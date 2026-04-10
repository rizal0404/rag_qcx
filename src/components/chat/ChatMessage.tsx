'use client'

import React from 'react'
import type { AppUIMessage, MessageData } from '@/types/chat'
import MarkdownRenderer from './MarkdownRenderer'
import CitationBadge from './CitationBadge'
import DiagramViewer from './DiagramViewer'
import SourcePreviewModal from './SourcePreviewModal'
import ConfidenceIndicator from './ConfidenceIndicator'
import FallbackCard from './FallbackCard'

interface ChatMessageProps {
  message: AppUIMessage
  customData?: MessageData
}

function getMessageText(message: AppUIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export default function ChatMessage({ message, customData }: ChatMessageProps) {
  const [selectedImageIndex, setSelectedImageIndex] = React.useState<number | null>(null)
  const [selectedCitationIndex, setSelectedCitationIndex] = React.useState<number | null>(null)
  const isAssistant = message.role === 'assistant'
  const textContent = getMessageText(message)
  const selectedImage =
    typeof selectedImageIndex === 'number' && customData?.images
      ? customData.images[selectedImageIndex] ?? null
      : null
  const selectedCitation =
    typeof selectedCitationIndex === 'number' && customData?.citations
      ? customData.citations[selectedCitationIndex] ?? null
      : null

  return (
    <>
      <div className={`flex w-full ${isAssistant ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`relative max-w-[85%] rounded-2xl px-6 py-5 shadow-lg ${
            isAssistant
              ? 'border border-indigo-500/20 bg-[#161626] text-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.4)]'
              : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_8px_30px_rgba(99,102,241,0.2)]'
          }`}
        >
          {isAssistant && (
            <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-gradient-to-b from-indigo-400 to-cyan-400"></div>
          )}
          
          <div className="mb-3 flex items-center gap-2">
            <div className="text-xs font-bold uppercase tracking-widest opacity-60">
              {isAssistant ? 'O.A.S.I.S' : 'You'}
            </div>
            {isAssistant && <div className="h-1 w-1 rounded-full bg-indigo-400"></div>}
            {isAssistant && <ConfidenceIndicator confidence={customData?.confidence} />}
          </div>

          <div className={`prose prose-sm max-w-none ${isAssistant ? 'chat-markdown' : 'text-white'}`}>
            {isAssistant ? (
              <MarkdownRenderer
                content={textContent}
                citations={customData?.citations}
                onCitationClick={(citationIndex) => setSelectedCitationIndex(citationIndex)}
              />
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed">{textContent}</div>
            )}
          </div>

          {isAssistant && customData?.citations && customData.citations.length > 0 && (
            <div className="mt-5 border-t border-white/5 pt-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                Sources Cited
              </div>
              <div className="mb-3 text-[11px] text-slate-500">
                Showing the top 3 unique sources. Highlighted badges are cited inline in the answer.
              </div>
              <div className="flex flex-wrap gap-2">
                {customData.citations.map((citation, idx) => (
                  <CitationBadge
                    key={`${citation.chunkId}-${idx}`}
                    citation={citation}
                    index={idx + 1}
                    onClick={() => setSelectedCitationIndex(idx)}
                  />
                ))}
              </div>
            </div>
          )}

          {isAssistant && customData?.images && customData.images.length > 0 && (
            <div className="mt-5 border-t border-white/5 pt-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                Attached Diagrams
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {customData.images.map((img, idx) => (
                  <button
                    key={`${img.url}-${idx}`}
                    type="button"
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#0f111a] text-left transition-all hover:border-indigo-500/50 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                    onClick={() => setSelectedImageIndex(idx)}
                  >
                    <div className="relative flex items-center justify-center bg-black/40 p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.caption} className="h-24 w-full rounded-lg object-contain opacity-90 transition-opacity group-hover:opacity-100" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                        <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                      </div>
                    </div>
                    <div className="border-t border-white/5 bg-white/5 px-3 py-3 backdrop-blur-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                        {img.imageType.replace(/_/g, ' ')}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-300 leading-relaxed">{img.caption}</div>
                      <div className="mt-2 text-[10px] text-slate-500">Page {img.pageNumber || 'N/A'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isAssistant && customData?.fallback && <div className="mt-4"><FallbackCard /></div>}
        </div>
      </div>

      <DiagramViewer image={selectedImage} onClose={() => setSelectedImageIndex(null)} />
      <SourcePreviewModal citation={selectedCitation} onClose={() => setSelectedCitationIndex(null)} />
    </>
  )
}
