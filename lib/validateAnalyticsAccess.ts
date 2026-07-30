"use client";

import { supabase } from "./supabase-client";

export type AnalyticsAccess = {
  id: string;
  full_name: string;
  email: string;
  department: string;
  job_title: string;
  zone: string;
  role: "admin" | "leader" | "supervisor" | "analyst" | "uploader";
  reports_to: string | null;
  status: "activo" | "inactivo" | "suspendido";
};

export async function validateAnalyticsAccess(): Promise<AnalyticsAccess> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(`No se pudo validar la sesión: ${userError.message}`);
  }

  if (!user) {
    throw new Error("No se encontró una sesión válida.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("analytics_profiles")
    .select(
      "id,full_name,email,department,job_title,zone,role,reports_to,status",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `No se pudo verificar el acceso a CC Analytics: ${profileError.message}`,
    );
  }

  if (!profile || profile.status !== "activo") {
    await supabase.auth.signOut();
    throw new Error(
      "Tu cuenta de CC Analytics está inactiva o pendiente de aprobación.",
    );
  }

  return profile as AnalyticsAccess;
}
