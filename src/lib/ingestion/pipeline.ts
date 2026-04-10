import { createAdminClient } from '@/lib/supabase/admin'
import { buildEmbeddingText, generateEmbeddings } from '@/lib/ai/embeddings'
import { enrichChunk } from '@/lib/ingestion/enricher'
import { prepareChunkHierarchy, chunkNarrativeText } from '@/lib/ingestion/chunker'
import type { ContentType, Document } from '@/types/database'
import type { IngestedChunk, RawIngestionElement } from '@/types/ingestion'

export type { IngestedChunk, RawIngestionElement } from '@/types/ingestion'

export interface IngestionResult {
  documentId: string
  totalChunks: number
  totalImages: number
  errors: string[]
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
}

function createParentReferenceMap(chunks: IngestedChunk[]): Map<string, string> {
  return new Map(
    chunks
      .filter((chunk) => chunk.chunk_ref)
      .map((chunk) => [chunk.chunk_ref as string, '']),
  )
}

export function prepareChunksForIngestion(
  document: Document,
  elements: RawIngestionElement[],
): IngestedChunk[] {
  const hierarchicalChunks = prepareChunkHierarchy(elements)
  return hierarchicalChunks.map((chunk) => enrichChunk(document, chunk))
}

export function buildTextIngestionPayload(input: {
  text: string
  sectionPath?: string | null
  pageNumbers?: number[]
  contentType?: ContentType
  metadata?: Record<string, unknown>
}): RawIngestionElement[] {
  const contentType = input.contentType ?? 'NARRATIVE_TEXT'

  if (contentType !== 'NARRATIVE_TEXT') {
    return [
      {
        content: input.text,
        content_type: contentType,
        section_path: input.sectionPath ?? null,
        page_numbers: input.pageNumbers ?? [],
        metadata: input.metadata ?? {},
      },
    ]
  }

  return chunkNarrativeText(input.text, 500, 50).map((content, index) => ({
    content,
    content_type: 'NARRATIVE_TEXT',
    section_path: input.sectionPath ?? null,
    page_numbers: input.pageNumbers ?? [],
    metadata: {
      ...(input.metadata ?? {}),
      source: 'text-ingestion',
      source_chunk_index: index,
    },
  }))
}

export async function runIngestionPipeline(
  documentId: string,
  preparedChunks: IngestedChunk[],
): Promise<IngestionResult> {
  const supabase = createAdminClient()
  const errors: string[] = []
  let totalChunks = 0
  let totalImages = 0
  const parentReferenceMap = createParentReferenceMap(preparedChunks)

  try {
    await supabase
      .from('documents')
      .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
      .eq('id', documentId)

    const batchSize = 10

    for (let index = 0; index < preparedChunks.length; index += batchSize) {
      const batch = preparedChunks.slice(index, index + batchSize)
      const embeddingTexts = batch.map((chunk) =>
        buildEmbeddingText(
          chunk.content,
          chunk.section_path,
          typeof chunk.metadata.llm_summary === 'string' ? chunk.metadata.llm_summary : null,
          chunk.metadata,
        ),
      )

      let embeddings: number[][] = []

      try {
        embeddings = await generateEmbeddings(embeddingTexts)
      } catch (error) {
        errors.push(`Embedding error in batch ${index / batchSize + 1}: ${String(error)}`)
        continue
      }

      // -----------------------------------------------------------------
      // Split the batch into two groups:
      //   directInsertChunks — simple chunks with no parent ref or image
      //     → can be bulk-inserted in a single round-trip
      //   sequentialChunks   — chunks that need their DB id back
      //      (those with chunk_ref for parent tracking, or image_data)
      //     → inserted one at a time (existing logic)
      // -----------------------------------------------------------------
      type ChunkWithEmbedding = { chunk: IngestedChunk; embedding: number[] }
      const directInsertRows: {
        document_id: string
        parent_chunk_id: string | null
        content: string
        content_type: string
        section_path: string | null
        page_numbers: number[]
        metadata: Record<string, unknown>
        embedding: number[]
      }[] = []
      const sequentialChunks: ChunkWithEmbedding[] = []

      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        const chunk = batch[batchIndex]
        const embedding = embeddings[batchIndex]
        const needsTracking = chunk.chunk_ref || chunk.image_data

        if (needsTracking) {
          sequentialChunks.push({ chunk, embedding })
          continue
        }

        const resolvedParentId =
          chunk.parent_chunk_id ??
          (chunk.parent_ref ? parentReferenceMap.get(chunk.parent_ref) || null : null)

        const chunkMetadata = { ...chunk.metadata }
        delete chunkMetadata.chunk_role

        directInsertRows.push({
          document_id: documentId,
          parent_chunk_id: resolvedParentId,
          content: chunk.content,
          content_type: chunk.content_type,
          section_path: chunk.section_path,
          page_numbers: chunk.page_numbers,
          metadata: chunkMetadata,
          embedding,
        })
      }

      // Bulk insert for simple chunks (1 round-trip per batch)
      if (directInsertRows.length > 0) {
        const { data: bulkData, error: bulkError } = await supabase
          .from('chunks')
          .insert(directInsertRows)
          .select('id')

        if (bulkError) {
          errors.push(`Batch insert error: ${bulkError.message}`)
        } else {
          totalChunks += bulkData?.length ?? 0
        }
      }

      // Sequential insert for tracked chunks (need returned IDs)
      for (const { chunk, embedding } of sequentialChunks) {
        const resolvedParentId =
          chunk.parent_chunk_id ??
          (chunk.parent_ref ? parentReferenceMap.get(chunk.parent_ref) || null : null)

        const chunkMetadata = { ...chunk.metadata }
        delete chunkMetadata.chunk_role

        const { data: insertedChunk, error: chunkError } = await supabase
          .from('chunks')
          .insert({
            document_id: documentId,
            parent_chunk_id: resolvedParentId,
            content: chunk.content,
            content_type: chunk.content_type,
            section_path: chunk.section_path,
            page_numbers: chunk.page_numbers,
            metadata: chunkMetadata,
            embedding,
          })
          .select('id')
          .single()

        if (chunkError || !insertedChunk) {
          errors.push(`Chunk insert error: ${chunkError?.message ?? 'unknown error'}`)
          continue
        }

        totalChunks += 1

        if (chunk.chunk_ref) {
          parentReferenceMap.set(chunk.chunk_ref, insertedChunk.id)
        }

        if (!chunk.image_data) {
          continue
        }

        const { error: imageError } = await supabase.from('images').insert({
          chunk_id: insertedChunk.id,
          document_id: documentId,
          file_path: chunk.image_data.file_path,
          image_type: chunk.image_data.image_type ?? 'illustration',
          vlm_description: chunk.image_data.vlm_description ?? null,
          callouts: chunk.image_data.callouts ?? null,
          page_number: chunk.image_data.page_number,
        })

        if (imageError) {
          errors.push(`Image insert error: ${imageError.message}`)
          continue
        }

        totalImages += 1
      }
    } // end: for each batch

    const finalDocumentStatus = errors.length > 0 && totalChunks === 0 ? 'ERROR' : 'ACTIVE'

    await supabase
      .from('documents')
      .update({
        status: finalDocumentStatus,
        total_chunks: totalChunks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    return {
      documentId,
      totalChunks,
      totalImages,
      errors,
      status:
        finalDocumentStatus === 'ERROR'
          ? 'FAILED'
          : errors.length > 0
            ? 'PARTIAL'
            : 'SUCCESS',
    }
  } catch (error) {
    await supabase
      .from('documents')
      .update({ status: 'ERROR', updated_at: new Date().toISOString() })
      .eq('id', documentId)

    return {
      documentId,
      totalChunks,
      totalImages,
      errors: [...errors, `Fatal error: ${String(error)}`],
      status: 'FAILED',
    }
  }
}

export function processTable(
  tableMarkdown: string,
  sectionPath: string,
  pageNumber: number,
): IngestedChunk {
  return {
    content: tableMarkdown,
    content_type: 'SPEC_TABLE',
    section_path: sectionPath,
    page_numbers: [pageNumber],
    metadata: {
      table_markdown: tableMarkdown,
    },
  }
}

export function processSafetyCallout(
  text: string,
  severity: 'DANGER' | 'WARNING' | 'CAUTION' | 'NOTE',
  sectionPath: string,
  pageNumber: number,
): IngestedChunk {
  return {
    content: `WARNING: ${severity}\n${text}`.trim(),
    content_type: 'SAFETY_CALLOUT',
    section_path: sectionPath,
    page_numbers: [pageNumber],
    metadata: {
      safety_level: severity,
      llm_summary: `${severity} safety callout.`,
    },
  }
}

export async function getDocumentForIngestion(documentId: string): Promise<Document | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('documents').select('*').eq('id', documentId).single()

  if (error || !data) {
    return null
  }

  return data as Document
}
