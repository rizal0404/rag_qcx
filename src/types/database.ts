export type DocumentStatus = 'UPLOADED' | 'EXTRACTING' | 'EXTRACTED' | 'PROCESSING' | 'EMBEDDING' | 'ACTIVE' | 'ERROR' | 'INACTIVE'

export interface Document {
  id: string
  title: string
  doc_type: string
  doc_number: string | null
  revision: string | null
  equipment_model: string | null
  language: string
  file_path: string
  total_pages: number | null
  total_chunks: number
  status: DocumentStatus
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type ContentType = 'NARRATIVE_TEXT' | 'SPEC_TABLE' | 'PROCEDURE_TABLE' | 'WIRING_DIAGRAM' | 'TECHNICAL_PHOTO' | 'SAFETY_CALLOUT' | 'PARTS_LIST'

export interface Chunk {
  id: string
  document_id: string
  parent_chunk_id: string | null
  content: string
  content_type: ContentType
  section_path: string | null
  page_numbers: number[]
  metadata: Record<string, any>
  embedding: number[] | null
  created_at: string
}

export type ImageType = 'wiring_diagram' | 'technical_photo' | 'schematic' | 'illustration' | 'chart'

export interface DocumentImage {
  id: string
  chunk_id: string
  document_id: string
  file_path: string
  image_type: ImageType
  vlm_description: string | null
  callouts: Record<string, any> | null
  page_number: number | null
  created_at: string
}

export interface ChatSession {
  id: string
  user_id: string | null
  title: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  cited_chunk_ids: string[]
  cited_images: Record<string, any> | null
  is_fallback: boolean
  created_at: string
}
