'use client'

import React, { useEffect } from 'react'
import type { ImageRef } from '@/types/chat'

interface DiagramViewerProps {
  image: ImageRef | null
  onClose: () => void
}

export default function DiagramViewer({ image, onClose }: DiagramViewerProps) {
  useEffect(() => {
    if (!image) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [image, onClose])

  if (!image) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close diagram viewer"
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4 text-slate-100">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {image.imageType.replace(/_/g, ' ')}
            </div>
            <div className="mt-1 text-sm text-slate-200">{image.caption}</div>
            <div className="mt-1 text-xs text-slate-500">Page {image.pageNumber || 'N/A'}</div>
          </div>

          <button
            type="button"
            className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="max-h-[80vh] overflow-auto bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_38%),linear-gradient(180deg,#0f172a,#020617)] p-4 sm:p-8">
          <div className="mx-auto flex min-h-[24rem] items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.caption}
              className="h-auto max-h-[70vh] w-auto max-w-full rounded-xl object-contain shadow-[0_24px_80px_rgba(15,23,42,0.65)]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
