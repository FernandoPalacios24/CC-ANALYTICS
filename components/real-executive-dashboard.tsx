"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Profile } from "@/components/analytics-app-v2";
import type { ProductionFilters } from "@/components/real-department-dashboard";
import { supabase } from "@/lib/supabase-client";

type Sale = {
  sale_date: string;
  sale_units: number | null;
  amount_billed: number | string | null;
  department: string;
  zone: string;
};

type Metric = {
  department: string;
  module_key: string;
  zone: string;
  period_month: string;
  value: number | string;
  target_value: number | string | null;
  updated_at: string;
};

type ImportRow = {
  id: string;
  file_name: string;
  department: string;
  zone: string;
  module: string;
  row_count: number;
  created_at: string;
};

type Completeness = {
  id: string;
  department: string;
  complete: boolean;
  missing_fields: string[] | null;
  status: string;
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

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function units(value: number | null) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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
      <div className="flex items-start justify-between">
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

export function RealExecutiveDashboard({
  profile,
  filters,
}: {
  profile: Profile;
  filters: ProductionFilters;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [profiles, setProfiles] = useState<Completeness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const currentMonth = useMemo(() => monthIso(filters.month), [filters.month]);
  const previous = useMemo(() => previousMonth(currentMonth), [currentMonth]);
  const end = useMemo(() => nextMonth(currentMonth), [currentMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    let salesQuery = supabase
      .from("analytics_sales")
      .select("sale_date,sale_units,amount_billed,department,zone")
      .gte("sale_date", previous)
      .lt("sale_date", end)
      .limit(100000);

    let metricQuery = supabase
      .from("analytics_metric_values")
      .select("department,module_key,zone,period_month,value,target_value,updated_at")
      .in("period_month", [previous, currentMonth])
      .limit(100000);

    let importQuery = supabase
      .from("analytics_imports")
      .select("id,file_name,department,zone,module,row_count,created_at")
      .gte("created_at", `${currentMonth}T00:00:00`)
      .lt("created_at", `${end}T00:00:00`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (filters.region !== "Todas las zonas") {
      salesQuery = salesQuery.eq("zone", filters.region);
      metricQuery = metricQuery.eq("zone", filters.region);
      importQuery = importQuery.eq("zone", filters.region);
    }

    const [salesResult, metricResult, importResult, profileResult] = await Promise.all([
      salesQuery,
      metricQuery,
      importQuery,
      supabase
        .from("analytics_profile_completeness")
        .select("id,department,complete,missing_fields,status"),
    ]);

    const firstError = salesResult.error || metricResult.error || importResult.error || profileResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setSales((salesResult.data || []) as Sale[]);
    setMetrics((metricResult.data || []) as Metric[]);
    setImports((importResult.data || []) as ImportRow[]);
    setProfiles((profileResult.data || []) as Completeness[]);
    setLoading(false);
  }, [currentMonth, end, filters.region, previous]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const handler = () => void load();
    window.addEventListener("cc-analytics-data-changed", handler);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("cc-analytics-data-changed", handler);
    };
  }, [load]);

  const stats = useMemo(() => {
    const currentSales = sales.filter((sale) => sale.sale_date >= currentMonth && sale.sale_date < end);
    const previousSales = sales.filter((sale) => sale.sale_date >= previous && sale.sale_date < currentMonth);
    const contracts = currentSales.reduce((sum, sale) => sum + units(sale.sale_units), 0);
    const previousContracts = previousSales.reduce((sum, sale) => sum + units(sale.sale_units), 0);
    const amount = currentSales.reduce((sum, sale) => sum + numberValue(sale.amount_billed), 0);
    const previousAmount = previousSales.reduce((sum, sale) => sum + numberValue(sale.amount_billed), 0);
    const currentMetrics = metrics.filter((metric) => metric.period_month === currentMonth);
    const reportingDepartments = new Set([
      ...currentSales.map((sale) => sale.department),
      ...currentMetrics.map((metric) => metric.department),
    ]).size;
    const activeProfiles = profiles.filter((row) => row.status === "activo");
    const completeProfiles = activeProfiles.filter((row) => row.complete).length;
    const profileQuality = activeProfiles.length ? (completeProfiles / activeProfiles.length) * 100 : 0;

    const dayMap = new Map<string, number>();
    currentSales.forEach((sale) => {
      const day = String(Number(sale.sale_date.slice(8, 10)));
      dayMap.set(day, (dayMap.get(day) || 0) + units(sale.sale_units));
    });
    const totalDays = new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, 0).getDate();
    const daily = Array.from({ length: totalDays }, (_, index) => ({
      day: String(index + 1),
      ventas: dayMap.get(String(index + 1)) || 0,
    }));

    const byDepartment = new Map<string, { department: string; sales: number; metrics: number; imports: number }>();
    [...new Set([
      ...currentSales.map((sale) => sale.department),
      ...currentMetrics.map((metric) => metric.department),
      ...imports.map((item) => item.department),
    ])].forEach((department) => {
      byDepartment.set(department, { department, sales: 0, metrics: 0, imports: 0 });
    });
    currentSales.forEach((sale) => {
      const row = byDepartment.get(sale.department);
      if (row) row.sales += units(sale.sale_units);
    });
    currentMetrics.forEach((metric) => {
      const row = byDepartment.get(metric.department);
      if (row) row.metrics += 1;
    });
    imports.forEach((item) => {
      const row = byDepartment.get(item.department);
      if (row) row.imports += 1;
    });

    return {
      contracts,
      amount,
      reportingDepartments,
      profileQuality,
      contractChange: percentChange(contracts, previousContracts),
      amountChange: percentChange(amount, previousAmount),
      daily,
      departments: Array.from(byDepartment.values()).sort((a, b) => b.sales - a.sales || b.metrics - a.metrics),
    };
  }, [currentMonth, end, imports, metrics, previous, profiles, sales]);

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Datos reales · Vista nacional</p>
          <h2 className="mt-1 text-xl font-black">Dashboard ejecutivo en tiempo real</h2>
          <p className="mt-1 text-xs text-zinc-500">{filters.month} · {filters.region}. Sin cifras de demostración.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          Actualizar
        </button>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
          <AlertTriangle className="mr-2 inline" size={15} /> {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ventas acumuladas" value={stats.contracts.toLocaleString("es-HN")} change={stats.contractChange} icon={BarChart3} />
        <Kpi label="Monto vendido" value={money(stats.amount)} change={stats.amountChange} icon={CircleDollarSign} />
        <Kpi label="Áreas reportando" value={stats.reportingDepartments.toLocaleString("es-HN")} icon={Database} />
        <Kpi label="Perfiles completos" value={`${stats.profileQuality.toFixed(1)}%`} icon={Users} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <h3 className="text-sm font-black">Ventas diarias consolidadas</h3>
          <p className="mt-1 text-[11px] text-zinc-500">Suma real de unidades visibles para el alcance seleccionado.</p>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.daily}>
                <defs>
                  <linearGradient id="executiveSales" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#a855f7" stopOpacity={0.42} />
                    <stop offset="1" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#24242b" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="day" stroke="#52525b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#121218", border: "1px solid #30243d", borderRadius: 12 }} />
                <Area dataKey="ventas" stroke="#b56cff" strokeWidth={2.5} fill="url(#executiveSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <h3 className="text-sm font-black">Actividad por departamento</h3>
          <p className="mt-1 text-[11px] text-zinc-500">Ventas, indicadores y archivos reales del período.</p>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.departments} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid stroke="#24242b" strokeDasharray="3 4" horizontal={false} />
                <XAxis type="number" stroke="#52525b" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="department" width={115} stroke="#71717a" tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ background: "#121218", border: "1px solid #30243d", borderRadius: 12 }} />
                <Bar dataKey="sales" name="Ventas" fill="#a855f7" radius={[0, 6, 6, 0]} />
                <Bar dataKey="metrics" name="Indicadores" fill="#06b6d4" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
          <div className="border-b border-white/[.06] p-5">
            <h3 className="text-sm font-black">Últimas fuentes cargadas</h3>
            <p className="mt-1 text-[11px] text-zinc-500">Trazabilidad de archivos del mes.</p>
          </div>
          <div className="max-h-72 overflow-auto">
            {imports.slice(0, 12).map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-b border-white/[.05] px-5 py-3 last:border-0">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300"><Database size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-zinc-200">{item.file_name}</p>
                  <p className="mt-1 text-[9px] text-zinc-600">{item.department} · {item.zone} · {item.row_count} filas</p>
                </div>
                <span className="text-[9px] text-zinc-600">{new Date(item.created_at).toLocaleString("es-HN")}</span>
              </div>
            ))}
            {!imports.length && (
              <div className="p-8 text-center text-xs text-zinc-600">No hay archivos cargados en el período.</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <h3 className="text-sm font-black">Control corporativo</h3>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] p-4">
              <span className="flex items-center gap-2 text-xs text-zinc-300"><ShieldCheck size={16} className="text-purple-300" /> Calidad de perfiles</span>
              <b className="text-purple-200">{stats.profileQuality.toFixed(1)}%</b>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] p-4">
              <span className="flex items-center gap-2 text-xs text-zinc-300"><CheckCircle2 size={16} className="text-emerald-300" /> Áreas con datos</span>
              <b className="text-emerald-300">{stats.reportingDepartments}</b>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] p-4">
              <span className="flex items-center gap-2 text-xs text-zinc-300"><Database size={16} className="text-cyan-300" /> Archivos del mes</span>
              <b className="text-cyan-300">{imports.length}</b>
            </div>
          </div>
        </section>
      </div>

      <p className="text-right text-[9px] text-zinc-700">Perfil activo: {profile.name} · {profile.role}</p>
    </div>
  );
}
