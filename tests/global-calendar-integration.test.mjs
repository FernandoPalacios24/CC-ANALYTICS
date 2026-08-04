import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile("app/layout.tsx", "utf8");
const launcher = await readFile("components/global-business-calendar.tsx", "utf8");
const calendar = await readFile("components/business-calendar-center.tsx", "utf8");
const presentation = await readFile(
  "components/live-sales-presentation-v2.tsx",
  "utf8",
);

test("calendar is mounted inside CC Analytics instead of a separate page", async () => {
  assert.match(layout, /GlobalBusinessCalendar/);
  assert.match(launcher, /pathname !== "\/"/);
  await assert.rejects(access("app/calendario/page.tsx"));
});

test("calendar remains isolated from the live presentation", () => {
  assert.doesNotMatch(presentation, /analytics_month_calendar/);
  assert.doesNotMatch(presentation, /analytics_working_day_stats/);
  assert.doesNotMatch(presentation, /analytics_business_calendar/);
  assert.doesNotMatch(presentation, /MutationObserver/);
  assert.match(calendar, /analytics_month_calendar/);
  assert.match(calendar, /analytics_set_business_day/);
});

test("only authorized management roles receive the global control", () => {
  assert.match(launcher, /Administrador/);
  assert.match(launcher, /Líder de departamento/);
  assert.match(launcher, /mapped\.active/);
});
