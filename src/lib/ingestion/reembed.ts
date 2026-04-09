import { buildEmbeddingText, generateEmbeddings } from '@/lib/ai/embeddings'
import { createAdminClient } from '@/lib/supabase/admin'

interface StoredChunk {
  id: string
  document_id: string
  content: string
  section_path: string | null
  metadata: Record<string, unknown> | null
}

export interface ReembedChunksParams {
  documentId?: string
  batchSize?: number
}

export interface ReembedChunksResult {
  updatedChunks: number
  scannedChunks: number
  documentIds: string[]
  errors: string[]
}

export async function reembedStoredChunks({
  documentId,
  batchSize = 20,
}: ReembedChunksParams): Promise<ReembedChunksResult> {
  const supabase = createAdminClient()
  const errors: string[] = []
  const touchedDocumentIds = new Set<string>()
  let updatedChunks = 0
  let scannedChunks = 0
  let offset = 0

  while (true) {
    let query = supabase
      .from('chunks')
      .select('id, document_id, content, section_path, metadata')
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (documentId) {
      query = query.eq('document_id', documentId)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to load chunks for re-embedding: ${error.message}`)
    }

    const chunks = ((data as StoredChunk[] | null) ?? []).filter(
      (chunk) => typeof chunk.content === 'string' && chunk.content.trim().length > 0,
    )

    if (chunks.length === 0) {
      break
    }

    scannedChunks += chunks.length

    const embeddingTexts = chunks.map((chunk) =>
      buildEmbeddingText(
        chunk.content,
        chunk.section_path,
        typeof chunk.metadata?.llm_summary === 'string' ? chunk.metadata.llm_summary : null,
        chunk.metadata,
      ),
    )

    let embeddings: number[][]

    try {
      embeddings = await generateEmbeddings(embeddingTexts)
    } catch (error) {
      errors.push(`Embedding generation failed at offset ${offset}: ${String(error)}`)
      offset += chunks.length
      continue
    }

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      const embedding = embeddings[index]

      const { error: updateError } = await supabase
        .from('chunks')
        .update({ embedding })
        .eq('id', chunk.id)

      if (updateError) {
        errors.push(`Failed to update chunk ${chunk.id}: ${updateError.message}`)
        continue
      }

      updatedChunks += 1
      touchedDocumentIds.add(chunk.document_id)
    }

    offset += chunks.length
  }

  return {
    updatedChunks,
    scannedChunks,
    documentIds: Array.from(touchedDocumentIds),
    errors,
  }
}
