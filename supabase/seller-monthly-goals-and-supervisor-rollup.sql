-- CC ANALYTICS · METAS MENSUALES POR VENDEDOR
-- La meta del supervisor se calcula automáticamente como la suma de las metas
-- individuales de sus vendedores. Toda modificación queda auditada.

create table if not exists public.analytics_seller_goals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.analytics_sellers(id) on delete restrict,
  supervisor_profile_id uuid not null references public.analytics_profiles(id) on delete restrict,
  department text not null,
  zone text not null,
  goal_month date not null,
  goal_units integer not null default 0,
  correction_reason text not null,
  created_by uuid not null references public.analytics_profiles(id) on delete restrict,
  updated_by uuid not null references public.analytics_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_seller_goals_month_check
    check (goal_month = date_trunc('month', goal_month)::date),
  constraint analytics_seller_goals_units_check
    check (goal_units between 0 and 100000),
  constraint analytics_seller_goals_reason_check
    check (length(trim(correction_reason)) >= 5),
  constraint analytics_seller_goals_unique
    unique (seller_id, goal_month)
);

create index if not exists analytics_seller_goals_supervisor_month_idx
  on public.analytics_seller_goals (supervisor_profile_id, goal_month, seller_id);

create or replace function public.set_analytics_seller_goal_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists analytics_seller_goals_updated_at
  on public.analytics_seller_goals;
create trigger analytics_seller_goals_updated_at
before update on public.analytics_seller_goals
for each row execute function public.set_analytics_seller_goal_updated_at();

alter table public.analytics_seller_goals enable row level security;
drop policy if exists "analytics seller goals scoped select"
  on public.analytics_seller_goals;
create policy "analytics seller goals scoped select"
on public.analytics_seller_goals for select to authenticated
using (
  public.current_user_can_view_seller(
    supervisor_profile_id,
    department,
    zone
  )
);

revoke all on public.analytics_seller_goals from anon;
revoke insert, update, delete on public.analytics_seller_goals from authenticated;
grant select on public.analytics_seller_goals to authenticated;

create or replace function public.analytics_set_seller_goal(
  target_seller_id uuid,
  target_month date,
  target_goal_units integer,
  target_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_row public.analytics_sellers%rowtype;
  old_row public.analytics_seller_goals%rowtype;
  saved_id uuid;
  normalized_month date;
  clean_reason text := trim(coalesce(target_reason, ''));
begin
  if target_month is null then
    raise exception 'El mes de la meta es obligatorio';
  end if;
  if target_goal_units < 0 or target_goal_units > 100000 then
    raise exception 'La meta debe estar entre 0 y 100000 ventas';
  end if;
  if length(clean_reason) < 5 then
    raise exception 'Escribe un motivo de al menos 5 caracteres';
  end if;

  select * into seller_row
  from public.analytics_sellers
  where id = target_seller_id;

  if seller_row.id is null then
    raise exception 'Vendedor no encontrado';
  end if;
  if not public.current_user_can_manage_supervisor(seller_row.supervisor_profile_id) then
    raise exception 'No tienes permiso para asignar la meta de este vendedor';
  end if;

  normalized_month := date_trunc('month', target_month)::date;

  select * into old_row
  from public.analytics_seller_goals
  where seller_id = target_seller_id
    and goal_month = normalized_month
  for update;

  insert into public.analytics_seller_goals (
    seller_id,
    supervisor_profile_id,
    department,
    zone,
    goal_month,
    goal_units,
    correction_reason,
    created_by,
    updated_by
  ) values (
    seller_row.id,
    seller_row.supervisor_profile_id,
    seller_row.department,
    seller_row.zone,
    normalized_month,
    target_goal_units,
    clean_reason,
    auth.uid(),
    auth.uid()
  )
  on conflict (seller_id, goal_month)
  do update set
    supervisor_profile_id = excluded.supervisor_profile_id,
    department = excluded.department,
    zone = excluded.zone,
    goal_units = excluded.goal_units,
    correction_reason = excluded.correction_reason,
    updated_by = auth.uid()
  returning id into saved_id;

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
    'seller_goal_saved',
    'analytics_seller_goal',
    saved_id::text,
    seller_row.department,
    seller_row.zone,
    jsonb_build_object(
      'seller_id', seller_row.id,
      'seller_name', seller_row.full_name,
      'supervisor_profile_id', seller_row.supervisor_profile_id,
      'goal_month', normalized_month,
      'reason', clean_reason,
      'before_goal_units', old_row.goal_units,
      'after_goal_units', target_goal_units
    )
  );

  return saved_id;
end;
$$;

revoke all on function public.analytics_set_seller_goal(uuid,date,integer,text)
  from public;
grant execute on function public.analytics_set_seller_goal(uuid,date,integer,text)
  to authenticated;

create or replace view public.analytics_supervisor_goal_summary
with (security_invoker = true)
as
select
  goal.supervisor_profile_id,
  goal.department,
  goal.zone,
  goal.goal_month,
  sum(goal.goal_units)::integer as supervisor_goal_units,
  count(*)::integer as sellers_with_goal
from public.analytics_seller_goals goal
group by
  goal.supervisor_profile_id,
  goal.department,
  goal.zone,
  goal.goal_month;

grant select on public.analytics_supervisor_goal_summary to authenticated;

notify pgrst, 'reload schema';