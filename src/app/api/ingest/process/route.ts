import { NextRequest, NextResponse } from 'next/server'
import {
  buildTextIngestionPayload,
  getDocumentForIngestion,
  prepareChunksForIngestion,
  runIngestionPipeline,
  type RawIngestionElement,
} from '@/lib/ingestion/pipeline'
import { parseDocumentWithLlamaParse } from '@/lib/ingestion/llamaParse'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const {
      documentId,
      elements,
      chunks,
      text,
      sectionPath,
      pageNumbers,
      contentType,
    }: {
      documentId?: string
      elements?: RawIngestionElement[]
      chunks?: RawIngestionElement[]
      text?: string
      sectionPath?: string | null
      pageNumbers?: number[]
      contentType?: RawIngestionElement['content_type']
    } = await req.json()

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const document = await getDocumentForIngestion(documentId)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const supabase = createAdminClient()
    const hasElements = Array.isArray(elements) && elements.length > 0
    const hasChunks = Array.isArray(chunks) && chunks.length > 0
    const hasText = typeof text === 'string' && text.trim().length > 0
    const shouldParseWithLlamaParse = !hasElements && !hasChunks && !hasText

    if (shouldParseWithLlamaParse) {
      await supabase
        .from('documents')
        .update({ status: 'EXTRACTING', updated_at: new Date().toISOString() })
        .eq('id', documentId)
    }

    const rawElements = hasElements
      ? elements
      : hasChunks
        ? chunks
        : hasText
          ? buildTextIngestionPayload({
              text,
              sectionPath,
              pageNumbers,
              contentType,
            })
          : await parseDocumentWithLlamaParse(document)

    if (!rawElements) {
      return NextResponse.json(
        {
          error: 'No ingestion payload provided.',
          hint:
            'Provide elements/chunks from an external parser, or send text for a lightweight ingestion run.',
        },
        { status: 400 },
      )
    }

    const preparedChunks = prepareChunksForIngestion(document, rawElements)
    const result = await runIngestionPipeline(documentId, preparedChunks)

    return NextResponse.json({
      success: result.status !== 'FAILED',
      result,
      preparedChunkCount: preparedChunks.length,
    })
  } catch (error) {
    console.error('Process ingestion error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    let requestDocumentId: string | null = null

    try {
      const requestClone = req.clone()
      const body = (await requestClone.json()) as { documentId?: string }
      requestDocumentId = typeof body.documentId === 'string' ? body.documentId : null
    } catch {
      requestDocumentId = null
    }

    if (requestDocumentId) {
      try {
        const supabase = createAdminClient()
        await supabase
          .from('documents')
          .update({ status: 'ERROR', updated_at: new Date().toISOString() })
          .eq('id', requestDocumentId)
      } catch (statusError) {
        console.error('Failed to update document status after ingestion error:', statusError)
      }
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
