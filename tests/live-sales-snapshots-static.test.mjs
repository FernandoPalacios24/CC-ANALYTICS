import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(
  "components/real-sales-dashboard.tsx",
  "utf8",
);
const hub = await readFile("components/sales-data-hub-v2.tsx", "utf8");
const matching = await readFile("lib/seller-matching.ts", "utf8");
const auth = await readFile("components/auth-shell.tsx", "utf8");
const app = await readFile("components/production-analytics-app.tsx", "utf8");
const page = await readFile("app/page.tsx", "utf8");
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

test("authentication renders the native production app directly", () => {
  assert.match(page, /AuthShell/);
  assert.doesNotMatch(page, /AnalyticsRoot/);
  assert.doesNotMatch(page, /ProductionModuleController/);
  assert.doesNotMatch(page, /SalesDataEnhancementController/);
  assert.match(auth, /ProductionAnalyticsApp/);
  assert.doesNotMatch(auth, /<AnalyticsApp/);
  assert.doesNotMatch(auth, /window\.prompt/);
  assert.match(app, /RealSalesDashboard/);
  assert.match(app, /RealExecutiveDashboard/);
  assert.match(app, /RealDepartmentDashboard/);
  assert.match(app, /ProductionUserAccess/);
  assert.match(app, /ProductionAuditCenter/);
  assert.match(app, /SalesGoalsCenter/);
});

test("database migration replaces imported rows but preserves manual sales", () => {
  assert.match(migration, /source_type = 'imported'/);
  assert.match(migration, /source_import_id <> current_import_id/);
  assert.match(migration, /analytics_finalize_sales_import/);
  assert.match(migration, /superseded_by/);
  assert.match(migration, /sale_units/);
});
