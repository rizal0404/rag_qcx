'use client'

import React from 'react'
import type { ChatSessionSummary } from '@/types/chat'

interface ChatHistorySidebarProps {
  activeSessionId: string | null
  isLoading: boolean
  onClose?: () => void
  onNewChat: () => void
  onSelectSession: (sessionId: string) => void
  sessions: ChatSessionSummary[]
  title?: string
}

function formatTimestamp(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export default function ChatHistorySidebar({
  activeSessionId,
  isLoading,
  onClose,
  onNewChat,
  onSelectSession,
  sessions,
  title = 'History',
}: ChatHistorySidebarProps) {
  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/30 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
            {title}
          </div>
          <div className="mt-1 text-sm text-slate-400">Open previous sessions or start a new one.</div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
            aria-label="Close history panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="border-b border-white/8 p-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-between rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 px-4 py-3 text-left text-sm font-medium text-white transition hover:border-cyan-400/40 hover:from-cyan-500/15 hover:to-indigo-500/15"
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
            <span>New chat</span>
          </span>
          <span className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Fresh</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="space-y-3 px-1">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4"
              >
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
                <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-white/5" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm leading-relaxed text-slate-400">
            No saved sessions yet. Start a chat and it will appear here.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId

              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    isActive
                      ? 'border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                      : 'border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-medium ${isActive ? 'text-white' : 'text-slate-200'}`}>
                        {session.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {session.preview || 'Open this chat to continue the conversation.'}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {formatTimestamp(session.updatedAt)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
