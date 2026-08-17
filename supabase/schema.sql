-- Exeter Biology Symposium Outreach — schema
-- Conventions: text PKs, no foreign-key constraints, snake_case, timestamptz,
-- RLS enabled with zero policies so only the service-role key can read/write.

create table if not exists public.orgs (
  id               text primary key,
  name             text not null,
  level            text,              -- 'middle' | 'high' | 'middle_high'
  school_type      text,              -- 'public' | 'private'
  state            text,
  city             text,
  website          text,

  -- email discovery
  email            text,
  email_source     text,              -- URL the address was found on
  email_confidence real default 0,    -- 0..1, see lib/find-email.ts
  consent_basis    text,              -- 'conspicuously_published'

  -- provenance
  registry         text,              -- 'nces_ccd' | 'nces_pss'
  registry_id      text,              -- NCES school ID
  normalized_key   text unique,       -- slug(name + state + city)

  -- research output
  research_summary text,
  research_hook    text,

  status           text not null default 'discovered',
  notes            text,
  last_researched  timestamptz,
  drafted_at       timestamptz,
  gmail_draft_id   text,
  sent_at          timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists public.drafts (
  id          text primary key,          -- 'draft-' || org_id
  org_id      text not null unique,
  subject     text not null,
  body        text not null,
  is_fallback boolean not null default false,   -- never pushed to Gmail
  model       text not null default '',
  updated_at  timestamptz default now()
);

create table if not exists public.sources (
  id           text primary key,
  org_id       text not null,
  url          text not null,
  title        text,
  excerpt      text,                    -- truncated to 3600 chars
  retrieved_at timestamptz default now()
);

create table if not exists public.jobs (
  id         text primary key,
  org_id     text not null,
  stage      text not null,
  status     text not null default 'pending',
  priority   int  not null default 0,
  attempts   int  not null default 0,
  run_after  timestamptz not null default now(),
  started_at timestamptz,
  last_error text,
  created_at timestamptz default now()
);

create table if not exists public.suppressions (
  email      text primary key,
  reason     text,
  created_at timestamptz default now()
);

-- Rotatable OAuth refresh token. MUST be a DB row, not an env var: the app
-- needs to rewrite it, and env vars are immutable at runtime.
create table if not exists public.secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

create index if not exists idx_jobs_claim    on public.jobs (status, run_after) where status = 'pending';
create index if not exists idx_jobs_org      on public.jobs (org_id);
create index if not exists idx_orgs_status   on public.orgs (status);
create index if not exists idx_orgs_state    on public.orgs (state);
create index if not exists idx_sources_org   on public.sources (org_id);

create unique index if not exists jobs_org_stage_open_idx
  on public.jobs (org_id, stage) where status in ('pending', 'running');
create index if not exists jobs_reap_idx
  on public.jobs (started_at) where status = 'running';

alter table public.orgs         enable row level security;
alter table public.drafts       enable row level security;
alter table public.sources      enable row level security;
alter table public.jobs         enable row level security;
alter table public.suppressions enable row level security;
alter table public.secrets      enable row level security;

-- updated_at trigger — Research Bridge declares updated_at and never sets it;
-- do not repeat that bug.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger orgs_touch   before update on public.orgs   for each row execute function public.touch_updated_at();
create trigger drafts_touch before update on public.drafts for each row execute function public.touch_updated_at();

-- Job-claiming function. @supabase/supabase-js speaks PostgREST and cannot
-- issue raw SQL, so FOR UPDATE SKIP LOCKED must live here and be called via
-- .rpc(). Do not emulate with select-then-update from JS — that races and
-- hands the same job to two concurrent ticks.
create or replace function public.claim_jobs(batch_size int, allowed_stages text[])
returns setof public.jobs
language plpgsql
as $$
begin
  -- Reap jobs abandoned by a timed-out serverless invocation. Runs inline on
  -- every poll: one indexed update on a tiny table. Without this, any tick
  -- that exceeds maxDuration leaves its jobs stuck in 'running' forever and
  -- the pipeline silently stalls.
  update public.jobs
     set status = 'pending', started_at = null
   where status = 'running' and started_at < now() - interval '15 minutes';

  return query
  with claimed as (
    select id from public.jobs
     where status = 'pending'
       and stage = any(allowed_stages)
       and run_after <= now()
     order by priority desc, run_after
     limit batch_size
     for update skip locked
  )
  update public.jobs j
     set status = 'running', started_at = now(), attempts = j.attempts + 1
    from claimed c
   where j.id = c.id
  returning j.*;
end $$;

-- Exact America/New_York day boundary for the daily draft cap (BUILD.md §7).
-- A plain PostgREST .gte() filter can only approximate this in UTC, which
-- drifts the cap reset by several hours — this RPC does it exactly.
create or replace function public.drafts_today_count()
returns bigint
language sql
stable
as $$
  select count(*) from public.orgs
   where drafted_at >= date_trunc('day', now() at time zone 'America/New_York');
$$;

revoke all on function public.drafts_today_count() from public, anon, authenticated;

-- CRITICAL — do not omit. PostgREST exposes every function in the `public`
-- schema to the anon role by default, and RLS does not apply to functions.
-- The "RLS on, zero policies" model protects the tables but leaves this
-- function callable by anyone holding the public anon key. This REVOKE is
-- the patch.
revoke all on function public.claim_jobs(int, text[]) from public, anon, authenticated;
