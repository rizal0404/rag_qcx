'use client'

import React, { useState } from 'react'
import DocumentList from '@/components/admin/DocumentList'
import ProcessingStatus from '@/components/admin/ProcessingStatus'
import IngestionLog from '@/components/admin/IngestionLog'

export default function AdminDashboard() {
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = () => {
    setRefreshKey((current) => current + 1)
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Knowledge Base</h2>
          <p className="mt-1 text-slate-500">Manage technical manuals and processing status.</p>
        </div>
        <a
          href="/admin/upload"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          + Upload Document
        </a>
      </div>

      <div className="mb-8">
        <ProcessingStatus refreshKey={refreshKey} />
      </div>

      <div className="space-y-8">
        <DocumentList refreshKey={refreshKey} onRefresh={handleRefresh} />
        <IngestionLog refreshKey={refreshKey} />
      </div>
    </div>
  )
}
