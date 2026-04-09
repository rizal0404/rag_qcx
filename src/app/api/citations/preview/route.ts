import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SIGNED_URL_TTL_SECONDS = 60 * 10

export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get('documentId')?.trim()
  const chunkId = request.nextUrl.searchParams.get('chunkId')?.trim()

  if (!documentId && !chunkId) {
    return NextResponse.json({ error: 'documentId or chunkId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  let resolvedDocumentId = documentId

  if (!resolvedDocumentId && chunkId) {
    const { data: chunk, error: chunkError } = await supabase
      .from('chunks')
      .select('document_id')
      .eq('id', chunkId)
      .single()

    if (chunkError || !chunk?.document_id) {
      return NextResponse.json(
        { error: chunkError?.message ?? 'Chunk not found' },
        { status: 404 },
      )
    }

    resolvedDocumentId = chunk.document_id
  }

  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('id, title, file_path')
    .eq('id', resolvedDocumentId)
    .single()

  if (documentError || !document?.file_path) {
    return NextResponse.json(
      { error: documentError?.message ?? 'Document not found' },
      { status: 404 },
    )
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from('manuals')
    .createSignedUrl(document.file_path, SIGNED_URL_TTL_SECONDS)

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? 'Failed to create preview URL' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    documentId: document.id,
    documentTitle: document.title,
    signedUrl: signedUrlData.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  })
}
