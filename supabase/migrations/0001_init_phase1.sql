-- Phase 1: Upload & Ingestion schema
-- Enable pgvector
create extension if not exists vector;

-- Documents table: one row per uploaded file
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  filename text not null,
  mime_type text not null,
  storage_path text not null,
  status text not null check (status in ('uploaded', 'ingesting', 'ready', 'error')) default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_status_idx on public.documents (status);

-- Document chunks: vectorized segments per document
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_id text not null,
  text text not null,
  embedding vector(3072) not null,
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);
-- No ivfflat index: pgvector ivfflat supports max 2000 dimensions; gemini-embedding-001 uses 3072.
-- match_documents uses ORDER BY embedding <=> query_embedding (sequential scan); fine for MVP.

-- RPC function for vector search (used in later phases)
create or replace function public.match_documents(
  query_embedding vector(3072),
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  chunk_id text,
  text text,
  similarity float
) as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_id,
    dc.text,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  order by dc.embedding <=> query_embedding
  limit match_count;
$$ language sql stable;

