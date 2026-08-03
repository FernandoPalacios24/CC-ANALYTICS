import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile("app/page.tsx", "utf8");
const controller = await readFile(
  "components/production-module-controller.tsx",
  "utf8",
);
const departmentDashboard = await readFile(
  "components/real-department-dashboard.tsx",
  "utf8",
);
const executiveDashboard = await readFile(
  "components/real-executive-dashboard.tsx",
  "utf8",
);
const importCenter = await readFile(
  "components/department-import-center.tsx",
  "utf8",
);
const alertCenter = await readFile(
  "components/real-alert-center.tsx",
  "utf8",
);
const platform = await readFile("lib/production-platform.ts", "utf8");
const metricsMigration = await readFile(
  "supabase/department-metrics-production.sql",
  "utf8",
);
const importMigration = await readFile(
  "supabase/department-import-metric-replacement.sql",
  "utf8",
);
const copilot = await readFile("app/api/report-copilot/route.ts", "utf8");

test("production entry uses one dashboard controller", () => {
  assert.match(page, /ProductionModuleController/);
  assert.doesNotMatch(page, /InitialDashboardController/);
  assert.match(controller, /cc-production-module-host/);
  assert.match(controller, /canSeeNav/);
  assert.match(controller, /currentMonthLabel/);
});

test("visible production modules read Supabase instead of demo fixtures", () => {
  for (const source of [departmentDashboard, executiveDashboard, alertCenter]) {
    assert.match(source, /from\("analytics_/);
    assert.doesNotMatch(source, /@\/lib\/data/);
  }
  assert.match(controller, /RealDepartmentDashboard/);
  assert.match(controller, /RealExecutiveDashboard/);
  assert.match(controller, /RealSalesDashboard/);
  assert.match(controller, /RealAlertCenter/);
  assert.match(controller, /DepartmentImportCenter/);
});

test("department imports persist rows, replace previous cuts and feed metrics", () => {
  for (const marker of [
    'from("analytics_imports")',
    'from("analytics_records")',
    "analytics_finalize_department_import",
    "analytics_upsert_department_metric",
    "protectedKeys",
  ]) {
    assert.match(importCenter, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(importMigration, /source_type = 'import'/);
  assert.match(importMigration, /removed_imported_metrics/);
});

test("metrics core includes RLS, audit, targets and profile completeness", () => {
  for (const marker of [
    "analytics_metric_definitions",
    "analytics_metric_values",
    "analytics_upsert_department_metric",
    "analytics_profile_completeness",
    "department_metric_saved",
    "enable row level security",
  ]) {
    assert.match(metricsMigration, new RegExp(marker));
  }
});

test("module registry assigns a purpose and scope to every visible area", () => {
  for (const marker of [
    "Dashboard ejecutivo",
    "Dashboard de mi área",
    "Marketing digital",
    "Call center",
    "Recursos humanos",
    "Finanzas",
    "Operaciones",
    "Instalaciones",
    "Soporte técnico",
    "Inventario",
    "Cobertura",
    "Clientes",
    "Centro de alertas",
    "Proyecciones",
  ]) {
    assert.match(platform, new RegExp(marker));
  }
  assert.match(platform, /canSeeNav/);
  assert.match(platform, /moduleOwner/);
});

test("report copilot cannot fall back to another Supabase project", () => {
  assert.doesNotMatch(copilot, /vvuxlzxbgnilzdtomyod/);
  assert.doesNotMatch(copilot, /BdePRThQK0YafjmpN3vbow/);
  assert.doesNotMatch(copilot, /gpt-5\.6-sol/);
  assert.match(copilot, /gpt-5\.2/);
  assert.match(copilot, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(copilot, /JSON\.parse/);
});
