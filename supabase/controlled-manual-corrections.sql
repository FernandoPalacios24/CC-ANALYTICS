-- CC ANALYTICS · CORRECCIONES MANUALES CONTROLADAS
-- Permite corregir vendedores, ventas posteadas y ventas anunciadas sin perder
-- historial. Toda corrección exige motivo, usuario y conserva valores anterior/nuevo.

alter table public.analytics_sales
  add column if not exists manual_override boolean not null default false,
  add column if not exists corrected_by uuid references public.analytics_profiles(id) on delete set null,
  add column if not exists correction_reason text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.analytics_announced_sales
  add column if not exists manual_override boolean not null default false,
  add column if not exists corrected_by uuid references public.analytics_profiles(id) on delete set null,
  add column if not exists correction_reason text;

create or replace function public.set_analytics_sale_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists analytics_sales_updated_at on public.analytics_sales;
create trigger analytics_sales_updated_at
before update on public.analytics_sales
for each row execute function public.set_analytics_sale_updated_at();

create or replace function public.analytics_correct_seller(
  target_id uuid,
  target_supervisor_id uuid,
  target_full_name text,
  target_seller_code text,
  target_hire_date date,
  target_probation_days integer,
  target_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.analytics_sellers%rowtype;
  new_row public.analytics_sellers%rowtype;
  supervisor_row public.analytics_profiles%rowtype;
  clean_reason text := trim(coalesce(target_reason, ''));
begin
  if length(clean_reason) < 5 then
    raise exception 'Escribe un motivo de corrección de al menos 5 caracteres';
  end if;

  select * into old_row
  from public.analytics_sellers
  where id = target_id
  for update;

  if old_row.id is null then
    raise exception 'Vendedor no encontrado';
  end if;

  if not public.current_user_can_manage_supervisor(old_row.supervisor_profile_id)
     or not public.current_user_can_manage_supervisor(target_supervisor_id) then
    raise exception 'No tienes permiso para corregir este vendedor';
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

  update public.analytics_sellers
  set department = supervisor_row.department,
      zone = supervisor_row.zone,
      supervisor_profile_id = target_supervisor_id,
      seller_code = nullif(trim(coalesce(target_seller_code, '')), ''),
      full_name = trim(target_full_name),
      hire_date = target_hire_date,
      probation_days = target_probation_days
  where id = target_id
  returning * into new_row;

  update public.analytics_sales
  set department = new_row.department,
      zone = new_row.zone,
      supervisor_profile_id = new_row.supervisor_profile_id,
      seller_name = new_row.full_name,
      seller_code = new_row.seller_code,
      corrected_by = auth.uid(),
      correction_reason = clean_reason,
      detected_fields = coalesce(detected_fields, '{}'::jsonb)
        || jsonb_build_object('seller_master_corrected', true)
  where seller_id = target_id;

  update public.analytics_announced_sales
  set department = new_row.department,
      zone = new_row.zone,
      supervisor_profile_id = new_row.supervisor_profile_id,
      seller_name = new_row.full_name,
      seller_code = new_row.seller_code,
      corrected_by = auth.uid(),
      correction_reason = clean_reason,
      detected_fields = coalesce(detected_fields, '{}'::jsonb)
        || jsonb_build_object('seller_master_corrected', true)
  where seller_id = target_id;

  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    'seller_corrected',
    'analytics_seller',
    target_id::text,
    new_row.department,
    new_row.zone,
    jsonb_build_object(
      'reason', clean_reason,
      'before', to_jsonb(old_row),
      'after', to_jsonb(new_row)
    )
  );

  return target_id;
end;
$$;

create or replace function public.analytics_correct_posted_sale(
  target_id bigint,
  target_seller_id uuid,
  target_sale_date date,
  target_sale_units integer,
  target_amount_billed numeric,
  target_city text,
  target_service text,
  target_contract_service text,
  target_sale_type text,
  target_medium text,
  target_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.analytics_sales%rowtype;
  new_row public.analytics_sales%rowtype;
  seller_row public.analytics_sellers%rowtype;
  supervisor_name text;
  clean_reason text := trim(coalesce(target_reason, ''));
begin
  if length(clean_reason) < 5 then
    raise exception 'Escribe un motivo de corrección de al menos 5 caracteres';
  end if;
  if target_sale_date is null then
    raise exception 'La fecha de venta es obligatoria';
  end if;
  if target_sale_units < 1 or target_sale_units > 100000 then
    raise exception 'La cantidad de ventas debe estar entre 1 y 100000';
  end if;

  select * into old_row
  from public.analytics_sales
  where id = target_id
  for update;

  if old_row.id is null then
    raise exception 'Venta posteada no encontrada';
  end if;
  if old_row.supervisor_profile_id is null
     or not public.current_user_can_manage_supervisor(old_row.supervisor_profile_id) then
    raise exception 'No tienes permiso para corregir esta venta';
  end if;

  select * into seller_row
  from public.analytics_sellers
  where id = target_seller_id;

  if seller_row.id is null
     or not public.current_user_can_manage_supervisor(seller_row.supervisor_profile_id) then
    raise exception 'El vendedor seleccionado está fuera de tu alcance';
  end if;

  select full_name into supervisor_name
  from public.analytics_profiles
  where id = seller_row.supervisor_profile_id;

  update public.analytics_sales
  set seller_id = seller_row.id,
      seller_name = seller_row.full_name,
      seller_code = seller_row.seller_code,
      supervisor_profile_id = seller_row.supervisor_profile_id,
      department = seller_row.department,
      zone = seller_row.zone,
      team = coalesce(supervisor_name, team),
      sale_date = target_sale_date,
      sale_units = target_sale_units,
      amount_billed = target_amount_billed,
      city = nullif(trim(coalesce(target_city, '')), ''),
      service = nullif(trim(coalesce(target_service, '')), ''),
      contract_service = nullif(trim(coalesce(target_contract_service, '')), ''),
      sale_type = nullif(trim(coalesce(target_sale_type, '')), ''),
      medium = nullif(trim(coalesce(target_medium, '')), ''),
      snapshot_as_of = greatest(coalesce(snapshot_as_of, target_sale_date), target_sale_date),
      manual_override = true,
      corrected_by = auth.uid(),
      correction_reason = clean_reason,
      detected_fields = coalesce(detected_fields, '{}'::jsonb)
        || jsonb_build_object('manual_correction', true)
  where id = target_id
  returning * into new_row;

  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    'posted_sale_corrected',
    'analytics_sale',
    target_id::text,
    new_row.department,
    new_row.zone,
    jsonb_build_object(
      'reason', clean_reason,
      'before', to_jsonb(old_row),
      'after', to_jsonb(new_row)
    )
  );

  return target_id;
end;
$$;

create or replace function public.analytics_correct_announced_sale(
  target_id bigint,
  target_seller_id uuid,
  target_announced_date date,
  target_expected_post_date date,
  target_sale_units integer,
  target_amount_announced numeric,
  target_city text,
  target_service text,
  target_contract_service text,
  target_notes text,
  target_status text,
  target_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.analytics_announced_sales%rowtype;
  new_row public.analytics_announced_sales%rowtype;
  seller_row public.analytics_sellers%rowtype;
  clean_reason text := trim(coalesce(target_reason, ''));
begin
  if length(clean_reason) < 5 then
    raise exception 'Escribe un motivo de corrección de al menos 5 caracteres';
  end if;
  if target_announced_date is null then
    raise exception 'La fecha anunciada es obligatoria';
  end if;
  if target_sale_units < 1 or target_sale_units > 100000 then
    raise exception 'La cantidad de ventas debe estar entre 1 y 100000';
  end if;
  if target_status not in ('anunciada','posteada','cancelada') then
    raise exception 'Estado de venta anunciada no válido';
  end if;

  select * into old_row
  from public.analytics_announced_sales
  where id = target_id
  for update;

  if old_row.id is null then
    raise exception 'Venta anunciada no encontrada';
  end if;
  if not public.current_user_can_manage_supervisor(old_row.supervisor_profile_id) then
    raise exception 'No tienes permiso para corregir esta venta anunciada';
  end if;

  select * into seller_row
  from public.analytics_sellers
  where id = target_seller_id;

  if seller_row.id is null
     or not public.current_user_can_manage_supervisor(seller_row.supervisor_profile_id) then
    raise exception 'El vendedor seleccionado está fuera de tu alcance';
  end if;

  update public.analytics_announced_sales
  set seller_id = seller_row.id,
      seller_name = seller_row.full_name,
      seller_code = seller_row.seller_code,
      supervisor_profile_id = seller_row.supervisor_profile_id,
      department = seller_row.department,
      zone = seller_row.zone,
      announced_at = target_announced_date::timestamptz + interval '12 hours',
      expected_post_date = target_expected_post_date,
      sale_units = target_sale_units,
      amount_announced = target_amount_announced,
      city = nullif(trim(coalesce(target_city, '')), ''),
      service = nullif(trim(coalesce(target_service, '')), ''),
      contract_service = nullif(trim(coalesce(target_contract_service, '')), ''),
      notes = nullif(trim(coalesce(target_notes, '')), ''),
      status = target_status,
      snapshot_as_of = greatest(coalesce(snapshot_as_of, target_announced_date), target_announced_date),
      manual_override = true,
      corrected_by = auth.uid(),
      correction_reason = clean_reason,
      detected_fields = coalesce(detected_fields, '{}'::jsonb)
        || jsonb_build_object('manual_correction', true)
  where id = target_id
  returning * into new_row;

  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    'announced_sale_corrected',
    'analytics_announced_sale',
    target_id::text,
    new_row.department,
    new_row.zone,
    jsonb_build_object(
      'reason', clean_reason,
      'before', to_jsonb(old_row),
      'after', to_jsonb(new_row)
    )
  );

  return target_id;
end;
$$;

revoke all on function public.analytics_correct_seller(uuid,uuid,text,text,date,integer,text) from public;
revoke all on function public.analytics_correct_posted_sale(bigint,uuid,date,integer,numeric,text,text,text,text,text,text) from public;
revoke all on function public.analytics_correct_announced_sale(bigint,uuid,date,date,integer,numeric,text,text,text,text,text,text) from public;

grant execute on function public.analytics_correct_seller(uuid,uuid,text,text,date,integer,text) to authenticated;
grant execute on function public.analytics_correct_posted_sale(bigint,uuid,date,integer,numeric,text,text,text,text,text,text) to authenticated;
grant execute on function public.analytics_correct_announced_sale(bigint,uuid,date,date,integer,numeric,text,text,text,text,text,text) to authenticated;

-- Una corrección manual no debe desaparecer al subir un nuevo corte acumulado.
create or replace function public.analytics_finalize_sales_import(
  current_import_id uuid,
  target_supervisor_id uuid,
  target_start date,
  target_end date,
  target_module text,
  target_mode text default 'replace'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  import_row public.analytics_imports%rowtype;
  removed_sales integer := 0;
  removed_announced integer := 0;
  superseded_count integer := 0;
begin
  if target_start is null or target_end is null or target_start > target_end then
    raise exception 'El rango de fechas de la importación no es válido';
  end if;
  if target_module not in ('sales_posted','sales_announced') then
    raise exception 'El tipo de importación no es válido';
  end if;
  if target_mode not in ('append','replace') then
    raise exception 'El modo de importación no es válido';
  end if;
  if not public.current_user_can_assign_supervisor(target_supervisor_id) then
    raise exception 'No tienes permiso para actualizar este equipo';
  end if;

  select * into import_row from public.analytics_imports where id = current_import_id;
  if import_row.id is null then raise exception 'Importación no encontrada'; end if;
  if import_row.uploaded_by <> auth.uid() and not public.current_user_is_admin() then
    raise exception 'La importación no pertenece al usuario actual';
  end if;

  update public.analytics_imports
  set supervisor_profile_id = target_supervisor_id,
      period_start = target_start,
      period_end = target_end,
      snapshot_as_of = target_end,
      import_mode = target_mode
  where id = current_import_id;

  if target_mode = 'replace' then
    if target_module = 'sales_posted' then
      delete from public.analytics_sales
      where supervisor_profile_id = target_supervisor_id
        and source_type = 'imported'
        and source_import_id is not null
        and source_import_id <> current_import_id
        and sale_date between target_start and target_end
        and coalesce(manual_override, false) = false;
      get diagnostics removed_sales = row_count;
    else
      delete from public.analytics_announced_sales
      where supervisor_profile_id = target_supervisor_id
        and source_import_id is not null
        and source_import_id <> current_import_id
        and announced_at::date between target_start and target_end
        and coalesce(manual_override, false) = false;
      get diagnostics removed_announced = row_count;
    end if;

    update public.analytics_imports previous
    set superseded_by = current_import_id
    where previous.id <> current_import_id
      and previous.supervisor_profile_id = target_supervisor_id
      and previous.module = target_module
      and previous.superseded_by is null
      and coalesce(previous.period_start, target_start) <= target_end
      and coalesce(previous.period_end, target_end) >= target_start;
    get diagnostics superseded_count = row_count;
  end if;

  update public.analytics_imports
  set replaced_rows = removed_sales + removed_announced
  where id = current_import_id;

  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    case when target_mode = 'replace' then 'sales_snapshot_replaced' else 'sales_snapshot_appended' end,
    'analytics_import',
    current_import_id::text,
    import_row.department,
    import_row.zone,
    jsonb_build_object(
      'supervisor_profile_id', target_supervisor_id,
      'period_start', target_start,
      'period_end', target_end,
      'module', target_module,
      'mode', target_mode,
      'removed_sales_rows', removed_sales,
      'removed_announced_rows', removed_announced,
      'superseded_imports', superseded_count,
      'protected_manual_corrections', true
    )
  );

  return jsonb_build_object(
    'removed_sales_rows', removed_sales,
    'removed_announced_rows', removed_announced,
    'superseded_imports', superseded_count
  );
end;
$$;

notify pgrst, 'reload schema';