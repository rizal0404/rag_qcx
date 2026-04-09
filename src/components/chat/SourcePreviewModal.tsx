'use client'

import React, { useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { Citation } from '@/types/chat'

interface SourcePreviewModalProps {
  citation: Citation | null
  onClose: () => void
}

interface PreviewPayload {
  signedUrl: string
}

const PdfPagePreview = dynamic(() => import('./PdfPagePreview'), {
  ssr: false,
})

function buildPreviewQuery(citation: Citation): string | null {
  const params = new URLSearchParams()

  if (citation.documentId) {
    params.set('documentId', citation.documentId)
  } else if (citation.chunkId) {
    params.set('chunkId', citation.chunkId)
  }

  const query = params.toString()
  return query ? `/api/citations/preview?${query}` : null
}

function getInitialPage(citation: Citation | null): number {
  return citation?.pageNumbers[0] ?? 1
}

export default function SourcePreviewModal({ citation, onClose }: SourcePreviewModalProps) {
  const [selectedPage, setSelectedPage] = React.useState<number>(getInitialPage(citation))
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [numPages, setNumPages] = React.useState<number | null>(null)
  const [containerWidth, setContainerWidth] = React.useState<number>(0)
  const previewWidthRef = React.useRef<HTMLDivElement | null>(null)
  const previewScrollRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!citation) {
      return
    }

    setSelectedPage(getInitialPage(citation))
    setNumPages(null)
  }, [citation])

  useEffect(() => {
    if (!citation) {
      return
    }

    const currentCitation = citation
    const controller = new AbortController()

    async function loadPreviewUrl() {
      try {
        setIsLoading(true)
        setError(null)

        const previewUrl = buildPreviewQuery(currentCitation)

        if (!previewUrl) {
          throw new Error('Citation preview metadata is incomplete')
        }

        const response = await fetch(previewUrl, {
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? 'Failed to load source preview')
        }

        const payload = (await response.json()) as PreviewPayload
        setSignedUrl(payload.signedUrl)
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return
        }

        setSignedUrl(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load source preview')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadPreviewUrl()

    return () => {
      controller.abort()
    }
  }, [citation])

  useEffect(() => {
    if (!citation) {
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
  }, [citation, onClose])

  useEffect(() => {
    if (!citation || !previewWidthRef.current) {
      return
    }

    const node = previewWidthRef.current

    const updateWidth = () => {
      setContainerWidth(node.clientWidth)
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [citation])

  useEffect(() => {
    previewScrollRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }, [selectedPage, citation])

  if (!citation) {
    return null
  }

  const pageOptions = citation.pageNumbers.length > 0 ? citation.pageNumbers : [1]
  const pageWidth =
    containerWidth > 0 ? Math.max(Math.min(Math.floor(containerWidth - 16), 980), 280) : 280
  const canRenderSelectedPage = !numPages || selectedPage <= numPages
  const previewSrc = signedUrl ? `${signedUrl}#page=${selectedPage}&view=FitH` : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close source preview"
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative z-10 flex h-[calc(100vh-2rem)] w-full max-w-7xl min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-4 text-slate-100 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
              Source Preview
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-100">
              {citation.documentTitle}
            </div>
            <div className="mt-1 text-sm text-slate-300">{citation.sectionPath}</div>
            <div className="mt-2 text-xs text-slate-500">
              Citation pages: {pageOptions.join(', ')}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pageOptions.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setSelectedPage(pageNumber)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  selectedPage === pageNumber
                    ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                Page {pageNumber}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.12),_transparent_32%),linear-gradient(180deg,#0f172a,#020617)] p-3 sm:p-4">
          <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <div
              ref={previewScrollRef}
              className="h-full min-h-0 overflow-x-auto overflow-y-auto overscroll-contain"
            >
              <div ref={previewWidthRef} className="min-h-full w-full p-4 sm:p-6">
                {isLoading && (
                  <div className="flex min-h-[70vh] items-center justify-center p-8 text-center">
                    <div>
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/10">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                      </div>
                      <div className="mt-4 text-sm font-medium text-slate-200">Loading source page preview...</div>
                      <div className="mt-1 text-xs text-slate-500">Fetching PDF from Supabase storage.</div>
                    </div>
                  </div>
                )}

                {!isLoading && error && (
                  <div className="flex min-h-[70vh] items-center justify-center p-8 text-center">
                    <div>
                      <div className="text-sm font-semibold text-rose-300">Preview unavailable</div>
                      <div className="mt-2 max-w-md text-sm text-slate-400">{error}</div>
                    </div>
                  </div>
                )}

                {!isLoading && !error && signedUrl && !canRenderSelectedPage && (
                  <div className="flex min-h-[70vh] items-center justify-center p-8 text-center">
                    <div>
                      <div className="text-sm font-semibold text-amber-300">Page out of range</div>
                      <div className="mt-2 max-w-md text-sm text-slate-400">
                        The PDF has {numPages} pages, but this citation points to page {selectedPage}.
                      </div>
                    </div>
                  </div>
                )}

                {!isLoading && !error && previewSrc && (
                  <div className="mx-auto min-w-fit">
                    {canRenderSelectedPage && (
                      <PdfPagePreview
                        file={signedUrl!}
                        pageNumber={selectedPage}
                        width={pageWidth}
                        onLoadSuccess={(loadedPages) => {
                          setNumPages(loadedPages)
                          setError(null)
                        }}
                        onLoadError={(message) => {
                          setError(message)
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {previewSrc && !isLoading && !error && (
          <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            If the embedded viewer does not render in your browser, open the source in a new tab:
            {' '}
            <a
              href={previewSrc}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 underline underline-offset-4 hover:text-cyan-200"
            >
              Page {selectedPage}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
