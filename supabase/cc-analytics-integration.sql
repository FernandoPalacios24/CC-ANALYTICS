-- CC HUB + CC ANALYTICS · integración de identidad y permisos
-- Ejecutar en Supabase SQL Editor con una cuenta propietaria; es idempotente.

alter table public.profiles
  add column if not exists analytics_enabled boolean not null default false,
  add column if not exists analytics_role text not null default 'viewer',
  add column if not exists zone text not null default 'Sin asignar',
  add column if not exists reports_to uuid references public.profiles(id) on delete set null;

alter table public.profiles drop constraint if exists profiles_analytics_role_check;
alter table public.profiles add constraint profiles_analytics_role_check
  check (analytics_role in ('admin','manager','leader','supervisor','analyst','uploader','viewer'));

-- Los vendedores no son usuarios de CC Analytics. Si existían accesos
-- históricos con ese cargo, quedan deshabilitados y continúan solo como datos.
update public.profiles
set analytics_enabled = false,
    analytics_role = 'viewer',
    updated_at = now()
where lower(trim(coalesce(job_title, ''))) like '%vendedor%'
   or lower(trim(coalesce(job_title, ''))) like '%ejecutivo de ventas%';

alter table public.profiles
  drop constraint if exists profiles_no_seller_analytics_access;
alter table public.profiles
  add constraint profiles_no_seller_analytics_access
  check (
    not analytics_enabled
    or (
      lower(trim(coalesce(job_title, ''))) not like '%vendedor%'
      and lower(trim(coalesce(job_title, '')))
        not like '%ejecutivo de ventas%'
    )
  );

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

create or replace function public.current_user_zone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select zone from public.profiles
  where id = auth.uid() and status = 'activo' and analytics_enabled = true;
$$;

-- Un líder puede leer los perfiles de sus supervisores y colaboradores.
-- Los vendedores no participan en esta jerarquía de identidad: son datos.
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
      select 1 from public.profiles me
      where me.id = auth.uid() and me.reports_to = target_user_id
    )
    or exists (
      select 1 from public.profiles target
      where target.id = target_user_id and target.reports_to = auth.uid()
    )
    or exists (
      select 1
      from public.profiles target
      join public.profiles supervisor on supervisor.id = target.reports_to
      where target.id = target_user_id and supervisor.reports_to = auth.uid()
    );
$$;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_department() from public;
revoke all on function public.current_user_zone() from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_department() to authenticated;
grant execute on function public.current_user_zone() to authenticated;
revoke all on function public.current_user_can_view_profile(uuid) from public;
grant execute on function public.current_user_can_view_profile(uuid) to authenticated;

-- Bitácora corporativa inmutable. Los usuarios normales no pueden insertar,
-- editar ni borrar eventos; solo los administradores pueden consultarlos.
create table if not exists public.analytics_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
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
drop policy if exists "analytics audit admin select"
  on public.analytics_audit_log;
create policy "analytics audit admin select"
on public.analytics_audit_log
for select to authenticated
using (public.current_user_is_admin());

revoke all on public.analytics_audit_log from anon;
revoke insert, update, delete on public.analytics_audit_log from authenticated;
grant select on public.analytics_audit_log to authenticated;

-- Sustituye las políticas permisivas originales de profiles.
drop policy if exists "profiles readable authenticated" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "profiles read scoped" on public.profiles;
drop policy if exists "profiles update own safe fields" on public.profiles;

create policy "profiles read scoped"
on public.profiles for select to authenticated
using (public.current_user_can_view_profile(id));

create policy "profiles update own safe fields"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

-- Todo usuario nuevo de Auth recibe un perfil compartido inactivo.
-- La activación y los roles solo se completan desde un administrador.
create or replace function public.handle_new_cc_platform_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, department, job_title, zone, reports_to, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'department', ''),
    nullif(new.raw_user_meta_data ->> 'job_title', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'zone', ''), 'Sin asignar'),
    case
      when coalesce(new.raw_user_meta_data ->> 'reports_to', '') ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      then (new.raw_user_meta_data ->> 'reports_to')::uuid
      else null
    end,
    'colaborador',
    'inactivo'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_cc_platform on auth.users;
create trigger on_auth_user_created_cc_platform
after insert on auth.users
for each row execute function public.handle_new_cc_platform_user();

-- Operación administrativa segura para accesos y perfiles.
drop function if exists public.admin_set_user_access(uuid,text,text,text,boolean,text);
drop function if exists public.admin_set_user_access(uuid,text,boolean,text);
drop function if exists public.admin_set_user_access(uuid,text,text,text,text,text,boolean,text);
drop function if exists public.admin_set_user_access(uuid,text,text,text,uuid,text,text,boolean,text);

create or replace function public.admin_set_user_access(
  target_user_id uuid,
  target_department text,
  target_job_title text,
  target_zone text,
  target_reports_to uuid,
  target_hub_role text,
  target_status text,
  target_analytics_enabled boolean,
  target_analytics_role text
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
  if target_hub_role not in ('administrador','supervisor','colaborador') then
    raise exception 'Rol de CC HUB inválido';
  end if;
  if target_status not in ('activo','inactivo','suspendido') then
    raise exception 'Estado inválido';
  end if;
  if target_analytics_role not in ('admin','manager','leader','supervisor','analyst','uploader','viewer') then
    raise exception 'Rol de Analytics inválido';
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
  if target_analytics_role in ('admin','manager','leader') then
    target_reports_to := null;
  elsif target_reports_to is not null and not exists (
    select 1 from public.profiles manager
    where manager.id = target_reports_to
      and manager.department = target_department
      and (manager.zone = target_zone or manager.zone = 'Nacional')
      and (
        (target_analytics_role = 'supervisor' and manager.analytics_role in ('leader','manager'))
        or
        (target_analytics_role in ('analyst','uploader','viewer') and manager.analytics_role = 'supervisor')
      )
  ) then
    raise exception 'El superior debe pertenecer al mismo departamento y alcance';
  end if;
  select to_jsonb(profile_row)
  into previous_profile
  from public.profiles profile_row
  where profile_row.id = target_user_id;
  if previous_profile is null then
    raise exception 'Usuario no encontrado';
  end if;
  update public.profiles
  set department = target_department,
      job_title = trim(target_job_title),
      zone = trim(target_zone),
      reports_to = target_reports_to,
      role = target_hub_role,
      status = target_status,
      analytics_enabled = target_analytics_enabled,
      analytics_role = target_analytics_role,
      updated_at = now()
  where id = target_user_id;
  insert into public.analytics_audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    department,
    zone,
    metadata
  )
  values (
    auth.uid(),
    'profile_access_updated',
    'profile',
    target_user_id::text,
    target_department,
    target_zone,
    jsonb_build_object(
      'before', previous_profile,
      'after', jsonb_build_object(
        'department', target_department,
        'job_title', trim(target_job_title),
        'zone', trim(target_zone),
        'reports_to', target_reports_to,
        'hub_role', target_hub_role,
        'status', target_status,
        'analytics_enabled', target_analytics_enabled,
        'analytics_role', target_analytics_role
      )
    )
  );
end;
$$;

revoke all on function public.admin_set_user_access(uuid,text,text,text,uuid,text,text,boolean,text) from public;
grant execute on function public.admin_set_user_access(uuid,text,text,text,uuid,text,text,boolean,text) to authenticated;

-- Registro y datos flexibles importados por departamento.
create table if not exists public.analytics_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  department text not null,
  zone text not null default 'Sin asignar',
  module text not null default 'general',
  row_count integer not null default 0,
  uploaded_by uuid not null references public.profiles(id),
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
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Modelo normalizado para comparativos, jerarquías y reportes comerciales.
-- El JSON original se conserva en analytics_records para auditoría.
create table if not exists public.analytics_sales (
  id bigint generated always as identity primary key,
  source_import_id uuid references public.analytics_imports(id) on delete cascade,
  department text not null,
  zone text not null default 'Sin asignar',
  -- Compatibilidad histórica: el vendedor nunca es un perfil de acceso.
  seller_profile_id uuid references public.profiles(id) on delete set null,
  supervisor_profile_id uuid references public.profiles(id) on delete set null,
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
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists analytics_sales_period_idx
  on public.analytics_sales (department, zone, sale_date);
drop index if exists public.analytics_sales_seller_idx;
create index analytics_sales_seller_idx
  on public.analytics_sales (seller_name, sale_date);
create index if not exists analytics_sales_supervisor_idx
  on public.analytics_sales (supervisor_profile_id, sale_date);

alter table public.analytics_imports
  add column if not exists zone text not null default 'Sin asignar';
alter table public.analytics_records
  add column if not exists zone text not null default 'Sin asignar';
alter table public.analytics_sales
  add column if not exists supervisor_profile_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists seller_code text;

-- Migra asociaciones antiguas sin convertir vendedores en usuarios.
update public.analytics_sales sale
set supervisor_profile_id = coalesce(
  profile_row.reports_to,
  case
    when profile_row.analytics_role = 'supervisor' then profile_row.id
    else null
  end
)
from public.profiles profile_row
where sale.seller_profile_id = profile_row.id
  and sale.supervisor_profile_id is null;

update public.analytics_sales
set seller_profile_id = null
where seller_profile_id is not null;

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
      from public.profiles me
      join public.profiles supervisor
        on supervisor.id = target_supervisor_id
      where me.id = auth.uid()
        and me.status = 'activo'
        and me.analytics_enabled = true
        and supervisor.status = 'activo'
        and supervisor.analytics_enabled = true
        and supervisor.analytics_role = 'supervisor'
        and supervisor.department = me.department
        and (me.zone = 'Nacional' or supervisor.zone = me.zone)
        and (
          (me.analytics_role in ('leader','manager')
            and supervisor.reports_to = me.id)
          or (me.analytics_role = 'supervisor'
            and supervisor.id = me.id)
          or (me.analytics_role in ('analyst','uploader','viewer')
            and me.reports_to = supervisor.id)
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
      from public.profiles me
      where me.id = auth.uid()
        and me.status = 'activo'
        and me.analytics_enabled = true
        and me.department = target_department
        and (me.zone = 'Nacional' or me.zone = target_zone)
        and (
          (me.analytics_role in ('leader','manager') and exists (
            select 1
            from public.profiles supervisor
            where supervisor.id = target_supervisor_id
              and supervisor.reports_to = me.id
              and supervisor.analytics_role = 'supervisor'
          ))
          or (
            me.analytics_role = 'supervisor'
            and target_supervisor_id = me.id
          )
          or (
            me.analytics_role in ('analyst','uploader','viewer')
            and target_created_by = me.id
          )
        )
    );
$$;

revoke all on function public.current_user_can_assign_supervisor(uuid)
  from public;
revoke all on function public.current_user_can_view_sale(text,text,uuid,uuid)
  from public;
grant execute on function public.current_user_can_assign_supervisor(uuid)
  to authenticated;
grant execute on function public.current_user_can_view_sale(text,text,uuid,uuid)
  to authenticated;

drop policy if exists "analytics imports scoped select" on public.analytics_imports;
drop policy if exists "analytics imports scoped insert" on public.analytics_imports;
drop policy if exists "analytics records scoped select" on public.analytics_records;
drop policy if exists "analytics records scoped insert" on public.analytics_records;
drop policy if exists "analytics sales hierarchical select" on public.analytics_sales;
drop policy if exists "analytics sales scoped insert" on public.analytics_sales;

create policy "analytics imports scoped select" on public.analytics_imports
for select to authenticated
using (
  public.current_user_is_admin() or
  (
    public.current_user_can_view_profile(uploaded_by) and
    department = public.current_user_department() and
    (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
  )
);

create policy "analytics imports scoped insert" on public.analytics_imports
for insert to authenticated
with check (
  uploaded_by = auth.uid() and
  (
    public.current_user_is_admin() or
    (
      department = public.current_user_department() and
      (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
    )
  )
);

create policy "analytics records scoped select" on public.analytics_records
for select to authenticated
using (
  public.current_user_is_admin() or
  (
    public.current_user_can_view_profile(created_by) and
    department = public.current_user_department() and
    (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
  )
);

create policy "analytics sales hierarchical select" on public.analytics_sales
for select to authenticated
using (
  public.current_user_can_view_sale(
    department,
    zone,
    supervisor_profile_id,
    created_by
  )
);

create policy "analytics sales scoped insert" on public.analytics_sales
for insert to authenticated
with check (
  created_by = auth.uid() and
  (
    public.current_user_is_admin() or
    (
      department = public.current_user_department() and
      (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone()) and
      public.current_user_can_assign_supervisor(supervisor_profile_id)
    )
  )
);

create policy "analytics records scoped insert" on public.analytics_records
for insert to authenticated
with check (
  created_by = auth.uid() and
  (
    public.current_user_is_admin() or
    (
      department = public.current_user_department() and
      (public.current_user_zone() = 'Nacional' or zone = public.current_user_zone())
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
    actor_id,
    action,
    entity_type,
    entity_id,
    department,
    zone,
    metadata
  )
  values (
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

drop trigger if exists analytics_import_audit
  on public.analytics_imports;
create trigger analytics_import_audit
after insert on public.analytics_imports
for each row execute function public.audit_analytics_import();

-- Plantillas del laboratorio de reportes. La definición JSON conserva todas
-- las combinaciones de campos, métricas, filtros y visualizaciones.
create table if not exists public.analytics_report_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  department text not null,
  zone text not null default 'Nacional',
  definition jsonb not null,
  is_shared boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_report_templates_owner_idx
  on public.analytics_report_templates (created_by, updated_at desc);

alter table public.analytics_report_templates enable row level security;

drop policy if exists "analytics report templates scoped select"
  on public.analytics_report_templates;
drop policy if exists "analytics report templates scoped insert"
  on public.analytics_report_templates;
drop policy if exists "analytics report templates scoped update"
  on public.analytics_report_templates;
drop policy if exists "analytics report templates scoped delete"
  on public.analytics_report_templates;

create policy "analytics report templates scoped select"
on public.analytics_report_templates
for select to authenticated
using (
  public.current_user_is_admin()
  or created_by = auth.uid()
  or (
    is_shared
    and department = public.current_user_department()
    and (
      public.current_user_zone() = 'Nacional'
      or zone = public.current_user_zone()
    )
  )
);

create policy "analytics report templates scoped insert"
on public.analytics_report_templates
for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (
        public.current_user_zone() = 'Nacional'
        or zone = public.current_user_zone()
      )
    )
  )
);

create policy "analytics report templates scoped update"
on public.analytics_report_templates
for update to authenticated
using (created_by = auth.uid() or public.current_user_is_admin())
with check (created_by = auth.uid() or public.current_user_is_admin());

create policy "analytics report templates scoped delete"
on public.analytics_report_templates
for delete to authenticated
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
  if tg_op = 'DELETE' then
    template_row := old;
  else
    template_row := new;
  end if;
  insert into public.analytics_audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    department,
    zone,
    metadata
  )
  values (
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
    jsonb_build_object(
      'name', template_row.name,
      'is_shared', template_row.is_shared
    )
  );
  return template_row;
end;
$$;

drop trigger if exists analytics_report_template_audit
  on public.analytics_report_templates;
create trigger analytics_report_template_audit
after insert or update or delete on public.analytics_report_templates
for each row execute function public.audit_analytics_report_template();

notify pgrst, 'reload schema';
