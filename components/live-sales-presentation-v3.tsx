"use client";

import { useCallback, useEffect, useState } from "react";
import { LiveSalesPresentationV2 } from "@/components/live-sales-presentation-v2";
import { supabase } from "@/lib/supabase-client";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  return { start, end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01` };
}

function units(value: number | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function LiveSalesPresentationV3() {
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const month = params?.get("month") || currentMonth();
  const department = params?.get("department") || "Ventas Digitales";
  const zone = params?.get("zone") || "Zona Norte";
  const [projection, setProjection] = useState<number | null>(null);

  const loadProjection = useCallback(async () => {
    const { start, end } = monthBounds(month);
    const [{ data: sales, error: salesError }, { data: stats, error: statsError }] = await Promise.all([
      supabase.from("analytics_sales").select("sale_units").eq("department", department).eq("zone", zone).gte("sale_date", start).lt("sale_date", end).limit(50000),
      supabase.rpc("analytics_working_day_stats", {
        target_month: start,
        target_department: department,
        target_zone: zone,
        cutoff_date: new Date().toISOString().slice(0, 10),
      }),
    ]);
    if (salesError || statsError) return;
    const totalSales = (sales || []).reduce((sum, row) => sum + units(row.sale_units), 0);
    const row = Array.isArray(stats) ? stats[0] : null;
    const elapsed = Math.max(1, Number(row?.elapsed_working_days || 1));
    const total = Math.max(elapsed, Number(row?.total_working_days || elapsed));
    setProjection(Math.round((totalSales / elapsed) * total));
  }, [department, month, zone]);

  useEffect(() => {
    void loadProjection();
    const timer = window.setInterval(() => void loadProjection(), 15_000);
    const calendarHandler = () => void loadProjection();
    window.addEventListener("cc-business-calendar-changed", calendarHandler);
    const channel = supabase.channel("cc-live-calendar-projection")
      .on("postgres_changes", { event: "*", schema: "public", table: "analytics_sales" }, () => void loadProjection())
      .on("postgres_changes", { event: "*", schema: "public", table: "analytics_business_calendar" }, () => void loadProjection())
      .subscribe();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("cc-business-calendar-changed", calendarHandler);
      void supabase.removeChannel(channel);
    };
  }, [loadProjection]);

  useEffect(() => {
    if (projection === null) return;
    const apply = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".kpi-card"));
      const card = cards.find((item) => item.querySelector("p")?.textContent?.trim().toLowerCase() === "proyección");
      const value = card?.querySelector("strong");
      if (value) {
        value.textContent = String(projection);
        value.setAttribute("title", "Proyección calculada con días hábiles; domingos y asuetos quedan fuera.");
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [projection]);

  return <LiveSalesPresentationV2 />;
}
