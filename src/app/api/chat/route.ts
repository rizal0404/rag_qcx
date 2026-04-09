import { randomUUID } from 'node:crypto'
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText } from 'ai'
import { getChatModelCandidates } from '@/lib/ai/llm'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { performHybridSearch } from '@/lib/search/hybrid'
import { buildContextFromResults } from '@/lib/search/contextBuilder'
import { detectFallback } from '@/lib/search/fallback'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { ensureChatSession, persistChatMessage } from '@/lib/chat/persistence'
import { AppUIMessage, MessageData, Citation, ImageRef } from '@/types/chat'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  expandQueryForRetrieval,
  extractIdentifierCandidates,
  rerankSearchResults,
} from '@/lib/search/query'
import type { SearchResult } from '@/lib/search/hybrid'

export const maxDuration = 60
const FALLBACK_TEXT = 'Maaf, data yang Anda cari tidak ditemukan dalam dokumen yang tersedia.'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function loadImagesForChunks(chunkIds: string[]): Promise<ImageRef[]> {
  if (chunkIds.length === 0) {
    return []
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('images')
    .select('file_path, image_type, vlm_description, page_number')
    .in('chunk_id', chunkIds)

  if (error || !data) {
    if (error) {
      console.error('Failed to load images for chat response:', error)
    }

    return []
  }

  return data.map((image) => ({
    url: supabase.storage.from('manuals').getPublicUrl(image.file_path).data.publicUrl,
    caption: image.vlm_description || 'Referenced diagram',
    imageType: image.image_type,
    pageNumber: image.page_number || 0,
  }))
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function getLatestUserText(message: AppUIMessage | undefined): string | null {
  if (!message || message.role !== 'user') {
    return null
  }

  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim()

  return text.length > 0 ? text : null
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeSectionPath(sectionPath: string): string {
  return normalizeWhitespace(sectionPath).toLowerCase()
}

function buildCitation(result: SearchResult): string {
  const section = result.section_path || 'General'
  const page = result.page_numbers?.[0] ?? 'N/A'
  return `[Page ${page}, Section ${section}]`
}

function buildCitationIdentity(result: SearchResult): string {
  const documentIdentity = result.document_id || result.metadata?.documentTitle || 'unknown-document'
  const sectionIdentity = normalizeSectionPath(result.section_path || 'General')
  const pageIdentity =
    (result.page_numbers || [])
      .filter((page): page is number => Number.isFinite(page))
      .join(',') || 'no-pages'

  return `${documentIdentity}::${sectionIdentity}::${pageIdentity}`
}

function parseInlineCitationPages(value: string): number[] {
  const pages = Array.from(value.matchAll(/\d+/g), (match) => Number.parseInt(match[0], 10)).filter(
    (page) => Number.isFinite(page),
  )

  return Array.from(new Set(pages))
}

function extractInlineCitations(answer: string): Array<{ sectionPath: string; pageNumbers: number[] }> {
  const matches = answer.matchAll(/\[Page\s+(.+?),\s*Section\s+([^\]]+)\]/gi)

  return Array.from(matches, (match) => ({
    pageNumbers: parseInlineCitationPages(match[1] || ''),
    sectionPath: normalizeSectionPath(match[2] || 'General'),
  }))
}

function isCitationReferencedInline(
  citation: Citation,
  inlineCitations: Array<{ sectionPath: string; pageNumbers: number[] }>,
): boolean {
  const citationSection = normalizeSectionPath(citation.sectionPath)

  return inlineCitations.some((inlineCitation) => {
    if (inlineCitation.sectionPath !== citationSection) {
      return false
    }

    if (inlineCitation.pageNumbers.length === 0 || citation.pageNumbers.length === 0) {
      return true
    }

    return citation.pageNumbers.some((pageNumber) => inlineCitation.pageNumbers.includes(pageNumber))
  })
}

function buildDisplayedCitations(
  searchResults: SearchResult[],
  answerText: string,
  limit = 3,
): Citation[] {
  const uniqueCitations: Citation[] = []
  const seen = new Set<string>()

  for (const result of searchResults) {
    const identity = buildCitationIdentity(result)

    if (seen.has(identity)) {
      continue
    }

    seen.add(identity)
    uniqueCitations.push({
      chunkId: result.chunk_id,
      documentId: result.document_id,
      sectionPath: result.section_path || 'General',
      pageNumbers: result.page_numbers || [],
      documentTitle: result.metadata?.documentTitle || 'Unknown',
      documentNumber: result.metadata?.documentNumber,
    })

    if (uniqueCitations.length >= limit) {
      break
    }
  }

  const inlineCitations = extractInlineCitations(answerText)

  return uniqueCitations.map((citation) => ({
    ...citation,
    isInlineReferenced: isCitationReferencedInline(citation, inlineCitations),
  }))
}

function isGroundedAnswerRejectedByModel(answer: string, fallbackAllowed: boolean): boolean {
  if (fallbackAllowed) {
    return false
  }

  const normalized = normalizeWhitespace(answer).toLowerCase()
  return normalized.length === 0 || normalized.includes(FALLBACK_TEXT.toLowerCase())
}

function buildRepairPrompt(queryText: string, searchResults: SearchResult[]): string {
  const topResults = searchResults.slice(0, 3)
  const sourceBlocks = topResults
    .map((result, index) => {
      const section = result.section_path || 'General'
      const pages = result.page_numbers?.join(', ') || 'N/A'
      return `SOURCE ${index + 1}
Document: ${result.metadata?.documentTitle || 'Unknown'}
Location: Page ${pages}, Section ${section}
Content:
${result.content}`
    })
    .join('\n\n')

  return `Answer the user's question using ONLY the source excerpts below.
The excerpts are relevant and sufficient, so DO NOT return the fallback sentence.
If the source is in English and the user asked in Indonesian, answer in Indonesian.
Keep the answer concise and include citations in the form [Page X, Section Y].

Question:
${queryText}

Sources:
${sourceBlocks}`
}

function buildExtractiveGroundedAnswer(queryText: string, searchResults: SearchResult[]): string {
  const primary = searchResults[0]

  if (!primary) {
    return FALLBACK_TEXT
  }

  const lines = primary.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Core Core V/i.test(line))
    .filter((line) => !/^\[Child \d+/.test(line))

  const numberedLines = lines.filter((line) => /^\d+\./.test(line))
  const citation = buildCitation(primary)

  if (numberedLines.length > 0) {
    const steps = numberedLines.slice(0, 4).map((line) => `- ${line} ${citation}`)
    return `Berdasarkan manual, langkah yang tersedia adalah:\n${steps.join('\n')}`
  }

  const informativeLines = lines
    .filter((line) => line.length > 25)
    .filter((line) => !/^\d+(\.\d+)+\s/.test(line))
    .slice(0, 2)

  if (informativeLines.length > 0) {
    return `Berdasarkan manual, ${informativeLines.join(' ')} ${citation}`
  }

  return `Bagian yang paling relevan untuk pertanyaan "${queryText}" ada di ${citation}.`
}

function mergeSearchResults(primary: SearchResult[], supplemental: SearchResult[]): SearchResult[] {
  const merged = new Map<string, SearchResult>()

  for (const result of [...primary, ...supplemental]) {
    const existing = merged.get(result.chunk_id)

    if (!existing) {
      merged.set(result.chunk_id, result)
      continue
    }

    const existingScore = existing.retrieval_score ?? existing.combined_score
    const nextScore = result.retrieval_score ?? result.combined_score

    if (nextScore > existingScore) {
      merged.set(result.chunk_id, result)
    }
  }

  return Array.from(merged.values())
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      id,
      sessionId: requestedSessionId,
    }: { messages: AppUIMessage[]; id?: string; sessionId?: string } = await req.json()
    const lastMessage = messages[messages.length - 1]
    const queryText = getLatestUserText(lastMessage)

    if (!queryText) {
      return new Response('Invalid request', { status: 400 })
    }

    const sessionId = isUuid(requestedSessionId)
      ? requestedSessionId
      : isUuid(id)
        ? id
        : randomUUID()
    await ensureChatSession(sessionId, queryText)
    await persistChatMessage({
      sessionId,
      role: 'user',
      content: queryText,
    })

    // 1. Generate query embedding
    const retrievalQuery = expandQueryForRetrieval(queryText)
    const queryEmbedding = await generateEmbedding(retrievalQuery)
    const identifierQueries = extractIdentifierCandidates(queryText)

    // 2. Perform hybrid search
    const primaryResults = await performHybridSearch({
      queryEmbedding,
      queryText: retrievalQuery,
      rerankQuery: queryText,
      // Default matchCount from env is applied in the function
    })

    let searchResults = primaryResults

    if (identifierQueries.length > 0) {
      const supplementalResults = await Promise.all(
        identifierQueries.map(async (identifierQuery) => {
          const identifierEmbedding = await generateEmbedding(identifierQuery)

          return performHybridSearch({
            queryEmbedding: identifierEmbedding,
            queryText: identifierQuery,
            rerankQuery: queryText,
          })
        }),
      )

      searchResults = rerankSearchResults(
        mergeSearchResults(primaryResults, supplementalResults.flat()),
        queryText,
      ).slice(0, parseInt(process.env.MAX_CHUNKS_PER_QUERY || '10'))
    }

    // 3. Fallback detection
    const fallbackAnalysis = detectFallback(searchResults, queryText)

    // 4. Load related assets for the retrieved chunks
    const images = fallbackAnalysis.isFallback
      ? []
      : await loadImagesForChunks(searchResults.map((result) => result.chunk_id))

    // 5. Build context
    const contextStr = fallbackAnalysis.isFallback 
      ? '' 
      : buildContextFromResults(searchResults)

    // 6. Build system prompt
    const systemPrompt = buildSystemPrompt(contextStr)

    const modelMessages = await convertToModelMessages(messages)
    const temperature = Number.parseFloat(process.env.LLM_TEMPERATURE || '0.1')
    const candidates = getChatModelCandidates()

    if (candidates.length === 0) {
      throw new Error(
        'No chat provider is configured. Set OPENROUTER_API_KEY or a fallback provider key.',
      )
    }

    let responseText = ''
    let finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' =
      'stop'
    let selectedProvider = ''
    let selectedModel = ''
    let lastError: unknown

    for (const candidate of candidates) {
      try {
        let result = await generateText({
          model: candidate.model,
          system: systemPrompt,
          messages: modelMessages,
          temperature,
        })

        if (isGroundedAnswerRejectedByModel(result.text, fallbackAnalysis.isFallback)) {
          result = await generateText({
            model: candidate.model,
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: buildRepairPrompt(queryText, searchResults) }],
              },
            ],
            temperature: 0,
          })
        }

        responseText = result.text
        finishReason = result.finishReason
        selectedProvider = candidate.provider
        selectedModel = candidate.modelId

        if (!isGroundedAnswerRejectedByModel(responseText, fallbackAnalysis.isFallback)) {
          break
        }
      } catch (error) {
        lastError = error
        console.error(`Chat provider failed: ${candidate.provider}/${candidate.modelId}`, error)
      }
    }

    if (!selectedProvider && !fallbackAnalysis.isFallback) {
      responseText = buildExtractiveGroundedAnswer(queryText, searchResults)
      selectedProvider = 'extractive-fallback'
      selectedModel = 'grounded-extractive'
    }

    if (!selectedProvider) {
      throw lastError instanceof Error
        ? lastError
        : new Error('All configured chat providers failed.')
    }

    const citations = fallbackAnalysis.isFallback ? [] : buildDisplayedCitations(searchResults, responseText)

    const messageData: MessageData = {
      citations,
      images,
      fallback: fallbackAnalysis.isFallback,
      confidence: searchResults.length > 0 ? searchResults[0].combined_score : 0,
      sessionId,
    }

    await persistChatMessage({
      sessionId,
      role: 'assistant',
      content: responseText,
      citedChunkIds: citations.map((citation) => citation.chunkId),
      citedImages: images,
      isFallback: fallbackAnalysis.isFallback,
    })

    const stream = createUIMessageStream<AppUIMessage>({
      originalMessages: messages,
      execute: ({ writer }) => {
        const textId = randomUUID()

        writer.write({
          type: 'start',
        })
        writer.write({
          type: 'text-start',
          id: textId,
        })
        writer.write({
          type: 'text-delta',
          id: textId,
          delta: responseText,
        })
        writer.write({
          type: 'text-end',
          id: textId,
        })
        writer.write({
          type: 'finish',
          finishReason,
          messageMetadata: {
            ...messageData,
            provider: selectedProvider,
            model: selectedModel,
          },
        })
      },
      onError: (error) => {
        console.error('UI stream error:', error)
        return 'An error occurred while generating the response.'
      },
    })

    return createUIMessageStreamResponse({
      stream,
    })
  } catch (error: any) {
    console.error('API /chat Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
