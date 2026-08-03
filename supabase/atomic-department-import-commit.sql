-- CC ANALYTICS · CONFIRMACIÓN ATÓMICA DE IMPORTACIONES DEPARTAMENTALES
-- Las filas nuevas se cargan primero. La sustitución, indicadores y auditoría se
-- confirman después dentro de una sola transacción de PostgreSQL.

create or replace function public.analytics_commit_department_import(
  current_import_id uuid,
  target_department text,
  target_zone text,
  target_module text,
  target_period_month date,
  target_metrics jsonb default '[]'::jsonb
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
  loaded_records integer := 0;
  removed_records integer := 0;
  removed_metrics integer := 0;
  imported_metrics integer := 0;
  protected_metrics integer := 0;
  superseded_imports integer := 0;
  metric jsonb;
  metric_key text;
  metric_label text;
  metric_unit text;
  metric_value numeric;
  metric_notes text;
  existing_definition_id uuid;
begin
  if target_period_month is null then
    raise exception 'El mes de la importación es obligatorio';
  end if;
  if trim(coalesce(target_department, '')) = ''
     or trim(coalesce(target_zone, '')) = ''
     or trim(coalesce(target_module, '')) = '' then
    raise exception 'Departamento, zona y módulo son obligatorios';
  end if;
  if jsonb_typeof(coalesce(target_metrics, '[]'::jsonb)) <> 'array' then
    raise exception 'La lista de indicadores detectados no es válida';
  end if;
  if not public.analytics_can_edit_scope(
    target_department,
    target_zone,
    'import'
  ) then
    raise exception 'No tienes permiso para importar información en este alcance';
  end if;

  select * into current_row
  from public.analytics_imports
  where id = current_import_id
  for update;

  if current_row.id is null then
    raise exception 'Importación no encontrada';
  end if;
  if current_row.uploaded_by <> auth.uid()
     and not public.current_user_is_admin() then
    raise exception 'La importación no pertenece al usuario actual';
  end if;

  select count(*)::integer into loaded_records
  from public.analytics_records
  where import_id = current_import_id;

  if loaded_records < current_row.row_count then
    raise exception 'El archivo nuevo está incompleto: se esperaban % filas y solo se guardaron %',
      current_row.row_count,
      loaded_records;
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

  for metric in
    select value from jsonb_array_elements(coalesce(target_metrics, '[]'::jsonb))
  loop
    metric_key := lower(
      regexp_replace(
        trim(coalesce(metric->>'key', '')),
        '[^a-zA-Z0-9_]+',
        '_',
        'g'
      )
    );
    metric_label := trim(coalesce(metric->>'label', ''));
    metric_unit := trim(coalesce(metric->>'unit', 'number'));
    metric_notes := nullif(trim(coalesce(metric->>'notes', '')), '');

    if metric_key = '' or metric_label = '' then
      raise exception 'Uno de los indicadores detectados no tiene clave o nombre';
    end if;
    if metric_unit not in (
      'number','count','currency','percent','minutes','hours','days','ratio'
    ) then
      raise exception 'La unidad % no es válida para %', metric_unit, metric_label;
    end if;
    begin
      metric_value := coalesce((metric->>'value')::numeric, 0);
    exception when others then
      raise exception 'El valor del indicador % no es numérico', metric_label;
    end;

    select id into existing_definition_id
    from public.analytics_metric_definitions
    where department = target_department
      and module_key = target_module
      and metric_key = metric_key
    limit 1;

    if existing_definition_id is not null and exists (
      select 1
      from public.analytics_metric_values value
      where value.metric_id = existing_definition_id
        and value.zone = target_zone
        and value.period_month = normalized_month
        and value.source_type = 'manual'
    ) then
      protected_metrics := protected_metrics + 1;
      continue;
    end if;

    perform public.analytics_upsert_department_metric(
      target_department,
      target_module,
      metric_key,
      metric_label,
      metric_unit,
      target_zone,
      normalized_month,
      metric_value,
      null,
      coalesce(
        metric_notes,
        current_row.file_name || ' · indicador detectado automáticamente'
      ),
      'import',
      current_import_id
    );
    imported_metrics := imported_metrics + 1;
  end loop;

  insert into public.analytics_audit_log(
    actor_id,
    action,
    entity_type,
    entity_id,
    department,
    zone,
    metadata
  ) values (
    auth.uid(),
    'department_import_committed',
    'analytics_import',
    current_import_id::text,
    target_department,
    target_zone,
    jsonb_build_object(
      'module', target_module,
      'period_month', normalized_month,
      'loaded_records', loaded_records,
      'removed_records', removed_records,
      'removed_imported_metrics', removed_metrics,
      'imported_metrics', imported_metrics,
      'protected_manual_metrics', protected_metrics,
      'superseded_imports', superseded_imports
    )
  );

  return jsonb_build_object(
    'loaded_records', loaded_records,
    'removed_records', removed_records,
    'removed_imported_metrics', removed_metrics,
    'imported_metrics', imported_metrics,
    'protected_manual_metrics', protected_metrics,
    'superseded_imports', superseded_imports
  );
end;
$$;

revoke all on function public.analytics_commit_department_import(
  uuid,text,text,text,date,jsonb
) from public;
grant execute on function public.analytics_commit_department_import(
  uuid,text,text,text,date,jsonb
) to authenticated;

notify pgrst, 'reload schema';
