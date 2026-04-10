import { generateEmbedding } from '@/lib/ai/embeddings'
import { performHybridSearch } from '@/lib/search/hybrid'
import { expandQueryForRetrieval, extractIdentifierCandidates, rerankSearchResults } from '@/lib/search/query'
import { mergeSearchResults } from '@/lib/search/mergeResults'
import type { SearchResult } from '@/lib/search/hybrid'

export interface RetrievalResult {
  searchResults: SearchResult[]
  queryEmbedding: number[]
  expandedQuery: string
}

export async function retrieveContext(queryText: string): Promise<RetrievalResult> {
  const expandedQuery = expandQueryForRetrieval(queryText)
  const queryEmbedding = await generateEmbedding(expandedQuery)
  const identifierQueries = extractIdentifierCandidates(queryText)

  const primaryResults = await performHybridSearch({
    queryEmbedding,
    queryText: expandedQuery,
    rerankQuery: queryText,
  })

  const maxChunks = parseInt(process.env.MAX_CHUNKS_PER_QUERY || '10', 10)

  if (identifierQueries.length === 0) {
    return { searchResults: primaryResults.slice(0, maxChunks), queryEmbedding, expandedQuery }
  }

  const supplementalResults = await Promise.all(
    identifierQueries.map(async (idQuery) => {
      const idEmbedding = await generateEmbedding(idQuery)
      return performHybridSearch({
        queryEmbedding: idEmbedding,
        queryText: idQuery,
        rerankQuery: queryText,
        matchCount: maxChunks,
      })
    }),
  )

  const merged = rerankSearchResults(
    mergeSearchResults(primaryResults, supplementalResults.flat()),
    queryText,
  ).slice(0, maxChunks)

  return { searchResults: merged, queryEmbedding, expandedQuery }
}
