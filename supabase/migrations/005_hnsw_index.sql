-- ============================================================
-- Migration 005: Switch from IVFFlat to HNSW index
-- HNSW provides more stable recall without list-count tuning.
-- Compatible with pgvector 0.5+ (available in Supabase).
-- ============================================================

-- Drop existing IVFFlat index (if it exists)
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Create HNSW index
-- m=16: number of bi-directional links per node (good default for most use cases)
-- ef_construction=64: higher = better recall at index build time, slower build
CREATE INDEX idx_chunks_embedding
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Note: ef_search (search-time quality parameter) defaults to 40 in pgvector.
-- It can be set per-session if needed: SET hnsw.ef_search = 100;
-- We leave it at the default; for production tuning, increase to 60-100 for
-- higher recall at the cost of slightly slower queries.

-- Verify: SELECT * FROM pg_indexes WHERE indexname = 'idx_chunks_embedding';
