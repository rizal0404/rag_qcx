import { randomUUID } from 'node:crypto'
import { convertToModelMessages } from 'ai'
import { buildContextFromResults } from '@/lib/search/contextBuilder'
import { detectFallback } from '@/lib/search/fallback'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { ensureChatSession, persistChatMessage } from '@/lib/chat/persistence'
import { createAdminClient } from '@/lib/supabase/admin'
import { retrieveContext } from '@/lib/chat/retrieval'
import { streamChatResponse } from '@/lib/chat/generation'
import type { AppUIMessage, ImageRef } from '@/types/chat'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function getLatestUserText(message: AppUIMessage | undefined): string | null {
  if (!message || message.role !== 'user') {
    return null
  }

  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim()

  return text.length > 0 ? text : null
}

async function loadImagesForChunks(chunkIds: string[]): Promise<ImageRef[]> {
  if (chunkIds.length === 0) {
    return []
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('images')
    .select('file_path, image_type, vlm_description, page_number')
    .in('chunk_id', chunkIds)

  if (error || !data) {
    if (error) {
      console.error('Failed to load images for chat response:', error)
    }

    return []
  }

  return data.map((image) => ({
    url: supabase.storage.from('manuals').getPublicUrl(image.file_path).data.publicUrl,
    caption: image.vlm_description || 'Referenced diagram',
    imageType: image.image_type,
    pageNumber: image.page_number || 0,
  }))
}

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const {
      messages,
      id,
      sessionId: requestedSessionId,
    }: { messages: AppUIMessage[]; id?: string; sessionId?: string } = await req.json()
    const lastMessage = messages[messages.length - 1]
    const queryText = getLatestUserText(lastMessage)

    if (!queryText) {
      return new Response('Invalid request', { status: 400 })
    }

    const sessionId = isUuid(requestedSessionId)
      ? requestedSessionId
      : isUuid(id)
        ? id
        : randomUUID()

    await ensureChatSession(sessionId, queryText)
    await persistChatMessage({
      sessionId,
      role: 'user',
      content: queryText,
    })

    const { searchResults } = await retrieveContext(queryText)
    const fallback = detectFallback(searchResults, queryText)
    
    const images = fallback.isFallback
      ? []
      : await loadImagesForChunks(searchResults.map((result) => result.chunk_id))

    const contextStr = fallback.isFallback ? '' : buildContextFromResults(searchResults)
    const systemPrompt = buildSystemPrompt(contextStr)
    const modelMessages = await convertToModelMessages(messages)

    return await streamChatResponse({ 
      sessionId, 
      searchResults, 
      fallback, 
      images, 
      contextStr, 
      messages, 
      modelMessages, 
      queryText, 
      systemPrompt 
    })
  } catch (error: unknown) {
    console.error('API /chat Error:', error)
    const message = error instanceof Error ? error.message : 'Internal Server Error'

    return new Response(JSON.stringify({ error: message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
