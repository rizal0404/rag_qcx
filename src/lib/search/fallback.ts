import { SearchResult } from './hybrid'
import { extractQueryKeywords } from './query'

export interface FallbackAnalysis {
  isFallback: boolean
  reason?: string
}

function countKeywordOverlap(queryText: string, result: SearchResult): number {
  const keywords = extractQueryKeywords(queryText)

  if (keywords.length === 0) {
    return 0
  }

  const haystack = [
    result.section_path,
    result.content,
    result.parent_content,
    result.metadata?.documentTitle,
    result.metadata?.equipmentModel,
    typeof result.metadata?.llm_summary === 'string' ? result.metadata.llm_summary : null,
    Array.isArray(result.metadata?.keywords) ? result.metadata.keywords.join(' ') : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return keywords.filter((keyword) => haystack.includes(keyword)).length
}

function compactText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function hasExactIdentifierMatch(queryText: string, result: SearchResult): boolean {
  const compactQueries = [queryText, ...extractQueryKeywords(queryText)]
    .map((value) => compactText(value))
    .filter((value, index, values) => value.length >= 8 && values.indexOf(value) === index)

  const haystack = compactText(
    [
      result.section_path,
      result.content,
      result.parent_content,
      result.metadata?.documentTitle,
      result.metadata?.equipmentModel,
      typeof result.metadata?.llm_summary === 'string' ? result.metadata.llm_summary : null,
      Array.isArray(result.metadata?.keywords) ? result.metadata.keywords.join(' ') : null,
    ]
      .filter(Boolean)
      .join(' '),
  )

  return compactQueries.some((compactQuery) => haystack.includes(compactQuery))
}

export function detectFallback(results: SearchResult[], queryText?: string): FallbackAnalysis {
  if (!results || results.length === 0) {
    return {
      isFallback: true,
      reason: 'No results found in the knowledge base.',
    }
  }

  const thresholdText = process.env.SIMILARITY_THRESHOLD || '0.6'
  const similarityThreshold = parseFloat(thresholdText)
  const bestMatch = results[0]

  if (bestMatch.combined_score >= similarityThreshold) {
    return {
      isFallback: false,
    }
  }

  if (queryText) {
    const exactIdentifierMatch = results.find((result) => hasExactIdentifierMatch(queryText, result))

    if (exactIdentifierMatch) {
      return {
        isFallback: false,
        reason: 'Accepted due to an exact identifier match in the indexed document.',
      }
    }

    const overlapCount = countKeywordOverlap(queryText, bestMatch)
    const lexicalScore = bestMatch.lexical_score ?? 0
    const matchedTerms = bestMatch.matched_terms?.length ?? 0

    if (lexicalScore >= 4 && matchedTerms >= 2) {
      return {
        isFallback: false,
        reason: `Accepted due to lexical grounding (${matchedTerms} matched terms, score ${lexicalScore.toFixed(1)}).`,
      }
    }

    if (overlapCount >= 2) {
      return {
        isFallback: false,
        reason: `Accepted due to keyword overlap (${overlapCount}) despite score ${bestMatch.combined_score.toFixed(2)}.`,
      }
    }
  }

  return {
    isFallback: true,
    reason: `Best match score (${bestMatch.combined_score.toFixed(2)}) is below the threshold (${similarityThreshold}).`,
  }
}
