import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

// Provider for Chat/Generation (OpenRouter)
export const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

// Provider for direct OpenAI access
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// OpenRouter exposes an OpenAI-compatible API surface for embeddings.
export const openRouterOpenAI = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  name: 'openrouter',
})

// Provider for direct Gemini fallback
export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

export interface ChatModelCandidate {
  provider: 'openrouter' | 'openai' | 'google'
  modelId: string
  model: LanguageModel
}

export function hasUsableApiKey(apiKey: string | undefined): boolean {
  if (!apiKey || apiKey.trim().length === 0) {
    return false
  }

  return !/(xxxx|your-|test-|placeholder)/i.test(apiKey)
}

export function getChatModelCandidates(): ChatModelCandidate[] {
  const candidates: ChatModelCandidate[] = []

  const openRouterModel =
    process.env.OPENROUTER_MODEL || process.env.LLM_MODEL || 'google/gemini-2.5-flash'
  const openAiFallbackModel = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4.1-mini'
  const geminiFallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash'

  if (hasUsableApiKey(process.env.OPENROUTER_API_KEY)) {
    candidates.push({
      provider: 'openrouter',
      modelId: openRouterModel,
      model: openRouter(openRouterModel),
    })
  }

  if (hasUsableApiKey(process.env.OPENAI_API_KEY)) {
    candidates.push({
      provider: 'openai',
      modelId: openAiFallbackModel,
      model: openai(openAiFallbackModel),
    })
  }

  if (hasUsableApiKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY)) {
    candidates.push({
      provider: 'google',
      modelId: geminiFallbackModel,
      model: google(geminiFallbackModel),
    })
  }

  return candidates
}

// Backward-compatible single-model accessor
export function getChatModel() {
  const [candidate] = getChatModelCandidates()

  if (!candidate) {
    throw new Error('No chat provider is configured. Set OPENROUTER_API_KEY or a fallback provider key.')
  }

  return candidate.model
}
