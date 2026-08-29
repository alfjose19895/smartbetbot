-- SmartBetBot Phase 3: normalize untrusted Auth metadata before it reaches profile constraints.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80);

  if char_length(requested_name) < 2 then
    requested_name := null;
  end if;

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
