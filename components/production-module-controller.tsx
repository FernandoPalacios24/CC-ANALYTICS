"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Department, Profile } from "@/components/analytics-app-v2";
import { DepartmentImportCenter } from "@/components/department-import-center";
import { RealAlertCenter } from "@/components/real-alert-center";
import {
  RealDepartmentDashboard,
  type ProductionFilters,
} from "@/components/real-department-dashboard";
import { RealExecutiveDashboard } from "@/components/real-executive-dashboard";
import { RealSalesDashboard } from "@/components/real-sales-dashboard";
import {
  analyticsProfileColumns,
  mapAnalyticsProfile,
  type AnalyticsProfileRow,
} from "@/lib/analytics-profile";
import {
  canSeeNav,
  departmentDefaultModule,
  moduleForHeading,
  moduleOwner,
  salesDepartments,
} from "@/lib/production-platform";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

const nativeHeadings = new Set([
  "Reportes",
  "Usuarios y permisos",
  "Auditoría y seguridad",
]);

function currentMonthLabel() {
  return new Intl.DateTimeFormat("es-HN", {
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .replace(/^./, (value) => value.toUpperCase());
}

function recentMonthLabels(total = 36) {
  const now = new Date();
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return new Intl.DateTimeFormat("es-HN", {
      month: "long",
      year: "numeric",
    })
      .format(date)
      .replace(/^./, (value) => value.toUpperCase());
  });
}

function applicationMain() {
  return document.querySelector<HTMLElement>("div.min-h-screen main");
}

function applicationHeading() {
  const main = applicationMain();
  const shell = main?.parentElement;
  return shell?.querySelector(":scope > header h1")?.textContent?.trim() || "";
}

function filterSelects() {
  const main = applicationMain();
  if (!main) return [];
  const bar = Array.from(main.children).find(
    (child) => child instanceof HTMLElement && child.classList.contains("mb-5"),
  );
  return bar
    ? Array.from(bar.querySelectorAll<HTMLSelectElement>("select"))
    : [];
}

function readFilters(): ProductionFilters {
  const selects = filterSelects();
  return {
    month: selects[0]?.value || currentMonthLabel(),
    region: selects[1]?.value || "Todas las zonas",
    city: selects[2]?.value || "Todas las ciudades",
    channel: selects[3]?.value || "Todos los canales",
  };
}

function sameFilters(a: ProductionFilters, b: ProductionFilters) {
  return (
    a.month === b.month &&
    a.region === b.region &&
    a.city === b.city &&
    a.channel === b.channel
  );
}

function navButton(title: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("aside nav button"),
  ).find((button) => button.title === title);
}

export function ProductionModuleController() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [heading, setHeading] = useState("");
  const [filters, setFilters] = useState<ProductionFilters>(() => ({
    month: currentMonthLabel(),
    region: "Todas las zonas",
    city: "Todas las ciudades",
    channel: "Todos los canales",
  }));
  const [host, setHost] = useState<HTMLElement | null>(null);
  const hiddenLegacy = useRef<HTMLElement | null>(null);
  const initializedProfile = useRef<string | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;

    async function loadProfile() {
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) {
        setProfile(null);
        initializedProfile.current = null;
        return;
      }
      const { data: current } = await supabase
        .from("analytics_profiles")
        .select(analyticsProfileColumns)
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!active || !current) return;
      try {
        setProfile(mapAnalyticsProfile(current as AnalyticsProfileRow));
      } catch {
        setProfile(null);
      }
    }

    void loadProfile();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void loadProfile());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextHeading = applicationHeading();
        setHeading((current) =>
          current === nextHeading ? current : nextHeading,
        );
        const nextFilters = readFilters();
        setFilters((current) =>
          sameFilters(current, nextFilters) ? current : nextFilters,
        );
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", sync, true);
    document.addEventListener("click", sync, true);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("change", sync, true);
      document.removeEventListener("click", sync, true);
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    let disposed = false;
    const timers: number[] = [];

    const syncNavigation = () => {
      if (disposed) return;
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>("aside nav button"),
      );
      buttons.forEach((button) => {
        const title = button.title;
        if (!moduleForHeading(title)) return;
        button.style.display = canSeeNav(profile, title) ? "" : "none";
      });

      if (initializedProfile.current !== profile.id) {
        const desired =
          profile.role === "Administrador"
            ? "Dashboard ejecutivo"
            : "Dashboard de mi área";
        const button = navButton(desired);
        if (button) {
          initializedProfile.current = profile.id;
          button.click();
        }
      }

      const monthSelect = filterSelects()[0];
      if (monthSelect) {
        const existing = new Set(
          Array.from(monthSelect.options).map((option) => option.value),
        );
        recentMonthLabels().forEach((month) => {
          if (!existing.has(month)) {
            monthSelect.add(new Option(month, month));
            existing.add(month);
          }
        });
        if (monthSelect.dataset.ccMonthProfile !== profile.id) {
          monthSelect.dataset.ccMonthProfile = profile.id;
          const currentMonth = currentMonthLabel();
          monthSelect.value = currentMonth;
          monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };

    syncNavigation();
    [80, 250, 700, 1600].forEach((delay) =>
      timers.push(window.setTimeout(syncNavigation, delay)),
    );
    const observer = new MutationObserver(syncNavigation);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
    };
  }, [profile]);

  useEffect(() => {
    const restore = () => {
      if (hiddenLegacy.current) {
        hiddenLegacy.current.style.display = "";
        hiddenLegacy.current = null;
      }
      hostRef.current?.remove();
      hostRef.current = null;
      setHost(null);
    };

    if (!profile || !heading || nativeHeadings.has(heading)) {
      restore();
      return;
    }

    const module = moduleForHeading(heading);
    if (!module || !canSeeNav(profile, heading)) {
      restore();
      return;
    }

    const main = applicationMain();
    if (!main) return;
    const legacy = Array.from(main.children).find(
      (child) =>
        child instanceof HTMLElement &&
        child.classList.contains("animate-in") &&
        child.id !== "cc-production-module-host",
    ) as HTMLElement | undefined;

    let nextHost = document.getElementById("cc-production-module-host");
    if (!nextHost) {
      nextHost = document.createElement("div");
      nextHost.id = "cc-production-module-host";
      main.insertBefore(nextHost, legacy || main.querySelector("footer"));
    }
    if (legacy) {
      legacy.style.display = "none";
      hiddenLegacy.current = legacy;
    }
    hostRef.current = nextHost;
    setHost((current) => (current === nextHost ? current : nextHost));

    return restore;
  }, [heading, profile]);

  const replacement = useMemo(() => {
    if (!profile || !host) return null;

    if (heading === "Dashboard ejecutivo") {
      return <RealExecutiveDashboard profile={profile} filters={filters} />;
    }

    if (heading === "Dashboard de mi área") {
      if (salesDepartments.includes(profile.department)) {
        return (
          <RealSalesDashboard
            profile={profile}
            department={profile.department}
            title={`${profile.department} en tiempo real`}
            filters={filters}
          />
        );
      }
      const moduleKey = departmentDefaultModule[profile.department];
      return (
        <RealDepartmentDashboard
          profile={profile}
          department={profile.department}
          moduleKey={moduleKey}
          title={`${profile.department} en tiempo real`}
          filters={filters}
          onOpenImport={
            profile.role === "Analista"
              ? undefined
              : () => navButton("Importar datos")?.click()
          }
        />
      );
    }

    if (heading === "Importar datos") {
      const initialDepartment: Department =
        profile.role === "Administrador" ? "Marketing" : profile.department;
      return (
        <DepartmentImportCenter
          profile={profile}
          filters={filters}
          initialDepartment={initialDepartment}
        />
      );
    }

    if (heading === "Centro de alertas") {
      return (
        <RealAlertCenter
          profile={profile}
          filters={filters}
          onNavigate={(target) => navButton(target)?.click()}
        />
      );
    }

    if (heading === "Proyecciones") {
      if (salesDepartments.includes(profile.department)) {
        return (
          <RealSalesDashboard
            profile={profile}
            department={profile.department}
            title={`Proyección de ${profile.department}`}
            filters={filters}
          />
        );
      }
      if (profile.role === "Administrador") {
        return <RealExecutiveDashboard profile={profile} filters={filters} />;
      }
      const moduleKey = departmentDefaultModule[profile.department];
      return (
        <RealDepartmentDashboard
          profile={profile}
          department={profile.department}
          moduleKey={moduleKey}
          title={`Proyección de ${profile.department}`}
          filters={filters}
          projectionMode
        />
      );
    }

    const module = moduleForHeading(heading);
    if (!module) return null;
    const department = moduleOwner(module, profile);

    if (module.moduleKey === "sales" && module.ownerDepartment) {
      return (
        <RealSalesDashboard
          profile={profile}
          department={department}
          title={module.title}
          filters={filters}
        />
      );
    }

    if (module.kind !== "metrics") return null;
    return (
      <RealDepartmentDashboard
        profile={profile}
        department={department}
        moduleKey={module.moduleKey}
        title={module.title}
        filters={filters}
        onOpenImport={
          profile.role === "Analista" || salesDepartments.includes(profile.department)
            ? undefined
            : () => navButton("Importar datos")?.click()
        }
      />
    );
  }, [filters, heading, host, profile]);

  if (!host || !replacement) return null;
  return createPortal(replacement, host);
}
