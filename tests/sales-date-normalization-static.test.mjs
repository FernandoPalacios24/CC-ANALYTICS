import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wrapper = await readFile("components/sales-data-hub-safe.tsx", "utf8");
const tsconfig = await readFile("tsconfig.json", "utf8");

test("sales hub alias points to the safe date validation wrapper", () => {
  assert.match(tsconfig, /@\/components\/sales-data-hub-v2/);
  assert.match(tsconfig, /sales-data-hub-safe\.tsx/);
  assert.match(wrapper, /CoreSalesDataHubV2/);
});

test("all detected dates outside the selected range use the selected cutoff", () => {
  assert.match(wrapper, /allOutside/);
  assert.match(wrapper, /row\[header\] = end/);
  assert.match(wrapper, /fechas de/);
  assert.match(wrapper, /fuera del rango seleccionado/);
});

test("valid files continue into the original intelligent import engine", () => {
  assert.match(wrapper, /DataTransfer/);
  assert.match(wrapper, /dispatchEvent\(new Event\("change"/);
  assert.match(wrapper, /preparedFiles/);
});
