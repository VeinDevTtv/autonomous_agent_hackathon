-- Align embedding dimension with gemini-embedding-001 (3072).
-- Run this if you previously applied a schema with vector(1536).
-- Existing chunk rows are removed so ingestion can repopulate with 3072-dim embeddings.

TRUNCATE public.document_chunks;

ALTER TABLE public.document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.document_chunks ADD COLUMN embedding vector(3072) NOT NULL;

-- No ivfflat index: pgvector ivfflat max 2000 dimensions; we use 3072 (gemini-embedding-001).

-- Recreate match_documents for vector(3072)
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(3072),
  match_count int
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_id text,
  text text,
  similarity float
) AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_id,
    dc.text,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
