import crypto from 'node:crypto'
import { embed, embedMany } from 'ai'
import { hasUsableApiKey, openRouterOpenAI, openai } from './llm'
import { getCachedEmbedding, setCachedEmbedding } from './embeddingCache'

const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER || 'auto').trim().toLowerCase()
const VECTOR_DIMENSIONS = parseInt(process.env.EMBEDDING_VECTOR_DIMENSIONS || '1024', 10)
const LOCAL_EMBEDDING_DIMENSIONS = VECTOR_DIMENSIONS
const LEGACY_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL?.trim()
const OPENROUTER_EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || LEGACY_EMBEDDING_MODEL || 'baai/bge-m3'
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-large'
const warnedDimensions = new Set<string>()

type EmbeddingProvider = 'openrouter' | 'openai' | 'local'

interface EmbeddingModelCandidate {
  provider: EmbeddingProvider
  modelId: string
  model: ReturnType<typeof openai.embedding>
  providerOptions?: {
    openai?: {
      dimensions?: number
    }
  }
}

const MULTILINGUAL_HINT_GROUPS = [
  ['install', 'installation', 'setup', 'instalasi', 'pemasangan', 'pasang'],
  ['configure', 'configuration', 'setting', 'konfigurasi', 'atur', 'pengaturan'],
  ['requirement', 'requirements', 'prerequisite', 'persyaratan', 'kebutuhan'],
  ['operation', 'operate', 'startup', 'shutdown', 'operasi', 'menjalankan', 'mulai', 'matikan'],
  ['maintenance', 'service', 'inspection', 'perawatan', 'servis', 'inspeksi'],
  ['troubleshooting', 'fault', 'error', 'alarm', 'gangguan', 'kesalahan', 'alarm'],
  ['safety', 'warning', 'caution', 'bahaya', 'peringatan', 'keselamatan'],
  ['wiring', 'connection', 'terminal', 'kabel', 'pengkabelan', 'koneksi'],
  ['calibration', 'adjustment', 'calibrate', 'kalibrasi', 'penyetelan'],
  ['sql server', 'database', 'server', 'basis data', 'database'],
]

function normalizeInput(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toAsciiFold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9_-]{1,}/g)
      ?.slice(0, 2048) ?? []
  )
}

function normalizeVectorMagnitude(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, current) => sum + current * current, 0))

  if (magnitude === 0) {
    return vector
  }

  return vector.map((value) => value / magnitude)
}

function alignVectorDimensions(vector: number[]): number[] {
  if (vector.length === VECTOR_DIMENSIONS) {
    return normalizeVectorMagnitude(vector)
  }

  const aligned = new Array<number>(VECTOR_DIMENSIONS).fill(0)

  if (vector.length < VECTOR_DIMENSIONS) {
    for (let index = 0; index < vector.length; index += 1) {
      aligned[index] = vector[index]
    }
  } else {
    for (let index = 0; index < vector.length; index += 1) {
      aligned[index % VECTOR_DIMENSIONS] += vector[index]
    }
  }

  const warningKey = `${vector.length}->${VECTOR_DIMENSIONS}`

  if (!warnedDimensions.has(warningKey)) {
    console.warn(
      `Embedding dimension mismatch: received ${vector.length}, aligned to ${VECTOR_DIMENSIONS}. Re-ingest documents after changing embedding model family or dimensions.`,
    )
    warnedDimensions.add(warningKey)
  }

  return normalizeVectorMagnitude(aligned)
}

function generateLocalEmbedding(value: string): number[] {
  const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0)
  const tokens = tokenize(normalizeInput(value))

  if (tokens.length === 0) {
    return vector
  }

  for (const token of tokens) {
    const digest = crypto.createHash('sha256').update(token).digest()
    const weight = 1 + Math.min(token.length, 12) / 12

    for (let offset = 0; offset < 12; offset += 4) {
      const index = digest.readUInt32BE(offset) % LOCAL_EMBEDDING_DIMENSIONS
      const sign = (digest[offset + 16] & 1) === 0 ? 1 : -1
      vector[index] += sign * weight
    }
  }

  return normalizeVectorMagnitude(vector)
}

function getEmbeddingModelCandidates(): EmbeddingModelCandidate[] {
  const candidates: EmbeddingModelCandidate[] = []
  const hasOpenRouterKey = hasUsableApiKey(process.env.OPENROUTER_API_KEY)
  const hasOpenAiKey = hasUsableApiKey(process.env.OPENAI_API_KEY)
  const openAiProviderOptions =
    /^text-embedding-3-(small|large)$/.test(OPENAI_EMBEDDING_MODEL)
      ? {
          openai: {
            dimensions: VECTOR_DIMENSIONS,
          },
        }
      : undefined

  const pushOpenRouter = () => {
    if (!hasOpenRouterKey) {
      return
    }

    candidates.push({
      provider: 'openrouter',
      modelId: OPENROUTER_EMBEDDING_MODEL,
      model: openRouterOpenAI.embedding(OPENROUTER_EMBEDDING_MODEL),
    })
  }

  const pushOpenAi = () => {
    if (!hasOpenAiKey) {
      return
    }

    candidates.push({
      provider: 'openai',
      modelId: OPENAI_EMBEDDING_MODEL,
      model: openai.embedding(OPENAI_EMBEDDING_MODEL),
      providerOptions: openAiProviderOptions,
    })
  }

  switch (EMBEDDING_PROVIDER) {
    case 'openrouter':
      pushOpenRouter()
      pushOpenAi()
      break
    case 'openai':
      pushOpenAi()
      pushOpenRouter()
      break
    case 'local':
      break
    case 'auto':
    default:
      pushOpenRouter()
      pushOpenAi()
      break
  }

  return candidates
}

async function generateRemoteEmbedding(
  candidate: EmbeddingModelCandidate,
  value: string,
): Promise<number[]> {
  const { embedding } = await embed({
    model: candidate.model,
    value: normalizeInput(value),
    providerOptions: candidate.providerOptions,
  })

  return alignVectorDimensions(embedding)
}

async function generateRemoteEmbeddings(
  candidate: EmbeddingModelCandidate,
  values: string[],
): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: candidate.model,
    values: values.map(normalizeInput),
    providerOptions: candidate.providerOptions,
  })

  return embeddings.map(alignVectorDimensions)
}

export async function generateEmbedding(value: string): Promise<number[]> {
  const normalizedValue = normalizeInput(value)

  // Check cache first to avoid redundant API round-trips
  const cached = getCachedEmbedding(normalizedValue)
  if (cached) return cached

  const candidates = getEmbeddingModelCandidates()

  if (candidates.length === 0) {
    const embedding = generateLocalEmbedding(normalizedValue)
    setCachedEmbedding(normalizedValue, embedding)
    return embedding
  }

  for (const candidate of candidates) {
    try {
      const embedding = await generateRemoteEmbedding(candidate, normalizedValue)
      setCachedEmbedding(normalizedValue, embedding)
      return embedding
    } catch (error) {
      console.warn(
        `Falling back from ${candidate.provider} embedding model ${candidate.modelId} for single value:`,
        error,
      )
    }
  }

  const embedding = generateLocalEmbedding(normalizedValue)
  setCachedEmbedding(normalizedValue, embedding)
  return embedding
}

export async function generateEmbeddings(values: string[]): Promise<number[][]> {
  const candidates = getEmbeddingModelCandidates()

  if (candidates.length === 0) {
    return values.map(generateLocalEmbedding)
  }

  for (const candidate of candidates) {
    try {
      return await generateRemoteEmbeddings(candidate, values)
    } catch (error) {
      console.warn(
        `Falling back from ${candidate.provider} embedding model ${candidate.modelId} for batch:`,
        error,
      )
    }
  }

  return values.map(generateLocalEmbedding)
}

function extractMultilingualHints(values: string[]): string[] {
  const corpus = toAsciiFold(values.filter(Boolean).join(' \n '))

  return MULTILINGUAL_HINT_GROUPS
    .filter((group) => group.some((term) => corpus.includes(toAsciiFold(term))))
    .flatMap((group) => group)
    .slice(0, 24)
}

export function buildEmbeddingText(
  content: string,
  sectionPath: string | null,
  summary: string | null,
  metadata?: Record<string, unknown> | null,
): string {
  const parts: string[] = []
  const documentTitle =
    typeof metadata?.documentTitle === 'string' ? normalizeInput(metadata.documentTitle) : null
  const documentNumber =
    typeof metadata?.documentNumber === 'string' ? normalizeInput(metadata.documentNumber) : null
  const equipmentModel =
    typeof metadata?.equipmentModel === 'string' ? normalizeInput(metadata.equipmentModel) : null
  const language = typeof metadata?.language === 'string' ? normalizeInput(metadata.language) : null
  const keywords = Array.isArray(metadata?.keywords)
    ? metadata.keywords
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(normalizeInput)
        .slice(0, 16)
    : []
  const multilingualHints = extractMultilingualHints([
    documentTitle ?? '',
    equipmentModel ?? '',
    sectionPath ?? '',
    summary ?? '',
    keywords.join(' '),
    content,
  ])

  if (documentTitle) parts.push(`Document title: ${documentTitle}`)
  if (documentNumber) parts.push(`Document number: ${documentNumber}`)
  if (equipmentModel) parts.push(`Equipment model: ${equipmentModel}`)
  if (language) parts.push(`Document language: ${language}`)
  if (sectionPath) parts.push(`Section: ${sectionPath}`)
  if (summary) parts.push(`Summary: ${summary}`)
  if (keywords.length > 0) parts.push(`Keywords: ${keywords.join(', ')}`)
  if (multilingualHints.length > 0) parts.push(`Cross-language hints: ${multilingualHints.join(', ')}`)
  parts.push(`Content: ${content}`)
  return parts.join('\n')
}
