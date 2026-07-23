import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("sellers are data records, never Analytics users", async () => {
  const [ui, auth, migration] = await Promise.all([
    read("components/analytics-app-v2.tsx"),
    read("components/auth-shell.tsx"),
    read("supabase/cc-analytics-integration.sql"),
  ]);

  assert.doesNotMatch(
    ui,
    /jobProfiles\s*=\s*\[[\s\S]*?"Ejecutivo de ventas"/,
  );
  assert.match(auth, /seller_profile_id:\s*null/);
  assert.match(auth, /supervisor_profile_id:/);
  assert.match(migration, /profiles_no_seller_analytics_access/);
  assert.match(migration, /Los vendedores no reciben acceso a CC Analytics/);
});

test("administrative invitations stay on the server and are audited", async () => {
  const [client, route, migration] = await Promise.all([
    read("lib/supabase-client.ts"),
    read("app/api/admin/invite/route.ts"),
    read("supabase/cc-analytics-integration.sql"),
  ]);

  assert.doesNotMatch(client, /createSignupClient/);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /inviteUserByEmail/);
  assert.match(route, /user_invite_requested/);
  assert.match(migration, /create table if not exists public\.analytics_audit_log/);
});

test("hierarchical RLS uses supervisors instead of seller identities", async () => {
  const migration = await read("supabase/cc-analytics-integration.sql");
  assert.match(migration, /supervisor_profile_id uuid/);
  assert.match(migration, /current_user_can_assign_supervisor/);
  assert.match(migration, /current_user_can_view_sale/);
  assert.match(
    migration,
    /create policy "analytics sales hierarchical select"/,
  );
});
