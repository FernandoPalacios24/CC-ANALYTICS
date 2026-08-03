"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleDollarSign,
  Crown,
  Expand,
  Medal,
  Minimize,
  RefreshCw,
  Settings2,
  Target,
  TrendingUp,
  Trophy,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

type Identity = { id: string; full_name: string; department: string; zone: string; role: "admin" | "leader" | string; status: string };
type DirectoryRow = { id: string; full_name: string };
type SaleRow = { id: number; seller_id: string | null; seller_name: string; seller_code: string | null; supervisor_profile_id: string | null; team: string | null; sale_date: string; sale_units: number | null; amount_billed: number | string | null; created_at: string };
type GoalRow = { seller_id: string; supervisor_profile_id: string; goal_units: number };
type SellerRanking = { key: string; name: string; supervisor: string; sales: number; amount: number; goal: number };
type TeamRanking = { key: string; name: string; sales: number; amount: number; goal: number };

function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function monthBounds(month: string) { const [year, monthNumber] = month.split("-").map(Number); const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`; const next = new Date(year, monthNumber, 1); const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`; return { start, end, year, monthNumber }; }
function monthName(month: string) { const { year, monthNumber } = monthBounds(month); return new Intl.DateTimeFormat("es-HN", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1)).replace(/^./, (letter) => letter.toUpperCase()); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function units(value: number | null | undefined) { const parsed = Number(value ?? 1); return Number.isFinite(parsed) && parsed > 0 ? parsed : 1; }
function numeric(value: number | string | null) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: number) { return new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL", maximumFractionDigits: 0 }).format(value); }
function elapsedMonthDays(month: string) { const { year, monthNumber } = monthBounds(month); const total = new Date(year, monthNumber, 0).getDate(); const now = new Date(); if (year === now.getFullYear() && monthNumber === now.getMonth() + 1) return { elapsed: Math.max(1, now.getDate()), total }; const selected = new Date(year, monthNumber - 1, 1); const currentStart = new Date(now.getFullYear(), now.getMonth(), 1); return { elapsed: selected < currentStart ? total : 1, total }; }

const podiumTone = {
  1: { frame: "podium-gold", text: "text-amber-200", badge: "bg-amber-300/15 text-amber-200", Icon: Crown },
  2: { frame: "podium-silver", text: "text-slate-100", badge: "bg-slate-200/10 text-slate-100", Icon: Medal },
  3: { frame: "podium-bronze", text: "text-orange-200", badge: "bg-orange-400/10 text-orange-200", Icon: Medal },
} as const;

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return <div className="kpi-card"><div><p>{label}</p><strong>{value}</strong></div><span><Icon /></span></div>;
}

function PodiumCard({ item, place }: { item: SellerRanking | undefined; place: 1 | 2 | 3 }) {
  const tone = podiumTone[place]; const Icon = tone.Icon; const compliance = item?.goal ? Math.round((item.sales / item.goal) * 100) : 0;
  return (
    <article className={`podium-card ${tone.frame} podium-place-${place}`}>
      <div className="podium-sheen" /><div className="podium-particles" />
      <div className={`podium-place ${tone.text}`}>{String(place).padStart(2, "0")}</div>
      <div className={`podium-icon ${tone.badge}`}><Icon /></div>
      <div className="podium-person"><h3>{item?.name || "Sin vendedor"}</h3><p>{item?.supervisor || "Sin equipo"}</p></div>
      <div className="podium-metrics"><div><span>Ventas</span><b>{item?.sales || 0}</b></div><div><span>Meta</span><b>{item?.goal || 0}</b><small>{item?.goal ? `${compliance}%` : "sin meta"}</small></div></div>
      <div className="podium-base" />
    </article>
  );
}

export function LiveSalesPresentationV2() {
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [month, setMonth] = useState(() => params?.get("month") || currentMonth());
  const [title, setTitle] = useState(() => params?.get("title") || "Resultados comerciales en vivo");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [directory, setDirectory] = useState<DirectoryRow[]>([]);
  const [checking, setChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => { const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", onFullscreen); return () => document.removeEventListener("fullscreenchange", onFullscreen); }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setError("Supabase no está configurado en este entorno."); setChecking(false); return; }
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (!data.session) { setError("Inicia sesión en CC Analytics antes de abrir la presentación."); setChecking(false); return; }
      const { data: profile, error: profileError } = await supabase.from("analytics_profiles").select("id,full_name,department,zone,role,status").eq("id", data.session.user.id).maybeSingle();
      if (!active) return;
      if (profileError || !profile) setError(profileError?.message || "No se pudo cargar el perfil.");
      else { const mapped = profile as Identity; if (mapped.status !== "activo") setError("Tu acceso a CC Analytics no está activo."); else if (!["admin", "leader"].includes(mapped.role)) setError("La presentación está disponible para líderes y administradores."); else setIdentity(mapped); }
      setChecking(false);
    });
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    if (!identity) return;
    setRefreshing(true);
    const { start, end } = monthBounds(month);
    const [salesResult, goalsResult, directoryResult] = await Promise.all([
      supabase.from("analytics_sales").select("id,seller_id,seller_name,seller_code,supervisor_profile_id,team,sale_date,sale_units,amount_billed,created_at").gte("sale_date", start).lt("sale_date", end).order("created_at", { ascending: false }).limit(50000),
      supabase.from("analytics_seller_goals").select("seller_id,supervisor_profile_id,goal_units").eq("goal_month", start).limit(50000),
      supabase.from("analytics_profiles").select("id,full_name").eq("status", "activo"),
    ]);
    const firstError = salesResult.error || goalsResult.error || directoryResult.error;
    if (firstError) setError(firstError.message);
    else { setSales((salesResult.data || []) as SaleRow[]); setGoals((goalsResult.data || []) as GoalRow[]); setDirectory((directoryResult.data || []) as DirectoryRow[]); setLastUpdated(new Date()); setError(""); }
    setRefreshing(false);
  }, [identity, month]);

  useEffect(() => {
    if (!identity) return;
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    const channel = supabase.channel(`cc-live-one-screen-${identity.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "analytics_sales" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "analytics_seller_goals" }, () => void load())
      .subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [identity, load]);

  const data = useMemo(() => {
    const profileNames = new Map(directory.map((item) => [item.id, item.full_name]));
    const sellerGoals = new Map(goals.map((goal) => [goal.seller_id, Number(goal.goal_units || 0)]));
    const teamGoals = new Map<string, number>();
    goals.forEach((goal) => teamGoals.set(goal.supervisor_profile_id, (teamGoals.get(goal.supervisor_profile_id) || 0) + Number(goal.goal_units || 0)));
    const sellers = new Map<string, SellerRanking>(); const teams = new Map<string, TeamRanking>();
    sales.forEach((row) => {
      const supervisorKey = row.supervisor_profile_id || row.team || "unassigned";
      const supervisor = (row.supervisor_profile_id && profileNames.get(row.supervisor_profile_id)) || row.team || "Sin supervisor";
      const sellerKey = row.seller_id || row.seller_code?.trim() || normalize(row.seller_name);
      const quantity = units(row.sale_units);
      const seller = sellers.get(sellerKey) || { key: sellerKey, name: row.seller_name, supervisor, sales: 0, amount: 0, goal: row.seller_id ? sellerGoals.get(row.seller_id) || 0 : 0 };
      seller.sales += quantity; seller.amount += numeric(row.amount_billed); sellers.set(sellerKey, seller);
      const team = teams.get(supervisorKey) || { key: supervisorKey, name: supervisor, sales: 0, amount: 0, goal: row.supervisor_profile_id ? teamGoals.get(row.supervisor_profile_id) || 0 : 0 };
      team.sales += quantity; team.amount += numeric(row.amount_billed); teams.set(supervisorKey, team);
    });
    const sellerRanking = Array.from(sellers.values()).sort((a, b) => b.sales - a.sales || b.amount - a.amount || a.name.localeCompare(b.name));
    const teamRanking = Array.from(teams.values()).sort((a, b) => b.sales - a.sales || b.amount - a.amount);
    const totalSales = sellerRanking.reduce((sum, row) => sum + row.sales, 0); const totalAmount = sellerRanking.reduce((sum, row) => sum + row.amount, 0); const goal = goals.reduce((sum, row) => sum + Number(row.goal_units || 0), 0);
    const { elapsed, total } = elapsedMonthDays(month); const projection = Math.round((totalSales / elapsed) * total);
    return { sellerRanking, teamRanking, totalSales, totalAmount, goal, projection, compliance: goal ? (totalSales / goal) * 100 : 0 };
  }, [directory, goals, month, sales]);

  async function toggleFullscreen() { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }

  if (checking) return <div className="grid min-h-screen place-items-center bg-[#060609] text-zinc-400"><span className="h-8 w-8 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" /></div>;
  if (!identity) return <div className="grid min-h-screen place-items-center bg-[#060609] p-6 text-white"><section className="max-w-lg rounded-2xl border border-rose-500/20 bg-rose-500/[.05] p-8 text-center"><WifiOff className="mx-auto text-rose-300" size={30} /><h1 className="mt-4 text-xl font-black">Presentación no disponible</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{error}</p><button onClick={() => (window.location.href = "/")} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black"><ArrowLeft size={15} /> Volver</button></section></div>;

  const topThree = data.sellerRanking.slice(0, 3); const restTopTen = data.sellerRanking.slice(3, 10); const supervisors = data.teamRanking.slice(0, 6);

  return (
    <div className="live-screen">
      <div className="live-glow" />
      <header className="live-header"><div><p>CABLE COLOR · {identity.department.toUpperCase()} · {identity.zone.toUpperCase()}</p><h1>{title}</h1><span>{monthName(month)} · datos reales de Supabase{lastUpdated ? ` · ${lastUpdated.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></div><div className="live-actions"><span className={realtimeConnected ? "live-online" : "live-offline"}><Wifi /> {realtimeConnected ? "TIEMPO REAL" : "RECONECTANDO"}</span><button aria-label="Actualizar" onClick={() => void load()}><RefreshCw className={refreshing ? "animate-spin" : ""} /></button><button aria-label="Configuración" onClick={() => setSettingsOpen(true)}><Settings2 /></button><button aria-label="Pantalla completa" onClick={() => void toggleFullscreen()}>{isFullscreen ? <Minimize /> : <Expand />}</button></div></header>
      <section className="kpi-grid"><KpiCard label="Ventas" value={String(data.totalSales)} icon={Trophy} /><KpiCard label="Monto" value={money(data.totalAmount)} icon={CircleDollarSign} /><KpiCard label="Meta" value={String(data.goal)} icon={Target} /><KpiCard label="Cumplimiento" value={`${data.compliance.toFixed(1)}%`} icon={TrendingUp} /><KpiCard label="Proyección" value={String(data.projection)} icon={Users} /></section>
      <main className="live-main">
        <section className="podium-panel"><div className="panel-title"><span><Trophy /></span><div><p>PODIO DEL MES</p><h2>Líderes comerciales</h2></div></div><div className="podium-grid"><PodiumCard item={topThree[1]} place={2} /><PodiumCard item={topThree[0]} place={1} /><PodiumCard item={topThree[2]} place={3} /></div></section>
        <section className="top-ten-panel"><div className="ranking-title">TOP 10 · POSICIONES 4 A 10</div><div className="ranking-head"><span>#</span><span>Vendedor</span><span>Equipo</span><span>Ventas</span><span>Monto</span></div><div className="ranking-list">{restTopTen.map((row, index) => <div className="ranking-row" key={row.key}><b>{index + 4}</b><span><UserRound />{row.name}</span><span>{row.supervisor}</span><strong>{row.sales}</strong><strong>{money(row.amount)}</strong></div>)}{!restTopTen.length && <div className="ranking-empty">Aún no hay suficientes vendedores para completar el Top 10.</div>}</div></section>
      </main>
      <section className="supervisor-panel"><div className="supervisor-title"><Users /> TOP DE SUPERVISORES</div><div className="supervisor-grid">{supervisors.map((row, index) => { const compliance = row.goal ? Math.min(100, (row.sales / row.goal) * 100) : 0; return <article key={row.key} className="supervisor-card"><div className="supervisor-card-title"><span>{index + 1}</span><h3>{row.name}</h3></div><div className="supervisor-metrics"><div><small>Ventas</small><b>{row.sales}</b></div><div><small>Monto</small><b>{money(row.amount)}</b></div><div><small>Meta</small><b>{row.goal}</b></div><div><small>Cumplimiento</small><b>{row.goal ? `${Math.round((row.sales / row.goal) * 100)}%` : "—"}</b></div></div><div className="supervisor-progress"><span style={{ width: `${compliance}%` }} /></div></article>; })}{!supervisors.length && <div className="supervisor-empty">No hay equipos con ventas en el período seleccionado.</div>}</div></section>
      {error && <div className="live-error">{error}</div>}
      {settingsOpen && <div className="settings-overlay" onClick={() => setSettingsOpen(false)}><section onClick={(event) => event.stopPropagation()}><button aria-label="Cerrar" onClick={() => setSettingsOpen(false)}><X /></button><p>CONFIGURACIÓN DE PRESENTACIÓN</p><h2>Vista en vivo</h2><label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><small>Las ventas, montos, metas y rankings se obtienen únicamente del Supabase de CC Analytics.</small></section></div>}
      <style jsx global>{`
        :root{color-scheme:dark}body{margin:0;overflow:hidden;background:#050508}.live-screen{--gap:clamp(8px,.75vw,16px);position:relative;z-index:0;height:100dvh;overflow:hidden;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:var(--gap);padding:clamp(10px,1.2vw,24px);color:white;background:radial-gradient(circle at 50% -20%,rgba(126,34,206,.18),transparent 42%),linear-gradient(145deg,#050508 0%,#080813 58%,#12051f 100%);font-size:clamp(10px,.72vw,16px)}.live-glow{position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 25% 55%,rgba(59,130,246,.06),transparent 28%),radial-gradient(circle at 82% 70%,rgba(168,85,247,.08),transparent 30%)}
        .live-header{min-height:clamp(62px,8vh,92px);display:flex;align-items:center;justify-content:space-between;gap:1.5em;border-bottom:1px solid rgba(255,255,255,.07);padding:0 .35em .8em}.live-header p{margin:0 0 .35em;color:#c084fc;font-size:.72em;font-weight:900;letter-spacing:.2em}.live-header h1{margin:0;font-size:clamp(1.55rem,2.2vw,3rem);line-height:1;font-weight:950;letter-spacing:-.035em}.live-header span{display:block;margin-top:.55em;color:#71717a;font-size:.78em}.live-actions{display:flex;align-items:center;gap:.55em}.live-actions button,.live-actions>span{height:clamp(38px,4.6vw,58px);border:1px solid rgba(255,255,255,.09);border-radius:1em;background:rgba(255,255,255,.025);color:#d4d4d8;display:inline-flex;align-items:center;justify-content:center;gap:.55em;padding:0 1em;font-weight:900;font-size:.72em}.live-actions button{width:clamp(38px,4.6vw,58px);padding:0;cursor:pointer}.live-actions svg{width:1.35em;height:1.35em}.live-actions .live-online{color:#34d399;border-color:rgba(16,185,129,.2);background:rgba(16,185,129,.05)}.live-actions .live-offline{color:#fbbf24}
        .kpi-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--gap)}.kpi-card{min-height:clamp(64px,9.8vh,112px);border:1px solid rgba(255,255,255,.08);border-left:3px solid #c026d3;border-radius:1.15em;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(88,28,135,.08));display:flex;align-items:center;justify-content:space-between;padding:1.15em 1.25em}.kpi-card p{margin:0;color:#a855f7;font-size:.68em;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.kpi-card strong{display:block;margin-top:.4em;font-size:clamp(1.2rem,2vw,2.3rem);line-height:1;font-weight:950;white-space:nowrap}.kpi-card>span{width:3.35em;height:3.35em;border-radius:1em;background:rgba(126,34,206,.23);display:grid;place-items:center;color:#e9d5ff}.kpi-card svg{width:1.45em}
        .live-main{min-height:0;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(390px,1fr);gap:var(--gap)}.podium-panel,.top-ten-panel,.supervisor-panel{min-height:0;border:1px solid rgba(255,255,255,.09);border-radius:1.35em;background:linear-gradient(145deg,rgba(255,255,255,.025),rgba(30,12,52,.18));overflow:hidden}.podium-panel{display:grid;grid-template-rows:auto minmax(0,1fr);padding:1.1em}.panel-title{display:flex;align-items:center;gap:.8em;padding:.1em .2em .7em}.panel-title>span{color:#facc15}.panel-title svg{width:1.5em}.panel-title p,.ranking-title,.supervisor-title{margin:0;color:#d8b4fe;font-size:.72em;font-weight:950;letter-spacing:.16em}.panel-title p{color:#facc15}.panel-title h2{margin:.15em 0 0;font-size:1.45em;font-weight:950}.podium-grid{min-height:0;display:grid;grid-template-columns:1fr 1.12fr 1fr;align-items:end;gap:1em;padding:.15em .5em .25em}
        .podium-card{position:relative;min-width:0;height:86%;border:1px solid;border-radius:1.5em;overflow:visible;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;align-items:center;padding:1em 1.1em 1.15em;text-align:center;isolation:isolate}.podium-place-1{height:100%}.podium-gold{border-color:rgba(251,191,36,.9);background:linear-gradient(160deg,rgba(251,191,36,.22),rgba(30,20,5,.82) 44%,rgba(9,9,12,.95));box-shadow:0 0 1.4em rgba(251,191,36,.34),inset 0 0 1.5em rgba(251,191,36,.12);animation:goldPulse 2.7s ease-in-out infinite}.podium-silver{border-color:rgba(191,219,254,.8);background:linear-gradient(160deg,rgba(191,219,254,.16),rgba(13,20,35,.84) 44%,rgba(8,9,14,.96));box-shadow:0 0 1.15em rgba(96,165,250,.28),inset 0 0 1.2em rgba(191,219,254,.1);animation:silverPulse 3.2s ease-in-out infinite}.podium-bronze{border-color:rgba(251,146,60,.8);background:linear-gradient(160deg,rgba(251,146,60,.16),rgba(42,18,9,.84) 44%,rgba(10,8,9,.96));box-shadow:0 0 1.15em rgba(249,115,22,.26),inset 0 0 1.2em rgba(251,146,60,.1);animation:bronzePulse 3.5s ease-in-out infinite}.podium-sheen{position:absolute;inset:-40% -70%;z-index:-1;transform:rotate(17deg);background:linear-gradient(90deg,transparent 42%,rgba(255,255,255,.18) 50%,transparent 58%);animation:sheen 5s ease-in-out infinite}.podium-particles{position:absolute;inset:-8%;z-index:-2;opacity:.75;background-image:radial-gradient(circle,rgba(255,255,255,.55) 0 1px,transparent 1.5px);background-size:2.7em 2.7em;mask-image:linear-gradient(to bottom,black,transparent 82%);animation:particles 8s linear infinite}.podium-place{font-size:clamp(1.5rem,2.6vw,3.2rem);font-weight:950;line-height:1;text-shadow:0 0 .5em currentColor}.podium-icon{width:clamp(44px,5.2vw,78px);height:clamp(44px,5.2vw,78px);border-radius:1.15em;display:grid;place-items:center;margin:.55em auto;box-shadow:0 0 1em currentColor}.podium-icon svg{width:55%;height:55%}.podium-person{min-height:0;display:flex;flex-direction:column;justify-content:center}.podium-person h3{margin:0;font-size:clamp(.9rem,1.35vw,1.65rem);line-height:1.08;font-weight:950;text-wrap:balance}.podium-person p{margin:.55em 0 0;color:#a1a1aa;font-size:.78em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.podium-metrics{display:grid;grid-template-columns:1fr 1fr;gap:1em;border-top:1px solid rgba(255,255,255,.12);padding-top:.85em}.podium-metrics span,.supervisor-metrics small{display:block;color:#71717a;font-size:.65em;font-weight:900;text-transform:uppercase}.podium-metrics b{display:block;margin-top:.2em;font-size:1.85em;line-height:1}.podium-metrics small{color:#71717a;font-size:.62em}.podium-base{position:absolute;left:5%;right:5%;bottom:-.75em;height:1em;border-radius:50%;background:currentColor;opacity:.45;filter:blur(.45em)}
        .top-ten-panel{display:grid;grid-template-rows:auto auto minmax(0,1fr);padding:1.2em}.ranking-title{padding-bottom:1em}.ranking-head,.ranking-row{display:grid;grid-template-columns:2.4em minmax(0,1.45fr) minmax(0,1.15fr) .55fr .75fr;align-items:center;gap:.65em}.ranking-head{padding:.3em .75em .75em;color:#71717a;font-size:.64em;font-weight:900;text-transform:uppercase}.ranking-list{min-height:0;display:grid;grid-template-rows:repeat(7,minmax(0,1fr))}.ranking-row{border-top:1px solid rgba(255,255,255,.065);padding:.45em .75em}.ranking-row>b{width:2.15em;height:2.15em;border-radius:.75em;display:grid;place-items:center;background:rgba(126,34,206,.34);color:#e9d5ff}.ranking-row>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.77em}.ranking-row>span:nth-child(2){display:flex;align-items:center;gap:.45em;font-weight:750}.ranking-row svg{width:1.1em;color:#a855f7;flex:none}.ranking-row>span:nth-child(3){color:#8b8b96}.ranking-row strong{text-align:right;font-size:.83em}.ranking-row strong:nth-last-child(2){color:#d8b4fe;font-size:1.05em}.ranking-empty{grid-row:1/-1;display:grid;place-items:center;color:#52525b;font-size:.78em}
        .supervisor-panel{padding:.9em 1em 1em}.supervisor-title{display:flex;align-items:center;gap:.55em;margin-bottom:.7em}.supervisor-title svg{width:1.25em}.supervisor-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.7em}.supervisor-card{min-width:0;border:1px solid rgba(255,255,255,.075);border-radius:1em;background:rgba(255,255,255,.022);padding:.75em}.supervisor-card-title{display:flex;align-items:center;gap:.55em;min-width:0}.supervisor-card-title>span{width:2em;height:2em;flex:none;display:grid;place-items:center;border-radius:.7em;background:rgba(126,34,206,.4);color:#e9d5ff;font-weight:900}.supervisor-card-title h3{margin:0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.85em}.supervisor-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.35em;margin-top:.75em}.supervisor-metrics b{display:block;margin-top:.2em;font-size:.78em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.supervisor-progress{height:.28em;margin-top:.7em;overflow:hidden;border-radius:999px;background:#27272a}.supervisor-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#a855f7,#d946ef);box-shadow:0 0 .7em #a855f7}.supervisor-empty{grid-column:1/-1;display:grid;place-items:center;color:#52525b;min-height:6em}
        .live-error{position:fixed;left:50%;bottom:1.25em;transform:translateX(-50%);z-index:40;max-width:80vw;border:1px solid rgba(244,63,94,.25);border-radius:1em;background:rgba(39,5,12,.92);padding:.85em 1.2em;color:#fda4af;font-size:.78em}.settings-overlay{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(0,0,0,.82);padding:1.5em}.settings-overlay section{position:relative;width:min(480px,100%);border:1px solid rgba(168,85,247,.25);border-radius:1.4em;background:#0c0c13;padding:1.6em;box-shadow:0 2em 6em rgba(0,0,0,.65)}.settings-overlay section>button{position:absolute;right:1em;top:1em;width:2.6em;height:2.6em;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:.85em;background:rgba(255,255,255,.03);color:#a1a1aa}.settings-overlay p{margin:0;color:#c084fc;font-size:.68em;font-weight:900;letter-spacing:.16em}.settings-overlay h2{margin:.4em 0 1.2em;font-size:1.6em}.settings-overlay label{display:block;margin-top:1em;color:#71717a;font-size:.72em;font-weight:900;text-transform:uppercase}.settings-overlay input{display:block;width:100%;margin-top:.55em;border:1px solid rgba(255,255,255,.09);border-radius:.9em;background:#12121a;padding:.9em;color:white;font-size:1rem;text-transform:none}.settings-overlay small{display:block;margin-top:1.2em;color:#71717a;line-height:1.6}
        @keyframes goldPulse{0%,100%{box-shadow:0 0 1.2em rgba(251,191,36,.28),inset 0 0 1.5em rgba(251,191,36,.1)}50%{box-shadow:0 0 2.2em rgba(251,191,36,.62),0 0 4em rgba(245,158,11,.2),inset 0 0 2em rgba(251,191,36,.19)}}@keyframes silverPulse{0%,100%{box-shadow:0 0 1em rgba(96,165,250,.22),inset 0 0 1.2em rgba(191,219,254,.08)}50%{box-shadow:0 0 1.8em rgba(147,197,253,.5),0 0 3em rgba(59,130,246,.15),inset 0 0 1.8em rgba(191,219,254,.15)}}@keyframes bronzePulse{0%,100%{box-shadow:0 0 1em rgba(249,115,22,.2),inset 0 0 1.2em rgba(251,146,60,.08)}50%{box-shadow:0 0 1.8em rgba(251,146,60,.48),0 0 3em rgba(234,88,12,.14),inset 0 0 1.8em rgba(251,146,60,.14)}}@keyframes sheen{0%,18%{transform:translateX(-55%) rotate(17deg)}45%,100%{transform:translateX(55%) rotate(17deg)}}@keyframes particles{from{background-position:0 0}to{background-position:2.7em -5.4em}}
        @media(max-aspect-ratio:4/3){body{overflow:auto}.live-screen{height:auto;min-height:100dvh;overflow:auto}.live-main{grid-template-columns:1fr}.supervisor-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.podium-panel{min-height:52vh}.top-ten-panel{min-height:45vh}}@media(max-width:900px){.live-header{align-items:flex-start}.live-header span{display:none}.live-actions>span{display:none}.kpi-grid{grid-template-columns:repeat(5,minmax(110px,1fr));overflow-x:auto}.live-main{grid-template-columns:1fr}.supervisor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.podium-grid{gap:.55em}.ranking-head,.ranking-row{grid-template-columns:2em minmax(0,1.4fr) .7fr .55fr}.ranking-head span:nth-child(3),.ranking-row span:nth-child(3){display:none}.live-screen{overflow:auto;height:auto;min-height:100dvh}body{overflow:auto}}@media(prefers-reduced-motion:reduce){.podium-card,.podium-sheen,.podium-particles{animation:none!important}}
      `}</style>
    </div>
  );
}
