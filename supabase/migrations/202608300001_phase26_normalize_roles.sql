-- SmartBetBot Phase 26: Database Normalization - Roles Table and Profile Relationship

-- 1. Create normalized roles catalog table
create table if not exists public.roles (
  id serial primary key,
  slug text not null unique check (char_length(slug) between 2 and 50),
  name text not null check (char_length(name) between 2 and 80),
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.roles is 'System and application roles for normalized RBAC access control.';
comment on column public.roles.slug is 'Machine-readable unique identifier for the role (e.g. admin, bettor).';
comment on column public.roles.name is 'Human-readable display name for the role.';

-- 2. Seed system roles
insert into public.roles (slug, name, description, is_system)
values
  ('admin', 'Administrador', 'Control total de la plataforma, sincronizaciones de cuotas y gestión de usuarios', true),
  ('bettor', 'Apostador', 'Acceso al dashboard, visualización de cuotas y pronósticos de valor', true),
  ('user', 'Usuario Estándar', 'Usuario registrado con permisos básicos', true),
  ('analyst', 'Analista Deportivo', 'Acceso a modelos predictivos avanzados y métricas de backtesting', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description;

-- 3. Add foreign key relation role_id to public.profiles
alter table public.profiles
add column if not exists role_id integer references public.roles(id) on delete set null;

comment on column public.profiles.role_id is 'Foreign key referencing public.roles(id). Normalized application role.';

-- Populate role_id based on existing role column
update public.profiles p
set role_id = r.id
from public.roles r
where (p.role = r.slug or (p.role = 'user' and r.slug = 'bettor'))
  and p.role_id is null;

-- Set default role_id to bettor (id = 2)
alter table public.profiles
alter column role_id set default 2;

-- 4. Update handle_new_user trigger to populate role_id
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
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 5. RLS Policies for roles
alter table public.roles enable row level security;

create policy "Roles are readable by authenticated users"
on public.roles
for select
to authenticated
using (true);

create policy "Roles are readable by anonymous users"
on public.roles
for select
to anon
using (true);
