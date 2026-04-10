import { NextRequest, NextResponse } from 'next/server'
import { executeLocalIngestionRequest } from '@/lib/ingestion/execute'
import { isWorkerRequestAuthorized } from '@/lib/ingestion/worker'
import type { ProcessIngestionRequest } from '@/types/ingestion'

interface WorkerProcessRequest extends ProcessIngestionRequest {
  runInBackground?: boolean
}

export async function POST(req: NextRequest) {
  if (!isWorkerRequestAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized worker request' }, { status: 401 })
  }

  const requestPayload = (await req.json()) as WorkerProcessRequest

  if (!requestPayload.documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  }

  if (requestPayload.runInBackground) {
    void executeLocalIngestionRequest({
      ...requestPayload,
      documentId: requestPayload.documentId,
      executionMode: 'inline',
    }).catch((error) => {
      console.error('Background worker ingestion failed:', error)
    })

    return NextResponse.json(
      {
        success: true,
        queued: true,
        executionMode: 'worker',
        documentId: requestPayload.documentId,
      },
      { status: 202 },
    )
  }

  try {
    const result = await executeLocalIngestionRequest({
      ...requestPayload,
      documentId: requestPayload.documentId,
      executionMode: 'inline',
    })

    return NextResponse.json({
      ...result,
      executionMode: 'worker',
    })
  } catch (error) {
    console.error('Worker ingestion route error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
