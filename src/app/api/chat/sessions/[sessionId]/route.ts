import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  deleteChatSession,
  loadChatSessionMessages,
  renameChatSession,
} from '@/lib/chat/persistence'

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

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params
    const { title }: { title?: string } = await req.json()

    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      throw new Error(sessionError.message)
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    await renameChatSession(sessionId, title)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Rename chat session error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params
    const supabase = createAdminClient()
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionError) {
      throw new Error(sessionError.message)
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    await deleteChatSession(sessionId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete chat session error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
