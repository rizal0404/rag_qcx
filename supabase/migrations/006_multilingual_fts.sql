-- ============================================================
-- Migration 006: Add Indonesian FTS support
-- Enables bilingual full-text search (English + Indonesian).
-- ============================================================

-- 1. Add Indonesian FTS index alongside existing English one
--    Indonesian text configuration uses the 'indonesian' dictionary (available in PostgreSQL)
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts_indonesian
  ON chunks USING gin (to_tsvector('indonesian', content));

-- 2. Update hybrid_search to use bilingual FTS
--    Takes the GREATEST score from English or Indonesian FTS match.
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding VECTOR(1024),
  query_text TEXT,
  match_count INT DEFAULT 10,
  filter_doc_id UUID DEFAULT NULL,
  filter_content_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  parent_chunk_id UUID,
  content TEXT,
  content_type TEXT,
  section_path TEXT,
  page_numbers INTEGER[],
  metadata JSONB,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      c.id,
      c.document_id AS doc_id,
      c.parent_chunk_id AS parent_id,
      c.content AS chunk_content,
      c.content_type AS chunk_type,
      c.section_path AS chunk_section,
      c.page_numbers AS chunk_pages,
      c.metadata AS chunk_meta,
      1 - (c.embedding <=> query_embedding) AS vec_similarity
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE d.status = 'ACTIVE'
      AND (filter_doc_id IS NULL OR c.document_id = filter_doc_id)
      AND (filter_content_type IS NULL OR c.content_type = filter_content_type)
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword_results AS (
    SELECT
      c.id,
      GREATEST(
        ts_rank_cd(
          to_tsvector('english', c.content),
          plainto_tsquery('english', query_text)
        ),
        ts_rank_cd(
          to_tsvector('indonesian', c.content),
          plainto_tsquery('indonesian', query_text)
        )
      ) AS kw_rank
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE d.status = 'ACTIVE'
      AND (
        to_tsvector('english', c.content) @@ plainto_tsquery('english', query_text)
        OR to_tsvector('indonesian', c.content) @@ plainto_tsquery('indonesian', query_text)
      )
      AND (filter_doc_id IS NULL OR c.document_id = filter_doc_id)
  )
  SELECT
    vr.id AS chunk_id,
    vr.doc_id AS document_id,
    vr.parent_id AS parent_chunk_id,
    vr.chunk_content AS content,
    vr.chunk_type AS content_type,
    vr.chunk_section AS section_path,
    vr.chunk_pages AS page_numbers,
    vr.chunk_meta AS metadata,
    vr.vec_similarity::FLOAT AS similarity,
    COALESCE(kr.kw_rank, 0)::FLOAT AS keyword_rank,
    (0.7 * vr.vec_similarity + 0.3 * COALESCE(kr.kw_rank, 0))::FLOAT AS combined_score
  FROM vector_results vr
  LEFT JOIN keyword_results kr ON vr.id = kr.id
  ORDER BY (0.7 * vr.vec_similarity + 0.3 * COALESCE(kr.kw_rank, 0)) DESC
  LIMIT match_count;
END;
$$;
