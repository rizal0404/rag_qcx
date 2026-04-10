import type { ContentType, Document, ImageType } from '@/types/database'

export type IngestionExecutionMode = 'auto' | 'inline' | 'worker'

export interface RawImageData {
  file_path: string
  image_type?: ImageType
  vlm_description?: string
  callouts?: Record<string, string>
  page_number: number
}

export interface RawIngestionElement {
  content: string
  content_type?: ContentType
  section_path?: string | null
  page_numbers?: number[]
  metadata?: Record<string, unknown>
  parent_chunk_id?: string | null
  image_data?: RawImageData
}

export interface IngestedChunk {
  content: string
  content_type: ContentType
  parent_chunk_id?: string | null
  section_path: string | null
  page_numbers: number[]
  metadata: Record<string, unknown>
  image_data?: RawImageData
  chunk_ref?: string | null
  parent_ref?: string | null
}

export interface IngestionPreparationParams {
  document: Document
  elements: RawIngestionElement[]
}

export interface ProcessIngestionRequest {
  documentId?: string
  elements?: RawIngestionElement[]
  chunks?: RawIngestionElement[]
  text?: string
  sectionPath?: string | null
  pageNumbers?: number[]
  contentType?: ContentType
  executionMode?: IngestionExecutionMode
  replaceExisting?: boolean
}
