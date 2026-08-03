"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileSpreadsheet,
  MonitorUp,
  PencilLine,
  Presentation,
  Radio,
  X,
} from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { SalesCorrectionCenter } from "@/components/sales-correction-center";
import { SalesDataHubV2 } from "@/components/sales-data-hub-v2";
import type { Profile } from "@/components/analytics-app-v2";
import {
  analyticsProfileColumns,
  mapAnalyticsProfile,
  type AnalyticsProfileRow,
} from "@/lib/analytics-profile";
import { salesDepartments } from "@/lib/production-platform";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

export function AnalyticsRoot() {
  const [presentationAuthorized, setPresentationAuthorized] = useState(false);
  const [salesAuthorized, setSalesAuthorized] = useState(false);
  const [correctionAuthorized, setCorrectionAuthorized] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [insideReports, setInsideReports] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;

    async function checkAccess() {
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) {
        setPresentationAuthorized(false);
        setSalesAuthorized(false);
        setCorrectionAuthorized(false);
        setProfile(null);
        setProfiles([]);
        setSalesOpen(false);
        setCorrectionOpen(false);
        return;
      }

      const { data: current } = await supabase
        .from("analytics_profiles")
        .select(analyticsProfileColumns)
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!active || !current) return;

      let mapped: Profile;
      try {
        mapped = mapAnalyticsProfile(current as AnalyticsProfileRow);
      } catch {
        return;
      }

      const { data: directory } = await supabase
        .from("analytics_profiles")
        .select(analyticsProfileColumns)
        .order("full_name");
      if (!active) return;

      const mappedDirectory = (directory || []).flatMap((row) => {
        try {
          return [mapAnalyticsProfile(row as AnalyticsProfileRow)];
        } catch {
          return [];
        }
      });

      const isSalesScope = salesDepartments.includes(mapped.department);
      const isAdmin = mapped.role === "Administrador";
      const canOperateSales =
        mapped.active &&
        (isAdmin ||
          (isSalesScope &&
            ["Líder de departamento", "Supervisor", "Operador"].includes(
              mapped.role,
            )));
      const canCorrectSales =
        mapped.active &&
        (isAdmin ||
          (isSalesScope &&
            ["Líder de departamento", "Supervisor"].includes(mapped.role)));

      setProfile(mapped);
      setProfiles(
        mappedDirectory.some((item) => item.id === mapped.id)
          ? mappedDirectory
          : [mapped, ...mappedDirectory],
      );
      setSalesAuthorized(canOperateSales);
      setCorrectionAuthorized(canCorrectSales);
      setPresentationAuthorized(
        mapped.active &&
          (isAdmin ||
            (isSalesScope && mapped.role === "Líder de departamento")),
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
      const heading =
        document.querySelector("header h1")?.textContent?.trim() || "";
      setInsideReports(heading === "Reportes");
      setNavHost(document.querySelector<HTMLElement>("aside nav"));
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

      {salesAuthorized && navHost &&
        createPortal(
          <>
            <button
              title="Ingreso de ventas"
              onClick={() => {
                setCorrectionOpen(false);
                setSalesOpen(true);
              }}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                salesOpen
                  ? "bg-gradient-to-r from-emerald-600/20 to-cyan-500/[.04] text-emerald-200 shadow-[inset_2px_0_0_#34d399]"
                  : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-300"
              }`}
            >
              <FileSpreadsheet size={17} />
              <span className="truncate text-[11px] font-semibold">
                Ingreso de ventas
              </span>
              {salesOpen && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            {correctionAuthorized && (
              <button
                title="Corrección de datos"
                onClick={() => {
                  setSalesOpen(false);
                  setCorrectionOpen(true);
                }}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  correctionOpen
                    ? "bg-gradient-to-r from-purple-600/20 to-fuchsia-500/[.04] text-purple-200 shadow-[inset_2px_0_0_#a855f7]"
                    : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-300"
                }`}
              >
                <PencilLine size={17} />
                <span className="truncate text-[11px] font-semibold">
                  Corrección de datos
                </span>
                {correctionOpen && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-purple-400" />
                )}
              </button>
            )}
          </>,
          navHost,
        )}

      {salesOpen && profile && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#08080b]">
          <header className="sticky top-0 z-20 flex min-h-[74px] items-center justify-between border-b border-white/[.07] bg-[#09090d]/95 px-4 backdrop-blur-xl sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-400/80">
                Cable Color · {profile.department} · {profile.zone}
              </p>
              <h1 className="mt-1 text-lg font-black text-white">
                Ingreso de ventas
              </h1>
            </div>
            <button
              aria-label="Cerrar ingreso de ventas"
              onClick={() => setSalesOpen(false)}
              className="rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-400 hover:text-white"
            >
              <X size={19} />
            </button>
          </header>
          <main className="mx-auto max-w-[1800px] p-4 sm:p-6">
            <SalesDataHubV2 profile={profile} profiles={profiles} />
          </main>
        </div>
      )}

      {correctionOpen && correctionAuthorized && profile && (
        <SalesCorrectionCenter
          profile={profile}
          profiles={profiles}
          onClose={() => setCorrectionOpen(false)}
        />
      )}

      {presentationAuthorized &&
        insideReports &&
        !salesOpen &&
        !correctionOpen && (
          <aside className="fixed bottom-6 right-6 z-[70] w-[330px] overflow-hidden rounded-2xl border border-purple-400/25 bg-[#101016]/95 shadow-[0_25px_80px_rgba(0,0,0,.55),0_0_45px_rgba(168,85,247,.14)] backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-white/[.07] p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-purple-500/10 text-purple-300">
                <Presentation size={22} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-white">
                    Presentación en vivo
                  </h2>
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
