-- Phase 4: Tavily vendor enrichment cache (24h TTL)
-- Keyed by stable vendor identifier; enrichment stored as JSONB.

create table if not exists public.vendor_enrichment_cache (
  id uuid primary key default gen_random_uuid(),
  vendor_key text not null unique,
  enrichment jsonb not null default '{}',
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vendor_enrichment_cache_vendor_key_idx on public.vendor_enrichment_cache (vendor_key);
create index if not exists vendor_enrichment_cache_last_refreshed_idx on public.vendor_enrichment_cache (last_refreshed_at);
