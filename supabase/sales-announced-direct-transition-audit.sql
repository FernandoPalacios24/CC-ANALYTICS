-- Audita los botones existentes de Ingreso de ventas cuando cambian el estado
-- directamente, sin pasar por los RPC con motivo detallado.

create or replace function public.analytics_announced_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_row public.analytics_sellers%rowtype;
  supervisor_name text;
  generated_sale_id bigint;
  actor uuid := auth.uid();
  direct_reason text;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status <> 'anunciada' then
    raise exception 'Una venta anunciada procesada no puede cambiar nuevamente de estado';
  end if;

  if not public.current_user_can_manage_supervisor(old.supervisor_profile_id)
     and old.created_by <> actor then
    raise exception 'No tienes permiso para procesar esta venta anunciada';
  end if;

  if new.status = 'posteada' and new.linked_sale_id is null then
    select * into seller_row
    from public.analytics_sellers
    where id = old.seller_id;

    if seller_row.id is null then
      raise exception 'La venta anunciada debe estar vinculada a un vendedor oficial';
    end if;

    select full_name into supervisor_name
    from public.analytics_profiles
    where id = old.supervisor_profile_id;

    direct_reason := coalesce(
      nullif(trim(new.correction_reason), ''),
      'Posteada desde Ingreso de ventas'
    );

    insert into public.analytics_sales (
      source_import_id,
      department,
      zone,
      seller_profile_id,
      supervisor_profile_id,
      seller_code,
      seller_name,
      team,
      sale_date,
      city,
      sale_type,
      service,
      medium,
      is_primary,
      contract_service,
      amount_billed,
      payload,
      created_by,
      seller_id,
      source_type,
      import_confidence,
      detected_fields,
      sale_units,
      snapshot_as_of,
      manual_override,
      corrected_by,
      correction_reason,
      sale_status
    ) values (
      old.source_import_id,
      old.department,
      old.zone,
      null,
      old.supervisor_profile_id,
      seller_row.seller_code,
      seller_row.full_name,
      coalesce(supervisor_name, 'Equipo'),
      current_date,
      old.city,
      'Venta anunciada convertida',
      old.service,
      'Conversión de anunciada',
      true,
      old.contract_service,
      old.amount_announced,
      coalesce(old.payload, '{}'::jsonb)
        || jsonb_build_object('announced_sale_id', old.id),
      coalesce(actor, old.created_by),
      seller_row.id,
      'announced',
      coalesce(old.import_confidence, 1),
      coalesce(old.detected_fields, '{}'::jsonb)
        || jsonb_build_object('converted_from_announced', true),
      greatest(coalesce(old.sale_units, 1), 1),
      current_date,
      true,
      actor,
      direct_reason,
      'posteada'
    ) returning id into generated_sale_id;

    new.linked_sale_id := generated_sale_id;
    new.manual_override := true;
    new.corrected_by := actor;
    new.correction_reason := direct_reason;

    insert into public.analytics_audit_log (
      actor_id,
      action,
      entity_type,
      entity_id,
      department,
      zone,
      metadata
    ) values (
      actor,
      'announced_sale_posted',
      'analytics_announced_sale',
      old.id::text,
      old.department,
      old.zone,
      jsonb_build_object(
        'linked_sale_id', generated_sale_id,
        'post_date', current_date,
        'reason', direct_reason,
        'direct_transition', true,
        'before', to_jsonb(old)
      )
    );
  elsif new.status = 'cancelada' then
    direct_reason := coalesce(
      nullif(trim(new.correction_reason), ''),
      'Eliminada desde Ingreso de ventas'
    );
    new.manual_override := true;
    new.corrected_by := actor;
    new.correction_reason := direct_reason;

    if nullif(trim(old.correction_reason), '') is null
       and nullif(trim(new.correction_reason), '') = 'Eliminada desde Ingreso de ventas' then
      insert into public.analytics_audit_log (
        actor_id,
        action,
        entity_type,
        entity_id,
        department,
        zone,
        metadata
      ) values (
        actor,
        'announced_sale_deleted',
        'analytics_announced_sale',
        old.id::text,
        old.department,
        old.zone,
        jsonb_build_object(
          'reason', direct_reason,
          'direct_transition', true,
          'before', to_jsonb(old)
        )
      );
    end if;
  elsif new.status not in ('posteada', 'cancelada') then
    raise exception 'Transición de estado no válida';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
