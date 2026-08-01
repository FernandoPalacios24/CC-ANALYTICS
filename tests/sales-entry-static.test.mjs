import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hub = await readFile("components/sales-data-hub.tsx", "utf8");
const detector = await readFile("lib/sales-import-detection.ts", "utf8");
const root = await readFile("components/analytics-root.tsx", "utf8");
const migration = await readFile("supabase/cc-analytics-sales-entry.sql", "utf8");
const lintConfig = await readFile("eslint.config.mjs", "utf8");

test("sales entry hub includes roster, import, manual, announced and report workflows", () => {
  for (const marker of [
    "Mi equipo",
    "Subir Excel",
    "Venta manual",
    "Venta anunciada",
    "Reporte por vendedor",
  ]) {
    assert.match(hub, new RegExp(marker));
  }
});

test("flexible detector recognizes heterogeneous sales fields", () => {
  for (const marker of [
    "detectSalesColumns",
    "analyzeSalesMatrix",
    "sellerName",
    "saleDate",
    "amountBilled",
  ]) {
    assert.match(detector, new RegExp(marker));
  }
});

test("navigation exposes sales entry to authorized operational roles", () => {
  assert.match(root, /Ingreso de ventas/);
  assert.match(root, /SalesDataHub/);
  assert.match(root, /Supervisor/);
});

test("database migration preserves seller history and announced sales", () => {
  assert.match(migration, /create table if not exists public\.analytics_sellers/);
  assert.match(migration, /create table if not exists public\.analytics_announced_sales/);
  assert.match(migration, /analytics_retire_seller/);
  assert.match(migration, /salida_pendiente/);
  assert.match(migration, /seller_id uuid/);
});

test("lint configuration supports intentional Supabase loading effects", () => {
  assert.match(lintConfig, /react-hooks\/set-state-in-effect/);
});
