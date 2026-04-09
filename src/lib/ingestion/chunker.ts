import type { IngestedChunk, RawIngestionElement } from '@/types/ingestion'
import { classifyContentType } from './classifier'
import { processImageElement } from './imageProcessor'
import { processTableElement } from './tableProcessor'

const ATOMIC_TYPES = new Set([
  'SPEC_TABLE',
  'PROCEDURE_TABLE',
  'WIRING_DIAGRAM',
  'TECHNICAL_PHOTO',
  'SAFETY_CALLOUT',
  'PARTS_LIST',
] as const)

type AtomicContentType =
  | 'SPEC_TABLE'
  | 'PROCEDURE_TABLE'
  | 'WIRING_DIAGRAM'
  | 'TECHNICAL_PHOTO'
  | 'SAFETY_CALLOUT'
  | 'PARTS_LIST'

function isAtomicContentType(contentType: string): contentType is AtomicContentType {
  return ATOMIC_TYPES.has(contentType as AtomicContentType)
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4)
}

export function chunkNarrativeText(
  text: string,
  maxTokens = 500,
  overlapTokens = 50,
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return []
  }

  const chunks: string[] = []
  let currentChunk = ''

  for (const paragraph of paragraphs) {
    const nextChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph

    if (currentChunk && estimateTokens(nextChunk) > maxTokens) {
      chunks.push(currentChunk.trim())
      const overlapChars = overlapTokens * 4
      const overlap = currentChunk.slice(-overlapChars).trim()
      currentChunk = overlap ? `${overlap}\n\n${paragraph}` : paragraph
      continue
    }

    currentChunk = nextChunk
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

function buildNarrativeChunks(element: RawIngestionElement): IngestedChunk[] {
  const chunks = chunkNarrativeText(element.content)

  if (chunks.length === 0) {
    return []
  }

  return chunks.map((content, index) => ({
    content,
    content_type: 'NARRATIVE_TEXT',
    section_path: element.section_path ?? null,
    page_numbers: element.page_numbers ?? [],
    parent_chunk_id: element.parent_chunk_id ?? null,
    metadata: {
      ...(element.metadata ?? {}),
      chunk_index: index,
      chunk_total: chunks.length,
      llm_summary:
        content.length > 240 ? `${content.slice(0, 237).trimEnd()}...` : content,
    },
    image_data: element.image_data,
  }))
}

function buildSectionParentChunk(sectionPath: string, children: IngestedChunk[]): IngestedChunk {
  const allPages = Array.from(
    new Set(children.flatMap((child) => child.page_numbers).filter((page) => Number.isFinite(page))),
  ).sort((a, b) => a - b)

  const content = children
    .map((child, index) => `[Child ${index + 1} - ${child.content_type}]\n${child.content}`)
    .join('\n\n')

  return {
    content,
    content_type: 'NARRATIVE_TEXT',
    section_path: sectionPath,
    page_numbers: allPages,
    parent_chunk_id: null,
    chunk_ref: sectionPath,
    metadata: {
      chunk_role: 'parent',
      llm_summary: `Parent context for ${sectionPath}.`,
      child_count: children.length,
    },
  }
}

export function prepareChunkHierarchy(elements: RawIngestionElement[]): IngestedChunk[] {
  const childChunks: IngestedChunk[] = []
  const groupedBySection = new Map<string, IngestedChunk[]>()

  for (const element of elements) {
    const contentType = classifyContentType(element)
    let processed: IngestedChunk[]

    if (isAtomicContentType(contentType)) {
      if (contentType === 'SPEC_TABLE' || contentType === 'PROCEDURE_TABLE' || contentType === 'PARTS_LIST') {
        processed = [processTableElement({ ...element, content_type: contentType }, contentType)]
      } else if (contentType === 'WIRING_DIAGRAM' || contentType === 'TECHNICAL_PHOTO') {
        processed = [processImageElement({ ...element, content_type: contentType })]
      } else {
        processed = [
          {
            content: element.content.trim(),
            content_type: contentType,
            section_path: element.section_path ?? null,
            page_numbers: element.page_numbers ?? [],
            parent_chunk_id: element.parent_chunk_id ?? null,
            metadata: {
              ...(element.metadata ?? {}),
              llm_summary:
                element.content.length > 240
                  ? `${element.content.slice(0, 237).trimEnd()}...`
                  : element.content,
            },
            image_data: element.image_data,
          },
        ]
      }
    } else {
      processed = buildNarrativeChunks(element)
    }

    for (const chunk of processed) {
      const sectionKey = chunk.section_path ?? `Page ${chunk.page_numbers[0] ?? 'Unknown'}`
      chunk.parent_ref = sectionKey
      childChunks.push(chunk)

      if (!groupedBySection.has(sectionKey)) {
        groupedBySection.set(sectionKey, [])
      }

      groupedBySection.get(sectionKey)?.push(chunk)
    }
  }

  const parentChunks = Array.from(groupedBySection.entries()).map(([sectionKey, children]) =>
    buildSectionParentChunk(sectionKey, children),
  )

  return [...parentChunks, ...childChunks]
}
