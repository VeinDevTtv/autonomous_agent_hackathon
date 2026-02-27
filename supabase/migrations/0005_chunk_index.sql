-- Add chunk_index column to document_chunks for ordering and debug metadata.
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS chunk_index int NOT NULL DEFAULT 0;

-- Drop existing function first — return type is changing (adding chunk_index).
DROP FUNCTION IF EXISTS public.match_documents(vector(3072), int);

-- Recreate match_documents to include chunk_index in output.
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(3072),
  match_count int
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_id text,
  chunk_index int,
  text text,
  similarity float
) AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_id,
    dc.chunk_index,
    dc.text,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
