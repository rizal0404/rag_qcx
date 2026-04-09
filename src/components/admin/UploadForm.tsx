'use client'

import React, { useState } from 'react'

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [model, setModel] = useState('QCX PTD120')
  const [isUploading, setIsUploading] = useState(false)
  const [successDocumentId, setSuccessDocumentId] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      // Auto fill title if empty
      if (!title) {
        setTitle(e.target.files[0].name.replace('.pdf', '').replace(/[-_]/g, ' '))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setIsUploading(true)
    setSuccessDocumentId(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      formData.append('equipment_model', model)
      
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const payload = await response.json()
      setSuccessDocumentId(payload.document?.id ?? null)
      setFile(null)
      setTitle('')
      
    } catch (err) {
      console.error(err)
      alert('Failed to upload document')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-lg shadow-sm border border-slate-200">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Technical Document (PDF)</label>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition cursor-pointer relative">
            <input 
              type="file" 
              accept=".pdf"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              required
            />
            {file ? (
              <div className="text-blue-600 font-medium">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</div>
            ) : (
              <div className="text-slate-500">
                <svg className="mx-auto h-12 w-12 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="font-medium text-slate-600 block">Click to select or drag and drop</span>
                <span className="text-xs text-slate-400 mt-1">PDF up to 50MB</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Document Title</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Operation & Maintenance Manual"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Equipment Model</label>
          <input 
            type="text" 
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full border border-slate-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. QCX PTD120"
          />
        </div>

        <button 
          type="submit" 
          disabled={!file || isUploading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-md transition-colors disabled:bg-slate-300 flex justify-center"
        >
          {isUploading ? (
             <span className="flex items-center gap-2">
               <span className="w-4 h-4 rounded-full border-2 border-t-white border-white/30 animate-spin flex-shrink-0" />
               Uploading & Initializing...
             </span>
          ) : 'Upload Document'}
        </button>

        {successDocumentId && (
          <div className="p-4 bg-green-50 text-green-700 rounded border border-green-200 text-sm">
            Document uploaded and registered successfully. Document ID: <span className="font-mono">{successDocumentId}</span>. Ingestion still needs to be triggered through the processing endpoint.
          </div>
        )}
      </div>
    </form>
  )
}
