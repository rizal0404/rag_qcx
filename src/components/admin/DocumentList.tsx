'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Document } from '@/types/database'

interface DocumentListProps {
  refreshKey?: number
  onRefresh?: () => void
}

function canRunIngestion(status: Document['status']) {
  return status === 'UPLOADED' || status === 'ERROR'
}

function getIngestionButtonLabel(status: Document['status']) {
  if (status === 'ERROR') {
    return 'Retry Ingestion'
  }

  return 'Run Ingestion'
}

export default function DocumentList({ refreshKey = 0, onRefresh }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [runningDocumentId, setRunningDocumentId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    async function fetchDocuments() {
      try {
        setLoading(true)
        const supabase = createClient()
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        setDocuments(data || [])
      } catch (err) {
        console.error('Failed to fetch documents:', err)
      } finally {
        setLoading(false)
      }
    }

    void fetchDocuments()
  }, [refreshKey])

  const handleRunIngestion = async (documentId: string, title: string) => {
    try {
      setRunningDocumentId(documentId)
      setFeedback(null)
      setDocuments((current) =>
        current.map((document) =>
          document.id === documentId
            ? { ...document, status: 'PROCESSING', updated_at: new Date().toISOString() }
            : document,
        ),
      )

      const response = await fetch('/api/ingest/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.result?.errors?.[0] || 'Ingestion failed')
      }

      const totalChunks = payload.result?.totalChunks ?? 0
      setFeedback({
        tone: 'success',
        message: `Ingestion for "${title}" completed with ${totalChunks} stored chunk${totalChunks === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: `Failed to run ingestion for "${title}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    } finally {
      setRunningDocumentId(null)
      onRefresh?.()
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
      case 'UPLOADED': return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Uploaded</span>
      case 'PROCESSING': 
      case 'EXTRACTING':
      case 'EMBEDDING':
        return <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>{status}</span>
      case 'ERROR': return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Error</span>
      default: return <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-full font-medium">{status}</span>
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
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-slate-50 transition">
              <td className="px-6 py-4">
                <div className="font-medium text-slate-800">{doc.title}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{doc.doc_number} • Rev {doc.revision}</div>
              </td>
              <td className="px-6 py-4 text-slate-600">{doc.equipment_model || '-'}</td>
              <td className="px-6 py-4">{getStatusBadge(doc.status)}</td>
              <td className="px-6 py-4 text-slate-600">{doc.total_chunks || 0}</td>
              <td className="px-6 py-4 text-slate-500">
                {new Date(doc.created_at).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 text-right">
                {canRunIngestion(doc.status) ? (
                  <button
                    type="button"
                    onClick={() => handleRunIngestion(doc.id, doc.title)}
                    disabled={runningDocumentId !== null}
                    className="inline-flex min-w-32 items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {runningDocumentId === doc.id ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        Running...
                      </span>
                    ) : (
                      getIngestionButtonLabel(doc.status)
                    )}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">
                    {doc.status === 'ACTIVE' ? 'Indexed' : 'No action'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
