import { NextResponse } from 'next/server'
import { listChatSessions } from '@/lib/chat/persistence'

export async function GET() {
  try {
    const sessions = await listChatSessions()
    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('List chat sessions error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
