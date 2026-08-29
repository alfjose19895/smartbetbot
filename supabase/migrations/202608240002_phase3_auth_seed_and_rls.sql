-- SmartBetBot Phase 3: auth synchronization, deterministic seeds, grants, and RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80), '');

  insert into public.profiles (id, display_name, role, timezone, created_at, updated_at)
  values (new.id, requested_name, 'user', 'UTC', coalesce(new.created_at, now()), now())
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill users created during Phase 2 before this trigger existed.
insert into public.profiles (id, display_name, role, timezone, created_at, updated_at)
select
  users.id,
  nullif(left(trim(coalesce(users.raw_user_meta_data ->> 'full_name', '')), 80), ''),
  'user',
  'UTC',
  users.created_at,
  now()
from auth.users as users
on conflict (id) do nothing;

insert into public.user_preferences (user_id)
select profiles.id
from public.profiles as profiles
on conflict (user_id) do nothing;

insert into public.sports (name, slug, is_active)
values ('Football', 'football', true)
on conflict (slug) do update
set name = excluded.name,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.strategies (
  name,
  slug,
  market,
  is_live,
  enabled,
  min_probability,
  min_edge,
  min_smart_score,
  min_data_quality,
  min_odds,
  max_odds,
  cooldown_seconds,
  config_json
)
values
  (
    'Live Over 0.5 Pressure',
    'live-over-05-pressure',
    'over_0_5',
    true,
    false,
    0.75,
    0.05,
    75,
    0.70,
    1.10,
    3.00,
    300,
    '{"pressure_windows_minutes":[5,10,15],"requires_live_stats":true}'::jsonb
  ),
  (
    'Prematch Over 1.5',
    'prematch-over-15',
    'over_1_5',
    false,
    false,
    0.75,
    0.05,
    75,
    0.70,
    1.10,
    2.50,
    300,
    '{"baseline":"poisson_elo_form"}'::jsonb
  ),
  (
    'BTTS Prematch',
    'btts-prematch',
    'btts',
    false,
    false,
    0.75,
    0.05,
    75,
    0.70,
    1.20,
    3.00,
    300,
    '{"selections":["yes","no"],"baseline":"poisson_form"}'::jsonb
  ),
  (
    'Double Chance Prematch',
    'double-chance-prematch',
    'double_chance',
    false,
    false,
    0.75,
    0.05,
    75,
    0.70,
    1.05,
    2.25,
    300,
    '{"selections":["1x","x2"]}'::jsonb
  )
on conflict (slug) do update
set name = excluded.name,
    market = excluded.market,
    is_live = excluded.is_live,
    min_probability = excluded.min_probability,
    min_edge = excluded.min_edge,
    min_smart_score = excluded.min_smart_score,
    min_data_quality = excluded.min_data_quality,
    min_odds = excluded.min_odds,
    max_odds = excluded.max_odds,
    cooldown_seconds = excluded.cooldown_seconds,
    config_json = excluded.config_json,
    updated_at = now();

-- RLS is enabled on every table in the exposed public schema.
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.sports enable row level security;
alter table public.countries enable row level security;
alter table public.leagues enable row level security;
alter table public.seasons enable row level security;
alter table public.teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.fixture_events enable row level security;
alter table public.fixture_stats_snapshots enable row level security;
alter table public.odds_snapshots enable row level security;
alter table public.model_versions enable row level security;
alter table public.predictions enable row level security;
alter table public.strategies enable row level security;
alter table public.signals enable row level security;
alter table public.signal_reasons enable row level security;
alter table public.signal_results enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.worker_runs enable row level security;
alter table public.api_usage enable row level security;
alter table public.audit_logs enable row level security;

-- Supabase may apply broad default privileges to new public tables; remove them explicitly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Only user-owned resources are exposed directly to authenticated clients.
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, timezone) on table public.profiles to authenticated;

grant select on table public.user_preferences to authenticated;
grant insert (
  user_id,
  minimum_smart_score,
  minimum_probability,
  minimum_edge,
  live_enabled,
  prematch_enabled,
  markets,
  league_ids,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  timezone
) on table public.user_preferences to authenticated;
grant update (
  minimum_smart_score,
  minimum_probability,
  minimum_edge,
  live_enabled,
  prematch_enabled,
  markets,
  league_ids,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  timezone
) on table public.user_preferences to authenticated;
grant delete on table public.user_preferences to authenticated;

grant select on table public.push_subscriptions to authenticated;
grant insert (user_id, fcm_token, device_id, platform, user_agent, is_enabled, last_seen_at)
on table public.push_subscriptions to authenticated;
grant update (fcm_token, device_id, platform, user_agent, is_enabled, last_seen_at)
on table public.push_subscriptions to authenticated;
grant delete on table public.push_subscriptions to authenticated;

grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy user_preferences_select_own
on public.user_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy user_preferences_insert_own
on public.user_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy user_preferences_update_own
on public.user_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy user_preferences_delete_own
on public.user_preferences
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy push_subscriptions_select_own
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy push_subscriptions_insert_own
on public.push_subscriptions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy push_subscriptions_update_own
on public.push_subscriptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy push_subscriptions_delete_own
on public.push_subscriptions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy notifications_select_own
on public.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy notifications_update_own
on public.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Service processes have explicit database access. The service_role continues to bypass RLS.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Personal notifications can be consumed through Supabase Realtime while retaining RLS.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
