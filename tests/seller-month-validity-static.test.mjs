import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hub = await readFile("components/sales-data-hub-v2.tsx", "utf8");

test("seller lists are constrained by the selected sales period", () => {
  assert.match(hub, /function isSellerActiveOnDate/);
  assert.match(hub, /seller\.hire_date > cleanDate/);
  assert.match(hub, /cleanDate < seller\.inactive_effective_date/);
  assert.match(hub, /function isSellerActiveInPeriod/);
  assert.match(hub, /seller\.hire_date <= end/);
  assert.match(hub, /seller\.inactive_effective_date > start/);
  assert.match(hub, /Mes de ventas/);
  assert.match(hub, /Vendedor disponible en ese mes/);
  assert.match(hub, /reportSellers/);
  assert.match(hub, /importPeriodSellers/);
});

test("import matching uses the seller roster valid on each sale date", () => {
  assert.match(hub, /const sellersForSaleDate = selectedSellers\.filter/);
  assert.match(
    hub,
    /isSellerActiveOnDate\(seller, sale\.saleDate\)/,
  );
  assert.match(
    hub,
    /findBestSellerMatch\([\s\S]*?sale\.sellerCode,[\s\S]*?sellersForSaleDate/,
  );
});
