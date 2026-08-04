import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entry = await readFile(
  "components/live-sales-presentation-v3.tsx",
  "utf8",
);

test("calendar failures cannot clear live sales presentation data", () => {
  assert.match(entry, /LiveSalesPresentationV2/);
  assert.doesNotMatch(entry, /MutationObserver/);
  assert.doesNotMatch(entry, /analytics_working_day_stats/);
  assert.doesNotMatch(entry, /analytics_business_calendar/);
  assert.doesNotMatch(entry, /supabase\.rpc/);
  assert.doesNotMatch(entry, /postgres_changes/);
});
