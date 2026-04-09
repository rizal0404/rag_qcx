import { hasUsableApiKey } from '@/lib/ai/llm'
import type { SearchResult } from './hybrid'

const OPENROUTER_RERANK_URL = 'https://openrouter.ai/api/v1/rerank'
const DEFAULT_RERANK_MODEL = 'cohere/rerank-v3.5'
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_CANDIDATE_MULTIPLIER = 4
const DEFAULT_MAX_CANDIDATES = 40

interface OpenRouterRerankItem {
  index: number
  relevance_score: number
}

interface OpenRouterRerankResponse {
  results?: OpenRouterRerankItem[]
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function isRemoteRerankEnabled(): boolean {
  if ((process.env.RERANK_ENABLED || 'true').trim().toLowerCase() === 'false') {
    return false
  }

  return hasUsableApiKey(process.env.OPENROUTER_API_KEY)
}

export function getRerankCandidateCount(matchCount: number): number {
  if (!isRemoteRerankEnabled()) {
    return matchCount
  }

  const multiplier = parsePositiveInt(
    process.env.RERANK_CANDIDATE_MULTIPLIER,
    DEFAULT_CANDIDATE_MULTIPLIER,
  )
  const maxCandidates = parsePositiveInt(process.env.RERANK_MAX_CANDIDATES, DEFAULT_MAX_CANDIDATES)

  return Math.max(matchCount, Math.min(matchCount * multiplier, maxCandidates))
}

function truncateForRerank(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function buildRerankDocument(result: SearchResult): string {
  const parts: string[] = []

  if (typeof result.metadata?.documentTitle === 'string' && result.metadata.documentTitle.trim()) {
    parts.push(`Document: ${result.metadata.documentTitle.trim()}`)
  }

  if (typeof result.metadata?.equipmentModel === 'string' && result.metadata.equipmentModel.trim()) {
    parts.push(`Equipment: ${result.metadata.equipmentModel.trim()}`)
  }

  if (typeof result.section_path === 'string' && result.section_path.trim()) {
    parts.push(`Section: ${result.section_path.trim()}`)
  }

  if (typeof result.metadata?.llm_summary === 'string' && result.metadata.llm_summary.trim()) {
    parts.push(`Summary: ${truncateForRerank(result.metadata.llm_summary.trim(), 500)}`)
  }

  if (Array.isArray(result.metadata?.keywords) && result.metadata.keywords.length > 0) {
    parts.push(`Keywords: ${result.metadata.keywords.slice(0, 12).join(', ')}`)
  }

  if (typeof result.parent_content === 'string' && result.parent_content.trim()) {
    parts.push(`Parent context: ${truncateForRerank(result.parent_content.trim(), 1200)}`)
  }

  parts.push(`Content: ${truncateForRerank(result.content.trim(), 2200)}`)

  return parts.join('\n')
}

function applyRemoteScores(
  candidates: SearchResult[],
  rerankedItems: OpenRouterRerankItem[],
): SearchResult[] {
  const mapped: SearchResult[] = []

  for (const item of rerankedItems) {
    const source = candidates[item.index]

    if (!source || !Number.isFinite(item.relevance_score)) {
      continue
    }

    mapped.push({
      ...source,
      retrieval_score: source.retrieval_score ?? source.combined_score,
      rerank_score: item.relevance_score,
      rerank_provider: 'openrouter',
      rerank_model: process.env.RERANK_MODEL || DEFAULT_RERANK_MODEL,
    })
  }

  return mapped
}

function pruneIntentConflicts(results: SearchResult[], matchCount: number): SearchResult[] {
  const safeCandidates = results.filter((result) => (result.intent_penalty ?? 0) < 6)

  if (safeCandidates.length >= matchCount) {
    return safeCandidates
  }

  return results
}

export async function applyRemoteRerank(params: {
  results: SearchResult[]
  query: string
  matchCount: number
}): Promise<SearchResult[]> {
  const { query, matchCount } = params
  const results = pruneIntentConflicts(params.results, matchCount)

  if (!isRemoteRerankEnabled() || results.length <= 1 || query.trim().length === 0) {
    return results.slice(0, matchCount)
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim()

  if (!apiKey) {
    return results.slice(0, matchCount)
  }

  const timeoutMs = parsePositiveInt(process.env.RERANK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(OPENROUTER_RERANK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.RERANK_MODEL || DEFAULT_RERANK_MODEL,
        query,
        documents: results.map(buildRerankDocument),
        top_n: Math.min(matchCount, results.length),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter rerank failed: ${response.status} ${errorText}`)
    }

    const payload = (await response.json()) as OpenRouterRerankResponse

    if (!Array.isArray(payload.results) || payload.results.length === 0) {
      return results.slice(0, matchCount)
    }

    return applyRemoteScores(results, payload.results).slice(0, matchCount)
  } catch (error) {
    console.error('Remote rerank failed. Falling back to lexical ordering:', error)
    return results.slice(0, matchCount)
  } finally {
    clearTimeout(timer)
  }
}
