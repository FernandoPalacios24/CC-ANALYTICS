import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const center = await readFile(
  "components/sales-correction-center-lifecycle.tsx",
  "utf8",
);
const migration = await readFile(
  "supabase/sales-cancellations-and-announced-lifecycle.sql",
  "utf8",
);
const tsconfig = await readFile("tsconfig.json", "utf8");

test("correction center exposes audited cancellations and monthly returns", () => {
  for (const marker of [
    "Cancelar / devolver",
    "Devoluciones del mes",
    "Monto devuelto",
    "analytics_cancel_posted_sale",
    "analytics_sale_cancellations",
    "Motivo detallado",
  ]) {
    assert.match(center, new RegExp(marker));
  }
});

test("announced sales convert into real posted sales and can be removed", () => {
  for (const marker of [
    "Pasar a posteada",
    "analytics_post_announced_sale",
    "analytics_delete_announced_sale",
    "sumará en el ranking en vivo",
  ]) {
    assert.match(center, new RegExp(marker));
  }
  assert.match(migration, /insert into public\.analytics_sales/);
  assert.match(migration, /linked_sale_id/);
  assert.match(migration, /announced_sale_posted/);
});

test("RLS hides processed rows from normal dashboards and listings", () => {
  assert.match(migration, /sale_status = 'posteada'/);
  assert.match(migration, /status = 'anunciada'/);
  assert.match(migration, /analytics announced sales scoped select/);
  assert.match(migration, /analytics sales hierarchical select/);
});

test("existing correction module resolves to the lifecycle wrapper", () => {
  assert.match(tsconfig, /@\/components\/sales-correction-center/);
  assert.match(tsconfig, /sales-correction-center-lifecycle\.tsx/);
  assert.match(center, /CoreSalesCorrectionCenter/);
});
