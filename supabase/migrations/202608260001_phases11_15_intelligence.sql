-- SmartBetBot Phases 11-15: canonical entities, versioned probabilities and signals.

create table public.canonical_leagues (
  id uuid primary key default gen_random_uuid(),
  sport_id bigint not null references public.sports(id) on delete restrict,
  country_id bigint references public.countries(id) on delete set null,
  identity_key text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger canonical_leagues_set_updated_at
before update on public.canonical_leagues
for each row execute function public.set_updated_at();

create table public.league_provider_links (
  canonical_league_id uuid not null references public.canonical_leagues(id) on delete cascade,
  league_id uuid not null unique references public.leagues(id) on delete cascade,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  match_method text not null check (match_method in ('explicit', 'provider_id', 'normalized_name')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (canonical_league_id, league_id)
);

create index league_provider_links_canonical_idx
on public.league_provider_links (canonical_league_id);

create table public.canonical_teams (
  id uuid primary key default gen_random_uuid(),
  country_id bigint references public.countries(id) on delete set null,
  identity_key text not null unique,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger canonical_teams_set_updated_at
before update on public.canonical_teams
for each row execute function public.set_updated_at();

create table public.team_provider_links (
  canonical_team_id uuid not null references public.canonical_teams(id) on delete cascade,
  team_id uuid not null unique references public.teams(id) on delete cascade,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  match_method text not null check (
    match_method in ('explicit', 'exact_code', 'normalized_name', 'provider_id')
  ),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (canonical_team_id, team_id)
);

create index team_provider_links_canonical_idx
on public.team_provider_links (canonical_team_id);

alter table public.predictions
add column fingerprint text;

update public.predictions
set fingerprint = encode(digest('legacy:' || id::text, 'sha256'), 'hex')
where fingerprint is null;

alter table public.predictions
alter column fingerprint set not null;

create unique index predictions_fingerprint_idx
on public.predictions (fingerprint);

create index predictions_latest_market_idx
on public.predictions (
  fixture_id, market, selection, line, feature_cutoff_at desc, predicted_at desc, id desc
);

alter table public.worker_runs
drop constraint if exists worker_runs_worker_check;

alter table public.worker_runs
add constraint worker_runs_worker_check
check (
  worker in (
    'live', 'odds', 'prematch', 'probability', 'signal',
    'settlement', 'notification'
  )
);

-- Align strategies with the canonical markets written by the odds adapter.
update public.strategies
set market = 'total_goals',
    config_json = config_json || '{"selection":"over","line":"0.500"}'::jsonb,
    updated_at = now()
where slug = 'live-over-05-pressure';

update public.strategies
set market = 'total_goals',
    config_json = config_json || '{"selection":"over","line":"1.500"}'::jsonb,
    updated_at = now()
where slug = 'prematch-over-15';

update public.strategies
set market = 'both_teams_to_score',
    config_json = config_json || '{"selection":"yes"}'::jsonb,
    updated_at = now()
where slug = 'btts-prematch';

alter table public.canonical_leagues enable row level security;
alter table public.league_provider_links enable row level security;
alter table public.canonical_teams enable row level security;
alter table public.team_provider_links enable row level security;

revoke all on table public.canonical_leagues from public, anon, authenticated;
revoke all on table public.league_provider_links from public, anon, authenticated;
revoke all on table public.canonical_teams from public, anon, authenticated;
revoke all on table public.team_provider_links from public, anon, authenticated;

comment on table public.canonical_leagues is
'Provider-neutral league identity used to join historical and current-season data.';
comment on table public.canonical_teams is
'Provider-neutral team identity; links with low confidence remain unapproved and auditable.';
comment on column public.predictions.fingerprint is
'Versioned idempotency key over fixture, model, market, selection, line and feature cutoff.';
