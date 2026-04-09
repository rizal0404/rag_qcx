import type { IngestedChunk, RawIngestionElement } from '@/types/ingestion'

function buildImageSummary(element: RawIngestionElement): string {
  const description =
    element.image_data?.vlm_description ||
    (typeof element.metadata?.vlm_description === 'string'
      ? element.metadata.vlm_description
      : null)

  if (description) {
    return description
  }

  const section = element.section_path ? ` in section ${element.section_path}` : ''
  return `Technical illustration${section}.`
}

export function processImageElement(element: RawIngestionElement): IngestedChunk {
  return {
    content: element.content.trim() || buildImageSummary(element),
    content_type: element.content_type ?? 'TECHNICAL_PHOTO',
    section_path: element.section_path ?? null,
    page_numbers: element.page_numbers ?? [],
    parent_chunk_id: element.parent_chunk_id ?? null,
    metadata: {
      ...(element.metadata ?? {}),
      llm_summary: buildImageSummary(element),
      has_image: true,
      image_path: element.image_data?.file_path ?? null,
    },
    image_data: element.image_data,
  }
}
