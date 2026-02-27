-- Phase 2: Jobs table for retrieval (and future agent) orchestration
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('retrieval')),
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending',
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_pending_idx on public.jobs (status) where status = 'pending';
create index if not exists jobs_type_status_idx on public.jobs (type, status);
