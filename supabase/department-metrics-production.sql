-- CC ANALYTICS · NÚCLEO DE PRODUCCIÓN PARA INDICADORES DEPARTAMENTALES
-- Sustituye cifras demostrativas por definiciones, valores, metas y fuentes reales.

create table if not exists public.analytics_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  module_key text not null,
  metric_key text not null,
  label text not null,
  description text,
  unit text not null default 'number',
  aggregation text not null default 'sum',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.analytics_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_metric_definitions_unit_check
    check (unit in ('number','count','currency','percent','minutes','hours','days','ratio')),
  constraint analytics_metric_definitions_aggregation_check
    check (aggregation in ('sum','average','latest','minimum','maximum')),
  constraint analytics_metric_definitions_key_check
    check (metric_key ~ '^[a-z0-9_]+$'),
  constraint analytics_metric_definitions_unique
    unique (department, module_key, metric_key)
);

create table if not exists public.analytics_metric_values (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.analytics_metric_definitions(id) on delete restrict,
  department text not null,
  module_key text not null,
  zone text not null,
  period_month date not null,
  value numeric(18,4) not null default 0,
  target_value numeric(18,4),
  source_type text not null default 'manual',
  source_import_id uuid references public.analytics_imports(id) on delete set null,
  notes text,
  created_by uuid references public.analytics_profiles(id) on delete set null,
  updated_by uuid references public.analytics_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_metric_values_month_check
    check (period_month = date_trunc('month', period_month)::date),
  constraint analytics_metric_values_source_check
    check (source_type in ('manual','import','calculated')),
  constraint analytics_metric_values_unique
    unique (metric_id, zone, period_month)
);

create index if not exists analytics_metric_definitions_scope_idx
  on public.analytics_metric_definitions (department, module_key, active, sort_order);
create index if not exists analytics_metric_values_scope_idx
  on public.analytics_metric_values (department, module_key, zone, period_month);
create index if not exists analytics_metric_values_import_idx
  on public.analytics_metric_values (source_import_id)
  where source_import_id is not null;

create or replace function public.set_analytics_metric_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists analytics_metric_definitions_updated_at
  on public.analytics_metric_definitions;
create trigger analytics_metric_definitions_updated_at
before update on public.analytics_metric_definitions
for each row execute function public.set_analytics_metric_updated_at();

drop trigger if exists analytics_metric_values_updated_at
  on public.analytics_metric_values;
create trigger analytics_metric_values_updated_at
before update on public.analytics_metric_values
for each row execute function public.set_analytics_metric_updated_at();

create or replace function public.analytics_can_view_scope(
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
        and (
          me.zone = 'Nacional'
          or target_zone = 'Nacional'
          or me.zone = target_zone
        )
    );
$$;

create or replace function public.analytics_can_edit_scope(
  target_department text,
  target_zone text,
  target_source_type text default 'manual'
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
        and (
          me.zone = 'Nacional'
          or target_zone = 'Nacional'
          or me.zone = target_zone
        )
        and (
          me.role in ('leader','supervisor')
          or (me.role = 'uploader' and target_source_type = 'import')
        )
    );
$$;

revoke all on function public.analytics_can_view_scope(text,text) from public;
revoke all on function public.analytics_can_edit_scope(text,text,text) from public;
grant execute on function public.analytics_can_view_scope(text,text) to authenticated;
grant execute on function public.analytics_can_edit_scope(text,text,text) to authenticated;

alter table public.analytics_metric_definitions enable row level security;
alter table public.analytics_metric_values enable row level security;

drop policy if exists "analytics metric definitions scoped select"
  on public.analytics_metric_definitions;
create policy "analytics metric definitions scoped select"
on public.analytics_metric_definitions for select to authenticated
using (
  public.current_user_is_admin()
  or department = public.current_user_department()
);

drop policy if exists "analytics metric values scoped select"
  on public.analytics_metric_values;
create policy "analytics metric values scoped select"
on public.analytics_metric_values for select to authenticated
using (public.analytics_can_view_scope(department, zone));

revoke all on public.analytics_metric_definitions from anon;
revoke all on public.analytics_metric_values from anon;
revoke insert, update, delete on public.analytics_metric_definitions from authenticated;
revoke insert, update, delete on public.analytics_metric_values from authenticated;
grant select on public.analytics_metric_definitions to authenticated;
grant select on public.analytics_metric_values to authenticated;

create or replace function public.analytics_upsert_department_metric(
  target_department text,
  target_module_key text,
  target_metric_key text,
  target_label text,
  target_unit text,
  target_zone text,
  target_period_month date,
  target_value numeric,
  target_target_value numeric,
  target_notes text,
  target_source_type text default 'manual',
  target_source_import_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_department text := trim(coalesce(target_department, ''));
  clean_module text := lower(regexp_replace(trim(coalesce(target_module_key, '')), '[^a-zA-Z0-9_]+', '_', 'g'));
  clean_key text := lower(regexp_replace(trim(coalesce(target_metric_key, '')), '[^a-zA-Z0-9_]+', '_', 'g'));
  clean_label text := trim(coalesce(target_label, ''));
  clean_zone text := trim(coalesce(target_zone, ''));
  normalized_month date;
  definition_id uuid;
  value_id uuid;
  old_value public.analytics_metric_values%rowtype;
begin
  if clean_department = '' or clean_module = '' or clean_key = '' or clean_label = '' then
    raise exception 'Departamento, módulo, clave y nombre del indicador son obligatorios';
  end if;
  if clean_zone = '' then
    raise exception 'La zona es obligatoria';
  end if;
  if target_period_month is null then
    raise exception 'El mes del indicador es obligatorio';
  end if;
  if target_unit not in ('number','count','currency','percent','minutes','hours','days','ratio') then
    raise exception 'La unidad del indicador no es válida';
  end if;
  if target_source_type not in ('manual','import','calculated') then
    raise exception 'La fuente del indicador no es válida';
  end if;
  if target_source_type = 'import' and target_source_import_id is null then
    raise exception 'Una métrica importada debe conservar la referencia del archivo';
  end if;
  if not public.analytics_can_edit_scope(clean_department, clean_zone, target_source_type) then
    raise exception 'No tienes permiso para modificar indicadores en este alcance';
  end if;

  normalized_month := date_trunc('month', target_period_month)::date;

  insert into public.analytics_metric_definitions (
    department, module_key, metric_key, label, unit, created_by
  ) values (
    clean_department, clean_module, clean_key, clean_label, target_unit, auth.uid()
  )
  on conflict (department, module_key, metric_key)
  do update set
    label = excluded.label,
    unit = excluded.unit,
    active = true
  returning id into definition_id;

  select * into old_value
  from public.analytics_metric_values
  where metric_id = definition_id
    and zone = clean_zone
    and period_month = normalized_month
  for update;

  insert into public.analytics_metric_values (
    metric_id,
    department,
    module_key,
    zone,
    period_month,
    value,
    target_value,
    source_type,
    source_import_id,
    notes,
    created_by,
    updated_by
  ) values (
    definition_id,
    clean_department,
    clean_module,
    clean_zone,
    normalized_month,
    coalesce(target_value, 0),
    target_target_value,
    target_source_type,
    target_source_import_id,
    nullif(trim(coalesce(target_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  on conflict (metric_id, zone, period_month)
  do update set
    value = excluded.value,
    target_value = excluded.target_value,
    source_type = excluded.source_type,
    source_import_id = excluded.source_import_id,
    notes = excluded.notes,
    updated_by = auth.uid()
  returning id into value_id;

  insert into public.analytics_audit_log (
    actor_id, action, entity_type, entity_id, department, zone, metadata
  ) values (
    auth.uid(),
    'department_metric_saved',
    'analytics_metric_value',
    value_id::text,
    clean_department,
    clean_zone,
    jsonb_build_object(
      'module_key', clean_module,
      'metric_key', clean_key,
      'label', clean_label,
      'period_month', normalized_month,
      'source_type', target_source_type,
      'before_value', old_value.value,
      'after_value', coalesce(target_value, 0),
      'before_target', old_value.target_value,
      'after_target', target_target_value,
      'source_import_id', target_source_import_id
    )
  );

  return value_id;
end;
$$;

revoke all on function public.analytics_upsert_department_metric(
  text,text,text,text,text,text,date,numeric,numeric,text,text,uuid
) from public;
grant execute on function public.analytics_upsert_department_metric(
  text,text,text,text,text,text,date,numeric,numeric,text,text,uuid
) to authenticated;

create or replace view public.analytics_metric_monthly
with (security_invoker = true)
as
select
  definition.id as metric_id,
  definition.department,
  definition.module_key,
  definition.metric_key,
  definition.label,
  definition.description,
  definition.unit,
  definition.aggregation,
  definition.sort_order,
  value.id as value_id,
  value.zone,
  value.period_month,
  coalesce(value.value, 0) as value,
  value.target_value,
  value.source_type,
  value.source_import_id,
  value.notes,
  value.updated_at
from public.analytics_metric_definitions definition
left join public.analytics_metric_values value
  on value.metric_id = definition.id
where definition.active;

grant select on public.analytics_metric_monthly to authenticated;

create or replace view public.analytics_profile_completeness
with (security_invoker = true)
as
select
  profile.id,
  profile.full_name,
  profile.email,
  profile.department,
  profile.job_title,
  profile.zone,
  profile.role,
  profile.reports_to,
  profile.status,
  array_remove(array[
    case when trim(coalesce(profile.full_name, '')) = '' then 'nombre' end,
    case when trim(coalesce(profile.email, '')) = '' then 'correo' end,
    case when trim(coalesce(profile.department, '')) = '' then 'departamento' end,
    case when trim(coalesce(profile.job_title, '')) in ('', 'Pendiente de asignación') then 'cargo' end,
    case when trim(coalesce(profile.zone, '')) = '' then 'zona' end,
    case
      when profile.role in ('supervisor','analyst','uploader') and profile.reports_to is null
      then 'superior'
    end
  ], null) as missing_fields,
  cardinality(array_remove(array[
    case when trim(coalesce(profile.full_name, '')) = '' then 'nombre' end,
    case when trim(coalesce(profile.email, '')) = '' then 'correo' end,
    case when trim(coalesce(profile.department, '')) = '' then 'departamento' end,
    case when trim(coalesce(profile.job_title, '')) in ('', 'Pendiente de asignación') then 'cargo' end,
    case when trim(coalesce(profile.zone, '')) = '' then 'zona' end,
    case
      when profile.role in ('supervisor','analyst','uploader') and profile.reports_to is null
      then 'superior'
    end
  ], null)) = 0 as complete
from public.analytics_profiles profile;

grant select on public.analytics_profile_completeness to authenticated;

-- Catálogo real: se crean definiciones, nunca cifras ficticias.
insert into public.analytics_metric_definitions
  (department, module_key, metric_key, label, description, unit, aggregation, sort_order)
select * from (values
  ('Marketing','marketing_digital','leads','Leads recibidos','Prospectos recibidos durante el mes','count','sum',10),
  ('Marketing','marketing_digital','reach','Alcance','Personas alcanzadas por campañas','count','sum',20),
  ('Marketing','marketing_digital','investment','Inversión','Inversión publicitaria del período','currency','sum',30),
  ('Marketing','marketing_digital','conversions','Conversiones','Conversiones atribuidas a campañas','count','sum',40),
  ('Marketing','roa_roas','marketing_spend','Inversión atribuible','Inversión usada para calcular retorno','currency','sum',10),
  ('Marketing','roa_roas','attributed_revenue','Ingresos atribuidos','Ingresos asociados a campañas','currency','sum',20),
  ('Marketing','roa_roas','roas','ROAS','Retorno sobre inversión publicitaria','ratio','latest',30),
  ('Marketing','roa_roas','roa','ROA','Retorno sobre activos','percent','latest',40),

  ('Call Center','call_center','calls_received','Llamadas recibidas','Total de llamadas entrantes','count','sum',10),
  ('Call Center','call_center','calls_answered','Llamadas atendidas','Llamadas atendidas por el equipo','count','sum',20),
  ('Call Center','call_center','service_level','Nivel de servicio','Porcentaje atendido dentro del SLA','percent','latest',30),
  ('Call Center','call_center','abandonment_rate','Abandono','Porcentaje de llamadas abandonadas','percent','latest',40),
  ('Call Center','soporte_tecnico','tickets_opened','Tickets recibidos','Solicitudes de soporte creadas','count','sum',10),
  ('Call Center','soporte_tecnico','tickets_resolved','Tickets resueltos','Solicitudes resueltas','count','sum',20),
  ('Call Center','soporte_tecnico','first_response_minutes','Primera respuesta','Tiempo promedio de primera respuesta','minutes','average',30),
  ('Call Center','clientes','active_clients','Clientes activos','Clientes activos dentro del alcance','count','latest',10),
  ('Call Center','clientes','new_clients','Altas','Clientes nuevos del período','count','sum',20),
  ('Call Center','clientes','churned_clients','Bajas','Clientes retirados del período','count','sum',30),
  ('Call Center','clientes','nps','NPS','Índice de recomendación','number','latest',40),

  ('Recursos Humanos','recursos_humanos','active_employees','Colaboradores activos','Personal activo del alcance','count','latest',10),
  ('Recursos Humanos','recursos_humanos','hires','Ingresos','Nuevas contrataciones','count','sum',20),
  ('Recursos Humanos','recursos_humanos','terminations','Salidas','Retiros del período','count','sum',30),
  ('Recursos Humanos','recursos_humanos','turnover_rate','Rotación','Porcentaje de rotación','percent','latest',40),
  ('Recursos Humanos','recursos_humanos','vacancies','Vacantes','Plazas abiertas','count','latest',50),

  ('Finanzas','finanzas','revenue','Ingresos','Ingresos del período','currency','sum',10),
  ('Finanzas','finanzas','costs','Costos','Costos del período','currency','sum',20),
  ('Finanzas','finanzas','ebitda_margin','Margen EBITDA','Margen EBITDA del período','percent','latest',30),
  ('Finanzas','finanzas','overdue_portfolio','Cartera vencida','Saldo vencido','currency','latest',40),
  ('Finanzas','roa_roas','marketing_spend','Inversión atribuible','Inversión usada para calcular retorno','currency','sum',10),
  ('Finanzas','roa_roas','attributed_revenue','Ingresos atribuidos','Ingresos asociados a campañas','currency','sum',20),
  ('Finanzas','roa_roas','roas','ROAS','Retorno sobre inversión publicitaria','ratio','latest',30),
  ('Finanzas','roa_roas','roa','ROA','Retorno sobre activos','percent','latest',40),

  ('Operaciones','operaciones','open_orders','Órdenes abiertas','Órdenes pendientes','count','latest',10),
  ('Operaciones','operaciones','completed_orders','Órdenes completadas','Órdenes terminadas en el período','count','sum',20),
  ('Operaciones','operaciones','sla_compliance','SLA cumplido','Porcentaje dentro del SLA','percent','latest',30),
  ('Operaciones','operaciones','avg_completion_hours','Tiempo promedio','Horas promedio de finalización','hours','average',40),
  ('Operaciones','instalaciones','scheduled','Programadas','Instalaciones programadas','count','sum',10),
  ('Operaciones','instalaciones','completed','Completadas','Instalaciones completadas','count','sum',20),
  ('Operaciones','instalaciones','pending','Pendientes','Instalaciones pendientes','count','latest',30),
  ('Operaciones','instalaciones','sla','SLA','Cumplimiento del SLA','percent','latest',40),
  ('Operaciones','soporte_tecnico','tickets_opened','Tickets recibidos','Solicitudes de soporte creadas','count','sum',10),
  ('Operaciones','soporte_tecnico','tickets_resolved','Tickets resueltos','Solicitudes resueltas','count','sum',20),
  ('Operaciones','soporte_tecnico','first_response_minutes','Primera respuesta','Tiempo promedio de primera respuesta','minutes','average',30),
  ('Operaciones','soporte_tecnico','csat','CSAT','Satisfacción del cliente','percent','latest',40),
  ('Operaciones','inventario','units','Unidades','Unidades disponibles','count','latest',10),
  ('Operaciones','inventario','inventory_value','Valor de inventario','Valor monetario de existencias','currency','latest',20),
  ('Operaciones','inventario','critical_stock','Stock crítico','Artículos bajo mínimo','count','latest',30),
  ('Operaciones','inventario','turnover','Rotación','Rotación de inventario','ratio','latest',40),
  ('Operaciones','cobertura','homes_passed','Hogares pasados','Hogares con red disponible','count','latest',10),
  ('Operaciones','cobertura','coverage_percent','Cobertura','Porcentaje de cobertura','percent','latest',20),
  ('Operaciones','cobertura','new_zones','Zonas nuevas','Zonas incorporadas','count','sum',30),
  ('Operaciones','cobertura','availability','Disponibilidad','Disponibilidad de red','percent','latest',40)
) as seed(department,module_key,metric_key,label,description,unit,aggregation,sort_order)
on conflict (department, module_key, metric_key)
do update set
  label = excluded.label,
  description = excluded.description,
  unit = excluded.unit,
  aggregation = excluded.aggregation,
  sort_order = excluded.sort_order,
  active = true;

notify pgrst, 'reload schema';
