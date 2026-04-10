import { describe, it, expect } from 'vitest'
import { mergeSearchResults } from '@/lib/search/mergeResults'
import type { SearchResult } from '@/lib/search/hybrid'

describe('mergeSearchResults', () => {
  it('should merge and deduplicate based on chunk_id', () => {
    const primary = [
      { chunk_id: '1', combined_score: 0.9 },
      { chunk_id: '2', combined_score: 0.8 },
    ] as unknown as SearchResult[]
    const supplemental = [
      { chunk_id: '1', combined_score: 0.95 },
      { chunk_id: '3', combined_score: 0.7 },
    ] as unknown as SearchResult[]

    const result = mergeSearchResults(primary, supplemental)

    expect(result).toHaveLength(3)
    const chunk1 = result.find((r) => r.chunk_id === '1')
    expect(chunk1).toBeDefined()
    expect(chunk1?.combined_score).toBe(0.95) // Should take the max score
  })
})
