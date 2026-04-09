import type { UIMessage } from 'ai'

export interface Citation {
  chunkId: string
  documentId?: string
  sectionPath: string
  pageNumbers: number[]
  documentTitle: string
  documentNumber?: string
  isInlineReferenced?: boolean
}

export interface ImageRef {
  url: string
  caption: string
  imageType: string
  pageNumber: number
}

// Custom data payload that we send along with the standard AI SDK chat messages
export interface MessageData {
  citations?: Citation[]
  images?: ImageRef[]
  fallback?: boolean
  confidence?: number
  sessionId?: string
  provider?: string
  model?: string
}

export interface ChatSessionSummary {
  id: string
  title: string
  preview: string | null
  lastMessageRole: 'user' | 'assistant' | null
  createdAt: string
  updatedAt: string
}

export type AppUIMessage = UIMessage<MessageData>
