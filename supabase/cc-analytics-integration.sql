-- CC ANALYTICS · AUTENTICACIÓN Y DATOS INDEPENDIENTES
-- Ejecutar únicamente en el proyecto Supabase exclusivo de CC Analytics.
-- No depende de CC HUB, public.profiles ni public.app_memberships.

create extension if not exists pgcrypto;

create table if not exists public.analytics_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  department text not null default 'Administración',
  job_title text not null default 'Pendiente de asignación',
  zone text not null default 'Nacional',
  role text not null default 'analyst',
  reports_to uuid references public.analytics_profiles(id) on delete set null,
  status text not null default 'inactivo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_profiles_role_check
    check (role in ('admin','leader','supervisor','analyst','uploader')),
  constraint analytics_profiles_status_check
    check (status in ('activo','inactivo','suspendido')),
  constraint analytics_profiles_no_self_manager
    check (reports_to is null or reports_to <> id),
  constraint profiles_no_seller_analytics_access
    check (
      lower(trim(coalesce(job_title, ''))) not like '%vendedor%'
      and lower(trim(coalesce(job_title, '')))
        not like '%ejecutivo de ventas%'
    )
);

create index if not exists analytics_profiles_scope_idx
  on public.analytics_profiles (department, zone, role, status);
create index if not exists analytics_profiles_manager_idx
  on public.analytics_profiles (reports_to, status);

-- Los vendedores no reciben acceso a CC Analytics; se manejan como datos.
create or replace function public.handle_new_analytics_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_profiles (
    id, full_name, email, department, job_title, zone, role, reports_to, status
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'department', ''), 'Administración'),
    coalesce(nullif(new.raw_user_meta_data ->> 'job_title', ''), 'Pendiente de asignación'),
    coalesce(nullif(new.raw_user_meta_data ->> 'zone', ''), 'Nacional'),
    case
      when new.raw_user_meta_data ->> 'role'
        in ('admin','leader','supervisor','analyst','uploader')
      then new.raw_user_meta_data ->> 'role'
      else 'analyst'
    end,
    case
      when coalesce(new.raw_user_meta_data ->> 'reports_to', '') ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      then (new.raw_user_meta_data ->> 'reports_to')::uuid
      else null
    end,
    'inactivo'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_analytics on auth.users;
create trigger on_auth_user_created_analytics
after insert on auth.users
for each row execute function public.handle_new_analytics_user();

create or replace function public.set_analytics_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists analytics_profiles_updated_at on public.analytics_profiles;
create trigger analytics_profiles_updated_at
before update on public.analytics_profiles
for each row execute function public.set_analytics_updated_at();

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.analytics_profiles
    where id = auth.uid() and role = 'admin' and status = 'activo'
  );
$$;

create or replace function public.current_user_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department from public.analytics_profiles
  where id = auth.uid() and status = 'activo';
$$;

create or replace function public.current_user_zone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select zone from public.analytics_profiles
  where id = auth.uid() and status = 'activo';
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.analytics_profiles
  where id = auth.uid() and status = 'activo';
$$;

create or replace function public.current_user_can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_admin()
    or target_user_id = auth.uid()
    or exists (
      select 1
      from public.analytics_profiles me
      join public.analytics_profiles target on target.id = target_user_id
      where me.id = auth.uid()
        and me.status = 'activo'
        and (
          target.reports_to = me.id
          or me.reports_to = target.id
          or (
            me.role = 'leader'
            and exists (
              select 1 from public.analytics_profiles supervisor
              where supervisor.id = target.reports_to
                and supervisor.reports_to = me.id
            )
          )
        )
    );
$$;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_department() from public;
revoke all on function public.current_user_zone() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_can_view_profile(uuid) from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_department() to authenticated;
grant execute on function public.current_user_zone() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_can_view_profile(uuid) to authenticated;

alter table public.analytics_profiles enable row level security;
drop policy if exists "analytics profiles scoped select" on public.analytics_profiles;
drop policy if exists "analytics profiles update own name" on public.analytics_profiles;
create policy "analytics profiles scoped select"
on public.analytics_profiles for select to authenticated
using (public.current_user_can_view_profile(id));
create policy "analytics profiles update own name"
on public.analytics_profiles for update to authenticated
using (id = auth.uid() and status = 'activo')
with check (id = auth.uid() and status = 'activo');
revoke all on public.analytics_profiles from anon;
revoke insert, delete on public.analytics_profiles from authenticated;
revoke update on public.analytics_profiles from authenticated;
grant select on public.analytics_profiles to authenticated;
grant update (full_name) on public.analytics_profiles to authenticated;

create table if not exists public.analytics_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.analytics_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  department text,
  zone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_audit_actor_idx
  on public.analytics_audit_log (actor_id, created_at desc);
create index if not exists analytics_audit_action_idx
  on public.analytics_audit_log (action, created_at desc);
alter table public.analytics_audit_log enable row level security;
drop policy if exists "analytics audit admin select" on public.analytics_audit_log;
create policy "analytics audit admin select"
on public.analytics_audit_log for select to authenticated
using (public.current_user_is_admin());
revoke all on public.analytics_audit_log from anon;
revoke insert, update, delete on public.analytics_audit_log from authenticated;
grant select on public.analytics_audit_log to authenticated;

create or replace function public.admin_update_analytics_profile(
  target_user_id uuid,
  target_department text,
  target_job_title text,
  target_zone text,
  target_reports_to uuid,
  target_status text,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_profile jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'Acceso denegado';
  end if;
  if target_role not in ('admin','leader','supervisor','analyst','uploader') then
    raise exception 'Rol de Analytics inválido';
  end if;
  if target_status not in ('activo','inactivo','suspendido') then
    raise exception 'Estado inválido';
  end if;
  if nullif(trim(target_department), '') is null then
    raise exception 'Departamento requerido';
  end if;
  if nullif(trim(target_job_title), '') is null then
    raise exception 'Cargo o perfil requerido';
  end if;
  if nullif(trim(target_zone), '') is null then
    raise exception 'Zona requerida';
  end if;
  if lower(trim(target_job_title)) like '%vendedor%'
     or lower(trim(target_job_title)) like '%ejecutivo de ventas%' then
    raise exception 'Los vendedores no reciben acceso a CC Analytics';
  end if;
  if target_reports_to = target_user_id then
    raise exception 'Un usuario no puede reportarse a sí mismo';
  end if;
  if target_role = 'admin' then
    target_department := 'Administración';
    target_zone := 'Nacional';
    target_reports_to := null;
  elsif target_role = 'leader' then
    target_reports_to := null;
  elsif target_reports_to is null then
    raise exception 'El usuario requiere un superior responsable';
  elsif not exists (
    select 1 from public.analytics_profiles manager
    where manager.id = target_reports_to
      and manager.status = 'activo'
      and manager.department = target_department
      and (manager.zone = target_zone or manager.zone = 'Nacional')
      and (
        (target_role = 'supervisor' and manager.role = 'leader')
        or (target_role in ('analyst','uploader') and manager.role = 'supervisor')
      )
  ) then
    raise exception 'El superior debe pertenecer al mismo departamento y alcance';
  end if;

  select to_jsonb(profile_row) into previous_profile
  from public.analytics_profiles profile_row
  where profile_row.id = target_user_id;
  if previous_profile is null then
    raise exception 'Usuario no encontrado';
  end if;

  update public.analytics_profiles
  set department = trim(target_department),
      job_title = trim(target_job_title),
      zone = trim(target_zone),
      reports_to = target_reports_to,
      status = target_status,
      role = target_role,
      updated_at = now()
  where id = target_user_id;

  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    'analytics_profile_updated',
    'analytics_profile',
    target_user_id::text,
    target_department,
    target_zone,
    jsonb_build_object(
      'before', previous_profile,
      'after', jsonb_build_object(
        'department', target_department,
        'job_title', target_job_title,
        'zone', target_zone,
        'reports_to', target_reports_to,
        'status', target_status,
        'role', target_role
      )
    )
  );
end;
$$;
revoke all on function public.admin_update_analytics_profile(
  uuid,text,text,text,uuid,text,text
) from public;
grant execute on function public.admin_update_analytics_profile(
  uuid,text,text,text,uuid,text,text
) to authenticated;

create or replace function public.bootstrap_analytics_admin(
  target_email text,
  target_name text default 'Administrador CC Analytics'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_id uuid;
begin
  select id into target_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;
  if target_id is null then
    raise exception 'Primero crea el usuario en Authentication > Users';
  end if;

  insert into public.analytics_profiles (
    id, full_name, email, department, job_title, zone, role, reports_to, status
  ) values (
    target_id,
    trim(target_name),
    lower(trim(target_email)),
    'Administración',
    'Administrador',
    'Nacional',
    'admin',
    null,
    'activo'
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      department = 'Administración',
      job_title = 'Administrador',
      zone = 'Nacional',
      role = 'admin',
      reports_to = null,
      status = 'activo',
      updated_at = now();
  return target_id;
end;
$$;
revoke all on function public.bootstrap_analytics_admin(text,text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_analytics_admin(text,text)
  to service_role;

create table if not exists public.analytics_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  department text not null,
  zone text not null default 'Sin asignar',
  module text not null default 'general',
  row_count integer not null default 0,
  uploaded_by uuid not null references public.analytics_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_records (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.analytics_imports(id) on delete cascade,
  department text not null,
  zone text not null default 'Sin asignar',
  module text not null default 'general',
  period text,
  payload jsonb not null,
  created_by uuid not null references public.analytics_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_sales (
  id bigint generated always as identity primary key,
  source_import_id uuid references public.analytics_imports(id) on delete cascade,
  department text not null,
  zone text not null default 'Sin asignar',
  seller_profile_id uuid references public.analytics_profiles(id) on delete set null,
  supervisor_profile_id uuid references public.analytics_profiles(id) on delete set null,
  seller_code text,
  seller_name text not null,
  team text,
  sale_date date not null,
  country text,
  region text,
  city text,
  sale_type text,
  service text,
  medium text,
  is_primary boolean,
  contract_service text,
  amount_billed numeric(14,2),
  commission_income numeric(14,2),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.analytics_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists analytics_sales_period_idx
  on public.analytics_sales (department, zone, sale_date);
create index if not exists analytics_sales_seller_idx
  on public.analytics_sales (seller_name, sale_date);
create index if not exists analytics_sales_supervisor_idx
  on public.analytics_sales (supervisor_profile_id, sale_date);

alter table public.analytics_imports enable row level security;
alter table public.analytics_records enable row level security;
alter table public.analytics_sales enable row level security;

create or replace function public.current_user_can_assign_supervisor(
  target_supervisor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_admin()
    or exists (
      select 1
      from public.analytics_profiles me
      join public.analytics_profiles supervisor
        on supervisor.id = target_supervisor_id
      where me.id = auth.uid()
        and me.status = 'activo'
        and supervisor.status = 'activo'
        and supervisor.role = 'supervisor'
        and supervisor.department = me.department
        and (me.zone = 'Nacional' or supervisor.zone = me.zone)
        and (
          (me.role = 'leader' and supervisor.reports_to = me.id)
          or (me.role = 'supervisor' and supervisor.id = me.id)
          or (me.role in ('analyst','uploader') and me.reports_to = supervisor.id)
        )
    );
$$;

create or replace function public.current_user_can_view_sale(
  target_department text,
  target_zone text,
  target_supervisor_id uuid,
  target_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_admin()
    or exists (
      select 1
      from public.analytics_profiles me
      where me.id = auth.uid()
        and me.status = 'activo'
        and me.department = target_department
        and (me.zone = 'Nacional' or me.zone = target_zone)
        and (
          (me.role = 'leader' and exists (
            select 1 from public.analytics_profiles supervisor
            where supervisor.id = target_supervisor_id
              and supervisor.reports_to = me.id
              and supervisor.role = 'supervisor'
          ))
          or (me.role = 'supervisor' and target_supervisor_id = me.id)
          or (me.role in ('analyst','uploader') and target_created_by = me.id)
        )
    );
$$;

revoke all on function public.current_user_can_assign_supervisor(uuid) from public;
revoke all on function public.current_user_can_view_sale(text,text,uuid,uuid) from public;
grant execute on function public.current_user_can_assign_supervisor(uuid) to authenticated;
grant execute on function public.current_user_can_view_sale(text,text,uuid,uuid) to authenticated;

drop policy if exists "analytics imports scoped select" on public.analytics_imports;
drop policy if exists "analytics imports scoped insert" on public.analytics_imports;
drop policy if exists "analytics records scoped select" on public.analytics_records;
drop policy if exists "analytics records scoped insert" on public.analytics_records;
drop policy if exists "analytics sales hierarchical select" on public.analytics_sales;
drop policy if exists "analytics sales scoped insert" on public.analytics_sales;

create policy "analytics imports scoped select"
on public.analytics_imports for select to authenticated
using (
  public.current_user_is_admin()
  or (
    public.current_user_can_view_profile(uploaded_by)
    and department = public.current_user_department()
    and (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
  )
);
create policy "analytics imports scoped insert"
on public.analytics_imports for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
    )
  )
);
create policy "analytics records scoped select"
on public.analytics_records for select to authenticated
using (
  public.current_user_is_admin()
  or (
    public.current_user_can_view_profile(created_by)
    and department = public.current_user_department()
    and (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
  )
);
create policy "analytics records scoped insert"
on public.analytics_records for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
    )
  )
);
create policy "analytics sales hierarchical select"
on public.analytics_sales for select to authenticated
using (
  public.current_user_can_view_sale(
    department, zone, supervisor_profile_id, created_by
  )
);
create policy "analytics sales scoped insert"
on public.analytics_sales for insert to authenticated
with check (
  created_by = auth.uid()
  and seller_profile_id is null
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
      and public.current_user_can_assign_supervisor(supervisor_profile_id)
    )
  )
);

grant select, insert on public.analytics_imports to authenticated;
grant select, insert on public.analytics_records to authenticated;
grant select, insert on public.analytics_sales to authenticated;

create or replace function public.audit_analytics_import()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    new.uploaded_by,
    'data_import_created',
    'analytics_import',
    new.id::text,
    new.department,
    new.zone,
    jsonb_build_object(
      'file_name', new.file_name,
      'row_count', new.row_count,
      'module', new.module
    )
  );
  return new;
end;
$$;
drop trigger if exists analytics_import_audit on public.analytics_imports;
create trigger analytics_import_audit
after insert on public.analytics_imports
for each row execute function public.audit_analytics_import();

create table if not exists public.analytics_report_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  department text not null,
  zone text not null default 'Nacional',
  definition jsonb not null,
  is_shared boolean not null default false,
  created_by uuid not null references public.analytics_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists analytics_report_templates_owner_idx
  on public.analytics_report_templates (created_by, updated_at desc);
alter table public.analytics_report_templates enable row level security;
drop policy if exists "analytics report templates scoped select" on public.analytics_report_templates;
drop policy if exists "analytics report templates scoped insert" on public.analytics_report_templates;
drop policy if exists "analytics report templates scoped update" on public.analytics_report_templates;
drop policy if exists "analytics report templates scoped delete" on public.analytics_report_templates;
create policy "analytics report templates scoped select"
on public.analytics_report_templates for select to authenticated
using (
  public.current_user_is_admin()
  or created_by = auth.uid()
  or (
    is_shared
    and department = public.current_user_department()
    and (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
  )
);
create policy "analytics report templates scoped insert"
on public.analytics_report_templates for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
    )
  )
);
create policy "analytics report templates scoped update"
on public.analytics_report_templates for update to authenticated
using (created_by = auth.uid() or public.current_user_is_admin())
with check (created_by = auth.uid() or public.current_user_is_admin());
create policy "analytics report templates scoped delete"
on public.analytics_report_templates for delete to authenticated
using (created_by = auth.uid() or public.current_user_is_admin());
grant select, insert, update, delete
on public.analytics_report_templates to authenticated;

create or replace function public.audit_analytics_report_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template_row public.analytics_report_templates%rowtype;
begin
  if tg_op = 'DELETE' then template_row := old; else template_row := new; end if;
  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'report_template_created'
      when tg_op = 'UPDATE' then 'report_template_updated'
      else 'report_template_deleted'
    end,
    'analytics_report_template',
    template_row.id::text,
    template_row.department,
    template_row.zone,
    jsonb_build_object('name', template_row.name, 'is_shared', template_row.is_shared)
  );
  return template_row;
end;
$$;
drop trigger if exists analytics_report_template_audit on public.analytics_report_templates;
create trigger analytics_report_template_audit
after insert or update or delete on public.analytics_report_templates
for each row execute function public.audit_analytics_report_template();

grant usage, select on all sequences in schema public to authenticated;
notify pgrst, 'reload schema';

-- PRIMER ADMINISTRADOR
-- 1. Crea el usuario desde Authentication > Users.
-- 2. Ejecuta:
-- select public.bootstrap_analytics_admin(
--   'correo@empresa.com',
--   'Nombre del administrador'
-- );
