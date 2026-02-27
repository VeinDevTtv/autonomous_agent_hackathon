-- Phase 4: Reports bucket for analysis CSV (and optional markdown) outputs.
-- Private bucket; access via signed URLs from GET /api/jobs/:id/download/csv.

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- Allow service role to upload; restrict public access.
-- RLS policies: service role bypasses RLS; no anon read (use signed URL from API).
