"use client";

import { useCallback, useEffect } from "react";
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
  return {
    start,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
  };
}

export function LiveSalesPresentationV3() {
  const params =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const month = params?.get("month") || currentMonth();
  const department = params?.get("department") || "Ventas Digitales";
  const zone = params?.get("zone") || "Zona Norte";

  const warmCalendarCache = useCallback(async () => {
    const { start } = monthBounds(month);
    await supabase.rpc("analytics_working_day_stats", {
      target_month: start,
      target_department: department,
      target_zone: zone,
      cutoff_date: new Date().toISOString().slice(0, 10),
    });
  }, [department, month, zone]);

  useEffect(() => {
    void warmCalendarCache();
    const calendarHandler = () => void warmCalendarCache();
    window.addEventListener("cc-business-calendar-changed", calendarHandler);
    const channel = supabase
      .channel("cc-live-calendar-projection")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "analytics_business_calendar",
        },
        () => void warmCalendarCache(),
      )
      .subscribe();

    return () => {
      window.removeEventListener(
        "cc-business-calendar-changed",
        calendarHandler,
      );
      void supabase.removeChannel(channel);
    };
  }, [warmCalendarCache]);

  return <LiveSalesPresentationV2 />;
}
