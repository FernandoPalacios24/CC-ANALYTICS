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
  X,
} from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

type Identity = {
  id: string;
  full_name: string;
  department: string;
  zone: string;
  role: "admin" | "leader" | string;
  status: string;
};

type DirectoryRow = {
  id: string;
  full_name: string;
};

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
  created_at: string;
};

type GoalRow = {
  seller_id: string;
  supervisor_profile_id: string;
  goal_units: number;
};

type SellerRanking = {
  key: string;
  name: string;
  supervisor: string;
  sales: number;
  amount: number;
  goal: number;
};

type TeamRanking = {
  key: string;
  name: string;
  sales: number;
  amount: number;
  goal: number;
};

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

function monthName(month: string) {
  const { year, monthNumber } = monthBounds(month);
  return new Intl.DateTimeFormat("es-HN", {
    month: "long",
    year: "numeric",
  })
    .format(new Date(year, monthNumber - 1, 1))
    .replace(/^./, (letter) => letter.toUpperCase());
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function units(value: number | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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

function elapsedMonthDays(month: string) {
  const { year, monthNumber } = monthBounds(month);
  const total = new Date(year, monthNumber, 0).getDate();
  const now = new Date();
  if (year === now.getFullYear() && monthNumber === now.getMonth() + 1) {
    return { elapsed: Math.max(1, now.getDate()), total };
  }
  const selected = new Date(year, monthNumber - 1, 1);
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { elapsed: selected < currentStart ? total : 1, total };
}

function podiumStyle(index: number) {
  if (index === 0) {
    return "border-amber-300/40 bg-gradient-to-b from-amber-300/20 via-amber-400/[.08] to-transparent shadow-[0_0_70px_rgba(251,191,36,.16)]";
  }
  if (index === 1) {
    return "border-slate-200/30 bg-gradient-to-b from-slate-200/15 via-slate-300/[.06] to-transparent";
  }
  return "border-orange-400/30 bg-gradient-to-b from-orange-400/15 via-orange-500/[.05] to-transparent";
}

export function LiveSalesPresentationV2() {
  const params =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const [month, setMonth] = useState(
    () => params?.get("month") || currentMonth(),
  );
  const [title, setTitle] = useState(
    () =>
      params?.get("title") ||
      (typeof window !== "undefined"
        ? localStorage.getItem("cc-live-title-v2")
        : null) ||
      "Resultados comerciales en vivo",
  );
  const [manualGoal, setManualGoal] = useState(() => {
    const fromUrl = Number(params?.get("goal"));
    const fromStorage =
      typeof window === "undefined"
        ? 0
        : Number(localStorage.getItem("cc-live-manual-goal-v2"));
    return fromUrl > 0 ? fromUrl : fromStorage > 0 ? fromStorage : 0;
  });
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
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
      } else {
        const mapped = profile as Identity;
        if (mapped.status !== "activo") {
          setError("Tu acceso a CC Analytics no está activo.");
        } else if (!["admin", "leader"].includes(mapped.role)) {
          setError(
            "La presentación está disponible para líderes y administradores.",
          );
        } else {
          setIdentity(mapped);
        }
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
    const [salesResult, goalsResult, directoryResult] = await Promise.all([
      supabase
        .from("analytics_sales")
        .select(
          "id,seller_id,seller_name,seller_code,supervisor_profile_id,team,sale_date,sale_units,amount_billed,created_at",
        )
        .gte("sale_date", start)
        .lt("sale_date", end)
        .order("created_at", { ascending: false })
        .limit(50000),
      supabase
        .from("analytics_seller_goals")
        .select("seller_id,supervisor_profile_id,goal_units")
        .eq("goal_month", start)
        .limit(50000),
      supabase
        .from("analytics_profiles")
        .select("id,full_name")
        .eq("status", "activo"),
    ]);

    const firstError =
      salesResult.error || goalsResult.error || directoryResult.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setSales((salesResult.data || []) as SaleRow[]);
      setGoals((goalsResult.data || []) as GoalRow[]);
      setDirectory((directoryResult.data || []) as DirectoryRow[]);
      setLastUpdated(new Date());
      setError("");
    }
    setRefreshing(false);
  }, [identity, month]);

  useEffect(() => {
    if (!identity) return;
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    const channel = supabase
      .channel(`cc-live-v2-${identity.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analytics_sales" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analytics_seller_goals" },
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
    localStorage.setItem("cc-live-title-v2", title);
    localStorage.setItem("cc-live-manual-goal-v2", String(manualGoal));
  }, [manualGoal, title]);

  const data = useMemo(() => {
    const profileNames = new Map(
      directory.map((item) => [item.id, item.full_name]),
    );
    const sellerGoals = new Map(
      goals.map((goal) => [goal.seller_id, Number(goal.goal_units || 0)]),
    );
    const teamGoals = new Map<string, number>();
    goals.forEach((goal) => {
      teamGoals.set(
        goal.supervisor_profile_id,
        (teamGoals.get(goal.supervisor_profile_id) || 0) +
          Number(goal.goal_units || 0),
      );
    });

    const sellers = new Map<string, SellerRanking>();
    const teams = new Map<string, TeamRanking>();
    sales.forEach((row) => {
      const supervisorKey = row.supervisor_profile_id || row.team || "unassigned";
      const supervisor =
        (row.supervisor_profile_id &&
          profileNames.get(row.supervisor_profile_id)) ||
        row.team ||
        "Sin supervisor";
      const key = row.seller_id || row.seller_code?.trim() || normalize(row.seller_name);
      const quantity = units(row.sale_units);
      const current = sellers.get(key) || {
        key,
        name: row.seller_name,
        supervisor,
        sales: 0,
        amount: 0,
        goal: row.seller_id ? sellerGoals.get(row.seller_id) || 0 : 0,
      };
      current.sales += quantity;
      current.amount += numeric(row.amount_billed);
      sellers.set(key, current);

      const team = teams.get(supervisorKey) || {
        key: supervisorKey,
        name: supervisor,
        sales: 0,
        amount: 0,
        goal:
          row.supervisor_profile_id
            ? teamGoals.get(row.supervisor_profile_id) || 0
            : 0,
      };
      team.sales += quantity;
      team.amount += numeric(row.amount_billed);
      teams.set(supervisorKey, team);
    });

    const sellerRanking = Array.from(sellers.values()).sort(
      (a, b) => b.sales - a.sales || b.amount - a.amount || a.name.localeCompare(b.name),
    );
    const teamRanking = Array.from(teams.values()).sort(
      (a, b) => b.sales - a.sales || b.amount - a.amount,
    );
    const totalSales = sellerRanking.reduce((sum, row) => sum + row.sales, 0);
    const totalAmount = sellerRanking.reduce((sum, row) => sum + row.amount, 0);
    const databaseGoal = goals.reduce(
      (sum, row) => sum + Number(row.goal_units || 0),
      0,
    );
    const effectiveGoal = manualGoal > 0 ? manualGoal : databaseGoal;
    const { elapsed, total } = elapsedMonthDays(month);
    const projection = Math.round((totalSales / elapsed) * total);
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales
      .filter((row) => row.sale_date === today)
      .reduce((sum, row) => sum + units(row.sale_units), 0);

    return {
      sellerRanking,
      teamRanking,
      totalSales,
      totalAmount,
      databaseGoal,
      effectiveGoal,
      projection,
      todaySales,
      compliance: effectiveGoal ? (totalSales / effectiveGoal) * 100 : 0,
    };
  }, [directory, goals, manualGoal, month, sales]);

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#060609] text-white">
        <div className="text-center text-sm text-zinc-500">
          <span className="mx-auto mb-3 block h-7 w-7 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
          Preparando presentación...
        </div>
      </div>
    );
  }

  if (!identity) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#060609] p-6 text-white">
        <section className="max-w-lg rounded-2xl border border-rose-500/20 bg-rose-500/[.05] p-8 text-center">
          <WifiOff className="mx-auto text-rose-300" size={30} />
          <h1 className="mt-4 text-xl font-black">Presentación no disponible</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{error}</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black"
          >
            <ArrowLeft size={15} /> Volver a CC Analytics
          </button>
        </section>
      </div>
    );
  }

  const podium = data.sellerRanking.slice(0, 3);

  return (
    <div className="min-h-screen overflow-hidden bg-[#060609] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-15%,rgba(168,85,247,.22),transparent_42%),radial-gradient(circle_at_90%_45%,rgba(217,70,239,.08),transparent_32%)]" />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/[.07] bg-black/25 px-7 py-5 backdrop-blur-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.28em] text-purple-300">
            Cable Color · {identity.department} · {identity.zone}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-1 text-xs text-zinc-500">{monthName(month)} · datos reales de Supabase</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black ${realtimeConnected ? "border-emerald-500/15 bg-emerald-500/[.05] text-emerald-300" : "border-amber-500/15 bg-amber-500/[.05] text-amber-300"}`}>
            {realtimeConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {realtimeConnected ? "TIEMPO REAL" : "REINTENTANDO"}
          </span>
          <button onClick={() => void load()} className="rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-300"><RefreshCw className={refreshing ? "animate-spin" : ""} size={17} /></button>
          <button onClick={() => setSettingsOpen(true)} className="rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-300"><Settings2 size={17} /></button>
          <button onClick={() => void document.documentElement.requestFullscreen()} className="rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-300"><Maximize2 size={17} /></button>
        </div>
      </header>

      <main className="relative z-10 space-y-6 p-7">
        {error && <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-sm text-rose-300">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Ventas", data.totalSales.toLocaleString("es-HN"), Trophy],
            ["Monto", money(data.totalAmount), CircleDollarSign],
            ["Meta", data.effectiveGoal.toLocaleString("es-HN"), Target],
            ["Cumplimiento", `${data.compliance.toFixed(1)}%`, TrendingUp],
            ["Proyección", data.projection.toLocaleString("es-HN"), Users],
          ].map(([label, value, Icon]) => (
            <section key={String(label)} className="relative overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.035] p-5">
              <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-purple-400 to-fuchsia-600" />
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{String(label)}</p><p className="mt-3 text-2xl font-black">{String(value)}</p></div>
                <span className="rounded-xl bg-purple-500/10 p-2.5 text-purple-300"><Icon size={19} /></span>
              </div>
            </section>
          ))}
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Podio del mes</p><h2 className="mt-1 text-xl font-black">Líderes comerciales</h2></div>
            <span className="rounded-xl border border-white/[.07] bg-white/[.03] px-4 py-2 text-xs text-zinc-400">Hoy: <b className="text-emerald-300">{data.todaySales} ventas</b></span>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {podium.map((seller, index) => (
              <article key={seller.key} className={`relative overflow-hidden rounded-3xl border p-6 ${podiumStyle(index)}`}>
                <div className="flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-black/25 text-xl font-black">{index === 0 ? <Crown className="text-amber-300" /> : index === 1 ? <Medal className="text-slate-200" /> : <Medal className="text-orange-300" />}</span>
                  <span className="text-4xl font-black text-white/10">0{index + 1}</span>
                </div>
                <h3 className="mt-8 truncate text-xl font-black">{seller.name}</h3>
                <p className="mt-1 truncate text-xs text-zinc-500">Equipo {seller.supervisor}</p>
                <div className="mt-6 flex items-end justify-between gap-3">
                  <div><p className="text-[10px] uppercase tracking-wider text-zinc-600">Ventas</p><p className="mt-1 text-4xl font-black">{seller.sales}</p></div>
                  <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Meta</p><p className="mt-1 text-lg font-black text-purple-200">{seller.goal || 0}</p><p className="text-[9px] text-zinc-600">{seller.goal ? `${((seller.sales / seller.goal) * 100).toFixed(0)}%` : "sin meta"}</p></div>
                </div>
              </article>
            ))}
            {!podium.length && <div className="col-span-full grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/[.08] text-sm text-zinc-600">No hay ventas para el período seleccionado.</div>}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
          <section className="overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03]">
            <div className="border-b border-white/[.06] p-5"><h2 className="font-black">Ranking de vendedores</h2><p className="mt-1 text-[10px] text-zinc-600">Unidades, monto, meta y cumplimiento.</p></div>
            <div className="max-h-[390px] overflow-auto">
              {data.sellerRanking.slice(0, 20).map((seller, index) => (
                <div key={seller.key} className="grid grid-cols-[44px_1fr_90px_120px] items-center gap-3 border-b border-white/[.05] px-5 py-3 last:border-0">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-xs font-black text-purple-300">{index + 1}</span>
                  <div className="min-w-0"><p className="truncate text-xs font-black">{seller.name}</p><p className="mt-1 truncate text-[9px] text-zinc-600">{seller.supervisor}</p></div>
                  <div className="text-right"><p className="text-lg font-black text-emerald-300">{seller.sales}</p><p className="text-[9px] text-zinc-600">ventas</p></div>
                  <div className="text-right"><p className="text-xs font-black">{money(seller.amount)}</p><p className="text-[9px] text-zinc-600">meta {seller.goal || 0}</p></div>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03]">
            <div className="border-b border-white/[.06] p-5"><h2 className="font-black">Ranking de equipos</h2><p className="mt-1 text-[10px] text-zinc-600">Meta sumada desde cada vendedor.</p></div>
            <div className="max-h-[390px] overflow-auto">
              {data.teamRanking.map((team, index) => (
                <div key={team.key} className="flex items-center gap-3 border-b border-white/[.05] px-5 py-4 last:border-0">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/10 text-xs font-black text-fuchsia-300">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{team.name}</p><p className="mt-1 text-[9px] text-zinc-600">{money(team.amount)} · meta {team.goal || 0}</p></div>
                  <div className="text-right"><p className="text-xl font-black text-cyan-300">{team.sales}</p><p className="text-[9px] text-zinc-600">{team.goal ? `${((team.sales / team.goal) * 100).toFixed(0)}%` : "sin meta"}</p></div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.05] pt-4 text-[10px] text-zinc-600">
          <span><Clock3 className="mr-1 inline" size={12} />{clock.toLocaleString("es-HN")}</span>
          <span>Última actualización: {lastUpdated ? lastUpdated.toLocaleTimeString("es-HN") : "pendiente"}</span>
          <span>Meta automática de Supabase: {data.databaseGoal}</span>
        </footer>
      </main>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <section className="w-full max-w-lg rounded-2xl border border-purple-400/20 bg-[#0d0d12] p-6">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-purple-300">Presentación</p><h2 className="mt-1 text-lg font-black">Configuración</h2></div><button onClick={() => setSettingsOpen(false)} className="rounded-xl border border-white/[.08] p-2.5 text-zinc-400"><X size={17} /></button></div>
            <div className="mt-5 space-y-4">
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Título<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Meta manual opcional<input type="number" min={0} value={manualGoal} onChange={(event) => setManualGoal(Math.max(0, Number(event.target.value || 0)))} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /><span className="mt-2 block normal-case tracking-normal text-zinc-600">Usa 0 para tomar automáticamente la suma de metas de vendedores ({data.databaseGoal}).</span></label>
              <button onClick={() => setSettingsOpen(false)} className="w-full rounded-xl bg-purple-600 p-3 text-xs font-black">Aplicar</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
