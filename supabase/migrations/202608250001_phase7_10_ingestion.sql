-- SmartBetBot Phases 7-10: durable ingestion snapshots and odds-history integrity.

alter table public.leagues
alter column provider_id type text using provider_id::text;

alter table public.teams
alter column provider_id type text using provider_id::text;

alter table public.fixtures
alter column provider_id type text using provider_id::text;

alter table public.fixture_events
alter column player_provider_id type text using player_provider_id::text,
alter column assist_provider_id type text using assist_provider_id::text;

alter table public.countries
drop constraint if exists countries_code_check;

alter table public.countries
add constraint countries_code_check
check (code is null or code ~ '^[A-Z0-9]{2,3}(-[A-Z0-9]{1,3})?$');

alter table public.leagues
drop constraint if exists leagues_league_type_check;

alter table public.leagues
add constraint leagues_league_type_check
check (league_type in ('league', 'cup', 'friendly', 'unknown'));

alter table public.fixtures
drop constraint if exists fixtures_status_check;

alter table public.fixtures
add constraint fixtures_status_check
check (
  status in (
    'scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled',
    'abandoned', 'unknown'
  )
);

create table public.league_standings_snapshots (
  id bigint generated always as identity primary key,
  league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  captured_at timestamptz not null,
  group_name text,
  entries jsonb not null check (jsonb_typeof(entries) = 'array'),
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create index league_standings_league_season_time_idx
on public.league_standings_snapshots (league_id, season_id, captured_at desc);

create table public.team_season_stats_snapshots (
  id bigint generated always as identity primary key,
  league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  captured_at timestamptz not null,
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create index team_season_stats_team_season_time_idx
on public.team_season_stats_snapshots (team_id, season_id, captured_at desc);

create table public.fixture_lineup_snapshots (
  id bigint generated always as identity primary key,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  captured_at timestamptz not null,
  formation text,
  coach jsonb,
  starting_xi jsonb not null default '[]'::jsonb check (jsonb_typeof(starting_xi) = 'array'),
  substitutes jsonb not null default '[]'::jsonb check (jsonb_typeof(substitutes) = 'array'),
  fingerprint text not null unique,
  created_at timestamptz not null default now(),
  constraint fixture_lineup_coach_object
  check (coach is null or jsonb_typeof(coach) = 'object')
);

create index fixture_lineups_fixture_team_time_idx
on public.fixture_lineup_snapshots (fixture_id, team_id, captured_at desc);

create table public.provider_prediction_snapshots (
  id bigint generated always as identity primary key,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  provider text not null,
  captured_at timestamptz not null,
  home_win_probability numeric(7,6)
  check (home_win_probability is null or home_win_probability between 0 and 1),
  draw_probability numeric(7,6)
  check (draw_probability is null or draw_probability between 0 and 1),
  away_win_probability numeric(7,6)
  check (away_win_probability is null or away_win_probability between 0 and 1),
  predicted_winner_provider_id text,
  advice text,
  supplementary_only boolean not null default true check (supplementary_only),
  raw_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_payload) = 'object'),
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create index provider_predictions_fixture_time_idx
on public.provider_prediction_snapshots (fixture_id, captured_at desc);

alter table public.odds_snapshots
add column raw_implied_probability numeric(7,6)
check (raw_implied_probability between 0 and 1),
add column fingerprint text;

update public.odds_snapshots
set raw_implied_probability = round((1 / decimal_odds)::numeric, 6),
    fingerprint = md5('legacy:' || id::text)
where fingerprint is null or raw_implied_probability is null;

alter table public.odds_snapshots
alter column raw_implied_probability set not null,
alter column fingerprint set not null;

alter table public.odds_snapshots
add constraint odds_snapshots_implied_probability_matches_price
check (abs(raw_implied_probability - round((1 / decimal_odds)::numeric, 6)) <= 0.000001);

create unique index odds_snapshots_fingerprint_idx
on public.odds_snapshots (fingerprint);

create index odds_snapshots_movement_idx
on public.odds_snapshots (
  fixture_id, provider, bookmaker, market, selection, line, is_live, captured_at desc, id desc
);

alter table public.fixture_stats_snapshots
add column fingerprint text;

update public.fixture_stats_snapshots
set fingerprint = md5('legacy:' || id::text)
where fingerprint is null;

alter table public.fixture_stats_snapshots
alter column fingerprint set not null;

create unique index fixture_stats_snapshots_fingerprint_idx
on public.fixture_stats_snapshots (fingerprint);

alter table public.league_standings_snapshots enable row level security;
alter table public.team_season_stats_snapshots enable row level security;
alter table public.fixture_lineup_snapshots enable row level security;
alter table public.provider_prediction_snapshots enable row level security;

revoke all on table public.league_standings_snapshots from public, anon, authenticated;
revoke all on table public.team_season_stats_snapshots from public, anon, authenticated;
revoke all on table public.fixture_lineup_snapshots from public, anon, authenticated;
revoke all on table public.provider_prediction_snapshots from public, anon, authenticated;
revoke all on sequence public.league_standings_snapshots_id_seq from public, anon, authenticated;
revoke all on sequence public.team_season_stats_snapshots_id_seq from public, anon, authenticated;
revoke all on sequence public.fixture_lineup_snapshots_id_seq from public, anon, authenticated;
revoke all on sequence public.provider_prediction_snapshots_id_seq from public, anon, authenticated;
