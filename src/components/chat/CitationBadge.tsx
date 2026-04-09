'use client'

import React from 'react'
import { Citation } from '@/types/chat'

interface CitationBadgeProps {
  citation: Citation
  index: number
  onClick: () => void
}

export default function CitationBadge({ citation, index, onClick }: CitationBadgeProps) {
  const highlighted = citation.isInlineReferenced === true

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center space-x-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer group ${
        highlighted
          ? 'border-cyan-300 bg-cyan-50 text-cyan-900 hover:border-cyan-400 hover:bg-cyan-100'
          : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-blue-200 hover:bg-slate-200 hover:text-slate-700'
      }`}
      title={`Preview ${citation.documentTitle}${highlighted ? ' • Used in answer' : ''}`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-sm font-bold ${
          highlighted ? 'bg-cyan-200 text-cyan-900' : 'bg-blue-100 text-blue-700'
        }`}
      >
        {index}
      </span>
      <span className="truncate max-w-[150px]">
        {citation.sectionPath}
      </span>
      {citation.pageNumbers.length > 0 && (
        <span className={highlighted ? 'text-cyan-700 group-hover:text-cyan-800' : 'text-slate-400 group-hover:text-slate-500'}>
          (p.{citation.pageNumbers.join(',')})
        </span>
      )}
      {highlighted && (
        <span className="rounded-full bg-cyan-200/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-900">
          Inline
        </span>
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 transition-colors ${
          highlighted ? 'text-cyan-700 group-hover:text-cyan-900' : 'text-slate-400 group-hover:text-blue-600'
        }`}
      >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    </button>
  )
}
