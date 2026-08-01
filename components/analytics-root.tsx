"use client";

import { useEffect, useState } from "react";
import { MonitorUp, Presentation, Radio } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

export function AnalyticsRoot() {
  const [authorized, setAuthorized] = useState(false);
  const [insideReports, setInsideReports] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;

    async function checkAccess() {
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) {
        setAuthorized(false);
        return;
      }
      const { data: profile } = await supabase
        .from("analytics_profiles")
        .select("role,status")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!active) return;
      setAuthorized(
        profile?.status === "activo" &&
          (profile?.role === "leader" || profile?.role === "admin"),
      );
    }

    void checkAccess();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void checkAccess());

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const detect = () => {
      const heading = document.querySelector("header h1")?.textContent?.trim();
      setInsideReports(heading === "Reportes");
    };
    detect();
    const observer = new MutationObserver(detect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);

  function openPresentation() {
    const popup = window.open(
      "/presentacion",
      "cc-analytics-presentacion",
      "popup=yes,width=1920,height=1080,left=0,top=0",
    );
    if (!popup) window.location.href = "/presentacion";
    else popup.focus();
  }

  return (
    <>
      <AuthShell />
      {authorized && insideReports && (
        <aside className="fixed bottom-6 right-6 z-[70] w-[330px] overflow-hidden rounded-2xl border border-purple-400/25 bg-[#101016]/95 shadow-[0_25px_80px_rgba(0,0,0,.55),0_0_45px_rgba(168,85,247,.14)] backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/[.07] p-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-purple-500/10 text-purple-300">
              <Presentation size={22} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-white">Presentación en vivo</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-300">
                  <Radio size={9} /> LIVE
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-zinc-500">
                Podio, ranking y ventas actualizadas para el TV del departamento.
              </p>
            </div>
          </div>
          <div className="p-4">
            <button
              onClick={openPresentation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3 text-xs font-black text-white shadow-[0_0_28px_rgba(168,85,247,.22)]"
            >
              <MonitorUp size={17} /> Abrir en segunda pantalla
            </button>
            <p className="mt-2 text-center text-[9px] text-zinc-600">
              Mueve la ventana al TV y activa pantalla completa.
            </p>
          </div>
        </aside>
      )}
    </>
  );
}
