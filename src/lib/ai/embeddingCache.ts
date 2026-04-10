/**
 * Embedding LRU Cache
 *
 * In-memory cache for query embeddings to avoid redundant API calls.
 * Serverless-compatible: resets on cold start, which is acceptable
 * since embeddings are deterministic and can be re-fetched.
 *
 * Strategy:
 * - LRU eviction when MAX_ENTRIES is reached (evict the oldest inserted entry)
 * - TTL-based expiry (default 30 minutes)
 * - Key = SHA-256 hash of the normalized input text (first 16 hex chars)
 */

import crypto from 'node:crypto'

interface CacheEntry {
  embedding: number[]
  expiresAt: number
}

const MAX_ENTRIES = 500
const DEFAULT_TTL_MS = 30 * 60 * 1000 // 30 minutes

// Module-level singleton — shared across requests in the same serverless instance
const cache = new Map<string, CacheEntry>()

function computeKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function evictExpired(): void {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
    }
  }
}

function evictOldest(): void {
  if (cache.size < MAX_ENTRIES) return
  const oldest = cache.keys().next().value
  if (oldest) cache.delete(oldest)
}

/**
 * Returns a cached embedding vector for the given input text,
 * or null if no valid (non-expired) entry exists.
 */
export function getCachedEmbedding(value: string): number[] | null {
  const key = computeKey(value)
  const entry = cache.get(key)

  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }

  return entry.embedding
}

/**
 * Stores an embedding vector in the cache for the given input text.
 * Evicts expired entries and the oldest entry (LRU) if at capacity.
 */
export function setCachedEmbedding(value: string, embedding: number[]): void {
  evictExpired()
  evictOldest()
  cache.set(computeKey(value), {
    embedding,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  })
}

/**
 * Returns cache statistics for monitoring/debugging.
 */
export function getEmbeddingCacheStats(): { size: number; maxEntries: number } {
  return { size: cache.size, maxEntries: MAX_ENTRIES }
}
