import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ChatMessage as StoredChatMessage,
  ChatSession as StoredChatSession,
  Chunk,
  Document,
} from '@/types/database'
import type { AppUIMessage, ChatSessionSummary, Citation, ImageRef } from '@/types/chat'

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildSessionTitle(queryText: string): string {
  const normalized = normalizeWhitespace(queryText)
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized
}

function trimPreview(content: string | null | undefined): string | null {
  if (!content) {
    return null
  }

  const normalized = normalizeWhitespace(content)
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized
}

function toTextParts(content: string) {
  return [{ type: 'text' as const, text: content }]
}

function parseStoredImages(value: unknown): ImageRef[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const images = value.filter((item): item is ImageRef => {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ImageRef).url === 'string' &&
      typeof (item as ImageRef).caption === 'string' &&
      typeof (item as ImageRef).imageType === 'string' &&
      typeof (item as ImageRef).pageNumber === 'number'
    )
  })

  return images.length > 0 ? images : undefined
}

function buildCitationFromChunk(
  chunk: Pick<Chunk, 'id' | 'document_id' | 'section_path' | 'page_numbers' | 'metadata'>,
  document: Pick<Document, 'title' | 'doc_number'> | undefined,
): Citation {
  return {
    chunkId: chunk.id,
    documentId: chunk.document_id,
    sectionPath: chunk.section_path || 'General',
    pageNumbers: Array.isArray(chunk.page_numbers) ? chunk.page_numbers : [],
    documentTitle:
      chunk.metadata?.documentTitle ??
      document?.title ??
      'Unknown',
    documentNumber:
      chunk.metadata?.documentNumber ??
      document?.doc_number ??
      undefined,
  }
}

export async function ensureChatSession(sessionId: string, queryText: string): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const { data: existingSession, error: fetchError } = await supabase
    .from('chat_sessions')
    .select('id, title')
    .eq('id', sessionId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Failed to read chat session: ${fetchError.message}`)
  }

  if (existingSession?.id) {
    const updates: Record<string, string> = {
      updated_at: now,
    }

    if (!existingSession.title?.trim()) {
      updates.title = buildSessionTitle(queryText)
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update(updates)
      .eq('id', sessionId)

    if (updateError) {
      throw new Error(`Failed to persist chat session: ${updateError.message}`)
    }

    return
  }

  const { error: insertError } = await supabase.from('chat_sessions').insert({
    id: sessionId,
    title: buildSessionTitle(queryText),
    updated_at: now,
  })

  if (insertError) {
    throw new Error(`Failed to persist chat session: ${insertError.message}`)
  }
}

export async function persistChatMessage(input: {
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  citedChunkIds?: string[]
  citedImages?: ImageRef[]
  isFallback?: boolean
}): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('chat_messages').insert({
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    cited_chunk_ids: input.citedChunkIds ?? [],
    cited_images: input.citedImages && input.citedImages.length > 0 ? input.citedImages : null,
    is_fallback: input.isFallback ?? false,
  })

  if (error) {
    throw new Error(`Failed to persist chat message: ${error.message}`)
  }

  const { error: sessionUpdateError } = await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.sessionId)

  if (sessionUpdateError) {
    throw new Error(`Failed to update chat session timestamp: ${sessionUpdateError.message}`)
  }
}

export async function listChatSessions(limit = 50): Promise<ChatSessionSummary[]> {
  const supabase = createAdminClient()
  const { data: sessions, error: sessionsError } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (sessionsError) {
    throw new Error(`Failed to load chat sessions: ${sessionsError.message}`)
  }

  const typedSessions = (sessions || []) as StoredChatSession[]
  const sessionIds = typedSessions.map((session) => session.id)

  if (sessionIds.length === 0) {
    return []
  }

  const { data: messages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('session_id, role, content, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })

  if (messagesError) {
    throw new Error(`Failed to load chat session previews: ${messagesError.message}`)
  }

  const latestMessageBySession = new Map<
    string,
    Pick<StoredChatMessage, 'session_id' | 'role' | 'content' | 'created_at'>
  >()

  for (const message of messages || []) {
    if (!latestMessageBySession.has(message.session_id)) {
      latestMessageBySession.set(message.session_id, message)
    }
  }

  return typedSessions.map((session) => {
    const latestMessage = latestMessageBySession.get(session.id)

    return {
      id: session.id,
      title: session.title?.trim() || 'Untitled chat',
      preview: trimPreview(latestMessage?.content),
      lastMessageRole:
        latestMessage?.role === 'user' || latestMessage?.role === 'assistant'
          ? latestMessage.role
          : null,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    }
  })
}

export async function loadChatSessionMessages(sessionId: string): Promise<AppUIMessage[]> {
  const supabase = createAdminClient()
  const { data: messages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (messagesError) {
    throw new Error(`Failed to load chat messages: ${messagesError.message}`)
  }

  const typedMessages = (messages || []) as StoredChatMessage[]
  const citedChunkIds = Array.from(
    new Set(typedMessages.flatMap((message) => message.cited_chunk_ids || [])),
  )

  const chunkMap = new Map<
    string,
    Pick<Chunk, 'id' | 'document_id' | 'section_path' | 'page_numbers' | 'metadata'>
  >()
  const documentMap = new Map<string, Pick<Document, 'id' | 'title' | 'doc_number'>>()

  if (citedChunkIds.length > 0) {
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, document_id, section_path, page_numbers, metadata')
      .in('id', citedChunkIds)

    if (chunksError) {
      throw new Error(`Failed to load cited chunks: ${chunksError.message}`)
    }

    for (const chunk of chunks || []) {
      chunkMap.set(chunk.id, chunk)
    }

    const documentIds = Array.from(
      new Set((chunks || []).map((chunk) => chunk.document_id).filter(Boolean)),
    )

    if (documentIds.length > 0) {
      const { data: documents, error: documentsError } = await supabase
        .from('documents')
        .select('id, title, doc_number')
        .in('id', documentIds)

      if (documentsError) {
        throw new Error(`Failed to load cited documents: ${documentsError.message}`)
      }

      for (const document of documents || []) {
        documentMap.set(document.id, document)
      }
    }
  }

  return typedMessages.map((message) => {
    const citations = (message.cited_chunk_ids || [])
      .map((chunkId) => {
        const chunk = chunkMap.get(chunkId)

        if (!chunk) {
          return null
        }

        return buildCitationFromChunk(chunk, documentMap.get(chunk.document_id))
      })
      .filter((citation): citation is Citation => citation !== null)

    return {
      id: message.id,
      role: message.role,
      parts: toTextParts(message.content),
      metadata:
        message.role === 'assistant'
          ? {
              citations,
              images: parseStoredImages(message.cited_images),
              fallback: message.is_fallback,
              sessionId,
            }
          : undefined,
    }
  })
}
