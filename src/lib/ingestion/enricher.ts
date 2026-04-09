import type { Document } from '@/types/database'
import type { IngestedChunk } from '@/types/ingestion'

function inferKeywords(chunk: IngestedChunk): string[] {
  const sectionKeywords =
    chunk.section_path
      ?.split('>')
      .flatMap((value) => value.split(/[\s/-]+/))
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 2) ?? []

  const contentKeywords = chunk.content
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{2,}/g)
    ?.slice(0, 12) ?? []

  return Array.from(new Set([...sectionKeywords, ...contentKeywords])).slice(0, 16)
}

export function enrichChunk(document: Document, chunk: IngestedChunk): IngestedChunk {
  return {
    ...chunk,
    metadata: {
      ...chunk.metadata,
      documentTitle: document.title,
      documentNumber: document.doc_number,
      revision: document.revision,
      equipmentModel: document.equipment_model,
      language: document.language,
      keywords: chunk.metadata.keywords ?? inferKeywords(chunk),
    },
  }
}
