import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detector = await readFile("lib/sales-import-detection.ts", "utf8");
const hub = await readFile("components/sales-data-hub-v2.tsx", "utf8");

test("amount detection rejects package descriptions containing digits", () => {
  assert.match(detector, /function isLikelyMonetaryNumber/);
  assert.match(detector, /withoutCurrency/);
  assert.match(detector, /\[a-záéíóúñ\]/i);
  assert.match(
    detector,
    /sampleScore\(rows, key, isLikelyMonetaryNumber\)/,
  );
});

test("sales import can convert USD amounts to HNL", () => {
  assert.match(hub, /Los montos del archivo están en dólares/);
  assert.match(hub, /Tasa de cambio · L por US\$1/);
  assert.match(hub, /originalTotalAmount \* rate/);
  assert.match(hub, /__source_currency/);
  assert.match(hub, /__exchange_rate_hnl/);
  assert.match(hub, /Monto total en lempiras/);
});
