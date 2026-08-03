"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LiveSalesAreaDashboard } from "@/components/live-sales-area-dashboard";
import type { Profile } from "@/components/analytics-app-v2";
import {
  analyticsProfileColumns,
  mapAnalyticsProfile,
  type AnalyticsProfileRow,
} from "@/lib/analytics-profile";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

function currentMonthLabel() {
  return new Intl.DateTimeFormat("es-HN", {
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .replace(/^./, (value) => value.toUpperCase());
}

function ensureCurrentMonth() {
  const select = document.querySelector<HTMLSelectElement>(
    "main > div.mb-5 select",
  );
  if (!select) return;

  const currentMonth = currentMonthLabel();
  const exists = Array.from(select.options).some(
    (option) => option.value === currentMonth,
  );

  if (!exists) {
    select.insertBefore(
      new Option(currentMonth, currentMonth),
      select.options[1] || null,
    );
  }

  if (select.value !== currentMonth) {
    select.value = currentMonth;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function dashboardButton(title: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("aside nav button"),
  ).find((button) => button.title === title);
}

export function InitialDashboardController() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [executiveHost, setExecutiveHost] = useState<HTMLElement | null>(null);
  const initializedProfile = useRef<string | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  const hiddenLegacyRef = useRef<HTMLElement | null>(null);

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
    if (!profile) return;
    let cancelled = false;
    const timers: number[] = [];

    const removeExecutiveDashboard = () => {
      if (hiddenLegacyRef.current) {
        hiddenLegacyRef.current.style.display = "";
        hiddenLegacyRef.current = null;
      }
      hostRef.current?.remove();
      hostRef.current = null;
      setExecutiveHost(null);
    };

    const customizeExecutiveHeader = (host: HTMLElement) => {
      const dashboard = host.querySelector<HTMLElement>(
        ".cc-live-sales-dashboard",
      );
      const eyebrow = dashboard?.querySelector<HTMLElement>("p");
      const title = dashboard?.querySelector<HTMLElement>("h2");
      if (eyebrow) eyebrow.textContent = "Datos reales · Vista global";
      if (title) title.textContent = "Dashboard ejecutivo en tiempo real";
    };

    const sync = () => {
      if (cancelled) return;

      const heading =
        document.querySelector("header h1")?.textContent?.trim() || "";
      const desired =
        profile.role === "Administrador"
          ? "Dashboard ejecutivo"
          : "Dashboard de mi área";

      if (
        profile.role !== "Administrador" &&
        initializedProfile.current !== profile.id
      ) {
        const button = dashboardButton(desired);
        if (button) {
          initializedProfile.current = profile.id;
          button.click();
          timers.push(window.setTimeout(sync, 80));
          return;
        }
      }

      const showExecutive =
        profile.role === "Administrador" && heading === "Dashboard ejecutivo";

      if (!showExecutive) {
        removeExecutiveDashboard();
        return;
      }

      ensureCurrentMonth();
      const main = document.querySelector<HTMLElement>("main");
      if (!main) return;

      const legacy = Array.from(main.children).find(
        (element) =>
          element instanceof HTMLElement &&
          element.classList.contains("animate-in") &&
          element.id !== "cc-live-executive-host",
      ) as HTMLElement | undefined;

      let host = document.getElementById("cc-live-executive-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "cc-live-executive-host";
        main.insertBefore(host, legacy || main.querySelector("footer"));
      }

      if (legacy) {
        legacy.style.display = "none";
        hiddenLegacyRef.current = legacy;
      }

      hostRef.current = host;
      setExecutiveHost((current) => (current === host ? current : host));
      timers.push(
        window.setTimeout(() => customizeExecutiveHeader(host!), 0),
        window.setTimeout(() => customizeExecutiveHeader(host!), 250),
      );
    };

    const scheduleSync = () => {
      timers.push(window.setTimeout(sync, 0), window.setTimeout(sync, 120));
    };

    sync();
    [100, 300, 700, 1400, 2500].forEach((delay) =>
      timers.push(window.setTimeout(sync, delay)),
    );
    document.addEventListener("click", scheduleSync, true);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", scheduleSync, true);
      removeExecutiveDashboard();
    };
  }, [profile]);

  if (!profile || !executiveHost) return null;

  return createPortal(
    <LiveSalesAreaDashboard profile={profile} />,
    executiveHost,
  );
}
