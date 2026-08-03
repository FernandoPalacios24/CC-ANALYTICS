import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile("app/presentacion/page.tsx", "utf8");
const presentation = await readFile(
  "components/live-sales-presentation-v2.tsx",
  "utf8",
);

test("presentation route uses the production live screen", () => {
  assert.match(page, /LiveSalesPresentationV2/);
  assert.doesNotMatch(page, /LiveSalesPresentation\s/);
});

test("presentation counts sale units and reads seller goals", () => {
  assert.match(presentation, /sale_units/);
  assert.match(presentation, /analytics_seller_goals/);
  assert.match(presentation, /goal_units/);
  assert.match(presentation, /units\(row\.sale_units\)/);
  assert.match(presentation, /databaseGoal/);
  assert.doesNotMatch(presentation, /:\s*300/);
});

test("presentation refreshes on sales and goal changes", () => {
  assert.match(presentation, /table: "analytics_sales"/);
  assert.match(presentation, /table: "analytics_seller_goals"/);
  assert.match(presentation, /TIEMPO REAL/);
});
