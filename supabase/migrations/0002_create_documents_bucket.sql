-- Ensure the 'documents' storage bucket exists for Phase 1 ingestion/validation
-- This migration is idempotent and safe to run multiple times.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

