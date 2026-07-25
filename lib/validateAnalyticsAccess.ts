"use client";

import { supabase } from "./supabase-client";

export type AnalyticsAccess = {
  app_code: string;
  role_code: string;
  profile_name: string | null;
  department: string | null;
  zone: string | null;
  active: boolean;
};

export async function validateAnalyticsAccess(): Promise<AnalyticsAccess> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(
      `No se pudo validar la sesión: ${userError.message}`
    );
  }

  if (!user) {
    throw new Error("No se encontró una sesión válida.");
  }

  const { data: access, error: accessError } = await supabase
    .from("app_memberships")
    .select(`
      app_code,
      role_code,
      profile_name,
      department,
      zone,
      active
    `)
    .eq("user_id", user.id)
    .eq("app_code", "cc_analytics")
    .eq("active", true)
    .maybeSingle();

  if (accessError) {
    throw new Error(
      `No se pudo verificar el acceso a CC Analytics: ${accessError.message}`
    );
  }

  if (!access) {
    await supabase.auth.signOut();

    throw new Error(
      "Tu cuenta existe, pero no tiene acceso autorizado a CC Analytics."
    );
  }

  return access as AnalyticsAccess;
}