'use client'

import React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { AppUIMessage, ChatSessionSummary } from '@/types/chat'
import ChatHistorySidebar from './ChatHistorySidebar'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ChatToastStack, { type ChatToast } from './ChatToastStack'

const SESSION_QUERY_PARAM = 'session'
const LAST_SESSION_STORAGE_KEY = 'rag-chat:last-session-id'

function createClientUuid(): string {
  return crypto.randomUUID()
}

function createDraftSession() {
  return {
    id: createClientUuid(),
    messages: [] as AppUIMessage[],
  }
}

export default function ChatInterface() {
  const [input, setInput] = React.useState('')
  const [draftSession, setDraftSession] = React.useState(createDraftSession)
  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = React.useState(true)
  const [isSessionLoading, setIsSessionLoading] = React.useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)
  const [busySessionId, setBusySessionId] = React.useState<string | null>(null)
  const [toasts, setToasts] = React.useState<ChatToast[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const hasAttemptedRestoreRef = React.useRef(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const syncSessionReference = React.useCallback(
    (sessionId: string | null) => {
      if (typeof window !== 'undefined') {
        if (sessionId) {
          window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, sessionId)
        } else {
          window.localStorage.removeItem(LAST_SESSION_STORAGE_KEY)
        }
      }

      const params = new URLSearchParams(searchParams.toString())

      if (sessionId) {
        params.set(SESSION_QUERY_PARAM, sessionId)
      } else {
        params.delete(SESSION_QUERY_PARAM)
      }

      const queryString = params.toString()
      const nextUrl = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(nextUrl, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const clearSessionReference = React.useCallback(() => {
    syncSessionReference(null)
  }, [syncSessionReference])

  const dismissToast = React.useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId))
  }, [])

  const pushToast = React.useCallback((toast: Omit<ChatToast, 'id'>) => {
    const id = createClientUuid()
    setToasts((current) => [...current, { id, ...toast }])

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4000)
  }, [])

  const readErrorMessage = React.useCallback(async (response: Response, fallback: string) => {
    try {
      const payload = (await response.json()) as { error?: string }
      return payload.error || fallback
    } catch {
      return fallback
    }
  }, [])

  const loadSessions = React.useCallback(async () => {
    setIsHistoryLoading(true)

    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as { sessions?: ChatSessionSummary[] }
      setSessions(payload.sessions ?? [])
    } catch (error) {
      console.error('Failed to load chat session list:', error)
    } finally {
      setIsHistoryLoading(false)
    }
  }, [])

  const openStoredSession = React.useCallback(
    async (sessionId: string, closeHistory = true) => {
      if (!sessionId || isSessionLoading) {
        return false
      }

      if (sessionId === draftSession.id && draftSession.messages.length > 0) {
        syncSessionReference(sessionId)
        if (closeHistory) {
          setIsHistoryOpen(false)
        }
        return true
      }

      setIsSessionLoading(true)

      try {
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
          method: 'GET',
          cache: 'no-store',
        })

        if (!response.ok) {
          if (response.status === 404) {
            clearSessionReference()
          }

          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          messages?: AppUIMessage[]
          session?: { id?: string }
        }

        const nextSessionId = payload.session?.id || sessionId
        setInput('')
        setDraftSession({
          id: nextSessionId,
          messages: payload.messages ?? [],
        })
        syncSessionReference(nextSessionId)

        if (closeHistory) {
          setIsHistoryOpen(false)
        }

        return true
      } catch (error) {
        console.error(`Failed to load chat session ${sessionId}:`, error)
        return false
      } finally {
        setIsSessionLoading(false)
      }
    },
    [
      clearSessionReference,
      draftSession.id,
      draftSession.messages.length,
      isSessionLoading,
      syncSessionReference,
    ],
  )

  React.useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  React.useEffect(() => {
    if (hasAttemptedRestoreRef.current || isHistoryLoading) {
      return
    }

    hasAttemptedRestoreRef.current = true

    const sessionIdFromUrl = searchParams.get(SESSION_QUERY_PARAM)
    const sessionIdFromStorage =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LAST_SESSION_STORAGE_KEY)
        : null
    const sessionToRestore = sessionIdFromUrl || sessionIdFromStorage

    if (sessionToRestore) {
      void openStoredSession(sessionToRestore, false)
    }
  }, [isHistoryLoading, openStoredSession, searchParams])

  const {
    messages,
    sendMessage,
    status,
  } = useChat<AppUIMessage>({
    id: draftSession.id,
    messages: draftSession.messages,
    generateId: createClientUuid,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ id, messages, body }) => ({
        body: {
          ...body,
          messages,
          sessionId: id,
        },
      }),
    }),
    onFinish: ({ message }) => {
      const nextSessionId = message.metadata?.sessionId ?? draftSession.id

      if (nextSessionId !== draftSession.id) {
        setDraftSession((current) => ({
          ...current,
          id: nextSessionId,
        }))
      }

      syncSessionReference(nextSessionId)
      void loadSessions()
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'
  const selectedSession = sessions.find((session) => session.id === draftSession.id) ?? null

  React.useEffect(() => {
    if (!scrollRef.current) {
      return
    }

    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isLoading, draftSession.id])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!input.trim() || isLoading) {
      return
    }

    sendMessage({ text: input })
    setInput('')
  }

  const handleNewChat = React.useCallback(() => {
    setInput('')
    setDraftSession(createDraftSession())
    setIsHistoryOpen(false)
    clearSessionReference()
  }, [clearSessionReference])

  const handleSelectSession = React.useCallback(
    async (sessionId: string) => {
      await openStoredSession(sessionId)
    },
    [openStoredSession],
  )

  const handleRenameSession = React.useCallback(
    async (sessionId: string, title: string) => {
      setBusySessionId(sessionId)

      try {
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title }),
        })

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Failed to rename session'))
        }

        await loadSessions()
        pushToast({
          tone: 'success',
          title: 'Session renamed',
          description: 'The chat title has been updated.',
        })
      } catch (error) {
        console.error(`Failed to rename chat session ${sessionId}:`, error)
        pushToast({
          tone: 'error',
          title: 'Rename failed',
          description: error instanceof Error ? error.message : 'The session title could not be updated.',
        })
      } finally {
        setBusySessionId(null)
      }
    },
    [loadSessions, pushToast, readErrorMessage],
  )

  const handleDeleteSession = React.useCallback(
    async (sessionId: string) => {
      setBusySessionId(sessionId)

      try {
        const response = await fetch(`/api/chat/sessions/${sessionId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Failed to delete session'))
        }

        if (draftSession.id === sessionId) {
          setInput('')
          setDraftSession(createDraftSession())
          clearSessionReference()
        }

        await loadSessions()
        pushToast({
          tone: 'success',
          title: 'Session deleted',
          description: 'The selected chat history has been removed.',
        })
      } catch (error) {
        console.error(`Failed to delete chat session ${sessionId}:`, error)
        pushToast({
          tone: 'error',
          title: 'Delete failed',
          description: error instanceof Error ? error.message : 'The session could not be deleted.',
        })
      } finally {
        setBusySessionId(null)
      }
    },
    [clearSessionReference, draftSession.id, loadSessions, pushToast, readErrorMessage],
  )

  return (
    <>
      <ChatToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="flex h-full gap-4 lg:gap-5">
        <div className="hidden w-[320px] shrink-0 lg:block">
        <ChatHistorySidebar
          activeSessionId={selectedSession?.id ?? null}
          busySessionId={busySessionId}
          isLoading={isHistoryLoading}
          onDeleteSession={handleDeleteSession}
          onNewChat={handleNewChat}
          onRenameSession={handleRenameSession}
          onSelectSession={handleSelectSession}
          sessions={sessions}
        />
        </div>

        {isHistoryOpen ? (
          <div className="fixed inset-0 z-40 bg-[#02040b]/80 backdrop-blur-sm lg:hidden">
            <div className="absolute inset-y-0 left-0 w-[88vw] max-w-sm p-4">
              <ChatHistorySidebar
                activeSessionId={selectedSession?.id ?? null}
                busySessionId={busySessionId}
                isLoading={isHistoryLoading}
                onClose={() => setIsHistoryOpen(false)}
                onDeleteSession={handleDeleteSession}
                onNewChat={handleNewChat}
                onRenameSession={handleRenameSession}
                onSelectSession={handleSelectSession}
                sessions={sessions}
                title="Sessions"
              />
            </div>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex h-full flex-col overflow-hidden rounded-[2rem] glass-panel transition-all duration-300">
          <div className="relative flex items-center justify-between border-b border-white/5 bg-white/5 px-4 py-4 shadow-sm backdrop-blur-md sm:px-6">
            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>

            <div className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-400/30 hover:text-white lg:hidden"
                aria-label="Open chat history"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h18" />
                  <path d="M3 6h18" />
                  <path d="M3 18h18" />
                </svg>
              </button>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/20 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-wide text-white">
                  {selectedSession?.title || 'Technical Assistant'}
                </h2>
                <p className="mt-0.5 truncate text-xs font-medium uppercase tracking-widest text-indigo-300/80">
                  {selectedSession ? 'Loaded chat history' : 'QCX PTD120 Manual Support'}
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_5px_theme('colors.indigo.400')]"></span>
              Strict Mode
            </div>
          </div>

          <div
            ref={scrollRef}
            className="relative flex-1 space-y-6 overflow-y-auto bg-transparent p-4 sm:p-6"
          >
            {isSessionLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-3xl border border-white/10 bg-black/30 px-6 py-5 text-center backdrop-blur-xl">
                  <div className="mx-auto flex w-fit items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 typing-dot"></span>
                    <span className="h-2 w-2 rounded-full bg-indigo-400 typing-dot"></span>
                    <span className="h-2 w-2 rounded-full bg-violet-400 typing-dot"></span>
                  </div>
                  <div className="mt-4 text-sm font-medium text-slate-200">Loading session history...</div>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center animate-fade-in-up">
                <div className="max-w-md text-center">
                  <div className="group relative mx-auto mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl backdrop-blur-sm">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
                    <div className="absolute -inset-1 animate-pulse-glow bg-gradient-to-r from-indigo-500/30 to-cyan-500/30 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"></div>
                    <svg className="relative z-10 h-10 w-10 text-indigo-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                    </svg>
                  </div>
                  <p className="text-xl font-semibold tracking-tight text-white">
                    {selectedSession ? 'Continue this conversation' : 'How can I help you today?'}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">
                    Ask about specifications, safety procedures, or request diagrams from the manual. I will cite the exact sources for you.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <span className="rounded-full border border-white/5 bg-white/5 px-3 py-1 text-xs text-slate-300">&ldquo;PLC supply voltage?&rdquo;</span>
                    <span className="rounded-full border border-white/5 bg-white/5 px-3 py-1 text-xs text-slate-300">&ldquo;Diverter dimensions?&rdquo;</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-2">
                {messages.map((message, idx) => (
                  <div
                    key={message.id}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(idx * 0.05, 0.3)}s` }}
                  >
                    <ChatMessage
                      message={message}
                      customData={message.role === 'assistant' ? message.metadata : undefined}
                    />
                  </div>
                ))}
              </div>
            )}

            {isLoading ? (
              <div className="flex w-full animate-fade-in-up">
                <div className="flex max-w-[85%] items-center overflow-hidden rounded-2xl border border-indigo-500/20 bg-[#161626] shadow-lg">
                  <div className="w-1 self-stretch bg-gradient-to-b from-indigo-400 to-cyan-400"></div>
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-500 typing-dot"></span>
                      <span className="h-2 w-2 rounded-full bg-indigo-400 typing-dot"></span>
                      <span className="h-2 w-2 rounded-full bg-cyan-400 typing-dot"></span>
                    </div>
                    <span className="text-sm font-medium text-indigo-200/70">Analyzing knowledge base...</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative border-t border-white/5 bg-black/20 p-4 backdrop-blur-xl sm:p-6">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            <ChatInput
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isLoading={isLoading || isSessionLoading}
            />
          </div>
          </div>
        </div>
      </div>
    </>
  )
}
