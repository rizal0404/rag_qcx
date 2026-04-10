import { NextRequest, NextResponse } from 'next/server'
import { reembedStoredChunks } from '@/lib/ingestion/reembed'
import { updateDocumentStatus } from '@/lib/ingestion/execute'

export async function POST(req: NextRequest) {
  let documentId: string | undefined

  try {
    const body = await req.json().catch(() => ({}))
    documentId =
      typeof body.documentId === 'string' && body.documentId.trim().length > 0
        ? body.documentId.trim()
        : undefined
    const batchSize =
      typeof body.batchSize === 'number' && Number.isFinite(body.batchSize)
        ? Math.max(1, Math.min(body.batchSize, 100))
        : undefined

    if (documentId) {
      await updateDocumentStatus(documentId, 'EMBEDDING')
    }

    const result = await reembedStoredChunks({
      documentId,
      batchSize,
    })

    if (documentId) {
      await updateDocumentStatus(
        documentId,
        result.errors.length > 0 && result.updatedChunks === 0 ? 'ERROR' : 'ACTIVE',
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Re-embed route error:', error)

    if (documentId) {
      await updateDocumentStatus(documentId, 'ERROR').catch((statusError) => {
        console.error('Failed to update document status after re-embed error:', statusError)
      })
    }

    return NextResponse.json({ error: 'Failed to re-embed stored chunks' }, { status: 500 })
  }
}
