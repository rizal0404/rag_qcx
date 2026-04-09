import { createAdminClient } from '@/lib/supabase/admin'
import type { ContentType, Document } from '@/types/database'
import type { RawIngestionElement } from '@/types/ingestion'

const LLAMA_PARSE_UPLOAD_URL = 'https://api.cloud.llamaindex.ai/api/v2/parse/upload'
const LLAMA_PARSE_RESULT_URL = 'https://api.cloud.llamaindex.ai/api/v2/parse'
const DEFAULT_POLL_INTERVAL_MS = 3000
const DEFAULT_MAX_POLLS = 120

interface LlamaParseJobResponse {
  id?: string
  job_id?: string
  job?: {
    id?: string
    status?: string
    error_message?: string | null
  }
}

interface LlamaParseMarkdownPage {
  page?: number
  page_number?: number
  markdown?: string
  text?: string
}

interface LlamaParseResultResponse extends LlamaParseJobResponse {
  markdown?:
    | {
        pages?: LlamaParseMarkdownPage[]
        text?: string
      }
    | string
  text?:
    | {
        pages?: Array<{ page?: number; text?: string }>
        text?: string
      }
    | string
}

function getApiKey(): string {
  const apiKey = process.env.LLAMAPARSE_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('LLAMAPARSE_API_KEY is not configured')
  }

  if (/^llx-llx-/i.test(apiKey)) {
    throw new Error('LLAMAPARSE_API_KEY appears malformed. Remove the duplicated "llx-" prefix in your .env file.')
  }

  return apiKey
}

function sanitizeHeading(value: string): string {
  return value
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .trim()
}

function isMarkdownTable(block: string): boolean {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return false
  }

  return (
    lines.every((line) => line.includes('|')) &&
    /^\|?[\s:-]+\|[\s|:-]*$/.test(lines[1])
  )
}

function inferContentType(block: string): ContentType {
  if (isMarkdownTable(block)) {
    return /\b(interval|task|step|maintenance|inspection|procedure)\b/i.test(block)
      ? 'PROCEDURE_TABLE'
      : 'SPEC_TABLE'
  }

  if (/\b(danger|warning|caution|note)\b/i.test(block)) {
    return 'SAFETY_CALLOUT'
  }

  return 'NARRATIVE_TEXT'
}

function splitMarkdownIntoElements(
  markdown: string,
  pageNumber: number,
  sectionStack: string[],
): RawIngestionElement[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()

  if (!normalized) {
    return []
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  const elements: RawIngestionElement[] = []

  for (const block of blocks) {
    const headingMatch = block.match(/^(#{1,6})\s+(.+)$/)

    if (headingMatch) {
      const level = headingMatch[1].length
      const heading = sanitizeHeading(headingMatch[2])

      sectionStack.splice(level - 1)
      sectionStack[level - 1] = heading
      continue
    }

    const sectionPath = sectionStack.filter(Boolean).join(' > ') || null
    const contentType = inferContentType(block)

    elements.push({
      content: block,
      content_type: contentType,
      section_path: sectionPath,
      page_numbers: [pageNumber],
      metadata: {
        source: 'llamaparse',
      },
    })
  }

  return elements
}

function extractMarkdownPages(result: LlamaParseResultResponse): Array<{ pageNumber: number; markdown: string }> {
  if (typeof result.markdown === 'string') {
    return [{ pageNumber: 1, markdown: result.markdown }]
  }

  if (result.markdown?.pages && result.markdown.pages.length > 0) {
    return result.markdown.pages
      .map((page, index) => ({
        pageNumber: page.page_number ?? page.page ?? index + 1,
        markdown: page.markdown ?? page.text ?? '',
      }))
      .filter((page) => page.markdown.trim().length > 0)
  }

  if (typeof result.text === 'string') {
    return [{ pageNumber: 1, markdown: result.text }]
  }

  if (result.text && typeof result.text !== 'string' && result.text.pages) {
    return result.text.pages
      .map((page, index) => ({
        pageNumber: page.page ?? index + 1,
        markdown: page.text ?? '',
      }))
      .filter((page) => page.markdown.trim().length > 0)
  }

  return []
}

async function uploadPdfToLlamaParse(document: Document): Promise<string> {
  const apiKey = getApiKey()
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from('manuals').download(document.file_path)

  if (error || !data) {
    throw new Error(`Failed to download PDF from storage: ${error?.message ?? 'unknown error'}`)
  }

  const fileName = document.file_path.split('/').pop() || `${document.id}.pdf`
  const file = new File([await data.arrayBuffer()], fileName, {
    type: 'application/pdf',
  })

  const formData = new FormData()
  formData.append('file', file)
  formData.append(
    'configuration',
    JSON.stringify({
      tier: 'agentic',
      version: 'latest',
      output_options: {
        markdown: {
          tables: {
            output_tables_as_markdown: true,
            merge_continued_tables: true,
          },
        },
      },
    }),
  )

  const response = await fetch(LLAMA_PARSE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    let details = ''

    try {
      const responseText = await response.text()
      details = responseText.trim()
    } catch {
      details = ''
    }

    if (response.status === 401) {
      throw new Error(
        details
          ? `LlamaParse rejected the API key (401 Unauthorized): ${details}`
          : 'LlamaParse rejected the API key (401 Unauthorized). Check LLAMAPARSE_API_KEY in your .env file.',
      )
    }

    throw new Error(
      details
        ? `LlamaParse upload failed with status ${response.status}: ${details}`
        : `LlamaParse upload failed with status ${response.status}`,
    )
  }

  const payload = (await response.json()) as LlamaParseJobResponse
  const jobId = payload.job?.id ?? payload.job_id ?? payload.id

  if (!jobId) {
    throw new Error('LlamaParse upload did not return a job ID')
  }

  return jobId
}

async function pollLlamaParseResult(jobId: string): Promise<LlamaParseResultResponse> {
  const apiKey = getApiKey()

  for (let attempt = 0; attempt < DEFAULT_MAX_POLLS; attempt += 1) {
    const response = await fetch(`${LLAMA_PARSE_RESULT_URL}/${jobId}?expand=markdown`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`LlamaParse polling failed with status ${response.status}`)
    }

    const payload = (await response.json()) as LlamaParseResultResponse
    const status = payload.job?.status

    if (status === 'COMPLETED') {
      return payload
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(payload.job?.error_message || `LlamaParse job ended with status ${status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS))
  }

  throw new Error('LlamaParse job polling timed out')
}

export async function parseDocumentWithLlamaParse(document: Document): Promise<RawIngestionElement[]> {
  const jobId = await uploadPdfToLlamaParse(document)
  const result = await pollLlamaParseResult(jobId)
  const pages = extractMarkdownPages(result)
  const sectionStack: string[] = []

  const elements = pages.flatMap((page) =>
    splitMarkdownIntoElements(page.markdown, page.pageNumber, sectionStack),
  )

  if (elements.length === 0) {
    throw new Error('LlamaParse completed but produced no ingestible content')
  }

  return elements
}
