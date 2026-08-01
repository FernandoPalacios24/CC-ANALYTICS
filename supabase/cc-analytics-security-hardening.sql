-- CC ANALYTICS · ENDURECIMIENTO DE FUNCIONES
-- Ejecutar después de cc-analytics-integration.sql.

revoke all on function public.handle_new_analytics_user()
  from public, anon, authenticated;
revoke all on function public.audit_analytics_import()
  from public, anon, authenticated;
revoke all on function public.audit_analytics_report_template()
  from public, anon, authenticated;
revoke all on function public.set_analytics_updated_at()
  from public, anon, authenticated;

revoke all on function public.current_user_is_admin()
  from public, anon;
revoke all on function public.current_user_department()
  from public, anon;
revoke all on function public.current_user_zone()
  from public, anon;
revoke all on function public.current_user_role()
  from public, anon;
revoke all on function public.current_user_can_view_profile(uuid)
  from public, anon;
revoke all on function public.current_user_can_assign_supervisor(uuid)
  from public, anon;
revoke all on function public.current_user_can_view_sale(text,text,uuid,uuid)
  from public, anon;
revoke all on function public.admin_update_analytics_profile(
  uuid,text,text,text,uuid,text,text
) from public, anon;
revoke all on function public.bootstrap_analytics_admin(text,text)
  from public, anon, authenticated;

grant execute on function public.current_user_is_admin()
  to authenticated;
grant execute on function public.current_user_department()
  to authenticated;
grant execute on function public.current_user_zone()
  to authenticated;
grant execute on function public.current_user_role()
  to authenticated;
grant execute on function public.current_user_can_view_profile(uuid)
  to authenticated;
grant execute on function public.current_user_can_assign_supervisor(uuid)
  to authenticated;
grant execute on function public.current_user_can_view_sale(text,text,uuid,uuid)
  to authenticated;
grant execute on function public.admin_update_analytics_profile(
  uuid,text,text,text,uuid,text,text
) to authenticated;
grant execute on function public.bootstrap_analytics_admin(text,text)
  to service_role;

notify pgrst, 'reload schema';
