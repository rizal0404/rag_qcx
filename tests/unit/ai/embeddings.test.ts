import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const originalEnv = { ...process.env }

describe('generateEmbeddings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('falls back from OpenRouter to OpenAI with provider-specific model settings', async () => {
    const embedMany = vi
      .fn()
      .mockRejectedValueOnce(new Error('No successful provider responses.'))
      .mockResolvedValueOnce({
        embeddings: [Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0))],
      })

    vi.doMock('ai', () => ({
      embed: vi.fn(),
      embedMany,
    }))

    vi.doMock('@/lib/ai/llm', () => ({
      hasUsableApiKey: (apiKey: string | undefined) =>
        Boolean(apiKey && !/(xxxx|your-|test-|placeholder)/i.test(apiKey)),
      openRouterOpenAI: {
        embedding: vi.fn((modelId: string) => ({ provider: 'openrouter', modelId })),
      },
      openai: {
        embedding: vi.fn((modelId: string) => ({ provider: 'openai', modelId })),
      },
    }))

    vi.doMock('@/lib/ai/embeddingCache', () => ({
      getCachedEmbedding: vi.fn(() => null),
      setCachedEmbedding: vi.fn(),
    }))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    process.env.EMBEDDING_PROVIDER = 'auto'
    process.env.EMBEDDING_VECTOR_DIMENSIONS = '1024'
    process.env.OPENROUTER_API_KEY = 'sk-or-valid'
    process.env.OPENAI_API_KEY = 'sk-valid'
    process.env.OPENROUTER_EMBEDDING_MODEL = 'baai/bge-m3'
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large'

    const { generateEmbeddings } = await import('@/lib/ai/embeddings')
    const result = await generateEmbeddings(['manual chunk'])

    expect(embedMany).toHaveBeenCalledTimes(2)
    expect(embedMany.mock.calls[0][0]).toMatchObject({
      model: { provider: 'openrouter', modelId: 'baai/bge-m3' },
      values: ['manual chunk'],
    })
    expect(embedMany.mock.calls[1][0]).toMatchObject({
      model: { provider: 'openai', modelId: 'text-embedding-3-large' },
      providerOptions: {
        openai: {
          dimensions: 1024,
        },
      },
      values: ['manual chunk'],
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(1024)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
