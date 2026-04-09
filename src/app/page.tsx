import { Suspense } from 'react'
import ChatInterface from '@/components/chat/ChatInterface'

function ChatInterfaceFallback() {
  return (
    <div className="glass-panel flex h-full items-center justify-center overflow-hidden rounded-[2rem] border border-white/8 bg-black/20">
      <div className="rounded-3xl border border-white/10 bg-black/30 px-6 py-5 text-center backdrop-blur-xl">
        <div className="mx-auto flex w-fit items-center gap-2">
          <span className="typing-dot h-2 w-2 rounded-full bg-cyan-400"></span>
          <span className="typing-dot h-2 w-2 rounded-full bg-indigo-400"></span>
          <span className="typing-dot h-2 w-2 rounded-full bg-violet-400"></span>
        </div>
        <div className="mt-4 text-sm font-medium text-slate-200">Preparing chat workspace...</div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-8 sm:py-10">
      {/* Immersive background decoration */}
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-indigo-600/20 mix-blend-screen blur-[128px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-[30rem] w-[30rem] rounded-full bg-violet-600/15 mix-blend-screen blur-[128px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-[25rem] w-[25rem] rounded-full bg-cyan-600/10 mix-blend-screen blur-[128px]" />

      <div className="relative mx-auto flex h-[calc(100vh-3rem)] max-w-6xl flex-col sm:h-[calc(100vh-5rem)]">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-in-up">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-indigo-300 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
              </span>
              RAG Engine Active
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Knowledge Base <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Assistant</span>
            </h1>
          </div>
          <div className="max-w-sm text-sm leading-relaxed text-slate-400">
            Intelligent retrieval constrained strictly to indexed technical manuals. Every answer is grounded and paired with precise source citations.
          </div>
        </header>

        <div className="flex-1 overflow-hidden transition-all duration-500 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <Suspense fallback={<ChatInterfaceFallback />}>
            <ChatInterface />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
