"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Gauge,
  Loader2,
  RefreshCw,
  Target,
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
import type { Department, Profile } from "@/components/analytics-app-v2";
import type { ProductionFilters } from "@/components/real-department-dashboard";
import { supabase } from "@/lib/supabase-client";

type Sale = {
  id: number;
  seller_id: string | null;
  seller_name: string;
  sale_date: string;
  sale_units: number | null;
  amount_billed: number | string | null;
  city: string | null;
  medium: string | null;
  department: string;
  zone: string;
};

type Announced = {
  status: string;
  sale_units: number | null;
  announced_at: string;
  department: string;
  zone: string;
  city: string | null;
};

type Goal = {
  seller_id: string;
  goal_month: string;
  goal_units: number;
};

function monthIso(label: string) {
  const months: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = normalized.match(/^([a-z]+)\s+(\d{4})$/);
  if (!match || !months[match[1]]) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return `${match[2]}-${String(months[match[1]]).padStart(2, "0")}-01`;
}

function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function previousMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
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

function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Kpi({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  change?: number;
  icon: React.ElementType;
}) {
  const positive = (change || 0) >= 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-purple-400 to-violet-700" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-zinc-500">{label}</p>
          <p className="mt-3 text-2xl font-black text-white">{value}</p>
        </div>
        <span className="rounded-xl bg-purple-500/10 p-2.5 text-purple-300"><Icon size={19} /></span>
      </div>
      {change !== undefined && (
        <p className={`mt-3 flex items-center gap-1 text-xs font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {Math.abs(change).toFixed(1)}%
          <span className="font-normal text-zinc-600">vs mes anterior</span>
        </p>
      )}
    </section>
  );
}

export function RealSalesDashboard({
  profile,
  department,
  title,
  filters,
}: {
  profile: Profile;
  department: Department;
  title: string;
  filters: ProductionFilters;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [announced, setAnnounced] = useState<Announced[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const current = useMemo(() => monthIso(filters.month), [filters.month]);
  const previous = useMemo(() => previousMonth(current), [current]);
  const end = useMemo(() => nextMonth(current), [current]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let saleQuery = supabase
      .from("analytics_sales")
      .select("id,seller_id,seller_name,sale_date,sale_units,amount_billed,city,medium,department,zone")
      .eq("department", department)
      .gte("sale_date", previous)
      .lt("sale_date", end)
      .limit(100000);
    let announcedQuery = supabase
      .from("analytics_announced_sales")
      .select("status,sale_units,announced_at,department,zone,city")
      .eq("department", department)
      .gte("announced_at", `${current}T00:00:00`)
      .lt("announced_at", `${end}T00:00:00`)
      .limit(50000);

    if (filters.region !== "Todas las zonas") {
      saleQuery = saleQuery.eq("zone", filters.region);
      announcedQuery = announcedQuery.eq("zone", filters.region);
    }
    if (filters.city !== "Todas las ciudades") {
      saleQuery = saleQuery.eq("city", filters.city);
      announcedQuery = announcedQuery.eq("city", filters.city);
    }
    if (filters.channel !== "Todos los canales") {
      saleQuery = saleQuery.eq("medium", filters.channel);
    }

    const [saleResult, announcedResult, goalResult] = await Promise.all([
      saleQuery,
      announcedQuery,
      supabase
        .from("analytics_seller_goals")
        .select("seller_id,goal_month,goal_units")
        .eq("department", department)
        .eq("goal_month", current),
    ]);

    const firstError = saleResult.error || announcedResult.error || goalResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setSales((saleResult.data || []) as Sale[]);
    setAnnounced((announcedResult.data || []) as Announced[]);
    setGoals((goalResult.data || []) as Goal[]);
    setLoading(false);
  }, [current, department, end, filters.channel, filters.city, filters.region, previous]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`real-sales-${department}-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "analytics_sales" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "analytics_announced_sales" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "analytics_seller_goals" }, () => void load())
      .subscribe();
    const handler = () => void load();
    window.addEventListener("cc-analytics-data-changed", handler);
    return () => {
      window.removeEventListener("cc-analytics-data-changed", handler);
      void supabase.removeChannel(channel);
    };
  }, [department, load, profile.id]);

  const metrics = useMemo(() => {
    const currentRows = sales.filter((sale) => sale.sale_date >= current && sale.sale_date < end);
    const previousRows = sales.filter((sale) => sale.sale_date >= previous && sale.sale_date < current);
    const contracts = currentRows.reduce((sum, sale) => sum + units(sale.sale_units), 0);
    const previousContracts = previousRows.reduce((sum, sale) => sum + units(sale.sale_units), 0);
    const billed = currentRows.reduce((sum, sale) => sum + amount(sale.amount_billed), 0);
    const previousBilled = previousRows.reduce((sum, sale) => sum + amount(sale.amount_billed), 0);
    const goal = goals.reduce((sum, row) => sum + Number(row.goal_units || 0), 0);
    const compliance = goal ? (contracts / goal) * 100 : 0;
    const pending = announced
      .filter((sale) => sale.status === "anunciada")
      .reduce((sum, sale) => sum + units(sale.sale_units), 0);
    const conversion = contracts + pending ? (contracts / (contracts + pending)) * 100 : 0;
    const arpu = contracts ? billed / contracts : 0;

    const byDay = new Map<string, number>();
    currentRows.forEach((sale) => {
      const day = String(Number(sale.sale_date.slice(8, 10)));
      byDay.set(day, (byDay.get(day) || 0) + units(sale.sale_units));
    });
    const days = new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, 0).getDate();
    const daily = Array.from({ length: days }, (_, index) => ({
      day: String(index + 1),
      ventas: byDay.get(String(index + 1)) || 0,
    }));

    const rankingMap = new Map<string, { name: string; units: number; amount: number; goal: number }>();
    currentRows.forEach((sale) => {
      const key = sale.seller_id || sale.seller_name.toLowerCase();
      const row = rankingMap.get(key) || { name: sale.seller_name, units: 0, amount: 0, goal: 0 };
      row.units += units(sale.sale_units);
      row.amount += amount(sale.amount_billed);
      rankingMap.set(key, row);
    });
    goals.forEach((goalRow) => {
      const row = rankingMap.get(goalRow.seller_id);
      if (row) row.goal = Number(goalRow.goal_units || 0);
    });

    return {
      contracts,
      billed,
      goal,
      compliance,
      conversion,
      arpu,
      pending,
      contractChange: percentChange(contracts, previousContracts),
      amountChange: percentChange(billed, previousBilled),
      daily,
      ranking: Array.from(rankingMap.values()).sort((a, b) => b.units - a.units || b.amount - a.amount),
    };
  }, [announced, current, end, goals, previous, sales]);

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Datos reales · Supabase</p>
          <h2 className="mt-1 text-xl font-black">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{filters.month} · {filters.region}. Ventas, metas y vendedores autorizados.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          Actualizar
        </button>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300"><AlertTriangle className="mr-2 inline" size={15} /> {error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Contratos" value={metrics.contracts.toLocaleString("es-HN")} change={metrics.contractChange} icon={BarChart3} />
        <Kpi label="Monto vendido" value={money(metrics.billed)} change={metrics.amountChange} icon={CircleDollarSign} />
        <Kpi label="Cumplimiento de meta" value={`${metrics.compliance.toFixed(1)}%`} icon={Target} />
        <Kpi label="Conversión a posteo" value={`${metrics.conversion.toFixed(1)}%`} icon={Gauge} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">Ventas por día</h3>
              <p className="mt-1 text-[11px] text-zinc-500">Suma real de unidades cargadas.</p>
            </div>
            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-300">{metrics.pending} anunciadas pendientes</span>
          </div>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.daily}>
                <defs><linearGradient id="salesScopeFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#a855f7" stopOpacity={0.42} /><stop offset="1" stopColor="#a855f7" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#24242b" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="day" stroke="#52525b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#121218", border: "1px solid #30243d", borderRadius: 12 }} />
                <Area dataKey="ventas" stroke="#b56cff" strokeWidth={2.5} fill="url(#salesScopeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
          <div className="border-b border-white/[.06] p-5">
            <h3 className="text-sm font-black">Ranking del período</h3>
            <p className="mt-1 text-[11px] text-zinc-500">Incluye meta individual cuando está configurada.</p>
          </div>
          <div className="max-h-80 overflow-auto">
            {metrics.ranking.slice(0, 15).map((seller, index) => (
              <div key={`${seller.name}-${index}`} className="flex items-center gap-3 border-b border-white/[.05] px-5 py-3 last:border-0">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-xs font-black text-purple-300">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-zinc-200">{seller.name}</p>
                  <p className="mt-1 text-[9px] text-zinc-600">{money(seller.amount)} · meta {seller.goal || 0}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-emerald-300">{seller.units}</p>
                  <p className="text-[9px] text-zinc-600">{seller.goal ? `${((seller.units / seller.goal) * 100).toFixed(0)}%` : "sin meta"}</p>
                </div>
              </div>
            ))}
            {!metrics.ranking.length && <div className="grid min-h-64 place-items-center p-6 text-center text-xs text-zinc-600">No hay ventas reportadas para el período.</div>}
          </div>
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Meta del equipo</p><p className="mt-2 text-2xl font-black text-purple-200">{metrics.goal}</p></div>
        <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">ARPU</p><p className="mt-2 text-2xl font-black text-cyan-200">{money(metrics.arpu)}</p></div>
        <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Vendedores con venta</p><p className="mt-2 text-2xl font-black text-emerald-200"><Users className="mr-2 inline" size={20} />{metrics.ranking.length}</p></div>
      </section>
    </div>
  );
}
