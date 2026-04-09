'use client'

import React from 'react'
import type { ChatSessionSummary } from '@/types/chat'

interface ChatHistorySidebarProps {
  activeSessionId: string | null
  busySessionId?: string | null
  isLoading: boolean
  onClose?: () => void
  onDeleteSession: (sessionId: string) => void
  onNewChat: () => void
  onRenameSession: (sessionId: string, title: string) => void
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
  busySessionId,
  isLoading,
  onClose,
  onDeleteSession,
  onNewChat,
  onRenameSession,
  onSelectSession,
  sessions,
  title = 'History',
}: ChatHistorySidebarProps) {
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null)
  const [editingTitle, setEditingTitle] = React.useState('')
  const [deleteCandidate, setDeleteCandidate] = React.useState<ChatSessionSummary | null>(null)

  const beginRename = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId)
    setEditingTitle(currentTitle)
  }

  const cancelRename = () => {
    setEditingSessionId(null)
    setEditingTitle('')
  }

  const closeDeleteDialog = () => {
    setDeleteCandidate(null)
  }

  const submitRename = (sessionId: string) => {
    const nextTitle = editingTitle.trim()

    if (!nextTitle) {
      cancelRename()
      return
    }

    onRenameSession(sessionId, nextTitle)
    cancelRename()
  }

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
              const isBusy = session.id === busySessionId
              const isEditing = session.id === editingSessionId

              return (
                <div
                  key={session.id}
                  className={`rounded-2xl border transition ${
                    isActive
                      ? 'border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                      : 'border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-start gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      disabled={isBusy}
                      className="min-w-0 flex-1 rounded-xl px-1 py-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingTitle}
                              onChange={(event) => setEditingTitle(event.target.value)}
                              onBlur={() => submitRename(session.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  submitRename(session.id)
                                }

                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  cancelRename()
                                }
                              }}
                              className="w-full rounded-lg border border-cyan-400/30 bg-black/30 px-2 py-1 text-sm font-medium text-white outline-none"
                            />
                          ) : (
                            <div className={`truncate text-sm font-medium ${isActive ? 'text-white' : 'text-slate-200'}`}>
                              {session.title}
                            </div>
                          )}
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {session.preview || 'Open this chat to continue the conversation.'}
                          </div>
                        </div>
                        <div className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {isBusy ? 'Saving' : formatTimestamp(session.updatedAt)}
                        </div>
                      </div>
                    </button>

                    {!isEditing ? (
                      <div className="flex shrink-0 items-center gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => beginRename(session.id, session.title)}
                          disabled={isBusy}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Rename ${session.title}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteCandidate(session)}
                          disabled={isBusy}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-slate-400 transition hover:border-rose-400/30 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Delete ${session.title}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {deleteCandidate ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#02040b]/82 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0f17]/95 shadow-2xl">
            <div className="border-b border-white/8 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-300/80">
                Delete Session
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                Remove &ldquo;{deleteCandidate.title}&rdquo;?
              </div>
              <div className="mt-2 text-sm leading-relaxed text-slate-400">
                This will permanently delete the session and all messages stored in it. This action cannot be undone.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={busySessionId === deleteCandidate.id}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteSession(deleteCandidate.id)
                  closeDeleteDialog()
                }}
                disabled={busySessionId === deleteCandidate.id}
                className="inline-flex items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/45 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busySessionId === deleteCandidate.id ? 'Deleting...' : 'Delete session'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
