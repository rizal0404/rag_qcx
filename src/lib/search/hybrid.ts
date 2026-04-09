import { createAdminClient } from '../supabase/admin'
import { rerankSearchResults } from './query'
import { applyRemoteRerank, getRerankCandidateCount } from './rerank'

export interface SearchResult {
  chunk_id: string
  document_id: string
  parent_chunk_id: string | null
  content: string
  content_type: string
  section_path: string | null
  page_numbers: number[]
  metadata: Record<string, any>
  similarity: number
  keyword_rank: number
  combined_score: number
  parent_content?: string | null
  lexical_score?: number
  adjusted_lexical_score?: number
  matched_terms?: string[]
  retrieval_score?: number
  rerank_score?: number
  rerank_provider?: string
  rerank_model?: string
  intent_penalty?: number
  intent_penalty_reason?: string
}

interface HybridSearchParams {
  queryEmbedding: number[]
  queryText: string
  rerankQuery?: string
  matchCount?: number
  filterDocId?: string
  filterContentType?: string
}

export async function performHybridSearch({
  queryEmbedding,
  queryText,
  rerankQuery,
  matchCount = parseInt(process.env.MAX_CHUNKS_PER_QUERY || '10'),
  filterDocId,
  filterContentType,
}: HybridSearchParams): Promise<SearchResult[]> {
  const supabase = createAdminClient()
  const candidateCount = getRerankCandidateCount(matchCount)

  // Use the RPC call for hybrid_search
  const { data, error } = await supabase.rpc('hybrid_search', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    match_count: candidateCount,
    filter_doc_id: filterDocId,
    filter_content_type: filterContentType,
  })

  if (error) {
    console.error('Error performing hybrid search:', error)
    const message = typeof error.message === 'string' ? error.message : ''

    if (
      /vector|dimension|hybrid_search/i.test(message) &&
      /1024|1536|function/i.test(message)
    ) {
      throw new Error(
        'Database embedding schema is out of sync with the app configuration. Apply migration 002_bge_m3_native_dimensions.sql and rebuild stored chunk embeddings via /api/ingest/reembed.',
      )
    }

    throw new Error('Failed to search knowledge base')
  }

  const results = ((data as SearchResult[]) || []).map((result) => ({
    ...result,
    metadata: result.metadata || {},
  }))

  if (results.length === 0) {
    return results
  }

  const parentIds = Array.from(
    new Set(
      results
        .map((result) => result.parent_chunk_id)
        .filter((value): value is string => Boolean(value)),
    ),
  )

  const documentIds = Array.from(new Set(results.map((result) => result.document_id)))

  const [parentResponse, documentResponse] = await Promise.all([
    parentIds.length > 0
      ? supabase.from('chunks').select('id, content').in('id', parentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('documents')
      .select('id, title, doc_number, revision, equipment_model')
      .in('id', documentIds),
  ])

  if (parentResponse.error) {
    console.error('Error loading parent chunks:', parentResponse.error)
  }

  if (documentResponse.error) {
    console.error('Error loading document metadata:', documentResponse.error)
  }

  const parentMap = new Map(
    (parentResponse.data || []).map((parent) => [parent.id, parent.content]),
  )
  const documentMap = new Map(
    (documentResponse.data || []).map((document) => [document.id, document]),
  )

  const enrichedResults = results.map((result) => {
    const document = documentMap.get(result.document_id)

    return {
      ...result,
      parent_content: result.parent_chunk_id
        ? parentMap.get(result.parent_chunk_id) ?? null
        : null,
      metadata: {
        ...result.metadata,
        documentTitle: document?.title ?? result.metadata?.documentTitle ?? 'Unknown',
        documentNumber: document?.doc_number ?? result.metadata?.documentNumber ?? null,
        revision: document?.revision ?? result.metadata?.revision ?? null,
        equipmentModel: document?.equipment_model ?? result.metadata?.equipmentModel ?? null,
      },
    }
  })

  const locallyReranked = rerankSearchResults(enrichedResults, queryText)
  const remotelyReranked = await applyRemoteRerank({
    results: locallyReranked,
    query: rerankQuery ?? queryText,
    matchCount,
  })

  return rerankSearchResults(remotelyReranked, queryText)
}
