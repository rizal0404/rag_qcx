import React from 'react'
import UploadForm from '@/components/admin/UploadForm'

export const metadata = {
  title: 'Upload Manual | RAG Chatbot',
}

export default function UploadPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Upload Technical Manual</h2>
        <p className="text-slate-500 mt-1">Upload a PDF manual to extract and index its contents.</p>
      </div>

      <UploadForm />
    </div>
  )
}
