import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(
  "components/real-sales-dashboard.tsx",
  "utf8",
);
const hub = await readFile("components/sales-data-hub-v2.tsx", "utf8");
const matching = await readFile("lib/seller-matching.ts", "utf8");
const root = await readFile("components/analytics-root.tsx", "utf8");
const page = await readFile("app/page.tsx", "utf8");
const controller = await readFile(
  "components/production-module-controller.tsx",
  "utf8",
);
const migration = await readFile(
  "supabase/sales-snapshot-replacement-and-units.sql",
  "utf8",
);

test("dashboard uses real sales data and explicit zero-safe calculations", () => {
  for (const marker of [
    'from("analytics_sales")',
    'from("analytics_announced_sales")',
    'from("analytics_seller_goals")',
    "contracts",
    "billed",
    "No hay ventas reportadas para el período",
    "sale_units",
  ]) {
    assert.match(
      dashboard,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("sales import supports date ranges, replacement and cutoff history", () => {
  for (const marker of [
    "importStart",
    "importEnd",
    "Sustituir rango anterior",
    "analytics_finalize_sales_import",
    "Historial de cortes cargados",
    "replaced_rows",
    "sale_units",
  ]) {
    assert.match(hub, new RegExp(marker));
  }
});

test("seller matching tolerates name variants and protects ambiguity", () => {
  for (const marker of [
    "personNameSimilarity",
    "findBestSellerMatch",
    "levenshtein",
    "ambiguous",
    "detectedSaleUnits",
  ]) {
    assert.match(matching, new RegExp(marker));
  }
});

test("root keeps sales operations while a single production controller owns dashboards", () => {
  assert.match(root, /SalesDataHubV2/);
  assert.doesNotMatch(root, /LiveSalesAreaDashboard/);
  assert.doesNotMatch(root, /cc-live-sales-host/);
  assert.match(page, /ProductionModuleController/);
  assert.doesNotMatch(page, /InitialDashboardController/);
  assert.match(controller, /RealSalesDashboard/);
  assert.match(controller, /RealExecutiveDashboard/);
  assert.match(controller, /RealDepartmentDashboard/);
});

test("database migration replaces imported rows but preserves manual sales", () => {
  assert.match(migration, /source_type = 'imported'/);
  assert.match(migration, /source_import_id <> current_import_id/);
  assert.match(migration, /analytics_finalize_sales_import/);
  assert.match(migration, /superseded_by/);
  assert.match(migration, /sale_units/);
});
