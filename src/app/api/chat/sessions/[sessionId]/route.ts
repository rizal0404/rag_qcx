import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadChatSessionMessages } from '@/lib/chat/persistence'

interface RouteContext {
  params: Promise<{
    sessionId: string
  }>
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params
    const supabase = createAdminClient()
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at, updated_at')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      throw new Error(sessionError.message)
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const messages = await loadChatSessionMessages(sessionId)

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title?.trim() || 'Untitled chat',
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
      messages,
    })
  } catch (error) {
    console.error('Load chat session error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
