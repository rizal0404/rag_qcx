-- ============================================================
-- RAG Knowledge Base — Full Database Schema
-- Run this migration on your Supabase project
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. Documents Table
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  doc_type TEXT DEFAULT 'manual',
  doc_number TEXT,
  revision TEXT,
  equipment_model TEXT,
  language TEXT DEFAULT 'en',
  file_path TEXT NOT NULL,
  total_pages INTEGER,
  total_chunks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'UPLOADED' 
    CHECK (status IN ('UPLOADED','EXTRACTING','EXTRACTED','PROCESSING','EMBEDDING','ACTIVE','ERROR','INACTIVE')),
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Chunks Table (Core Knowledge Base)
-- ============================================================
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  parent_chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('NARRATIVE_TEXT','SPEC_TABLE','PROCEDURE_TABLE','WIRING_DIAGRAM','TECHNICAL_PHOTO','SAFETY_CALLOUT','PARTS_LIST')),
  section_path TEXT,
  page_numbers INTEGER[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. Images Table
-- ============================================================
CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  image_type TEXT DEFAULT 'illustration'
    CHECK (image_type IN ('wiring_diagram','technical_photo','schematic','illustration','chart')),
  vlm_description TEXT,
  callouts JSONB,
  page_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. Chat Sessions Table
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. Chat Messages Table
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  cited_chunk_ids UUID[] DEFAULT '{}',
  cited_images JSONB,
  is_fallback BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. Indexes
-- ============================================================

-- Vector similarity search index (IVFFlat for approximate NN)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding 
  ON chunks USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts 
  ON chunks USING gin (to_tsvector('english', content));

-- Trigram index for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm 
  ON chunks USING gin (content gin_trgm_ops);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_content_type ON chunks(content_type);
CREATE INDEX IF NOT EXISTS idx_chunks_section_path ON chunks(section_path);
CREATE INDEX IF NOT EXISTS idx_images_chunk_id ON images(chunk_id);
CREATE INDEX IF NOT EXISTS idx_images_document_id ON images(document_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- ============================================================
-- 7. Hybrid Search Function
-- ============================================================
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
      ts_rank_cd(
        to_tsvector('english', c.content), 
        plainto_tsquery('english', query_text)
      ) AS kw_rank
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE d.status = 'ACTIVE'
      AND to_tsvector('english', c.content) @@ plainto_tsquery('english', query_text)
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

-- ============================================================
-- 8. Storage Bucket (run via Supabase dashboard or API)
-- ============================================================
-- Create a storage bucket named 'manuals' with public read access
-- for serving images/diagrams to the chat UI.
-- 
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('manuals', 'manuals', true);

-- ============================================================
-- 9. Row Level Security (basic — disable for admin operations)
-- ============================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow public read on documents and chunks (chatbot needs this)
CREATE POLICY "Public read documents" ON documents FOR SELECT USING (true);
CREATE POLICY "Public read chunks" ON chunks FOR SELECT USING (true);
CREATE POLICY "Public read images" ON images FOR SELECT USING (true);
CREATE POLICY "Public read sessions" ON chat_sessions FOR SELECT USING (true);
CREATE POLICY "Public read messages" ON chat_messages FOR SELECT USING (true);

-- Allow service role full access (for ingestion pipeline)
CREATE POLICY "Service insert documents" ON documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update documents" ON documents FOR UPDATE USING (true);
CREATE POLICY "Service insert chunks" ON chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert images" ON images FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert sessions" ON chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert messages" ON chat_messages FOR INSERT WITH CHECK (true);
