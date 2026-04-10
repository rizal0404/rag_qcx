import { describe, it, expect } from 'vitest'
import { extractQueryKeywords, expandQueryForRetrieval } from '@/lib/search/query'

describe('extractQueryKeywords', () => {
  it('should remove stop words', () => {
    const keywords = extractQueryKeywords('how to install the server')
    expect(keywords).not.toContain('how')
    expect(keywords).not.toContain('to')
    expect(keywords).not.toContain('the')
    expect(keywords).toContain('install')
    expect(keywords).toContain('server')
  })

  it('should expand Indonesian terms', () => {
    const keywords = extractQueryKeywords('bagaimana instalasi server')
    expect(keywords).toContain('install')
    expect(keywords).toContain('installation')
    expect(keywords).toContain('setup')
  })

  it('should handle empty input', () => {
    expect(extractQueryKeywords('')).toEqual([])
  })
})

describe('expandQueryForRetrieval', () => {
  it('should append expanded keywords', () => {
    const expanded = expandQueryForRetrieval('instalasi server')
    expect(expanded).toContain('instalasi')
    expect(expanded).toContain('server')
    expect(expanded).toContain('install')
  })
})
