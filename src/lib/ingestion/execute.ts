import { createAdminClient } from '@/lib/supabase/admin'
import type { ContentType, Document as IngestionDocument, DocumentStatus } from '@/types/database'
import type { ProcessIngestionRequest, RawIngestionElement } from '@/types/ingestion'
import {
  buildTextIngestionPayload,
  getDocumentForIngestion,
  prepareChunksForIngestion,
  runIngestionPipeline,
} from '@/lib/ingestion/pipeline'
import { parseDocumentWithLlamaParse } from '@/lib/ingestion/llamaParse'

export interface LocalIngestionExecutionResult {
  success: boolean
  result: Awaited<ReturnType<typeof runIngestionPipeline>>
  preparedChunkCount: number
}

function hasElementsPayload(elements?: RawIngestionElement[], chunks?: RawIngestionElement[]) {
  return (Array.isArray(elements) && elements.length > 0) || (Array.isArray(chunks) && chunks.length > 0)
}

export function hasDirectIngestionPayload(input: {
  elements?: RawIngestionElement[]
  chunks?: RawIngestionElement[]
  text?: string
}): boolean {
  return hasElementsPayload(input.elements, input.chunks) || typeof input.text === 'string' && input.text.trim().length > 0
}

export function getQueuedDocumentStatus(input: Pick<ProcessIngestionRequest, 'elements' | 'chunks' | 'text'>): DocumentStatus {
  return hasDirectIngestionPayload(input) ? 'PROCESSING' : 'EXTRACTING'
}

export async function updateDocumentStatus(documentId: string, status: DocumentStatus): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('documents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', documentId)
}

async function resetDocumentChunks(documentId: string): Promise<void> {
  const supabase = createAdminClient()

  const { error: deleteError } = await supabase.from('chunks').delete().eq('document_id', documentId)

  if (deleteError) {
    throw new Error(`Failed to clear existing chunks before re-ingestion: ${deleteError.message}`)
  }

  const { error: updateError } = await supabase
    .from('documents')
    .update({
      total_chunks: 0,
      status: 'PROCESSING',
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)

  if (updateError) {
    throw new Error(`Failed to reset document counters before re-ingestion: ${updateError.message}`)
  }
}

export async function resolveDocumentForIngestion(documentId: string): Promise<IngestionDocument | null> {
  return getDocumentForIngestion(documentId)
}

export async function executeLocalIngestionRequest(
  input: ProcessIngestionRequest & { documentId: string },
): Promise<LocalIngestionExecutionResult> {
  const document = await getDocumentForIngestion(input.documentId)

  if (!document) {
    throw new Error('Document not found')
  }

  const hasElements = Array.isArray(input.elements) && input.elements.length > 0
  const hasChunks = Array.isArray(input.chunks) && input.chunks.length > 0
  const hasText = typeof input.text === 'string' && input.text.trim().length > 0
  const textInput = hasText ? input.text : undefined
  const shouldParseWithLlamaParse = !hasElements && !hasChunks && !hasText

  if (shouldParseWithLlamaParse) {
    await updateDocumentStatus(input.documentId, 'EXTRACTING')
  }

  const rawElements = hasElements
    ? input.elements
    : hasChunks
      ? input.chunks
      : hasText
        ? buildTextIngestionPayload({
            text: textInput as string,
            sectionPath: input.sectionPath,
            pageNumbers: input.pageNumbers,
            contentType: input.contentType as ContentType | undefined,
          })
        : await parseDocumentWithLlamaParse(document)

  if (!rawElements) {
    throw new Error(
      'No ingestion payload provided. Provide elements/chunks from an external parser, or send text for a lightweight ingestion run.',
    )
  }

  if (input.replaceExisting) {
    await resetDocumentChunks(input.documentId)
  }

  const preparedChunks = prepareChunksForIngestion(document, rawElements)
  const result = await runIngestionPipeline(input.documentId, preparedChunks)

  return {
    success: result.status !== 'FAILED',
    result,
    preparedChunkCount: preparedChunks.length,
  }
}
