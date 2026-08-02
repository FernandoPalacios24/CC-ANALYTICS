-- CC ANALYTICS · CORTES ACUMULADOS Y SUSTITUCIÓN DE VENTAS
-- Conserva el historial de cargas, permite actualizar rangos sin duplicar
-- y soporta archivos resumidos con varias ventas en una sola fila.

alter table public.analytics_imports
  add column if not exists supervisor_profile_id uuid
    references public.analytics_profiles(id) on delete set null,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists snapshot_as_of date,
  add column if not exists import_mode text not null default 'append',
  add column if not exists replaced_rows integer not null default 0,
  add column if not exists superseded_by uuid
    references public.analytics_imports(id) on delete set null;

alter table public.analytics_sales
  add column if not exists sale_units integer not null default 1,
  add column if not exists snapshot_as_of date;

alter table public.analytics_announced_sales
  add column if not exists sale_units integer not null default 1,
  add column if not exists snapshot_as_of date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analytics_imports_mode_check'
  ) then
    alter table public.analytics_imports
      add constraint analytics_imports_mode_check
      check (import_mode in ('append','replace'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'analytics_imports_period_check'
  ) then
    alter table public.analytics_imports
      add constraint analytics_imports_period_check
      check (
        period_start is null
        or period_end is null
        or period_start <= period_end
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'analytics_sales_units_check'
  ) then
    alter table public.analytics_sales
      add constraint analytics_sales_units_check
      check (sale_units between 1 and 100000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'analytics_announced_sales_units_check'
  ) then
    alter table public.analytics_announced_sales
      add constraint analytics_announced_sales_units_check
      check (sale_units between 1 and 100000);
  end if;
end;
$$;

create index if not exists analytics_imports_snapshot_idx
  on public.analytics_imports (
    supervisor_profile_id,
    module,
    period_start,
    period_end,
    created_at desc
  );

create index if not exists analytics_sales_snapshot_idx
  on public.analytics_sales (
    supervisor_profile_id,
    snapshot_as_of,
    sale_date desc
  );

create index if not exists analytics_announced_snapshot_idx
  on public.analytics_announced_sales (
    supervisor_profile_id,
    snapshot_as_of,
    announced_at desc
  );

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
  if target_start is null
     or target_end is null
     or target_start > target_end then
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

  select * into import_row
  from public.analytics_imports
  where id = current_import_id;

  if import_row.id is null then
    raise exception 'Importación no encontrada';
  end if;

  if import_row.uploaded_by <> auth.uid()
     and not public.current_user_is_admin() then
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
        and sale_date between target_start and target_end;
      get diagnostics removed_sales = row_count;
    else
      delete from public.analytics_announced_sales
      where supervisor_profile_id = target_supervisor_id
        and source_import_id is not null
        and source_import_id <> current_import_id
        and announced_at::date between target_start and target_end;
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
    actor_id,
    action,
    entity_type,
    entity_id,
    department,
    zone,
    metadata
  ) values (
    auth.uid(),
    case
      when target_mode = 'replace' then 'sales_snapshot_replaced'
      else 'sales_snapshot_appended'
    end,
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
      'superseded_imports', superseded_count
    )
  );

  return jsonb_build_object(
    'removed_sales_rows', removed_sales,
    'removed_announced_rows', removed_announced,
    'superseded_imports', superseded_count
  );
end;
$$;

revoke all on function public.analytics_finalize_sales_import(
  uuid,uuid,date,date,text,text
) from public;

grant execute on function public.analytics_finalize_sales_import(
  uuid,uuid,date,date,text,text
) to authenticated;

notify pgrst, 'reload schema';
