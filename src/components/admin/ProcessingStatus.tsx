'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StatusSummary {
  total: number
  active: number
  processing: number
  errored: number
}

interface ProcessingStatusProps {
  refreshKey?: number
}

export default function ProcessingStatus({ refreshKey = 0 }: ProcessingStatusProps) {
  const [summary, setSummary] = useState<StatusSummary>({
    total: 0,
    active: 0,
    processing: 0,
    errored: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const loadSummary = async () => {
      setLoading(true)

      const { data, error } = await supabase.from('documents').select('status')

      if (error) {
        console.error('Failed to load processing summary:', error)
        setLoading(false)
        return
      }

      const nextSummary = (data || []).reduce<StatusSummary>(
        (accumulator, document) => {
          accumulator.total += 1

          if (document.status === 'ACTIVE') {
            accumulator.active += 1
          } else if (['PROCESSING', 'EXTRACTING', 'EMBEDDING'].includes(document.status)) {
            accumulator.processing += 1
          } else if (document.status === 'ERROR') {
            accumulator.errored += 1
          }

          return accumulator
        },
        { total: 0, active: 0, processing: 0, errored: 0 },
      )

      setSummary(nextSummary)
      setLoading(false)
    }

    void loadSummary()
  }, [refreshKey])

  const cards = [
    { label: 'Total Documents', value: summary.total, tone: 'text-slate-800 bg-white border-slate-200' },
    { label: 'Active', value: summary.active, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { label: 'Processing', value: summary.processing, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
    { label: 'Errors', value: summary.errored, tone: 'text-rose-700 bg-rose-50 border-rose-200' },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-lg border p-4 shadow-sm ${card.tone}`}>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{card.label}</div>
          <div className="mt-3 text-3xl font-semibold">
            {loading ? <span className="animate-pulse">...</span> : card.value}
          </div>
        </div>
      ))}
    </div>
  )
}
