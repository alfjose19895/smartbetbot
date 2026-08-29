-- SmartBetBot Phase 3: keep client access limited to the three user-owned resources
-- explicitly included in the Phase 3 contract. Notification delivery is added in Phase 22.

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

revoke all privileges on table public.notifications from anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table public.notifications;
  end if;
end;
$$;
