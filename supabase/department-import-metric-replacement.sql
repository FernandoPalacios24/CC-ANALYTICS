-- CC ANALYTICS · SUSTITUCIÓN COMPLETA DE INDICADORES IMPORTADOS
-- Elimina valores derivados de cargas anteriores del mismo módulo, zona y mes.
-- Los valores ingresados manualmente permanecen protegidos.

create or replace function public.analytics_finalize_department_import(
  current_import_id uuid,
  target_department text,
  target_zone text,
  target_module text,
  target_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.analytics_imports%rowtype;
  normalized_month date;
  next_month date;
  removed_records integer := 0;
  removed_metrics integer := 0;
  superseded_imports integer := 0;
begin
  if target_period_month is null then
    raise exception 'El mes de la importación es obligatorio';
  end if;
  if trim(coalesce(target_department, '')) = ''
     or trim(coalesce(target_zone, '')) = ''
     or trim(coalesce(target_module, '')) = '' then
    raise exception 'Departamento, zona y módulo son obligatorios';
  end if;
  if not public.analytics_can_edit_scope(target_department, target_zone, 'import') then
    raise exception 'No tienes permiso para importar información en este alcance';
  end if;

  select * into current_row
  from public.analytics_imports
  where id = current_import_id
  for update;

  if current_row.id is null then
    raise exception 'Importación no encontrada';
  end if;
  if current_row.uploaded_by <> auth.uid() and not public.current_user_is_admin() then
    raise exception 'La importación no pertenece al usuario actual';
  end if;

  normalized_month := date_trunc('month', target_period_month)::date;
  next_month := (normalized_month + interval '1 month')::date;

  delete from public.analytics_records record
  using public.analytics_imports previous
  where record.import_id = previous.id
    and previous.id <> current_import_id
    and previous.department = target_department
    and previous.zone = target_zone
    and previous.module = target_module
    and coalesce(previous.period_start, normalized_month) < next_month
    and coalesce(previous.period_end, normalized_month) >= normalized_month
    and previous.superseded_by is null;
  get diagnostics removed_records = row_count;

  delete from public.analytics_metric_values
  where department = target_department
    and zone = target_zone
    and module_key = target_module
    and period_month = normalized_month
    and source_type = 'import'
    and (source_import_id is null or source_import_id <> current_import_id);
  get diagnostics removed_metrics = row_count;

  update public.analytics_imports previous
  set superseded_by = current_import_id
  where previous.id <> current_import_id
    and previous.department = target_department
    and previous.zone = target_zone
    and previous.module = target_module
    and coalesce(previous.period_start, normalized_month) < next_month
    and coalesce(previous.period_end, normalized_month) >= normalized_month
    and previous.superseded_by is null;
  get diagnostics superseded_imports = row_count;

  update public.analytics_imports
  set department = target_department,
      zone = target_zone,
      module = target_module,
      period_start = normalized_month,
      period_end = (next_month - interval '1 day')::date,
      snapshot_as_of = (next_month - interval '1 day')::date,
      import_mode = 'replace',
      replaced_rows = removed_records
  where id = current_import_id;

  insert into public.analytics_audit_log(
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    'department_import_replaced',
    'analytics_import',
    current_import_id::text,
    target_department,
    target_zone,
    jsonb_build_object(
      'module', target_module,
      'period_month', normalized_month,
      'removed_records', removed_records,
      'removed_imported_metrics', removed_metrics,
      'superseded_imports', superseded_imports
    )
  );

  return jsonb_build_object(
    'removed_records', removed_records,
    'removed_imported_metrics', removed_metrics,
    'superseded_imports', superseded_imports
  );
end;
$$;

notify pgrst, 'reload schema';
