-- CC ANALYTICS · LIMPIEZA DE CARGAS DEPARTAMENTALES INCOMPLETAS

create or replace function public.analytics_abort_department_import(
  target_import_id uuid,
  target_reason text default 'Carga incompleta'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  import_row public.analytics_imports%rowtype;
  deleted_records integer := 0;
begin
  select * into import_row
  from public.analytics_imports
  where id = target_import_id
  for update;

  if import_row.id is null then
    return false;
  end if;
  if import_row.uploaded_by <> auth.uid()
     and not public.current_user_is_admin() then
    raise exception 'La importación no pertenece al usuario actual';
  end if;
  if exists (
    select 1
    from public.analytics_imports previous
    where previous.superseded_by = target_import_id
  ) then
    raise exception 'La importación ya fue confirmada y no puede abortarse';
  end if;

  delete from public.analytics_records
  where import_id = target_import_id;
  get diagnostics deleted_records = row_count;

  delete from public.analytics_metric_values
  where source_import_id = target_import_id
    and source_type = 'import';

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
    'department_import_aborted',
    'analytics_import',
    target_import_id::text,
    import_row.department,
    import_row.zone,
    jsonb_build_object(
      'file_name', import_row.file_name,
      'reason', trim(coalesce(target_reason, 'Carga incompleta')),
      'deleted_records', deleted_records
    )
  );

  delete from public.analytics_imports
  where id = target_import_id;

  return true;
end;
$$;

revoke all on function public.analytics_abort_department_import(uuid,text)
  from public;
grant execute on function public.analytics_abort_department_import(uuid,text)
  to authenticated;

notify pgrst, 'reload schema';
