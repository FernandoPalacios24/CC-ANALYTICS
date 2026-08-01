-- CC ANALYTICS · INGRESO INTELIGENTE DE VENTAS
-- Modelo histórico de vendedores, período de prueba, ventas manuales/anunciadas
-- y vinculación automática de archivos heterogéneos.

create or replace function public.analytics_normalize_person_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(
    regexp_replace(
      translate(
        trim(coalesce(value, '')),
        'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
        'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc'
      ),
      '[^a-zA-Z0-9]+',
      '',
      'g'
    )
  );
$$;

create table if not exists public.analytics_sellers (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  zone text not null,
  supervisor_profile_id uuid not null
    references public.analytics_profiles(id) on delete restrict,
  seller_code text,
  full_name text not null,
  normalized_name text not null default '',
  hire_date date not null,
  probation_days integer not null default 90,
  status text not null default 'activo',
  inactive_effective_date date,
  created_by uuid not null references public.analytics_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_sellers_probation_days_check
    check (probation_days between 0 and 365),
  constraint analytics_sellers_status_check
    check (status in ('activo', 'salida_pendiente', 'inactivo')),
  constraint analytics_sellers_name_check
    check (length(trim(full_name)) >= 3)
);

create index if not exists analytics_sellers_supervisor_idx
  on public.analytics_sellers (supervisor_profile_id, status, full_name);
create index if not exists analytics_sellers_scope_idx
  on public.analytics_sellers (department, zone, status);
create index if not exists analytics_sellers_code_idx
  on public.analytics_sellers (seller_code)
  where seller_code is not null;
create unique index if not exists analytics_sellers_active_name_uidx
  on public.analytics_sellers (supervisor_profile_id, normalized_name)
  where status in ('activo', 'salida_pendiente');

create or replace function public.set_analytics_seller_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.full_name := trim(new.full_name);
  new.seller_code := nullif(trim(coalesce(new.seller_code, '')), '');
  new.normalized_name := public.analytics_normalize_person_name(new.full_name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists analytics_sellers_fields on public.analytics_sellers;
create trigger analytics_sellers_fields
before insert or update on public.analytics_sellers
for each row execute function public.set_analytics_seller_fields();

create or replace function public.current_user_can_manage_supervisor(
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
          (me.role = 'supervisor' and supervisor.id = me.id)
          or (me.role = 'leader' and supervisor.reports_to = me.id)
        )
    );
$$;

create or replace function public.current_user_can_view_seller(
  target_supervisor_id uuid,
  target_department text,
  target_zone text
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
            select 1
            from public.analytics_profiles supervisor
            where supervisor.id = target_supervisor_id
              and supervisor.role = 'supervisor'
              and supervisor.reports_to = me.id
          ))
          or (me.role = 'supervisor' and target_supervisor_id = me.id)
          or (me.role in ('analyst', 'uploader') and me.reports_to = target_supervisor_id)
        )
    );
$$;

revoke all on function public.current_user_can_manage_supervisor(uuid) from public;
revoke all on function public.current_user_can_view_seller(uuid,text,text) from public;
grant execute on function public.current_user_can_manage_supervisor(uuid) to authenticated;
grant execute on function public.current_user_can_view_seller(uuid,text,text) to authenticated;

alter table public.analytics_sellers enable row level security;
drop policy if exists "analytics sellers scoped select" on public.analytics_sellers;
create policy "analytics sellers scoped select"
on public.analytics_sellers for select to authenticated
using (
  public.current_user_can_view_seller(
    supervisor_profile_id,
    department,
    zone
  )
);
revoke all on public.analytics_sellers from anon;
revoke insert, update, delete on public.analytics_sellers from authenticated;
grant select on public.analytics_sellers to authenticated;

alter table public.analytics_sales
  add column if not exists seller_id uuid
    references public.analytics_sellers(id) on delete set null,
  add column if not exists source_type text not null default 'imported',
  add column if not exists import_confidence numeric(5,4),
  add column if not exists detected_fields jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'analytics_sales_source_type_check'
  ) then
    alter table public.analytics_sales
      add constraint analytics_sales_source_type_check
      check (source_type in ('imported', 'manual'));
  end if;
end;
$$;

create index if not exists analytics_sales_seller_record_idx
  on public.analytics_sales (seller_id, sale_date desc);
create index if not exists analytics_sales_source_type_idx
  on public.analytics_sales (source_type, sale_date desc);

create table if not exists public.analytics_announced_sales (
  id bigint generated always as identity primary key,
  source_import_id uuid references public.analytics_imports(id) on delete set null,
  seller_id uuid references public.analytics_sellers(id) on delete set null,
  seller_name text not null,
  seller_code text,
  supervisor_profile_id uuid not null
    references public.analytics_profiles(id) on delete restrict,
  department text not null,
  zone text not null,
  announced_at timestamptz not null default now(),
  expected_post_date date,
  amount_announced numeric(14,2),
  city text,
  service text,
  contract_service text,
  notes text,
  status text not null default 'anunciada',
  linked_sale_id bigint references public.analytics_sales(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  import_confidence numeric(5,4),
  detected_fields jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.analytics_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_announced_sales_status_check
    check (status in ('anunciada', 'posteada', 'cancelada'))
);

create index if not exists analytics_announced_sales_scope_idx
  on public.analytics_announced_sales
    (department, zone, supervisor_profile_id, status, announced_at desc);
create index if not exists analytics_announced_sales_seller_idx
  on public.analytics_announced_sales (seller_id, announced_at desc);

create or replace function public.set_analytics_announced_sale_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists analytics_announced_sales_updated_at
  on public.analytics_announced_sales;
create trigger analytics_announced_sales_updated_at
before update on public.analytics_announced_sales
for each row execute function public.set_analytics_announced_sale_updated_at();

alter table public.analytics_announced_sales enable row level security;
drop policy if exists "analytics announced sales scoped select"
  on public.analytics_announced_sales;
drop policy if exists "analytics announced sales scoped insert"
  on public.analytics_announced_sales;
drop policy if exists "analytics announced sales scoped update"
  on public.analytics_announced_sales;
create policy "analytics announced sales scoped select"
on public.analytics_announced_sales for select to authenticated
using (
  public.current_user_can_view_sale(
    department,
    zone,
    supervisor_profile_id,
    created_by
  )
);
create policy "analytics announced sales scoped insert"
on public.analytics_announced_sales for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.current_user_is_admin()
    or public.current_user_can_assign_supervisor(supervisor_profile_id)
  )
);
create policy "analytics announced sales scoped update"
on public.analytics_announced_sales for update to authenticated
using (
  created_by = auth.uid()
  or public.current_user_can_manage_supervisor(supervisor_profile_id)
)
with check (
  created_by = auth.uid()
  or public.current_user_can_manage_supervisor(supervisor_profile_id)
);
revoke all on public.analytics_announced_sales from anon;
grant select, insert, update on public.analytics_announced_sales to authenticated;

create or replace function public.analytics_save_seller(
  target_id uuid,
  target_supervisor_id uuid,
  target_full_name text,
  target_seller_code text,
  target_hire_date date,
  target_probation_days integer default 90
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_id uuid;
  normalized text;
  supervisor_row public.analytics_profiles%rowtype;
begin
  if not public.current_user_can_manage_supervisor(target_supervisor_id) then
    raise exception 'No tienes permiso para administrar este equipo';
  end if;
  if nullif(trim(target_full_name), '') is null then
    raise exception 'El nombre completo es obligatorio';
  end if;
  if target_hire_date is null then
    raise exception 'La fecha de ingreso es obligatoria';
  end if;
  if target_probation_days < 0 or target_probation_days > 365 then
    raise exception 'El período de prueba debe estar entre 0 y 365 días';
  end if;

  select * into supervisor_row
  from public.analytics_profiles
  where id = target_supervisor_id
    and role = 'supervisor'
    and status = 'activo';
  if supervisor_row.id is null then
    raise exception 'Supervisor no encontrado o inactivo';
  end if;

  normalized := public.analytics_normalize_person_name(target_full_name);

  if target_id is null then
    select id into seller_id
    from public.analytics_sellers
    where supervisor_profile_id = target_supervisor_id
      and normalized_name = normalized
    order by updated_at desc
    limit 1;
  else
    seller_id := target_id;
    if not exists (
      select 1
      from public.analytics_sellers seller
      where seller.id = seller_id
        and public.current_user_can_manage_supervisor(seller.supervisor_profile_id)
    ) then
      raise exception 'Vendedor no encontrado o fuera de tu alcance';
    end if;
  end if;

  if seller_id is null then
    insert into public.analytics_sellers (
      department,
      zone,
      supervisor_profile_id,
      seller_code,
      full_name,
      hire_date,
      probation_days,
      status,
      inactive_effective_date,
      created_by
    ) values (
      supervisor_row.department,
      supervisor_row.zone,
      target_supervisor_id,
      nullif(trim(coalesce(target_seller_code, '')), ''),
      trim(target_full_name),
      target_hire_date,
      target_probation_days,
      'activo',
      null,
      auth.uid()
    ) returning id into seller_id;
  else
    update public.analytics_sellers
    set department = supervisor_row.department,
        zone = supervisor_row.zone,
        supervisor_profile_id = target_supervisor_id,
        seller_code = nullif(trim(coalesce(target_seller_code, '')), ''),
        full_name = trim(target_full_name),
        hire_date = target_hire_date,
        probation_days = target_probation_days,
        status = 'activo',
        inactive_effective_date = null
    where id = seller_id;
  end if;

  insert into public.analytics_audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    department,
    zone,
    metadata
  ) values (
    auth.uid(),
    'seller_saved',
    'analytics_seller',
    seller_id::text,
    supervisor_row.department,
    supervisor_row.zone,
    jsonb_build_object(
      'full_name', trim(target_full_name),
      'seller_code', nullif(trim(coalesce(target_seller_code, '')), ''),
      'hire_date', target_hire_date,
      'probation_days', target_probation_days,
      'supervisor_profile_id', target_supervisor_id
    )
  );

  return seller_id;
end;
$$;

create or replace function public.analytics_retire_seller(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_row public.analytics_sellers%rowtype;
  has_current_month_sales boolean;
  effective_date date;
  next_status text;
begin
  select * into seller_row
  from public.analytics_sellers
  where id = target_id;

  if seller_row.id is null then
    raise exception 'Vendedor no encontrado';
  end if;
  if not public.current_user_can_manage_supervisor(
    seller_row.supervisor_profile_id
  ) then
    raise exception 'No tienes permiso para retirar este vendedor';
  end if;

  select exists (
    select 1
    from public.analytics_sales sale
    where sale.sale_date >= date_trunc('month', current_date)::date
      and sale.sale_date < (date_trunc('month', current_date) + interval '1 month')::date
      and sale.supervisor_profile_id = seller_row.supervisor_profile_id
      and (
        sale.seller_id = seller_row.id
        or (
          sale.seller_id is null
          and public.analytics_normalize_person_name(sale.seller_name)
            = seller_row.normalized_name
        )
      )
  ) into has_current_month_sales;

  if has_current_month_sales then
    effective_date := (date_trunc('month', current_date) + interval '1 month')::date;
    next_status := 'salida_pendiente';
  else
    effective_date := current_date;
    next_status := 'inactivo';
  end if;

  update public.analytics_sellers
  set status = next_status,
      inactive_effective_date = effective_date
  where id = seller_row.id;

  insert into public.analytics_audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    department,
    zone,
    metadata
  ) values (
    auth.uid(),
    'seller_retired',
    'analytics_seller',
    seller_row.id::text,
    seller_row.department,
    seller_row.zone,
    jsonb_build_object(
      'full_name', seller_row.full_name,
      'effective_date', effective_date,
      'deferred_by_current_month_sales', has_current_month_sales
    )
  );

  return jsonb_build_object(
    'status', next_status,
    'effective_date', effective_date,
    'deferred', has_current_month_sales
  );
end;
$$;

create or replace function public.analytics_restore_seller(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_row public.analytics_sellers%rowtype;
begin
  select * into seller_row
  from public.analytics_sellers
  where id = target_id;
  if seller_row.id is null then
    raise exception 'Vendedor no encontrado';
  end if;
  if not public.current_user_can_manage_supervisor(
    seller_row.supervisor_profile_id
  ) then
    raise exception 'No tienes permiso para reactivar este vendedor';
  end if;
  update public.analytics_sellers
  set status = 'activo', inactive_effective_date = null
  where id = target_id;
end;
$$;

revoke all on function public.analytics_save_seller(
  uuid,uuid,text,text,date,integer
) from public;
revoke all on function public.analytics_retire_seller(uuid) from public;
revoke all on function public.analytics_restore_seller(uuid) from public;
grant execute on function public.analytics_save_seller(
  uuid,uuid,text,text,date,integer
) to authenticated;
grant execute on function public.analytics_retire_seller(uuid) to authenticated;
grant execute on function public.analytics_restore_seller(uuid) to authenticated;

create or replace function public.link_analytics_sale_to_seller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_row public.analytics_sellers%rowtype;
begin
  if new.seller_id is not null then
    return new;
  end if;

  select seller.* into seller_row
  from public.analytics_sellers seller
  where seller.department = new.department
    and seller.zone = new.zone
    and (
      new.supervisor_profile_id is null
      or seller.supervisor_profile_id = new.supervisor_profile_id
    )
    and seller.hire_date <= new.sale_date
    and (
      seller.inactive_effective_date is null
      or new.sale_date < seller.inactive_effective_date
    )
    and (
      (
        nullif(trim(coalesce(new.seller_code, '')), '') is not null
        and seller.seller_code = nullif(trim(new.seller_code), '')
      )
      or seller.normalized_name
        = public.analytics_normalize_person_name(new.seller_name)
    )
  order by
    case
      when nullif(trim(coalesce(new.seller_code, '')), '') is not null
        and seller.seller_code = nullif(trim(new.seller_code), '')
      then 0 else 1
    end,
    seller.updated_at desc
  limit 1;

  if seller_row.id is not null then
    new.seller_id := seller_row.id;
    new.supervisor_profile_id := coalesce(
      new.supervisor_profile_id,
      seller_row.supervisor_profile_id
    );
    new.seller_name := seller_row.full_name;
    new.seller_code := coalesce(new.seller_code, seller_row.seller_code);
  end if;
  return new;
end;
$$;

drop trigger if exists analytics_sales_link_seller on public.analytics_sales;
create trigger analytics_sales_link_seller
before insert or update of seller_name, seller_code, supervisor_profile_id, sale_date
on public.analytics_sales
for each row execute function public.link_analytics_sale_to_seller();

update public.analytics_sales sale
set seller_id = seller.id,
    seller_name = seller.full_name,
    seller_code = coalesce(sale.seller_code, seller.seller_code)
from public.analytics_sellers seller
where sale.seller_id is null
  and sale.supervisor_profile_id = seller.supervisor_profile_id
  and sale.department = seller.department
  and sale.zone = seller.zone
  and seller.hire_date <= sale.sale_date
  and (
    seller.inactive_effective_date is null
    or sale.sale_date < seller.inactive_effective_date
  )
  and (
    (
      nullif(trim(coalesce(sale.seller_code, '')), '') is not null
      and sale.seller_code = seller.seller_code
    )
    or public.analytics_normalize_person_name(sale.seller_name)
      = seller.normalized_name
  );

create or replace view public.analytics_seller_report
with (security_invoker = true)
as
select
  seller.id,
  seller.department,
  seller.zone,
  seller.supervisor_profile_id,
  seller.seller_code,
  seller.full_name,
  seller.hire_date,
  seller.probation_days,
  (seller.hire_date + seller.probation_days) as probation_end_date,
  current_date < (seller.hire_date + seller.probation_days) as is_on_probation,
  case
    when seller.status = 'salida_pendiente'
      and seller.inactive_effective_date <= current_date
    then 'inactivo'
    else seller.status
  end as effective_status,
  seller.inactive_effective_date,
  seller.created_at,
  seller.updated_at
from public.analytics_sellers seller;

grant select on public.analytics_seller_report to authenticated;

grant usage, select on all sequences in schema public to authenticated;
notify pgrst, 'reload schema';
