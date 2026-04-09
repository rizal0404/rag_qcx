'use client'

import React from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

interface PdfPagePreviewProps {
  file: string
  pageNumber: number
  width: number
  onLoadSuccess: (numPages: number) => void
  onLoadError: (message: string) => void
}

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export default function PdfPagePreview({
  file,
  pageNumber,
  width,
  onLoadSuccess,
  onLoadError,
}: PdfPagePreviewProps) {
  return (
    <div className="w-full">
      <Document
        key={file}
        file={file}
        loading={
          <div className="flex min-h-[70vh] items-center justify-center">
            <div className="text-sm text-slate-400">Rendering PDF page...</div>
          </div>
        }
        onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
        onLoadError={(error) => {
          onLoadError(error instanceof Error ? error.message : 'Failed to render PDF')
        }}
        className="w-full"
      >
        <Page
          pageNumber={pageNumber}
          width={width}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          className="mx-auto rounded-2xl shadow-[0_24px_80px_rgba(15,23,42,0.65)]"
        />
      </Document>
    </div>
  )
}
