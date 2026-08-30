-- SmartBetBot Phase 26 Fix: Align profiles role check constraint with normalized bettor/user roles

-- 1. Drop restrictive check constraint if present
do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
exception
  when others then null;
end $$;

-- 2. Re-add check constraint supporting all valid roles
alter table public.profiles
add constraint profiles_role_check
check (role in ('user', 'bettor', 'admin', 'premium', 'analyst'));

-- 3. Set default role to bettor
alter table public.profiles
alter column role set default 'bettor';

-- 4. Harden handle_new_user trigger function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
  default_role_id integer;
begin
  requested_name := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80);

  if char_length(requested_name) < 2 then
    requested_name := null;
  end if;

  select id into default_role_id from public.roles where slug = 'bettor' limit 1;
  if default_role_id is null then
    select id into default_role_id from public.roles where slug = 'user' limit 1;
  end if;

  insert into public.profiles (id, display_name, role, role_id, timezone, created_at, updated_at)
  values (new.id, requested_name, 'bettor', coalesce(default_role_id, 2), 'UTC', coalesce(new.created_at, now()), now())
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
