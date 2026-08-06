import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hub = await readFile("components/sales-data-hub-v2.tsx", "utf8");
const sql = await readFile(
  "supabase/add-historical-seller-exit-date.sql",
  "utf8",
);

test("seller form supports active and historical EVRs", () => {
  assert.match(hub, /EVR activo actualmente/);
  assert.match(hub, /!sellerIsActive &&/);
  assert.match(hub, /Fecha de salida/);
  assert.match(hub, /analytics_save_seller_with_exit/);
  assert.match(hub, /target_inactive_effective_date/);
});

test("historical seller RPC validates and audits the exit date", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /target_inactive_effective_date <= target_hire_date/);
  assert.match(sql, /seller_exit_recorded/);
  assert.match(sql, /revoke all[\s\S]*from public, anon/);
  assert.match(sql, /grant execute[\s\S]*to authenticated/);
});
