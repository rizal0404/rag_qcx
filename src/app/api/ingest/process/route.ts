import { NextRequest, NextResponse } from 'next/server'
import {
  executeLocalIngestionRequest,
  resolveDocumentForIngestion,
  updateDocumentStatus,
} from '@/lib/ingestion/execute'
import { dispatchIngestionToWorker, resolveIngestionExecutionMode } from '@/lib/ingestion/worker'
import type { ProcessIngestionRequest } from '@/types/ingestion'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const requestPayload = (await req.json()) as ProcessIngestionRequest
    const {
      documentId,
    } = requestPayload

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const document = await resolveDocumentForIngestion(documentId)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const executionMode = resolveIngestionExecutionMode(document, requestPayload)

    if (executionMode === 'worker') {
      try {
        const dispatchResult = await dispatchIngestionToWorker({
          ...requestPayload,
          documentId,
        })

        await updateDocumentStatus(documentId, dispatchResult.queuedStatus)

        return NextResponse.json(dispatchResult, { status: 202 })
      } catch (error) {
        await updateDocumentStatus(documentId, 'ERROR')
        const message = error instanceof Error ? error.message : 'Failed to dispatch ingestion job to worker'
        return NextResponse.json({ error: message }, { status: 502 })
      }
    }

    const result = await executeLocalIngestionRequest({
      ...requestPayload,
      documentId,
      executionMode: 'inline',
    })

    return NextResponse.json({
      ...result,
      executionMode: 'inline',
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
        await updateDocumentStatus(requestDocumentId, 'ERROR')
      } catch (statusError) {
        console.error('Failed to update document status after ingestion error:', statusError)
      }
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
