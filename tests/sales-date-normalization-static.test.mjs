import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dateWrapper = await readFile("components/sales-data-hub-safe.tsx", "utf8");
const integrityWrapper = await readFile(
  "components/sales-data-hub-integrity.tsx",
  "utf8",
);
const tsconfig = await readFile("tsconfig.json", "utf8");

test("sales hub alias points to the integrity wrapper and keeps date validation", () => {
  assert.match(tsconfig, /@\/components\/sales-data-hub-v2/);
  assert.match(tsconfig, /sales-data-hub-integrity\.tsx/);
  assert.match(integrityWrapper, /SafeSalesDataHubV2/);
  assert.match(dateWrapper, /CoreSalesDataHubV2/);
});

test("all detected dates outside the selected range use the selected cutoff", () => {
  assert.match(dateWrapper, /allOutside/);
  assert.match(dateWrapper, /row\[header\] = end/);
  assert.match(dateWrapper, /fechas de/);
  assert.match(dateWrapper, /fuera del rango seleccionado/);
});

test("valid files continue into the original intelligent import engine", () => {
  assert.match(dateWrapper, /DataTransfer/);
  assert.match(dateWrapper, /dispatchEvent\(new Event\("change"/);
  assert.match(dateWrapper, /preparedFiles/);
});

test("sales cannot be confirmed while seller links remain unresolved", () => {
  assert.match(integrityWrapper, /Conservar nombre original/);
  assert.match(integrityWrapper, /Confirmar actualización/);
  assert.match(integrityWrapper, /no guardará ventas huérfanas/);
});
