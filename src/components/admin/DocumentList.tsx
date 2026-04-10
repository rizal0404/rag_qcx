'use client'

import React, { useEffect, useState } from 'react'
import type { Document } from '@/types/database'

interface DocumentListProps {
  refreshKey?: number
  onRefresh?: () => void
}

type ActionKind = 'ingest' | 'reingest' | 'reembed'

interface ActionState {
  documentId: string
  kind: ActionKind
}

function isBusyStatus(status: Document['status']) {
  return status === 'PROCESSING' || status === 'EXTRACTING' || status === 'EMBEDDING'
}

function canRunIngestion(status: Document['status']) {
  return !isBusyStatus(status)
}

function canRunReembed(document: Document) {
  return !isBusyStatus(document.status) && document.total_chunks > 0
}

function getIngestionAction(status: Document['status'], totalChunks: number): ActionKind {
  if (status === 'ACTIVE' || totalChunks > 0) {
    return 'reingest'
  }

  return 'ingest'
}

function getIngestionButtonLabel(status: Document['status'], totalChunks: number) {
  const action = getIngestionAction(status, totalChunks)

  if (action === 'reingest') {
    return 'Re-ingest'
  }

  if (status === 'ERROR') {
    return 'Retry Ingestion'
  }

  return 'Run Ingestion'
}

export default function DocumentList({ refreshKey = 0, onRefresh }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [activeAction, setActiveAction] = useState<ActionState | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    async function fetchDocuments() {
      try {
        setLoading(true)
        const res = await fetch('/api/documents')
        if (!res.ok) throw new Error('Failed to fetch documents')
        const json = await res.json()
        setDocuments((json.documents || []) as Document[])
      } catch (err) {
        console.error('Failed to fetch documents:', err)
      } finally {
        setLoading(false)
      }
    }

    void fetchDocuments()
  }, [refreshKey])

  const handleRunIngestion = async (document: Document) => {
    const action = getIngestionAction(document.status, document.total_chunks)
    const replaceExisting = action === 'reingest'

    if (
      replaceExisting &&
      !window.confirm(`Re-ingest "${document.title}"? Existing indexed chunks for this document will be replaced.`)
    ) {
      return
    }

    try {
      setActiveAction({ documentId: document.id, kind: action })
      setFeedback(null)
      setDocuments((current) =>
        current.map((entry) =>
          entry.id === document.id
            ? {
                ...entry,
                status: replaceExisting ? 'EXTRACTING' : 'PROCESSING',
                total_chunks: replaceExisting ? 0 : entry.total_chunks,
                updated_at: new Date().toISOString(),
              }
            : entry,
        ),
      )

      const response = await fetch('/api/ingest/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: document.id,
          replaceExisting,
        }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.result?.errors?.[0] || 'Ingestion failed')
      }

      if (payload.queued) {
        setDocuments((current) =>
          current.map((entry) =>
            entry.id === document.id
              ? {
                  ...entry,
                  status: payload.queuedStatus ?? entry.status,
                  updated_at: new Date().toISOString(),
                }
              : entry,
          ),
        )
        setFeedback({
          tone: 'success',
          message:
            action === 'reingest'
              ? `Re-ingestion for "${document.title}" was queued on the worker. Refresh shortly to see the rebuilt index.`
              : `Ingestion for "${document.title}" was queued on the worker. Refresh shortly to see progress.`,
        })
      } else {
        const totalChunks = payload.result?.totalChunks ?? 0
        setFeedback({
          tone: 'success',
          message:
            action === 'reingest'
              ? `Re-ingestion for "${document.title}" completed with ${totalChunks} stored chunk${totalChunks === 1 ? '' : 's'}.`
              : `Ingestion for "${document.title}" completed with ${totalChunks} stored chunk${totalChunks === 1 ? '' : 's'}.`,
        })
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: `Failed to ${replaceExisting ? 're-ingest' : 'run ingestion for'} "${document.title}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    } finally {
      setActiveAction(null)
      onRefresh?.()
    }
  }

  const handleReembed = async (document: Document) => {
    try {
      setActiveAction({ documentId: document.id, kind: 'reembed' })
      setFeedback(null)
      setDocuments((current) =>
        current.map((entry) =>
          entry.id === document.id
            ? { ...entry, status: 'EMBEDDING', updated_at: new Date().toISOString() }
            : entry,
        ),
      )

      const response = await fetch('/api/ingest/reembed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: document.id,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Re-embed failed')
      }

      const updatedChunks = payload.updatedChunks ?? 0
      const errors = Array.isArray(payload.errors) ? payload.errors : []

      setFeedback({
        tone: errors.length > 0 ? 'error' : 'success',
        message:
          errors.length > 0
            ? `Re-embed for "${document.title}" completed with issues. Updated ${updatedChunks} chunk${updatedChunks === 1 ? '' : 's'}.`
            : `Re-embed for "${document.title}" completed. Updated ${updatedChunks} chunk${updatedChunks === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: `Failed to re-embed "${document.title}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    } finally {
      setActiveAction(null)
      onRefresh?.()
    }
  }

  const getStatusBadge = (status: Document['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
      case 'UPLOADED':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Uploaded</span>
      case 'PROCESSING':
      case 'EXTRACTING':
      case 'EMBEDDING':
        return (
          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            {status}
          </span>
        )
      case 'ERROR':
        return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Error</span>
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-full font-medium">{status}</span>
        )
    }
  }

  if (loading) {
    return <div className="text-slate-500 animate-pulse">Loading documents...</div>
  }

  if (documents.length === 0) {
    return (
      <div className="bg-white border text-center py-16 rounded-lg text-slate-500">
        No documents found. Upload a technical manual to get started.
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
      {feedback && (
        <div
          className={`border-b px-6 py-4 text-sm ${
            feedback.tone === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-50 text-slate-600 border-b">
          <tr>
            <th className="px-6 py-4 font-semibold">Title</th>
            <th className="px-6 py-4 font-semibold">Model</th>
            <th className="px-6 py-4 font-semibold">Status</th>
            <th className="px-6 py-4 font-semibold">Processed Chunks</th>
            <th className="px-6 py-4 font-semibold">Date</th>
            <th className="px-6 py-4 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {documents.map((doc) => {
            const canIngest = canRunIngestion(doc.status)
            const canReembed = canRunReembed(doc)
            const ingestionLabel = getIngestionButtonLabel(doc.status, doc.total_chunks)
            const isIngesting =
              activeAction?.documentId === doc.id &&
              (activeAction.kind === 'ingest' || activeAction.kind === 'reingest')
            const isReembedding = activeAction?.documentId === doc.id && activeAction.kind === 'reembed'

            return (
              <tr key={doc.id} className="hover:bg-slate-50 transition">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-800">{doc.title}</div>
                  <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">
                    {doc.doc_number || '-'} {doc.revision ? `| REV ${doc.revision}` : ''}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{doc.equipment_model || '-'}</td>
                <td className="px-6 py-4">{getStatusBadge(doc.status)}</td>
                <td className="px-6 py-4 text-slate-600">{doc.total_chunks || 0}</td>
                <td className="px-6 py-4 text-slate-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right whitespace-normal">
                  <div className="inline-flex flex-col items-end gap-2">
                    {canIngest ? (
                      <button
                        type="button"
                        onClick={() => handleRunIngestion(doc)}
                        disabled={activeAction !== null}
                        className="inline-flex min-w-32 items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {isIngesting ? (
                          <span className="flex items-center gap-2">
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                            Running...
                          </span>
                        ) : (
                          ingestionLabel
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{doc.status === 'ACTIVE' ? 'Indexed' : 'Busy'}</span>
                    )}

                    {canReembed && (
                      <button
                        type="button"
                        onClick={() => handleReembed(doc)}
                        disabled={activeAction !== null}
                        className="inline-flex min-w-32 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                      >
                        {isReembedding ? (
                          <span className="flex items-center gap-2">
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
                            Running...
                          </span>
                        ) : (
                          'Re-embed'
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
