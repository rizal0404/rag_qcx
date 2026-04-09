import type { SearchResult } from './hybrid'

const QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'apa',
  'apakah',
  'atau',
  'bagaimana',
  'buat',
  'can',
  'could',
  'dalam',
  'dengan',
  'for',
  'from',
  'how',
  'is',
  'itu',
  'ke',
  'mana',
  'manual',
  'of',
  'pada',
  'the',
  'to',
  'untuk',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'yang',
])

const QUERY_EXPANSIONS: Record<string, string[]> = {
  bagaimana: ['how', 'steps', 'procedure'],
  langkah: ['step', 'steps', 'procedure'],
  instalasi: ['install', 'installation', 'setup'],
  pasang: ['install', 'installation', 'setup'],
  kebutuhan: ['requirements', 'requirement', 'prerequisites'],
  persyaratan: ['requirements', 'requirement', 'prerequisites'],
  server: ['server', 'sql'],
  workplace: ['workplace'],
  framework: ['framework'],
  core: ['core'],
  qcx: ['qcx'],
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function extractIdentifierCandidates(query: string): string[] {
  const tokens = query.match(/[A-Za-z][A-Za-z0-9_]{7,}/g) ?? []

  return dedupe(
    tokens.filter(
      (token) =>
        /[a-z][A-Z]/.test(token) ||
        (/[A-Za-z]/.test(token) && /\d/.test(token)) ||
        token.includes('_'),
    ),
  )
}

export function extractQueryKeywords(query: string): string[] {
  const baseTokens = tokenize(query).filter((token) => !QUERY_STOP_WORDS.has(token))
  const expandedTokens = baseTokens.flatMap((token) => [token, ...(QUERY_EXPANSIONS[token] ?? [])])

  return dedupe(expandedTokens).filter((token) => token.length >= 2)
}

export function expandQueryForRetrieval(query: string): string {
  const keywords = extractQueryKeywords(query)

  if (keywords.length === 0) {
    return query.trim()
  }

  return dedupe([query.trim(), ...keywords]).join(' ')
}

function collectSearchFields(result: SearchResult): Array<{ text: string; weight: number }> {
  const metadataKeywords = Array.isArray(result.metadata?.keywords)
    ? result.metadata.keywords.join(' ')
    : ''

  return [
    { text: result.section_path ?? '', weight: 3 },
    { text: result.metadata?.documentTitle ?? '', weight: 2.5 },
    { text: result.metadata?.equipmentModel ?? '', weight: 2.5 },
    { text: metadataKeywords, weight: 2.5 },
    { text: result.metadata?.llm_summary ?? '', weight: 1.5 },
    { text: result.content ?? '', weight: 1.5 },
    { text: result.parent_content ?? '', weight: 1 },
  ]
}

const INSTALL_TERMS = [
  'install',
  'installation',
  'instalasi',
  'setup',
  'pemasangan',
  'pasang',
]

const UNINSTALL_TERMS = [
  'uninstall',
  'un-install',
  'un-installation',
  'deinstall',
  'deinstallation',
  'remove',
  'removal',
  'uninstal',
  'hapus',
  'copot',
]

function countTermMatches(text: string, terms: string[]): number {
  const normalized = normalizeText(text)
  const tokens = new Set(tokenize(normalized))

  let count = 0

  for (const term of terms) {
    if (term.includes(' ')) {
      if (normalized.includes(term)) {
        count += 1
      }

      continue
    }

    if (tokens.has(term)) {
      count += 1
    }
  }

  return count
}

function keywordMatchesField(fieldText: string, keyword: string): boolean {
  const normalizedField = normalizeText(fieldText)

  if (keyword.includes(' ')) {
    return normalizedField.includes(keyword)
  }

  return new Set(tokenize(normalizedField)).has(keyword)
}

function scoreIntentConflict(result: SearchResult, query: string): { penalty: number; reason?: string } {
  const queryInstallSignals = countTermMatches(query, INSTALL_TERMS)
  const queryUninstallSignals = countTermMatches(query, UNINSTALL_TERMS)

  if (queryInstallSignals === queryUninstallSignals) {
    return { penalty: 0 }
  }

  const haystack = collectSearchFields(result)
    .map((field) => field.text)
    .filter(Boolean)
    .join(' \n ')

  const resultInstallSignals = countTermMatches(haystack, INSTALL_TERMS)
  const resultUninstallSignals = countTermMatches(haystack, UNINSTALL_TERMS)

  if (queryInstallSignals > queryUninstallSignals && resultUninstallSignals > resultInstallSignals) {
    return {
      penalty: 8,
      reason: 'install-query penalized for uninstall-oriented candidate',
    }
  }

  if (queryUninstallSignals > queryInstallSignals && resultInstallSignals > resultUninstallSignals) {
    return {
      penalty: 8,
      reason: 'uninstall-query penalized for install-oriented candidate',
    }
  }

  return { penalty: 0 }
}

export function scoreResultLexically(result: SearchResult, query: string): {
  lexicalScore: number
  matchedTerms: string[]
} {
  const keywords = extractQueryKeywords(query)

  if (keywords.length === 0) {
    return {
      lexicalScore: 0,
      matchedTerms: [],
    }
  }

  const matchedTerms = new Set<string>()
  let lexicalScore = 0

  for (const keyword of keywords) {
    for (const field of collectSearchFields(result)) {
      if (!field.text) {
        continue
      }

      if (keywordMatchesField(field.text, keyword)) {
        matchedTerms.add(keyword)
        lexicalScore += field.weight
        break
      }
    }
  }

  return {
    lexicalScore,
    matchedTerms: Array.from(matchedTerms),
  }
}

export function rerankSearchResults(results: SearchResult[], query: string): SearchResult[] {
  return [...results]
    .map((result) => {
      const { lexicalScore, matchedTerms } = scoreResultLexically(result, query)
      const { penalty, reason } = scoreIntentConflict(result, query)
      const adjustedLexicalScore = lexicalScore - penalty

      return {
        ...result,
        retrieval_score: result.retrieval_score ?? result.combined_score,
        intent_penalty: penalty,
        intent_penalty_reason: reason,
        lexical_score: lexicalScore,
        adjusted_lexical_score: adjustedLexicalScore,
        matched_terms: matchedTerms,
      }
    })
    .sort((left, right) => {
      const leftLexical = left.adjusted_lexical_score ?? left.lexical_score ?? 0
      const rightLexical = right.adjusted_lexical_score ?? right.lexical_score ?? 0

      if (rightLexical !== leftLexical) {
        return rightLexical - leftLexical
      }

      const leftCoverage = left.matched_terms?.length ?? 0
      const rightCoverage = right.matched_terms?.length ?? 0

      if (rightCoverage !== leftCoverage) {
        return rightCoverage - leftCoverage
      }

      const leftRerank = left.rerank_score ?? Number.NEGATIVE_INFINITY
      const rightRerank = right.rerank_score ?? Number.NEGATIVE_INFINITY

      if (rightRerank !== leftRerank) {
        return rightRerank - leftRerank
      }

      if (right.combined_score !== left.combined_score) {
        return right.combined_score - left.combined_score
      }

      return right.similarity - left.similarity
    })
}
