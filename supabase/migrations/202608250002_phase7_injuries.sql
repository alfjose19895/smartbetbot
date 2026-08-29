-- SmartBetBot Phase 7: durable provider injury observations when league coverage exposes them.

create table public.fixture_injury_snapshots (
  id bigint generated always as identity primary key,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  provider text not null,
  player_provider_id text,
  player_name text not null,
  injury_type text,
  reason text,
  captured_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_payload) = 'object'),
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create index fixture_injuries_fixture_team_time_idx
on public.fixture_injury_snapshots (fixture_id, team_id, captured_at desc);

create index fixture_injuries_player_time_idx
on public.fixture_injury_snapshots (provider, player_provider_id, captured_at desc)
where player_provider_id is not null;

alter table public.fixture_injury_snapshots enable row level security;

revoke all on table public.fixture_injury_snapshots from public, anon, authenticated;
revoke all on sequence public.fixture_injury_snapshots_id_seq from public, anon, authenticated;
