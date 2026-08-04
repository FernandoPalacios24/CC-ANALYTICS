import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const types = fs.readFileSync("lib/report-engine/types.ts", "utf8");
const registry = fs.readFileSync("lib/report-engine/visual-registry.ts", "utf8");
const compiler = fs.readFileSync("lib/report-engine/query-compiler.ts", "utf8");
const model = fs.readFileSync("lib/report-engine/cc-semantic-model.ts", "utf8");

test("universal report spec is versioned", () => {
  assert.match(types, /version: 4/);
  assert.match(types, /UniversalReportSpec/);
  assert.match(types, /advancedSpec/);
});

test("visual registry supports open renderers", () => {
  for (const renderer of ["vega-lite", "vega", "grid", "react-flow"]) {
    assert.ok(registry.includes(`renderer: \"${renderer}\"`));
  }
  for (const visual of ["matrix", "heatmap", "treemap", "podium", "org_chart", "slicer"]) {
    assert.ok(registry.includes(`kind: \"${visual}\"`));
  }
});

test("query compiler validates identifiers and limits result size", () => {
  assert.match(compiler, /safeIdentifier/);
  assert.match(compiler, /10_000/);
  assert.match(compiler, /compilePostgresQuery/);
  assert.match(compiler, /compileClickHouseQuery/);
});

test("CC semantic model centralizes reusable sales measures", () => {
  for (const measure of ["sales_count", "sales_amount", "commission_amount", "arpu", "unique_sellers"]) {
    assert.ok(model.includes(`id: \"${measure}\"`));
  }
});
