"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Download,
  FileDown,
  Loader2,
  RefreshCw,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
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
  seller_code: string | null;
  supervisor_profile_id: string | null;
  team: string | null;
  sale_date: string;
  sale_units: number | null;
  amount_billed: number | string | null;
  department: string;
  zone: string;
  city: string | null;
  medium: string | null;
  service: string | null;
  contract_service: string | null;
};

type RankingRow = {
  key: string;
  name: string;
  supervisor: string;
  units: number;
  amount: number;
};

const SAFE_ROW_LIMIT = 5_000;

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function units(value: number | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function amount(value: number | string | null | undefined) {
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

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function ReportStudioV3({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const [month, setMonth] = useState(currentMonth());
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState(
    "Muéstrame el resumen mensual, ranking de supervisores y vendedores.",
  );
  const [view, setView] = useState<"summary" | "supervisors" | "sellers" | "cities">("summary");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    const { start, end } = monthBounds(month);
    let query = supabase
      .from("analytics_sales")
      .select(
        "id,seller_id,seller_name,seller_code,supervisor_profile_id,team,sale_date,sale_units,amount_billed,department,zone,city,medium,service,contract_service",
      )
      .gte("sale_date", start)
      .lt("sale_date", end)
      .order("sale_date", { ascending: false })
      .limit(SAFE_ROW_LIMIT);

    if (profile.role !== "Administrador") {
      query = query.eq("department", profile.department);
      if (profile.zone !== "Nacional") query = query.eq("zone", profile.zone);
    }

    const { data, error: loadError } = await query;
    if (loadError) setError(loadError.message);
    else {
      const rows = (data || []) as SaleRow[];
      setSales(rows);
      if (rows.length >= SAFE_ROW_LIMIT) {
        setNotice(
          `Se muestran las primeras ${SAFE_ROW_LIMIT.toLocaleString("es-HN")} filas del mes para proteger el rendimiento.`,
        );
      }
    }
    setLoading(false);
  }, [month, profile.department, profile.role, profile.zone]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = useMemo(() => {
    const profileNames = new Map(profiles.map((item) => [item.id, item.name]));
    const sellers = new Map<string, RankingRow>();
    const supervisors = new Map<string, RankingRow>();
    const cities = new Map<string, RankingRow>();

    sales.forEach((sale) => {
      const saleUnits = units(sale.sale_units);
      const saleAmount = amount(sale.amount_billed);
      const supervisor =
        (sale.supervisor_profile_id && profileNames.get(sale.supervisor_profile_id)) ||
        sale.team ||
        "Sin supervisor";
      const sellerKey = sale.seller_id || sale.seller_code || sale.seller_name;
      const seller = sellers.get(sellerKey) || {
        key: sellerKey,
        name: sale.seller_name || "Sin vendedor",
        supervisor,
        units: 0,
        amount: 0,
      };
      seller.units += saleUnits;
      seller.amount += saleAmount;
      sellers.set(sellerKey, seller);

      const supervisorKey = sale.supervisor_profile_id || supervisor;
      const supervisorRow = supervisors.get(supervisorKey) || {
        key: supervisorKey,
        name: supervisor,
        supervisor: "",
        units: 0,
        amount: 0,
      };
      supervisorRow.units += saleUnits;
      supervisorRow.amount += saleAmount;
      supervisors.set(supervisorKey, supervisorRow);

      const cityName = sale.city?.trim() || "Sin ciudad";
      const cityRow = cities.get(cityName) || {
        key: cityName,
        name: cityName,
        supervisor: "",
        units: 0,
        amount: 0,
      };
      cityRow.units += saleUnits;
      cityRow.amount += saleAmount;
      cities.set(cityName, cityRow);
    });

    const sortRows = (rows: RankingRow[]) =>
      rows.sort((a, b) => b.units - a.units || b.amount - a.amount || a.name.localeCompare(b.name));

    return {
      totalUnits: sales.reduce((sum, sale) => sum + units(sale.sale_units), 0),
      totalAmount: sales.reduce((sum, sale) => sum + amount(sale.amount_billed), 0),
      sellers: sortRows(Array.from(sellers.values())),
      supervisors: sortRows(Array.from(supervisors.values())),
      cities: sortRows(Array.from(cities.values())),
    };
  }, [profiles, sales]);

  function interpretPrompt() {
    const text = prompt.toLowerCase();
    if (text.includes("ciudad") || text.includes("zona")) setView("cities");
    else if (text.includes("vendedor") || text.includes("gestor") || text.includes("evr")) setView("sellers");
    else if (text.includes("supervisor") || text.includes("equipo")) setView("supervisors");
    else setView("summary");
    setNotice("Reporte preparado con los datos reales del período seleccionado.");
  }

  function exportCsv() {
    const selected =
      view === "cities" ? data.cities : view === "sellers" ? data.sellers : data.supervisors;
    const rows = [
      ["CC Analytics", "Reporte seguro"],
      ["Mes", month],
      ["Ventas", data.totalUnits],
      ["Monto", data.totalAmount],
      [],
      ["Posición", view === "cities" ? "Ciudad" : view === "sellers" ? "Vendedor" : "Supervisor", "Equipo", "Ventas", "Monto"],
      ...selected.map((row, index) => [index + 1, row.name, row.supervisor, row.units, row.amount]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cc-analytics-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const selectedRows =
    view === "cities" ? data.cities : view === "sellers" ? data.sellers : data.supervisors;

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Estudio de reportes</p>
          <h2 className="mt-1 text-2xl font-black">Crea el reporte sin complicar la plataforma.</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">
            Consulta un mes a la vez. Los cálculos se realizan con datos reales de CC Analytics y un límite seguro para evitar bloqueos del navegador.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-3 text-xs font-black text-zinc-300 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Actualizar
          </button>
          <button onClick={exportCsv} disabled={!sales.length} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-xs font-black disabled:opacity-40">
            <Download size={15} /> Descargar datos
          </button>
        </div>
      </section>

      {error && <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300"><AlertTriangle className="mr-2 inline" size={15} />{error}</p>}
      {notice && <p className="rounded-xl border border-purple-500/20 bg-purple-500/[.06] p-3 text-xs text-purple-200">{notice}</p>}

      <section className="grid gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 lg:grid-cols-[220px_1fr_auto]">
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
          Mes del reporte
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white" />
        </label>
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
          ¿Qué quieres descubrir o presentar?
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") interpretPrompt(); }} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white" />
        </label>
        <button onClick={interpretPrompt} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-3 text-xs font-black">
          <Bot size={16} /> Preparar reporte
        </button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Ventas" value={data.totalUnits.toLocaleString("es-HN")} icon={TrendingUp} />
        <Kpi title="Monto" value={money(data.totalAmount)} icon={FileDown} />
        <Kpi title="Vendedores" value={String(data.sellers.length)} icon={Users} />
        <Kpi title="Supervisores" value={String(data.supervisors.length)} icon={BarChart3} />
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-black">Vista del reporte</h3>
              <p className="mt-1 text-[10px] text-zinc-600">Top 12 del criterio seleccionado.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["summary", "supervisors", "sellers", "cities"] as const).map((item) => (
                <button key={item} onClick={() => setView(item)} className={`rounded-lg px-3 py-2 text-[10px] font-black ${view === item ? "bg-purple-600 text-white" : "border border-white/[.07] text-zinc-500"}`}>
                  {item === "summary" ? "Resumen" : item === "supervisors" ? "Supervisores" : item === "sellers" ? "Vendedores" : "Ciudades"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(view === "summary" ? data.supervisors : selectedRows).slice(0, 12)} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid stroke="#24242b" strokeDasharray="3 4" horizontal={false} />
                <XAxis type="number" stroke="#52525b" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={135} stroke="#71717a" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#121218", border: "1px solid #30243d", borderRadius: 12 }} />
                <Bar dataKey="units" fill="#a855f7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
          <div className="border-b border-white/[.06] p-5">
            <h3 className="flex items-center gap-2 font-black"><Table2 size={17} className="text-purple-300" />Detalle del ranking</h3>
          </div>
          <div className="max-h-[380px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#111116] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">#</th><th>Nombre</th><th>Equipo</th><th>Ventas</th><th className="pr-5">Monto</th></tr></thead>
              <tbody>{(view === "summary" ? data.supervisors : selectedRows).map((row, index) => <tr key={row.key} className="border-t border-white/[.05]"><td className="px-5 py-3 text-purple-300">{index + 1}</td><td className="font-bold text-zinc-200">{row.name}</td><td className="text-zinc-500">{row.supervisor || "—"}</td><td className="font-black text-emerald-300">{row.units}</td><td className="pr-5 font-bold">{money(row.amount)}</td></tr>)}</tbody>
            </table>
            {!sales.length && !loading && <div className="p-12 text-center text-xs text-zinc-600"><Sparkles className="mx-auto mb-3" />No hay ventas en el período seleccionado.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ title, value, icon: Icon }: { title: string; value: string; icon: React.ElementType }) {
  return (
    <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">{title}</p><p className="mt-3 text-2xl font-black">{value}</p></div>
        <span className="rounded-xl bg-purple-500/10 p-3 text-purple-300"><Icon size={19} /></span>
      </div>
    </section>
  );
}
