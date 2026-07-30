-- CC ANALYTICS · OPTIMIZACIÓN DE ÍNDICES Y RLS
-- Ejecutar después de cc-analytics-integration.sql.

create index if not exists analytics_imports_uploaded_by_idx
  on public.analytics_imports (uploaded_by);
create index if not exists analytics_records_import_id_idx
  on public.analytics_records (import_id);
create index if not exists analytics_records_created_by_idx
  on public.analytics_records (created_by);
create index if not exists analytics_sales_source_import_id_idx
  on public.analytics_sales (source_import_id);
create index if not exists analytics_sales_seller_profile_id_idx
  on public.analytics_sales (seller_profile_id);
create index if not exists analytics_sales_created_by_idx
  on public.analytics_sales (created_by);

drop policy if exists "analytics profiles update own name"
  on public.analytics_profiles;
create policy "analytics profiles update own name"
on public.analytics_profiles for update to authenticated
using (id = (select auth.uid()) and status = 'activo')
with check (id = (select auth.uid()) and status = 'activo');

drop policy if exists "analytics imports scoped insert"
  on public.analytics_imports;
create policy "analytics imports scoped insert"
on public.analytics_imports for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (
        public.current_user_zone() = 'Nacional'
        or zone = public.current_user_zone()
      )
    )
  )
);

drop policy if exists "analytics records scoped insert"
  on public.analytics_records;
create policy "analytics records scoped insert"
on public.analytics_records for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (
        public.current_user_zone() = 'Nacional'
        or zone = public.current_user_zone()
      )
    )
  )
);

drop policy if exists "analytics sales scoped insert"
  on public.analytics_sales;
create policy "analytics sales scoped insert"
on public.analytics_sales for insert to authenticated
with check (
  created_by = (select auth.uid())
  and seller_profile_id is null
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (
        public.current_user_zone() = 'Nacional'
        or zone = public.current_user_zone()
      )
      and public.current_user_can_assign_supervisor(supervisor_profile_id)
    )
  )
);

drop policy if exists "analytics report templates scoped select"
  on public.analytics_report_templates;
create policy "analytics report templates scoped select"
on public.analytics_report_templates for select to authenticated
using (
  public.current_user_is_admin()
  or created_by = (select auth.uid())
  or (
    is_shared
    and department = public.current_user_department()
    and (
      public.current_user_zone() = 'Nacional'
      or zone = public.current_user_zone()
    )
  )
);

drop policy if exists "analytics report templates scoped insert"
  on public.analytics_report_templates;
create policy "analytics report templates scoped insert"
on public.analytics_report_templates for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    public.current_user_is_admin()
    or (
      department = public.current_user_department()
      and (
        public.current_user_zone() = 'Nacional'
        or zone = public.current_user_zone()
      )
    )
  )
);

drop policy if exists "analytics report templates scoped update"
  on public.analytics_report_templates;
create policy "analytics report templates scoped update"
on public.analytics_report_templates for update to authenticated
using (
  created_by = (select auth.uid())
  or public.current_user_is_admin()
)
with check (
  created_by = (select auth.uid())
  or public.current_user_is_admin()
);

drop policy if exists "analytics report templates scoped delete"
  on public.analytics_report_templates;
create policy "analytics report templates scoped delete"
on public.analytics_report_templates for delete to authenticated
using (
  created_by = (select auth.uid())
  or public.current_user_is_admin()
);

notify pgrst, 'reload schema';
