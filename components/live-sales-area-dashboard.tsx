"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CircleDollarSign,
  Gauge,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

type SaleRow = {
  id: number;
  seller_id: string | null;
  seller_name: string;
  sale_date: string;
  amount_billed: number | string | null;
  sale_units: number | null;
  city: string | null;
  medium: string | null;
  zone: string;
};

type AnnouncedRow = {
  id: number;
  status: "anunciada" | "posteada" | "cancelada";
  announced_at: string;
  sale_units: number | null;
  city: string | null;
  zone: string;
};

type DashboardFilters = {
  month: string;
  region: string;
  city: string;
  channel: string;
};

const monthNames: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function currentMonthLabel() {
  return new Intl.DateTimeFormat("es-HN", {
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .replace(/^./, (value) => value.toUpperCase());
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function monthRange(label: string) {
  const normalized = label.trim().toLowerCase();
  const match = normalized.match(/^([a-záéíóúñ]+)\s+(\d{4})$/i);
  const month = match
    ? monthNames[
        match[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      ]
    : undefined;
  const year = match ? Number(match[2]) : Number.NaN;
  const base =
    month !== undefined && Number.isFinite(year)
      ? new Date(year, month, 1)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const previous = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return {
    start: isoDate(base),
    end: isoDate(next),
    previousStart: isoDate(previous),
  };
}

function readFilters(): DashboardFilters {
  const values = Array.from(
    document.querySelectorAll<HTMLSelectElement>("main > div.mb-5 select"),
  ).map((select) => select.value);
  return {
    month: values[0] || currentMonthLabel(),
    region: values[1] || "Todas las zonas",
    city: values[2] || "Todas las ciudades",
    channel: values[3] || "Todos los canales",
  };
}

function useVisibleDashboardFilters() {
  const [filters, setFilters] = useState<DashboardFilters>(() => ({
    month: currentMonthLabel(),
    region: "Todas las zonas",
    city: "Todas las ciudades",
    channel: "Todos los canales",
  }));

  useEffect(() => {
    const sync = () => setFilters(readFilters());
    sync();
    document.addEventListener("change", sync, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("change", sync, true);
      observer.disconnect();
    };
  }, []);

  return filters;
}

function units(value: number | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function amount(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    maximumFractionDigits: 0,
  }).format(value);
}

function percentageChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function Kpi({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  change: number;
  icon: React.ElementType;
}) {
  const positive = change >= 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-purple-400 to-violet-700" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-zinc-500">
            {label}
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-white">
            {value}
          </p>
        </div>
        <span className="rounded-xl bg-purple-500/10 p-2.5 text-purple-300">
          <Icon size={19} />
        </span>
      </div>
      <p
        className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${
          positive ? "text-emerald-400" : "text-rose-400"
        }`}
      >
        {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {Math.abs(change).toFixed(1)}%
        <span className="font-normal text-zinc-600">vs mes anterior</span>
      </p>
    </section>
  );
}

export function LiveSalesAreaDashboard({ profile }: { profile: Profile }) {
  const filters = useVisibleDashboardFilters();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [announced, setAnnounced] = useState<AnnouncedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const range = monthRange(filters.month);
    setError("");

    let salesQuery = supabase
      .from("analytics_sales")
      .select(
        "id,seller_id,seller_name,sale_date,amount_billed,sale_units,city,medium,zone",
      )
      .gte("sale_date", range.previousStart)
      .lt("sale_date", range.end)
      .order("sale_date", { ascending: true })
      .limit(50000);

    let announcedQuery = supabase
      .from("analytics_announced_sales")
      .select("id,status,announced_at,sale_units,city,zone")
      .gte("announced_at", `${range.start}T00:00:00`)
      .lt("announced_at", `${range.end}T00:00:00`)
      .limit(30000);

    if (filters.region !== "Todas las zonas") {
      salesQuery = salesQuery.eq("zone", filters.region);
      announcedQuery = announcedQuery.eq("zone", filters.region);
    }
    if (filters.city !== "Todas las ciudades") {
      salesQuery = salesQuery.eq("city", filters.city);
      announcedQuery = announcedQuery.eq("city", filters.city);
    }
    if (filters.channel !== "Todos los canales") {
      salesQuery = salesQuery.eq("medium", filters.channel);
    }

    const [salesResult, announcedResult] = await Promise.all([
      salesQuery,
      announcedQuery,
    ]);

    const firstError = salesResult.error || announcedResult.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setSales((salesResult.data || []) as SaleRow[]);
      setAnnounced((announcedResult.data || []) as AnnouncedRow[]);
      setUpdatedAt(new Date());
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`live-area-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analytics_sales" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "analytics_announced_sales",
        },
        () => void load(),
      )
      .subscribe();

    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [load, profile.id]);

  const range = useMemo(() => monthRange(filters.month), [filters.month]);
  const metrics = useMemo(() => {
    const current = sales.filter(
      (sale) => sale.sale_date >= range.start && sale.sale_date < range.end,
    );
    const previous = sales.filter(
      (sale) =>
        sale.sale_date >= range.previousStart && sale.sale_date < range.start,
    );

    const currentContracts = current.reduce(
      (sum, sale) => sum + units(sale.sale_units),
      0,
    );
    const previousContracts = previous.reduce(
      (sum, sale) => sum + units(sale.sale_units),
      0,
    );
    const currentAmount = current.reduce(
      (sum, sale) => sum + amount(sale.amount_billed),
      0,
    );
    const previousAmount = previous.reduce(
      (sum, sale) => sum + amount(sale.amount_billed),
      0,
    );
    const pendingAnnounced = announced
      .filter((row) => row.status === "anunciada")
      .reduce((sum, row) => sum + units(row.sale_units), 0);
    const conversionBase = currentContracts + pendingAnnounced;
    const conversion = conversionBase
      ? (currentContracts / conversionBase) * 100
      : 0;
    const arpu = currentContracts ? currentAmount / currentContracts : 0;
    const previousArpu = previousContracts
      ? previousAmount / previousContracts
      : 0;

    const byDay = new Map<string, number>();
    current.forEach((sale) => {
      const day = String(Number(sale.sale_date.slice(8, 10)));
      byDay.set(day, (byDay.get(day) || 0) + units(sale.sale_units));
    });
    const lastDay = new Date(
      Number(range.end.slice(0, 4)),
      Number(range.end.slice(5, 7)) - 1,
      0,
    ).getDate();
    const daily = Array.from({ length: lastDay }, (_, index) => ({
      day: String(index + 1),
      ventas: byDay.get(String(index + 1)) || 0,
    }));

    const rankingMap = new Map<
      string,
      { name: string; sales: number; amount: number }
    >();
    current.forEach((sale) => {
      const key = sale.seller_id || sale.seller_name.toLowerCase();
      const existing = rankingMap.get(key) || {
        name: sale.seller_name,
        sales: 0,
        amount: 0,
      };
      existing.sales += units(sale.sale_units);
      existing.amount += amount(sale.amount_billed);
      rankingMap.set(key, existing);
    });

    return {
      currentContracts,
      currentAmount,
      conversion,
      arpu,
      contractChange: percentageChange(currentContracts, previousContracts),
      amountChange: percentageChange(currentAmount, previousAmount),
      conversionChange: 0,
      arpuChange: percentageChange(arpu, previousArpu),
      daily,
      ranking: Array.from(rankingMap.values())
        .sort((a, b) => b.sales - a.sales || b.amount - a.amount)
        .slice(0, 10),
      pendingAnnounced,
    };
  }, [announced, range, sales]);

  return (
    <div className="cc-live-sales-dashboard animate-in space-y-4 text-white">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
            Datos reales · Supabase
          </p>
          <h2 className="mt-1 text-lg font-black">
            Ventas Digitales en tiempo real
          </h2>
          <p className="mt-1 text-[10px] text-zinc-500">
            Los indicadores quedan en cero cuando no existen ventas cargadas
            para el filtro seleccionado.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          Actualizar
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
          No se pudieron cargar los indicadores: {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Contratos"
          value={metrics.currentContracts.toLocaleString("es-HN")}
          change={metrics.contractChange}
          icon={BarChart3}
        />
        <Kpi
          label="Monto vendido"
          value={money(metrics.currentAmount)}
          change={metrics.amountChange}
          icon={CircleDollarSign}
        />
        <Kpi
          label="Conversión a posteo"
          value={`${metrics.conversion.toFixed(1)}%`}
          change={metrics.conversionChange}
          icon={Gauge}
        />
        <Kpi
          label="ARPU"
          value={money(metrics.arpu)}
          change={metrics.arpuChange}
          icon={Users}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Ventas por día</h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                {filters.month} · filtros visibles aplicados
              </p>
            </div>
            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300">
              {metrics.pendingAnnounced} anunciadas pendientes
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.daily}>
                <defs>
                  <linearGradient
                    id="liveSalesFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop stopColor="#a855f7" stopOpacity={0.42} />
                    <stop offset="1" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#24242b"
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  stroke="#52525b"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                />
                <YAxis
                  stroke="#52525b"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#121218",
                    border: "1px solid #30243d",
                    borderRadius: 12,
                    fontSize: 11,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="ventas"
                  stroke="#b56cff"
                  strokeWidth={2.5}
                  fill="url(#liveSalesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
          <div className="border-b border-white/[.06] p-5">
            <h3 className="text-sm font-bold text-zinc-100">
              Ranking del período
            </h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Suma real de unidades cargadas por vendedor
            </p>
          </div>
          <div className="max-h-80 overflow-auto">
            {metrics.ranking.map((seller, index) => (
              <div
                key={`${seller.name}-${index}`}
                className="flex items-center gap-3 border-b border-white/[.05] px-5 py-3 last:border-0"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-xs font-black text-purple-300">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-zinc-200">
                    {seller.name}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-600">
                    {money(seller.amount)}
                  </p>
                </div>
                <span className="text-lg font-black text-emerald-300">
                  {seller.sales}
                </span>
              </div>
            ))}
            {!metrics.ranking.length && (
              <div className="grid min-h-64 place-items-center p-6 text-center text-xs text-zinc-600">
                No hay ventas reportadas para este período.
              </div>
            )}
          </div>
        </section>
      </div>

      <p className="text-right text-[9px] text-zinc-700">
        Última actualización:{" "}
        {updatedAt ? updatedAt.toLocaleTimeString("es-HN") : "pendiente"}
      </p>
    </div>
  );
}
