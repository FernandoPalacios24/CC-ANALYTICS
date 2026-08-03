import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile("app/presentacion/page.tsx", "utf8");
const presentation = await readFile("components/live-sales-presentation-v2.tsx", "utf8");
const calendarProjection = await readFile("components/live-sales-presentation-v3.tsx", "utf8");
const calendarCenter = await readFile("components/business-calendar-center.tsx", "utf8");

test("presentation route uses the calendar-aware production live screen", () => {
  assert.match(page, /LiveSalesPresentationV3/);
  assert.match(calendarProjection, /LiveSalesPresentationV2/);
  assert.doesNotMatch(page, /LiveSalesPresentation\s/);
});

test("presentation counts sale units and reads seller goals", () => {
  assert.match(presentation, /sale_units/);
  assert.match(presentation, /analytics_seller_goals/);
  assert.match(presentation, /goal_units/);
  assert.match(presentation, /units\(row\.sale_units\)/);
  assert.match(presentation, /goals\.reduce/);
  assert.doesNotMatch(presentation, /:\s*300/);
  assert.doesNotMatch(presentation, /manualGoal/);
});

test("projection uses working days while sales remain counted", () => {
  assert.match(calendarProjection, /analytics_working_day_stats/);
  assert.match(calendarProjection, /elapsed_working_days/);
  assert.match(calendarProjection, /total_working_days/);
  assert.match(calendarProjection, /analytics_sales/);
  assert.match(calendarCenter, /domingos quedan fuera/i);
  assert.match(calendarCenter, /analytics_set_business_day/);
});

test("presentation refreshes on sales goal and calendar changes", () => {
  assert.match(presentation, /table: "analytics_sales"/);
  assert.match(presentation, /table: "analytics_seller_goals"/);
  assert.match(calendarProjection, /analytics_business_calendar/);
  assert.match(presentation, /TIEMPO REAL/);
});

test("presentation fits the approved one-screen hierarchy", () => {
  assert.match(presentation, /height:100dvh/);
  assert.match(presentation, /TOP 10 · POSICIONES 4 A 10/);
  assert.match(presentation, /TOP DE SUPERVISORES/);
  assert.match(presentation, /slice\(3, 10\)/);
  assert.match(presentation, /slice\(0, 6\)/);
});

test("top three use animated gold silver and bronze treatments", () => {
  assert.match(presentation, /podium-gold/);
  assert.match(presentation, /podium-silver/);
  assert.match(presentation, /podium-bronze/);
  assert.match(presentation, /@keyframes goldPulse/);
  assert.match(presentation, /@keyframes silverPulse/);
  assert.match(presentation, /@keyframes bronzePulse/);
  assert.match(presentation, /prefers-reduced-motion/);
});
