import type { Document } from '@/types/database'
import type { IngestionExecutionMode, ProcessIngestionRequest } from '@/types/ingestion'
import { getQueuedDocumentStatus } from '@/lib/ingestion/execute'

const DEFAULT_INLINE_MAX_FILE_SIZE_MB = 8
const WORKER_PROCESS_PATH = '/api/internal/ingest/process'

interface WorkerConfig {
  executionMode: IngestionExecutionMode
  workerUrl: string | null
  workerSecret: string | null
  inlineMaxFileSizeBytes: number
}

export interface RemoteIngestionDispatchResult {
  success: true
  queued: true
  executionMode: 'worker'
  documentId: string
  queuedStatus: ReturnType<typeof getQueuedDocumentStatus>
}

function parseExecutionMode(value: string | undefined): IngestionExecutionMode {
  if (value === 'inline' || value === 'worker') {
    return value
  }

  return 'auto'
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getWorkerConfig(): WorkerConfig {
  return {
    executionMode: parseExecutionMode(process.env.INGESTION_EXECUTION_MODE),
    workerUrl: process.env.INGESTION_WORKER_URL?.trim() || null,
    workerSecret: process.env.INGESTION_WORKER_SECRET?.trim() || null,
    inlineMaxFileSizeBytes:
      parsePositiveInt(process.env.INGESTION_INLINE_MAX_FILE_SIZE_MB, DEFAULT_INLINE_MAX_FILE_SIZE_MB) *
      1024 *
      1024,
  }
}

function hasWorkerTarget(config: WorkerConfig): boolean {
  return Boolean(config.workerUrl && config.workerSecret)
}

function hasInlinePayload(input: ProcessIngestionRequest): boolean {
  return (
    (Array.isArray(input.elements) && input.elements.length > 0) ||
    (Array.isArray(input.chunks) && input.chunks.length > 0) ||
    (typeof input.text === 'string' && input.text.trim().length > 0)
  )
}

export function resolveIngestionExecutionMode(
  document: Pick<Document, 'file_size_bytes'>,
  input: ProcessIngestionRequest,
): 'inline' | 'worker' {
  const config = getWorkerConfig()
  const requestedMode = parseExecutionMode(input.executionMode)

  if (requestedMode === 'inline') {
    return 'inline'
  }

  if (requestedMode === 'worker') {
    if (!hasWorkerTarget(config)) {
      throw new Error(
        'executionMode="worker" was requested, but INGESTION_WORKER_URL or INGESTION_WORKER_SECRET is not configured.',
      )
    }

    return 'worker'
  }

  if (config.executionMode === 'inline' || !hasWorkerTarget(config)) {
    return 'inline'
  }

  if (config.executionMode === 'worker') {
    return 'worker'
  }

  if (hasInlinePayload(input)) {
    return 'inline'
  }

  const fileSizeBytes = document.file_size_bytes ?? 0
  return fileSizeBytes > config.inlineMaxFileSizeBytes ? 'worker' : 'inline'
}

export async function dispatchIngestionToWorker(
  input: ProcessIngestionRequest & { documentId: string },
): Promise<RemoteIngestionDispatchResult> {
  const config = getWorkerConfig()

  if (!config.workerUrl || !config.workerSecret) {
    throw new Error('INGESTION_WORKER_URL and INGESTION_WORKER_SECRET must be configured to dispatch ingestion jobs.')
  }

  const workerEndpoint = new URL(WORKER_PROCESS_PATH, config.workerUrl).toString()
  const response = await fetch(workerEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.workerSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      executionMode: 'inline',
      runInBackground: true,
    }),
  })

  if (!response.ok) {
    let message = `Worker dispatch failed with status ${response.status}`

    try {
      const payload = (await response.json()) as { error?: string }
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        message = payload.error
      }
    } catch {
      // Ignore JSON parsing failures and preserve the status-based message.
    }

    throw new Error(message)
  }

  return {
    success: true,
    queued: true,
    executionMode: 'worker',
    documentId: input.documentId,
    queuedStatus: getQueuedDocumentStatus(input),
  }
}

export function isWorkerRequestAuthorized(authHeader: string | null): boolean {
  const secret = process.env.INGESTION_WORKER_SECRET?.trim()

  if (!secret) {
    return false
  }

  return authHeader === `Bearer ${secret}`
}
