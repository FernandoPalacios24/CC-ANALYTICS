"use client";

import { useEffect, useState } from "react";
import { BusinessCalendarCenter } from "@/components/business-calendar-center";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

function mapProfile(row: Record<string, unknown>, email: string): Profile {
  const name = String(row.full_name || email);
  return {
    id: String(row.id),
    name,
    email,
    initials: name.split(/\s+/).slice(0, 2).map((value) => value[0]).join("").toUpperCase(),
    role: String(row.role) === "admin" ? "Administrador" : String(row.role) === "leader" ? "Líder de departamento" : String(row.role) === "supervisor" ? "Supervisor" : "Analista",
    jobProfile: String(row.job_profile || row.role || "Usuario"),
    department: String(row.department) as Profile["department"],
    zone: String(row.zone),
    active: String(row.status) === "activo",
    managerId: row.reports_to ? String(row.reports_to) : undefined,
  };
}

export default function CalendarPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setError("Inicia sesión antes de abrir el calendario laboral."); return; }
      const { data: row, error: profileError } = await supabase.from("analytics_profiles").select("id,full_name,role,job_profile,department,zone,status,reports_to").eq("id", data.session.user.id).maybeSingle();
      if (profileError || !row) { setError(profileError?.message || "No se pudo cargar el perfil."); return; }
      const mapped = mapProfile(row as Record<string, unknown>, data.session.user.email || "");
      if (!["Administrador", "Líder de departamento"].includes(mapped.role)) { setError("Solo Administración y líderes pueden editar el calendario laboral."); return; }
      setProfile(mapped);
    });
  }, []);
  if (error) return <main className="grid min-h-screen place-items-center bg-[#08080b] p-6 text-rose-300">{error}</main>;
  if (!profile) return <main className="grid min-h-screen place-items-center bg-[#08080b] text-zinc-500">Cargando calendario...</main>;
  return <main className="min-h-screen bg-[#08080b] p-4 sm:p-6"><div className="mx-auto max-w-[1600px]"><BusinessCalendarCenter profile={profile} /></div></main>;
}
