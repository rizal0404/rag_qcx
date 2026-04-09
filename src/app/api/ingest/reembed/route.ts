import { NextRequest, NextResponse } from 'next/server'
import { reembedStoredChunks } from '@/lib/ingestion/reembed'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const documentId =
      typeof body.documentId === 'string' && body.documentId.trim().length > 0
        ? body.documentId.trim()
        : undefined
    const batchSize =
      typeof body.batchSize === 'number' && Number.isFinite(body.batchSize)
        ? Math.max(1, Math.min(body.batchSize, 100))
        : undefined

    const result = await reembedStoredChunks({
      documentId,
      batchSize,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Re-embed route error:', error)
    return NextResponse.json({ error: 'Failed to re-embed stored chunks' }, { status: 500 })
  }
}
