"use client";

import { useEffect, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { BusinessCalendarCenter } from "@/components/business-calendar-center";
import { supabase } from "@/lib/supabase-client";

function mapProfile(row: Record<string, unknown>, email: string): Profile {
  const name = String(row.full_name || email);
  const role = String(row.role);
  return {
    id: String(row.id),
    name,
    email,
    initials: name
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value[0])
      .join("")
      .toUpperCase(),
    role:
      role === "admin"
        ? "Administrador"
        : role === "leader"
          ? "Líder de departamento"
          : role === "supervisor"
            ? "Supervisor"
            : "Analista",
    jobProfile: String(row.job_profile || row.role || "Usuario"),
    department: String(row.department) as Profile["department"],
    zone: String(row.zone),
    active: String(row.status) === "activo",
    managerId: row.reports_to ? String(row.reports_to) : undefined,
  };
}

export function GlobalBusinessCalendar() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    setPathname(window.location.pathname);
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const { data: row } = await supabase
        .from("analytics_profiles")
        .select(
          "id,full_name,role,job_profile,department,zone,status,reports_to",
        )
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!active || !row) return;
      const mapped = mapProfile(
        row as Record<string, unknown>,
        data.session.user.email || "",
      );
      if (
        mapped.active &&
        ["Administrador", "Líder de departamento"].includes(mapped.role)
      ) {
        setProfile(mapped);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!profile || pathname !== "/") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-purple-400/25 bg-[#121218]/95 px-5 py-3 text-xs font-black text-purple-200 shadow-[0_18px_60px_rgba(0,0,0,.55),0_0_35px_rgba(168,85,247,.15)] backdrop-blur-xl transition hover:border-purple-300/50 hover:bg-purple-500/10 lg:left-auto lg:right-7 lg:translate-x-0"
        aria-label="Abrir calendario laboral global"
      >
        <CalendarDays size={17} /> Calendario laboral
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[190] bg-black/80 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Calendario laboral global"
        >
          <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden rounded-3xl border border-white/[.08] bg-[#08080b] shadow-2xl">
            <header className="flex items-center justify-between border-b border-white/[.07] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
                  Configuración central de reportes
                </p>
                <h2 className="mt-1 text-lg font-black text-white">
                  Calendario laboral
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/[.08] p-2.5 text-zinc-400 hover:text-white"
                aria-label="Cerrar calendario"
              >
                <X size={18} />
              </button>
            </header>
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
              <BusinessCalendarCenter profile={profile} />
            </main>
          </div>
        </div>
      )}
    </>
  );
}
