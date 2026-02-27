-- Phase 3: Add 'analysis' job type to the jobs table
-- Drop the old constraint and recreate with the new type included.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_type_check CHECK (type IN ('retrieval', 'analysis'));
