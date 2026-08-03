-- CC ANALYTICS · ACCESO DE LECTURA A MÓDULOS COMPARTIDOS
-- Cobertura, clientes, soporte y ROA/ROAS conservan un departamento propietario,
-- pero pueden ser consultados por las áreas que necesitan esos datos.

create or replace function public.analytics_can_view_metric_scope(
  target_department text,
  target_module_key text,
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
        and (
          (
            me.department = target_department
            and (me.zone = 'Nacional' or target_zone = 'Nacional' or me.zone = target_zone)
          )
          or (
            target_module_key = 'cobertura'
            and target_department = 'Operaciones'
            and me.department in (
              'Ventas Digitales',
              'Ventas Residenciales',
              'Ventas Residenciales Rurales',
              'Ventas Corporativas'
            )
            and (me.zone = 'Nacional' or target_zone = 'Nacional' or me.zone = target_zone)
          )
          or (
            target_module_key = 'clientes'
            and target_department = 'Call Center'
            and me.department in (
              'Ventas Digitales',
              'Ventas Residenciales',
              'Ventas Residenciales Rurales',
              'Ventas Corporativas'
            )
            and (me.zone = 'Nacional' or target_zone = 'Nacional' or me.zone = target_zone)
          )
          or (
            target_module_key = 'soporte_tecnico'
            and target_department in ('Operaciones','Call Center')
            and me.department in ('Operaciones','Call Center')
            and (me.zone = 'Nacional' or target_zone = 'Nacional' or me.zone = target_zone)
          )
          or (
            target_module_key = 'roa_roas'
            and target_department in ('Marketing','Finanzas')
            and me.department in ('Marketing','Finanzas')
            and (me.zone = 'Nacional' or target_zone = 'Nacional' or me.zone = target_zone)
          )
        )
    );
$$;

revoke all on function public.analytics_can_view_metric_scope(text,text,text) from public;
grant execute on function public.analytics_can_view_metric_scope(text,text,text) to authenticated;

drop policy if exists "analytics metric definitions scoped select"
  on public.analytics_metric_definitions;
create policy "analytics metric definitions scoped select"
on public.analytics_metric_definitions for select to authenticated
using (
  public.current_user_is_admin()
  or department = public.current_user_department()
  or (module_key = 'cobertura' and department = 'Operaciones' and public.current_user_department() in (
    'Ventas Digitales','Ventas Residenciales','Ventas Residenciales Rurales','Ventas Corporativas'
  ))
  or (module_key = 'clientes' and department = 'Call Center' and public.current_user_department() in (
    'Ventas Digitales','Ventas Residenciales','Ventas Residenciales Rurales','Ventas Corporativas'
  ))
  or (module_key = 'soporte_tecnico' and department in ('Operaciones','Call Center') and public.current_user_department() in ('Operaciones','Call Center'))
  or (module_key = 'roa_roas' and department in ('Marketing','Finanzas') and public.current_user_department() in ('Marketing','Finanzas'))
);

drop policy if exists "analytics metric values scoped select"
  on public.analytics_metric_values;
create policy "analytics metric values scoped select"
on public.analytics_metric_values for select to authenticated
using (public.analytics_can_view_metric_scope(department,module_key,zone));

notify pgrst, 'reload schema';
