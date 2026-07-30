import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(configuredUrl && configuredKey);

// Los valores de respaldo solo permiten compilar antes de configurar el
// proyecto independiente. Nunca apuntan al Supabase de CC HUB.
const url = configuredUrl || "https://cc-analytics-not-configured.supabase.co";
const publishableKey = configuredKey || "sb_publishable_not_configured";

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "cc-analytics-auth",
  },
});
