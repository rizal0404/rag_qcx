'use client'

import React, { useEffect, useState } from 'react'
import type { Document, DocumentStatus } from '@/types/database'

interface IngestionLogProps {
  refreshKey?: number
}

function describeStatus(status: DocumentStatus, totalChunks: number) {
  switch (status) {
    case 'ACTIVE':
      return `Indexed successfully with ${totalChunks} stored chunk${totalChunks === 1 ? '' : 's'}.`
    case 'PROCESSING':
    case 'EXTRACTING':
    case 'EMBEDDING':
      return 'Pipeline is still running for this document.'
    case 'ERROR':
      return 'Last ingestion attempt failed and requires inspection.'
    case 'UPLOADED':
      return 'Document is registered but ingestion has not started yet.'
    default:
      return `Current status: ${status}.`
  }
}

function formatRelativeTime(value: string) {
  const time = new Date(value).getTime()
  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000))

  if (diffMinutes < 1) {
    return 'just now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

export default function IngestionLog({ refreshKey = 0 }: IngestionLogProps) {
  const [entries, setEntries] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadEntries = async () => {
      setLoading(true)

      try {
        const res = await fetch('/api/documents')
        if (!res.ok) throw new Error('Failed to load ingestion log')

        const json = await res.json()
        const allDocs = (json.documents || []) as Document[]

        // Sort by updated_at descending and take top 8
        const sorted = allDocs
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 8)

        setEntries(sorted)
      } catch (error) {
        console.error('Failed to load ingestion log:', error)
      } finally {
        setLoading(false)
      }
    }

    void loadEntries()
  }, [refreshKey])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h3 className="text-lg font-semibold text-slate-900">Recent Ingestion Activity</h3>
        <p className="mt-1 text-sm text-slate-500">Latest processing events inferred from document status updates.</p>
      </div>

      <div className="divide-y divide-slate-100">
        {loading && (
          <div className="px-6 py-8 text-sm text-slate-500 animate-pulse">Loading ingestion activity...</div>
        )}

        {!loading && entries.length === 0 && (
          <div className="px-6 py-8 text-sm text-slate-500">No ingestion activity recorded yet.</div>
        )}

        {!loading &&
          entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-3 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{entry.title}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600">
                    {entry.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {describeStatus(entry.status, entry.total_chunks || 0)}
                </p>
                <div className="mt-2 text-xs text-slate-400">
                  Model: {entry.equipment_model || 'N/A'} | File: {entry.file_path}
                </div>
              </div>

              <div className="shrink-0 text-xs text-slate-400">
                Updated {formatRelativeTime(entry.updated_at)}
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}
