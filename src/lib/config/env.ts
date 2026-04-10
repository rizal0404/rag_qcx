export interface AppConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  openRouterApiKey: string | null
  openAiApiKey: string | null
  googleAiApiKey: string | null
  similarityThreshold: number
  maxChunksPerQuery: number
  llmTemperature: number
}

export function validateEnvConfig(): AppConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || null,
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
    googleAiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || null,
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.6'),
    maxChunksPerQuery: parseInt(process.env.MAX_CHUNKS_PER_QUERY || '10', 10),
    llmTemperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
  }
}
