import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { performHybridSearch } from '@/lib/search/hybrid'
import { detectFallback } from '@/lib/search/fallback'
import {
  expandQueryForRetrieval,
  extractIdentifierCandidates,
  rerankSearchResults,
} from '@/lib/search/query'
import type { SearchResult } from '@/lib/search/hybrid'

function mergeSearchResults(primary: SearchResult[], supplemental: SearchResult[]): SearchResult[] {
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

export async function POST(req: NextRequest) {
  try {
    const {
      query,
      matchCount,
      filterDocId,
      filterContentType,
    }: {
      query?: string
      matchCount?: number
      filterDocId?: string
      filterContentType?: string
    } = await req.json()

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const retrievalQuery = expandQueryForRetrieval(query)
    const identifierQueries = extractIdentifierCandidates(query)
    const embedding = await generateEmbedding(retrievalQuery)
    const primaryResults = await performHybridSearch({
      queryEmbedding: embedding,
      queryText: retrievalQuery,
      rerankQuery: query,
      matchCount,
      filterDocId,
      filterContentType,
    })

    let results = primaryResults

    if (identifierQueries.length > 0) {
      const supplementalResults = await Promise.all(
        identifierQueries.map(async (identifierQuery) => {
          const identifierEmbedding = await generateEmbedding(identifierQuery)

          return performHybridSearch({
            queryEmbedding: identifierEmbedding,
            queryText: identifierQuery,
            rerankQuery: query,
            matchCount,
            filterDocId,
            filterContentType,
          })
        }),
      )

      results = rerankSearchResults(
        mergeSearchResults(primaryResults, supplementalResults.flat()),
        query,
      ).slice(0, matchCount ?? parseInt(process.env.MAX_CHUNKS_PER_QUERY || '10'))
    }

    const fallback = detectFallback(results, query)

    return NextResponse.json({
      query,
      fallback,
      results,
    })
  } catch (error) {
    console.error('Search route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
