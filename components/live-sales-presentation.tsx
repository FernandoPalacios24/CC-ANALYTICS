"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleDollarSign,
  Clock3,
  Crown,
  Maximize2,
  Medal,
  RefreshCw,
  Settings2,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

type Identity = {
  id: string;
  full_name: string;
  department: string | null;
  zone: string | null;
  role: string;
  status: string;
};

type DirectoryRow = {
  id: string;
  full_name: string;
};

type SalesRow = {
  id: number;
  seller_name: string;
  seller_code: string | null;
  supervisor_profile_id: string | null;
  team: string | null;
  sale_date: string;
  amount_billed: number | string | null;
  city: string | null;
  created_at: string;
};

type SellerRanking = {
  key: string;
  name: string;
  supervisor: string;
  sales: number;
  amount: number;
  lastSale: string;
};

type TeamRanking = {
  name: string;
  sales: number;
  amount: number;
};

const SALES_FIELDS =
  "id,seller_name,seller_code,supervisor_profile_id,team,sale_date,amount_billed,city,created_at";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end, year, monthNumber };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function numeric(value: number | string | null) {
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

function monthName(month: string) {
  const { year, monthNumber } = monthBounds(month);
  return new Intl.DateTimeFormat("es-HN", {
    month: "long",
    year: "numeric",
  })
    .format(new Date(year, monthNumber - 1, 1))
    .replace(/^./, (letter) => letter.toUpperCase());
}

function elapsedMonthDays(month: string) {
  const { year, monthNumber } = monthBounds(month);
  const days = new Date(year, monthNumber, 0).getDate();
  const now = new Date();
  if (year === now.getFullYear() && monthNumber === now.getMonth() + 1) {
    return { elapsed: Math.max(1, now.getDate()), days };
  }
  const selected = new Date(year, monthNumber - 1, 1);
  return { elapsed: selected < new Date(now.getFullYear(), now.getMonth(), 1) ? days : 1, days };
}

function podiumStyle(index: number) {
  if (index === 0)
    return "border-amber-300/40 bg-gradient-to-b from-amber-300/20 via-amber-400/[.08] to-transparent shadow-[0_0_70px_rgba(251,191,36,.16)]";
  if (index === 1)
    return "border-slate-200/30 bg-gradient-to-b from-slate-200/15 via-slate-300/[.06] to-transparent";
  return "border-orange-400/30 bg-gradient-to-b from-orange-400/15 via-orange-500/[.05] to-transparent";
}

function placeLabel(index: number) {
  return index === 0 ? "1.er lugar" : index === 1 ? "2.º lugar" : "3.er lugar";
}

export function LiveSalesPresentation() {
  const params =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [month, setMonth] = useState(() => params?.get("month") || currentMonth());
  const [goal, setGoal] = useState(() => {
    const fromUrl = Number(params?.get("goal"));
    const fromStorage =
      typeof window === "undefined" ? 0 : Number(localStorage.getItem("cc-live-goal"));
    return fromUrl > 0 ? fromUrl : fromStorage > 0 ? fromStorage : 300;
  });
  const [title, setTitle] = useState(() => {
    const fromUrl = params?.get("title");
    const fromStorage =
      typeof window === "undefined" ? "" : localStorage.getItem("cc-live-title") || "";
    return fromUrl || fromStorage || "Resultados comerciales en vivo";
  });
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [directory, setDirectory] = useState<DirectoryRow[]>([]);
  const [checking, setChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clock, setClock] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setError("Supabase no está configurado en este entorno.");
      setChecking(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (!data.session) {
        setError("Inicia sesión en CC Analytics antes de abrir la presentación.");
        setChecking(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("analytics_profiles")
        .select("id,full_name,department,zone,role,status")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (!active) return;
      if (profileError || !profile) {
        setError(profileError?.message || "No se pudo cargar el perfil.");
        setChecking(false);
        return;
      }
      const mapped = profile as Identity;
      if (mapped.status !== "activo") {
        setError("Tu acceso a CC Analytics no está activo.");
      } else if (!['admin', 'leader'].includes(mapped.role)) {
        setError("La presentación en vivo está disponible para líderes de departamento y administradores.");
      } else {
        setIdentity(mapped);
      }
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!identity) return;
    setRefreshing(true);
    const { start, end } = monthBounds(month);
    const [salesResult, directoryResult] = await Promise.all([
      supabase
        .from("analytics_sales")
        .select(SALES_FIELDS)
        .gte("sale_date", start)
        .lt("sale_date", end)
        .order("created_at", { ascending: false })
        .limit(20_000),
      supabase
        .from("analytics_profiles")
        .select("id,full_name")
        .eq("status", "activo"),
    ]);

    if (salesResult.error) {
      setError(salesResult.error.message);
    } else {
      setRows((salesResult.data || []) as SalesRow[]);
      setDirectory((directoryResult.data || []) as DirectoryRow[]);
      setLastUpdated(new Date());
      setError("");
    }
    setRefreshing(false);
  }, [identity, month]);

  useEffect(() => {
    if (!identity) return;
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    const channel = supabase
      .channel(`cc-live-sales-${identity.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "analytics_sales" },
        () => void load(),
      )
      .subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [identity, load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cc-live-goal", String(goal));
    localStorage.setItem("cc-live-title", title);
  }, [goal, title]);

  const data = useMemo(() => {
    const profileNames = new Map(directory.map((item) => [item.id, item.full_name]));
    const sellers = new Map<string, SellerRanking>();
    const teams = new Map<string, TeamRanking>();

    rows.forEach((row) => {
      const supervisor =
        (row.supervisor_profile_id && profileNames.get(row.supervisor_profile_id)) ||
        row.team ||
        "Sin supervisor";
      const key = row.seller_code?.trim() || normalize(row.seller_name);
      const current = sellers.get(key) || {
        key,
        name: row.seller_name,
        supervisor,
        sales: 0,
        amount: 0,
        lastSale: row.created_at,
      };
      current.sales += 1;
      current.amount += numeric(row.amount_billed);
      if (new Date(row.created_at) > new Date(current.lastSale)) current.lastSale = row.created_at;
      sellers.set(key, current);

      const team = teams.get(supervisor) || { name: supervisor, sales: 0, amount: 0 };
      team.sales += 1;
      team.amount += numeric(row.amount_billed);
      teams.set(supervisor, team);
    });

    const sellerRanking = Array.from(sellers.values()).sort(
      (a, b) => b.sales - a.sales || b.amount - a.amount || a.name.localeCompare(b.name),
    );
    const teamRanking = Array.from(teams.values()).sort(
      (a, b) => b.sales - a.sales || b.amount - a.amount,
    );
    const totalAmount = rows.reduce((sum, row) => sum + numeric(row.amount_billed), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = rows.filter((row) => row.sale_date === today).length;
    const { elapsed, days } = elapsedMonthDays(month);
    const projection = Math.round((rows.length / elapsed) * days);

    return {
      sellerRanking,
      teamRanking,
      totalAmount,
      todaySales,
      projection,
      recent: rows.slice(0, 6),
    };
  }, [directory, month, rows]);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050507] text-white">
        <div className="text-center">
          <RefreshCw className="mx-auto animate-spin text-purple-400" size={34} />
          <p className="mt-4 text-sm text-zinc-400">Preparando presentación...</p>
        </div>
      </main>
    );
  }

  if (!identity) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050507] p-6 text-white">
        <div className="max-w-lg rounded-3xl border border-rose-500/20 bg-rose-500/[.06] p-8 text-center">
          <WifiOff className="mx-auto text-rose-300" size={38} />
          <h1 className="mt-4 text-2xl font-black">No se puede abrir la presentación</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{error}</p>
          <a href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold">
            <ArrowLeft size={16} /> Volver a CC Analytics
          </a>
        </div>
      </main>
    );
  }

  const progress = goal > 0 ? Math.min(999, (rows.length / goal) * 100) : 0;
  const podium = data.sellerRanking.slice(0, 3);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(168,85,247,.16),transparent_32%),radial-gradient(circle_at_85%_35%,rgba(217,70,239,.09),transparent_30%)]" />
      <div className="relative mx-auto min-h-screen max-w-[2200px] p-4 sm:p-6 2xl:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.08] pb-5">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-purple-400/30 bg-purple-500/10 text-lg font-black text-purple-200 shadow-[0_0_35px_rgba(168,85,247,.2)]">
              CC
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.28em] text-purple-300/70">CC Analytics · Pantalla departamental</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl 2xl:text-4xl">{title}</h1>
              <p className="mt-1 text-xs text-zinc-500">{identity.department} · {identity.zone || "Nacional"} · {monthName(month)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-2xl border border-white/[.08] bg-white/[.03] px-4 py-2 text-right sm:block">
              <p className="text-lg font-black tabular-nums">{clock.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">{clock.toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "short" })}</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-[10px] font-black tracking-wider ${error ? "border-rose-500/20 bg-rose-500/[.06] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300"}`}>
              {error ? <WifiOff size={15} /> : <Wifi size={15} />}
              {error ? "SIN CONEXIÓN" : realtimeConnected ? "EN VIVO" : "ACTUALIZA CADA 5 S"}
            </span>
            <button aria-label="Actualizar" onClick={() => void load()} className="rounded-2xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-400 hover:text-white">
              <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button aria-label="Configurar" onClick={() => setSettingsOpen((value) => !value)} className="rounded-2xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-400 hover:text-white">
              <Settings2 size={18} />
            </button>
            <button aria-label="Pantalla completa" onClick={() => void toggleFullscreen()} className="rounded-2xl bg-purple-600 p-3 shadow-[0_0_28px_rgba(168,85,247,.25)]">
              <Maximize2 size={18} />
            </button>
          </div>
        </header>

        {settingsOpen && (
          <section className="mt-4 grid gap-3 rounded-2xl border border-purple-400/20 bg-[#111118]/95 p-4 shadow-2xl backdrop-blur sm:grid-cols-[1fr_170px_170px_auto]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Título
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-purple-400/50" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mes
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Meta del mes
              <input type="number" min={1} value={goal} onChange={(event) => setGoal(Math.max(1, Number(event.target.value)))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none" />
            </label>
            <button onClick={() => setSettingsOpen(false)} className="self-end rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold">Aplicar</button>
          </section>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[.06] px-4 py-3 text-xs text-rose-300">{error}</div>
        )}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Ventas acumuladas", value: rows.length.toLocaleString("es-HN"), detail: `${data.sellerRanking.length} vendedores activos`, icon: Trophy },
            { label: "Ventas de hoy", value: data.todaySales.toLocaleString("es-HN"), detail: "Actualización automática", icon: Clock3 },
            { label: "Cumplimiento", value: `${progress.toFixed(1)}%`, detail: `Meta ${goal.toLocaleString("es-HN")}`, icon: Target },
            { label: "Proyección de cierre", value: data.projection.toLocaleString("es-HN"), detail: `Monto ${money(data.totalAmount)}`, icon: TrendingUp },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-2xl border border-white/[.08] bg-white/[.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500">{item.label}</p>
                  <span className="rounded-xl bg-purple-500/10 p-2 text-purple-300"><Icon size={18} /></span>
                </div>
                <p className="mt-3 text-3xl font-black tabular-nums 2xl:text-4xl">{item.value}</p>
                <p className="mt-2 text-xs text-zinc-600">{item.detail}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-3xl border border-white/[.08] bg-white/[.025] p-5 2xl:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">Podio del mes</p>
                <h2 className="mt-1 text-xl font-black 2xl:text-2xl">Los mejores vendedores</h2>
              </div>
              <Crown className="text-amber-300" size={28} />
            </div>
            <div className="mt-5 grid min-h-[310px] grid-cols-1 items-end gap-3 sm:grid-cols-3">
              {[podium[1], podium[0], podium[2]].map((seller, visualIndex) => {
                const rankIndex = visualIndex === 0 ? 1 : visualIndex === 1 ? 0 : 2;
                const height = rankIndex === 0 ? "sm:min-h-[270px]" : rankIndex === 1 ? "sm:min-h-[230px]" : "sm:min-h-[205px]";
                return (
                  <article key={seller?.key || `empty-${rankIndex}`} className={`flex ${height} flex-col justify-between rounded-3xl border p-5 text-center ${podiumStyle(rankIndex)}`}>
                    <div>
                      <div className={`mx-auto grid place-items-center rounded-full border border-white/20 bg-black/25 font-black ${rankIndex === 0 ? "h-20 w-20 text-3xl" : "h-16 w-16 text-2xl"}`}>
                        {rankIndex === 0 ? <Crown className="text-amber-300" size={32} /> : <Medal className={rankIndex === 1 ? "text-slate-200" : "text-orange-300"} size={28} />}
                      </div>
                      <p className="mt-4 text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">{placeLabel(rankIndex)}</p>
                      <h3 className="mt-2 line-clamp-2 text-lg font-black 2xl:text-xl">{seller?.name || "Sin datos"}</h3>
                      <p className="mt-1 truncate text-xs text-zinc-500">{seller?.supervisor || "—"}</p>
                    </div>
                    <div className="mt-5">
                      <p className="text-4xl font-black tabular-nums 2xl:text-5xl">{seller?.sales || 0}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">ventas</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/[.08] bg-white/[.025]">
            <div className="flex items-center justify-between border-b border-white/[.07] p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">Clasificación</p>
                <h2 className="mt-1 text-xl font-black">Ranking de vendedores</h2>
              </div>
              <Users className="text-purple-300" size={24} />
            </div>
            <div className="max-h-[390px] overflow-hidden">
              {data.sellerRanking.slice(0, 10).map((seller, index) => (
                <div key={seller.key} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 border-b border-white/[.055] px-5 py-3 last:border-0">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-black ${index < 3 ? "bg-purple-500/15 text-purple-200" : "bg-white/[.04] text-zinc-500"}`}>{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-200">{seller.name}</p>
                    <p className="truncate text-[10px] text-zinc-600">{seller.supervisor}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black tabular-nums">{seller.sales}</p>
                    <p className="text-[9px] uppercase text-zinc-600">ventas</p>
                  </div>
                </div>
              ))}
              {!data.sellerRanking.length && <p className="p-8 text-center text-sm text-zinc-600">Todavía no hay ventas registradas para este período.</p>}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
          <div className="rounded-3xl border border-white/[.08] bg-white/[.025] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">Equipos</p>
                <h2 className="mt-1 text-lg font-black">Ranking por supervisor</h2>
              </div>
              <Trophy className="text-purple-300" size={22} />
            </div>
            <div className="mt-4 space-y-2">
              {data.teamRanking.slice(0, 5).map((team, index) => (
                <div key={team.name} className="flex items-center gap-3 rounded-xl border border-white/[.055] bg-black/20 p-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-xs font-black text-purple-300">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{team.name}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500" style={{ width: `${Math.max(6, (team.sales / Math.max(1, data.teamRanking[0]?.sales || 1)) * 100)}%` }} /></div>
                  </div>
                  <p className="text-2xl font-black tabular-nums">{team.sales}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/[.08] bg-white/[.025] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-400">Actividad reciente</p>
                <h2 className="mt-1 text-lg font-black">Últimas ventas reportadas</h2>
              </div>
              <span className="text-[10px] text-zinc-600">Última sincronización: {lastUpdated ? lastUpdated.toLocaleTimeString("es-HN") : "Pendiente"}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.recent.map((sale) => (
                <article key={sale.id} className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[.035] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-300">NUEVA VENTA</span>
                    <span className="text-[9px] text-zinc-600">{new Date(sale.created_at).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="mt-3 truncate text-sm font-black">{sale.seller_name}</p>
                  <p className="mt-1 truncate text-[10px] text-zinc-600">{sale.city || sale.team || "Venta registrada"}</p>
                  <p className="mt-3 flex items-center gap-1 text-xs font-bold text-zinc-300"><CircleDollarSign size={13} className="text-emerald-400" /> {money(numeric(sale.amount_billed))}</p>
                </article>
              ))}
              {!data.recent.length && <p className="col-span-full py-8 text-center text-sm text-zinc-600">Esperando la primera venta del período.</p>}
            </div>
          </div>
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[.06] pt-4 text-[9px] uppercase tracking-[.16em] text-zinc-700">
          <span>CC Analytics · Cable Color Honduras</span>
          <span>Los datos se muestran según los permisos del líder conectado</span>
        </footer>
      </div>
    </main>
  );
}
