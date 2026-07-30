-- CC ANALYTICS · verificación corporativa de solo lectura
-- Ejecutar después de cc-analytics-integration.sql en el proyecto independiente.

select
  to_regclass('public.analytics_profiles') is not null as profiles_ready,
  to_regclass('public.analytics_audit_log') is not null as audit_log_ready,
  to_regclass('public.analytics_sales') is not null as sales_ready,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'analytics_sales'
      and column_name = 'supervisor_profile_id'
  ) as supervisor_scope_ready,
  to_regprocedure(
    'public.admin_update_analytics_profile(uuid,text,text,text,uuid,text,text)'
  ) is not null as admin_access_rpc_ready,
  to_regprocedure(
    'public.current_user_can_view_sale(text,text,uuid,uuid)'
  ) is not null as sales_rls_function_ready;

select
  count(*) as active_analytics_administrators
from public.analytics_profiles
where role = 'admin' and status = 'activo';

select
  count(*) as seller_accounts_with_analytics_access
from public.analytics_profiles
where lower(trim(coalesce(job_title, ''))) like '%vendedor%'
   or lower(trim(coalesce(job_title, ''))) like '%ejecutivo de ventas%';
