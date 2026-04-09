'use client'

import React, { useRef, useEffect } from 'react'

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
}

export default function ChatInput({ input, handleInputChange, handleSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim() !== '') {
        const fakeEvent = new Event('submit', { cancelable: true }) as unknown as React.FormEvent<HTMLFormElement>
        handleSubmit(fakeEvent)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-end overflow-hidden rounded-2xl border border-white/10 bg-[#0f111a]/80 shadow-[0_4px_24px_rgba(0,0,0,0.5)] focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all duration-300">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything about the manual..."
        className="max-h-[150px] w-full resize-none border-none bg-transparent px-5 py-4 text-[15px] leading-relaxed text-white outline-none placeholder:text-slate-500"
        rows={1}
      />
      <div className="p-2 pb-2.5 pr-2.5">
        <button
          type="submit"
          disabled={isLoading || input.trim() === ''}
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all hover:bg-indigo-500 disabled:bg-white/5 disabled:text-slate-500 disabled:shadow-none hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]"
        >
          {/* Subtle glow effect inside the button */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-indigo-500/0 to-white/20 opacity-0 transition-opacity group-hover:opacity-100 disabled:hidden"></div>
          
          <svg className="relative z-10 -ml-0.5 mt-0.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </form>
  )
}
