import type { SearchResult } from '@/lib/search/hybrid'

export function mergeSearchResults(primary: SearchResult[], supplemental: SearchResult[]): SearchResult[] {
  const merged = new Map<string, SearchResult>()

  for (const result of [...primary, ...supplemental]) {
    const existing = merged.get(result.chunk_id)

    if (!existing) {
      merged.set(result.chunk_id, result)
      continue
    }

    const existingScore = existing.retrieval_score ?? existing.combined_score
    const nextScore = result.retrieval_score ?? result.combined_score

    if (nextScore > existingScore) {
      merged.set(result.chunk_id, result)
    }
  }

  return Array.from(merged.values())
}
