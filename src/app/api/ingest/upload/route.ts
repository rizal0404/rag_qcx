import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const equipmentModel = formData.get('equipment_model') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const documentId = crypto.randomUUID()
    const filePath = `manuals/${documentId}.pdf`

    // 1. Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('manuals')
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (uploadError) {
      console.error('Storage error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 })
    }

    // 2. Register Document in DB
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        title: title || file.name,
        doc_type: 'manual',
        equipment_model: equipmentModel || null,
        file_path: filePath,
        status: 'UPLOADED',
        total_chunks: 0,
      })

    if (dbError) {
      console.error('DB error:', dbError)
      return NextResponse.json({ error: 'Failed to save document metadata' }, { status: 500 })
    }

    // 3. (Optional) Trigger Extraction Pipeline here 
    // fetch('http://localhost:3000/api/ingest/process', { method: 'POST', body: JSON.stringify({ documentId }) })
    // For now we just return success

    return NextResponse.json({ success: true, documentId })

  } catch (error: any) {
    console.error('Upload Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
