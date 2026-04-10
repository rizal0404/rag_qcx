import { Citation } from '@/types/chat'
import type { SearchResult } from '@/lib/search/hybrid'

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeSectionPath(sectionPath: string): string {
  return normalizeWhitespace(sectionPath).toLowerCase()
}

export function extractSectionIdentifiers(sectionPath: string): string[] {
  const normalized = normalizeSectionPath(sectionPath)
  const matches = normalized.match(/\d+(?:\.\d+)+/g)

  return matches ? Array.from(new Set(matches)) : []
}

export function isSectionPathMatch(leftSectionPath: string, rightSectionPath: string): boolean {
  const leftNormalized = normalizeSectionPath(leftSectionPath)
  const rightNormalized = normalizeSectionPath(rightSectionPath)

  if (leftNormalized === rightNormalized) {
    return true
  }

  const leftIdentifiers = extractSectionIdentifiers(leftNormalized)
  const rightIdentifiers = extractSectionIdentifiers(rightNormalized)

  if (leftIdentifiers.length > 0 && rightIdentifiers.length > 0) {
    return leftIdentifiers.some((identifier) => rightIdentifiers.includes(identifier))
  }

  return leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)
}

export function buildCitation(result: SearchResult): string {
  const section = result.section_path || 'General'
  const page = result.page_numbers?.[0] ?? 'N/A'
  return `[Page ${page}, Section ${section}]`
}

export function buildCitationIdentity(result: SearchResult): string {
  const documentIdentity = result.document_id || result.metadata?.documentTitle || 'unknown-document'
  const sectionIdentity = normalizeSectionPath(result.section_path || 'General')
  const pageIdentity =
    (result.page_numbers || [])
      .filter((page): page is number => Number.isFinite(page))
      .join(',') || 'no-pages'

  return `${documentIdentity}::${sectionIdentity}::${pageIdentity}`
}

export function parseInlineCitationPages(value: string): number[] {
  const pages = Array.from(value.matchAll(/\d+/g), (match) => Number.parseInt(match[0], 10)).filter(
    (page) => Number.isFinite(page),
  )

  return Array.from(new Set(pages))
}

export function extractInlineCitations(answer: string): Array<{ sectionPath: string; pageNumbers: number[] }> {
  const matches = answer.matchAll(/\[Page\s+(.+?),\s*Section\s+([^\]]+)\]/gi)

  return Array.from(matches, (match) => ({
    pageNumbers: parseInlineCitationPages(match[1] || ''),
    sectionPath: normalizeSectionPath(match[2] || 'General'),
  }))
}

export function isCitationReferencedInline(
  citation: Omit<Citation, 'isInlineReferenced'>,
  inlineCitations: Array<{ sectionPath: string; pageNumbers: number[] }>,
): boolean {
  return inlineCitations.some((inlineCitation) => {
    if (!isSectionPathMatch(citation.sectionPath, inlineCitation.sectionPath)) {
      return false
    }

    if (inlineCitation.pageNumbers.length === 0 || citation.pageNumbers.length === 0) {
      return true
    }

    return citation.pageNumbers.some((pageNumber) => inlineCitation.pageNumbers.includes(pageNumber))
  })
}

export function findMatchingCitationIndex(
  citations: Citation[],
  inlineSectionPath: string,
  inlinePageNumbers: number[],
): number | null {
  const citationIndex = citations.findIndex((citation) => {
    if (!isSectionPathMatch(citation.sectionPath, inlineSectionPath)) {
      return false
    }

    if (inlinePageNumbers.length === 0 || citation.pageNumbers.length === 0) {
      return true
    }

    return citation.pageNumbers.some((pageNumber) => inlinePageNumbers.includes(pageNumber))
  })

  return citationIndex >= 0 ? citationIndex : null
}

export function buildDisplayedCitations(
  searchResults: SearchResult[],
  answerText: string,
  limit = 3,
): Citation[] {
  const uniqueCitations: Omit<Citation, 'isInlineReferenced'>[] = []
  const seen = new Set<string>()

  for (const result of searchResults) {
    const identity = buildCitationIdentity(result)

    if (seen.has(identity)) {
      continue
    }

    seen.add(identity)
    uniqueCitations.push({
      chunkId: result.chunk_id,
      documentId: result.document_id,
      sectionPath: result.section_path || 'General',
      pageNumbers: result.page_numbers || [],
      documentTitle: result.metadata?.documentTitle || 'Unknown',
      documentNumber: result.metadata?.documentNumber,
    })

    if (uniqueCitations.length >= limit) {
      break
    }
  }

  const inlineCitations = extractInlineCitations(answerText)

  return uniqueCitations.map((citation) => ({
    ...citation,
    isInlineReferenced: isCitationReferencedInline(citation, inlineCitations),
  }))
}
