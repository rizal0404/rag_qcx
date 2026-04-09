'use client'

import React from 'react'

export interface ChatToast {
  id: string
  title: string
  description?: string
  tone: 'success' | 'error'
}

interface ChatToastStackProps {
  toasts: ChatToast[]
  onDismiss: (toastId: string) => void
}

export default function ChatToastStack({ toasts, onDismiss }: ChatToastStackProps) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(92vw,24rem)] flex-col gap-3">
      {toasts.map((toast) => {
        const isSuccess = toast.tone === 'success'

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${
              isSuccess
                ? 'border-emerald-400/25 bg-emerald-500/10'
                : 'border-rose-400/25 bg-rose-500/10'
            }`}
          >
            <div className="flex items-start gap-3 px-4 py-4">
              <div
                className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  isSuccess ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200'
                }`}
              >
                {isSuccess ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m15 9-6 6" />
                    <path d="m9 9 6 6" />
                  </svg>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{toast.title}</div>
                {toast.description ? (
                  <div className="mt-1 text-sm leading-relaxed text-slate-300">{toast.description}</div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:text-white"
                aria-label="Dismiss notification"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
