import { describe, it, expect } from 'vitest'
import { extractInlineCitations, buildCitation } from '@/lib/chat/citations'
import type { SearchResult } from '@/lib/search/hybrid'

describe('extractInlineCitations', () => {
  it('should extract correct page numbers and sections', () => {
    const text = 'Sesuai prosedur [Page 5, Section Troubleshooting] periksa kabel.'
    const citations = extractInlineCitations(text)

    expect(citations).toHaveLength(1)
    expect(citations[0].pageNumbers).toEqual([5])
    expect(citations[0].sectionPath).toBe('troubleshooting')
  })

  it('should handle unformatted strings safely', () => {
    const text = 'Tidak ada citation di sini'
    const citations = extractInlineCitations(text)
    expect(citations).toHaveLength(0)
  })
})

describe('buildCitation', () => {
  it('should build citation string from search result', () => {
    const result = {
      section_path: 'Overview',
      page_numbers: [12],
    } as unknown as SearchResult
    expect(buildCitation(result)).toBe('[Page 12, Section Overview]')
  })
})
