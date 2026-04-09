import { NextRequest, NextResponse } from 'next/server'
import {
  buildTextIngestionPayload,
  getDocumentForIngestion,
  prepareChunksForIngestion,
  runIngestionPipeline,
  type RawIngestionElement,
} from '@/lib/ingestion/pipeline'

// ============================================================
// Ingestion API — Processes uploaded documents into chunks
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const {
      documentId,
      chunks,
      elements,
    }: {
      documentId?: string
      chunks?: RawIngestionElement[]
      elements?: RawIngestionElement[]
    } = await req.json()

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 },
      )
    }

    const document = await getDocumentForIngestion(documentId)

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      )
    }

    const rawElements = Array.isArray(chunks) ? chunks : Array.isArray(elements) ? elements : null

    if (!rawElements) {
      return NextResponse.json(
        {
          error:
            'Please provide parsed chunks. Direct PDF parsing still requires an external parser (LlamaParse or Docling worker).',
          hint:
            'Send POST with { documentId, chunks: [...] } or { documentId, elements: [...] } where each item has content, section_path, page_numbers, and optional metadata.',
          example: {
            documentId: 'uuid',
            chunks: [
              {
                content: 'The 2-Position Diverter is intended for...',
                content_type: 'NARRATIVE_TEXT',
                parent_chunk_id: null,
                section_path: 'Technical description > Basic use and scheme',
                page_numbers: [14],
                metadata: {},
              },
            ],
          },
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
    console.error('Ingestion error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// Helper endpoint: simple text ingestion (paste text, auto-chunk)
export async function PUT(req: NextRequest) {
  try {
    const { documentId, text, sectionPath, pageNumbers, contentType } =
      await req.json()

    if (!documentId || !text) {
      return NextResponse.json(
        { error: 'documentId and text are required' },
        { status: 400 },
      )
    }

    const document = await getDocumentForIngestion(documentId)

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      )
    }

    const rawElements = buildTextIngestionPayload({
      text,
      sectionPath,
      pageNumbers,
      contentType,
    })

    const preparedChunks = prepareChunksForIngestion(document, rawElements)
    const result = await runIngestionPipeline(documentId, preparedChunks)

    return NextResponse.json({
      success: result.status !== 'FAILED',
      result,
      preparedChunkCount: preparedChunks.length,
    })
  } catch (error) {
    console.error('Text ingestion error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
