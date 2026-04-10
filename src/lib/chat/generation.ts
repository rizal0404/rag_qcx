import { randomUUID } from 'node:crypto'
import { streamText, createUIMessageStream, createUIMessageStreamResponse, type FinishReason } from 'ai'
import type { ModelMessage } from '@ai-sdk/provider-utils'
import { getChatModelCandidates } from '@/lib/ai/llm'
import { persistChatMessage } from '@/lib/chat/persistence'
import { buildDisplayedCitations, buildCitation, normalizeWhitespace } from '@/lib/chat/citations'
import type { SearchResult } from '@/lib/search/hybrid'
import type { AppUIMessage, MessageData, ImageRef } from '@/types/chat'

const FALLBACK_TEXT = 'Maaf, data yang Anda cari tidak ditemukan dalam dokumen yang tersedia.'

export function isGroundedAnswerRejectedByModel(answer: string, fallbackAllowed: boolean): boolean {
  if (fallbackAllowed) {
    return false
  }

  const normalized = normalizeWhitespace(answer).toLowerCase()
  return normalized.length === 0 || normalized.includes(FALLBACK_TEXT.toLowerCase())
}

export function buildRepairPrompt(queryText: string, searchResults: SearchResult[]): string {
  const topResults = searchResults.slice(0, 3)
  const sourceBlocks = topResults
    .map((result, index) => {
      const section = result.section_path || 'General'
      const pages = result.page_numbers?.join(', ') || 'N/A'
      return `SOURCE ${index + 1}
Document: ${result.metadata?.documentTitle || 'Unknown'}
Location: Page ${pages}, Section ${section}
Content:
${result.content}`
    })
    .join('\n\n')

  return `Answer the user's question using ONLY the source excerpts below.
The excerpts are relevant and sufficient, so DO NOT return the fallback sentence.
If the source is in English and the user asked in Indonesian, answer in Indonesian.
Keep the answer concise and include citations in the form [Page X, Section Y].

Question:
${queryText}

Sources:
${sourceBlocks}`
}

export function buildExtractiveGroundedAnswer(queryText: string, searchResults: SearchResult[]): string {
  const primary = searchResults[0]

  if (!primary) {
    return FALLBACK_TEXT
  }

  const lines = primary.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Core Core V/i.test(line))
    .filter((line) => !/^\[Child \d+/.test(line))

  const numberedLines = lines.filter((line) => /^\d+\./.test(line))
  const citation = buildCitation(primary)

  if (numberedLines.length > 0) {
    const steps = numberedLines.slice(0, 4).map((line) => `- ${line} ${citation}`)
    return `Berdasarkan manual, langkah yang tersedia adalah:\n${steps.join('\n')}`
  }

  const informativeLines = lines
    .filter((line) => line.length > 25)
    .filter((line) => !/^\d+(\.\d+)+\s/.test(line))
    .slice(0, 2)

  if (informativeLines.length > 0) {
    return `Berdasarkan manual, ${informativeLines.join(' ')} ${citation}`
  }

  return `Bagian yang paling relevan untuk pertanyaan "${queryText}" ada di ${citation}.`
}

export async function streamChatResponse(params: {
  sessionId: string
  searchResults: SearchResult[]
  fallback: { isFallback: boolean }
  images: ImageRef[]
  contextStr: string
  messages: AppUIMessage[]
  modelMessages: ModelMessage[]
  queryText: string
  systemPrompt: string
}) {
  const { sessionId, searchResults, fallback, images, messages, modelMessages, queryText, systemPrompt } = params
  
  const temperature = Number.parseFloat(process.env.LLM_TEMPERATURE || '0.1')
  const candidates = getChatModelCandidates()

  if (candidates.length === 0) {
    throw new Error('No chat provider is configured. Set OPENROUTER_API_KEY or a fallback provider key.')
  }

  const stream = createUIMessageStream<AppUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const textId = randomUUID()
      let accumulatedText = ''
      let streamSuccess = false
      let finishReason: FinishReason = 'stop'
      let selectedProvider = ''
      let selectedModel = ''
      let lastError: unknown
      
      writer.write({ type: 'start' })
      writer.write({ type: 'text-start', id: textId })

      // Try each provider with streaming
      for (const candidate of candidates) {
        try {
          const result = streamText({
            model: candidate.model,
            system: systemPrompt,
            messages: modelMessages,
            temperature,
          })

          for await (const delta of result.textStream) {
            accumulatedText += delta
            writer.write({ type: 'text-delta', id: textId, delta })
          }

          selectedProvider = candidate.provider
          selectedModel = candidate.modelId
          finishReason = (await result.finishReason) ?? 'stop'
          streamSuccess = true

          // Note: Repair prompt is disabled in Phase 1 due to streaming limitations.
          // Will be implemented as post-stream validation in Phase 2.
          break
        } catch (error) {
           lastError = error
          console.error(`Stream provider failed: ${candidate.provider}`, error)
        }
      }

      // If all streaming providers failed, use extractive fallback
      if (!streamSuccess && !fallback.isFallback) {
        accumulatedText = buildExtractiveGroundedAnswer(queryText, searchResults)
        writer.write({ type: 'text-delta', id: textId, delta: accumulatedText })
        selectedProvider = 'extractive-fallback'
        selectedModel = 'grounded-extractive'
      } else if (!streamSuccess) {
        accumulatedText = FALLBACK_TEXT
        writer.write({ type: 'text-delta', id: textId, delta: accumulatedText })
        selectedProvider = 'fallback'
        selectedModel = 'fallback'
        if (lastError) {
          console.error('All providers failed:', lastError)
        }
      }

      writer.write({ type: 'text-end', id: textId })

      const citations = fallback.isFallback
        ? []
        : buildDisplayedCitations(searchResults, accumulatedText)

      await persistChatMessage({
        sessionId,
        role: 'assistant',
        content: accumulatedText,
        citedChunkIds: citations.map((c) => c.chunkId),
        citedImages: images,
        isFallback: fallback.isFallback,
      })

      const messageData: MessageData = {
        citations,
        images,
        fallback: fallback.isFallback,
        confidence: searchResults[0]?.combined_score ?? 0,
        sessionId,
      }

      writer.write({
        type: 'finish',
        finishReason,
        messageMetadata: {
          ...messageData,
          provider: selectedProvider,
          model: selectedModel,
        },
      })
    },
    onError: (error) => {
      console.error('UI stream error:', error)
      return 'An error occurred while generating the response.'
    },
  })

  return createUIMessageStreamResponse({ stream })
}
