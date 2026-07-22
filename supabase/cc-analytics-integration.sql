-- CC HUB + CC ANALYTICS · integración de identidad y permisos
-- Ejecutar una sola vez en Supabase SQL Editor con una cuenta propietaria.

alter table public.profiles
  add column if not exists analytics_enabled boolean not null default false,
  add column if not exists analytics_role text not null default 'viewer';

do $$ begin
  alter table public.profiles add constraint profiles_analytics_role_check
    check (analytics_role in ('admin','manager','analyst','uploader','viewer'));
exception when duplicate_object then null;
end $$;

-- Los administradores existentes de CC HUB conservan administración global.
update public.profiles
set analytics_enabled = true, analytics_role = 'admin'
where role = 'administrador' and status = 'activo';

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'administrador' or analytics_role = 'admin')
      and status = 'activo'
      and analytics_enabled = true
  );
$$;

create or replace function public.current_user_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department from public.profiles
  where id = auth.uid() and status = 'activo' and analytics_enabled = true;
$$;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_department() from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_department() to authenticated;

-- Sustituye las políticas permisivas originales de profiles.
drop policy if exists "profiles readable authenticated" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "profiles read scoped" on public.profiles;
drop policy if exists "profiles update own safe fields" on public.profiles;

create policy "profiles read scoped"
on public.profiles for select to authenticated
using (id = auth.uid() or public.current_user_is_admin());

create policy "profiles update own safe fields"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

-- Operación administrativa segura para accesos y perfiles.
drop function if exists public.admin_set_user_access(uuid,text,text,text,boolean,text);

create or replace function public.admin_set_user_access(
  target_user_id uuid,
  target_department text,
  target_analytics_enabled boolean,
  target_analytics_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Acceso denegado';
  end if;
  if target_analytics_role not in ('admin','manager','analyst','uploader','viewer') then
    raise exception 'Rol de Analytics inválido';
  end if;
  if target_analytics_enabled and not exists (
    select 1 from public.profiles where id = target_user_id and status = 'activo'
  ) then
    raise exception 'El usuario debe estar activo en CC HUB';
  end if;
  update public.profiles
  set department = target_department,
      analytics_enabled = target_analytics_enabled,
      analytics_role = target_analytics_role,
      updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_set_user_access(uuid,text,boolean,text) from public;
grant execute on function public.admin_set_user_access(uuid,text,boolean,text) to authenticated;

-- Registro y datos flexibles importados por departamento.
create table if not exists public.analytics_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  department text not null,
  module text not null default 'general',
  row_count integer not null default 0,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_records (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.analytics_imports(id) on delete cascade,
  department text not null,
  module text not null default 'general',
  period text,
  payload jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.analytics_imports enable row level security;
alter table public.analytics_records enable row level security;

drop policy if exists "analytics imports scoped select" on public.analytics_imports;
drop policy if exists "analytics imports scoped insert" on public.analytics_imports;
drop policy if exists "analytics records scoped select" on public.analytics_records;
drop policy if exists "analytics records scoped insert" on public.analytics_records;

create policy "analytics imports scoped select" on public.analytics_imports
for select to authenticated
using (public.current_user_is_admin() or department = public.current_user_department());

create policy "analytics imports scoped insert" on public.analytics_imports
for insert to authenticated
with check (
  uploaded_by = auth.uid() and
  (public.current_user_is_admin() or department = public.current_user_department())
);

create policy "analytics records scoped select" on public.analytics_records
for select to authenticated
using (public.current_user_is_admin() or department = public.current_user_department());

create policy "analytics records scoped insert" on public.analytics_records
for insert to authenticated
with check (
  created_by = auth.uid() and
  (public.current_user_is_admin() or department = public.current_user_department())
);

grant select, insert on public.analytics_imports to authenticated;
grant select, insert on public.analytics_records to authenticated;
