-- Permite registrar EVR históricos con fecha de entrada y salida explícitas.
-- La fecha de salida es la primera fecha en que el EVR ya no está activo.

create or replace function public.analytics_save_seller_with_exit(
  target_id uuid,
  target_supervisor_id uuid,
  target_full_name text,
  target_seller_code text,
  target_hire_date date,
  target_probation_days integer default 90,
  target_inactive_effective_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_id uuid;
  seller_row public.analytics_sellers%rowtype;
  next_status text;
begin
  if target_inactive_effective_date is not null
     and target_inactive_effective_date <= target_hire_date then
    raise exception 'La fecha de salida debe ser posterior a la fecha de entrada';
  end if;

  seller_id := public.analytics_save_seller(
    target_id,
    target_supervisor_id,
    target_full_name,
    target_seller_code,
    target_hire_date,
    target_probation_days
  );

  if target_inactive_effective_date is not null then
    next_status := case
      when target_inactive_effective_date <= current_date then 'inactivo'
      else 'salida_pendiente'
    end;

    update public.analytics_sellers
    set status = next_status,
        inactive_effective_date = target_inactive_effective_date
    where id = seller_id
    returning * into seller_row;

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
      'seller_exit_recorded',
      'analytics_seller',
      seller_id::text,
      seller_row.department,
      seller_row.zone,
      jsonb_build_object(
        'full_name', seller_row.full_name,
        'hire_date', target_hire_date,
        'inactive_effective_date', target_inactive_effective_date,
        'status', next_status,
        'supervisor_profile_id', target_supervisor_id
      )
    );
  end if;

  return seller_id;
end;
$$;

revoke all on function public.analytics_save_seller_with_exit(
  uuid,uuid,text,text,date,integer,date
) from public, anon;
grant execute on function public.analytics_save_seller_with_exit(
  uuid,uuid,text,text,date,integer,date
) to authenticated;

notify pgrst, 'reload schema';
