"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Calculator,
  Download,
  GripVertical,
  LayoutGrid,
  LineChart as LineIcon,
  Maximize2,
  Minimize2,
  PieChart as PieIcon,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

type VisualType = "kpi" | "bar" | "line" | "pie" | "table";
type Size = "small" | "medium" | "large";
type SalesRow = {
  sale_date: string | null;
  seller_name: string | null;
  team: string | null;
  city: string | null;
  department: string | null;
  zone: string | null;
  amount_billed: number | string | null;
};
type Visual = {
  id: string;
  title: string;
  type: VisualType;
  dimension: string;
  measure: string;
  size: Size;
};
type Point = { name: string; value: number };

const colors = ["#a855f7", "#22d3ee", "#34d399", "#f59e0b", "#fb7185"];
const dimensions = [
  { value: "month", label: "Mes" },
  { value: "seller", label: "Vendedor" },
  { value: "team", label: "Supervisor / equipo" },
  { value: "city", label: "Ciudad" },
  { value: "department", label: "Departamento" },
  { value: "zone", label: "Zona" },
];
const measures = [
  { value: "count", label: "Cantidad de ventas" },
  { value: "amount", label: "Monto facturado" },
  { value: "average", label: "ARPU promedio" },
];
const visualCatalog: { type: VisualType; label: string; icon: typeof BarChart3 }[] = [
  { type: "kpi", label: "Indicador", icon: Calculator },
  { type: "bar", label: "Barras", icon: BarChart3 },
  { type: "line", label: "Línea", icon: LineIcon },
  { type: "pie", label: "Dona", icon: PieIcon },
  { type: "table", label: "Tabla", icon: Table2 },
];

function id() {
  return `visual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(value: string | null) {
  if (!value) return "Sin fecha";
  const raw = value.slice(0, 7);
  const [year, month] = raw.split("-").map(Number);
  if (!year || !month) return raw;
  return new Intl.DateTimeFormat("es-HN", { month: "short", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

function dimensionValue(row: SalesRow, dimension: string) {
  if (dimension === "month") return monthLabel(row.sale_date);
  if (dimension === "seller") return row.seller_name || "Sin vendedor";
  if (dimension === "team") return row.team || "Sin equipo";
  if (dimension === "city") return row.city || "Sin ciudad";
  if (dimension === "department") return row.department || "Sin departamento";
  if (dimension === "zone") return row.zone || "Sin zona";
  return "Total";
}

function aggregate(rows: SalesRow[], visual: Visual): Point[] {
  const groups = new Map<string, SalesRow[]>();
  rows.forEach((row) => {
    const key = dimensionValue(row, visual.dimension);
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  return Array.from(groups.entries())
    .map(([name, group]) => {
      const amount = group.reduce((sum, row) => sum + numberValue(row.amount_billed), 0);
      const value =
        visual.measure === "amount"
          ? amount
          : visual.measure === "average"
            ? group.length
              ? amount / group.length
              : 0
            : group.length;
      return { name, value: Math.round(value * 100) / 100 };
    })
    .sort((a, b) =>
      visual.dimension === "month" ? a.name.localeCompare(b.name) : b.value - a.value,
    )
    .slice(0, 25);
}

function formatValue(value: number, measure: string) {
  if (measure === "amount" || measure === "average") {
    return `L ${new Intl.NumberFormat("es-HN", { maximumFractionDigits: 2 }).format(value)}`;
  }
  return new Intl.NumberFormat("es-HN").format(value);
}

function defaultVisuals(): Visual[] {
  return [
    { id: "kpi-sales", title: "Ventas del período", type: "kpi", dimension: "month", measure: "count", size: "small" },
    { id: "kpi-amount", title: "Monto facturado", type: "kpi", dimension: "month", measure: "amount", size: "small" },
    { id: "trend", title: "Tendencia mensual", type: "line", dimension: "month", measure: "count", size: "large" },
    { id: "teams", title: "Venta por supervisor / equipo", type: "bar", dimension: "team", measure: "count", size: "medium" },
    { id: "cities", title: "Venta por ciudad", type: "pie", dimension: "city", measure: "count", size: "medium" },
    { id: "sellers", title: "Detalle por vendedor", type: "table", dimension: "seller", measure: "count", size: "large" },
  ];
}

export function ReportStudioV3({
  profile,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [visuals, setVisuals] = useState<Visual[]>(defaultVisuals);
  const [selectedId, setSelectedId] = useState("trend");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const selected = visuals.find((visual) => visual.id === selectedId) || null;

  useEffect(() => {
    let active = true;
    const query = supabase
      .from("analytics_sales")
      .select("sale_date,seller_name,team,city,department,zone,amount_billed")
      .order("sale_date", { ascending: true })
      .limit(5000);
    if (profile.role !== "Administrador") {
      query.eq("department", profile.department).eq("zone", profile.zone);
    }
    void query.then(({ data, error }) => {
      if (!active) return;
      setRows((data as SalesRow[] | null) || []);
      setNotice(error ? `No se pudieron cargar los datos: ${error.message}` : "");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [profile]);

  const totalRows = rows.length;
  const totalAmount = useMemo(
    () => rows.reduce((sum, row) => sum + numberValue(row.amount_billed), 0),
    [rows],
  );

  function addVisual(type: VisualType) {
    const visual: Visual = {
      id: id(),
      title: visualCatalog.find((item) => item.type === type)?.label || "Nuevo visual",
      type,
      dimension: type === "line" ? "month" : "team",
      measure: "count",
      size: type === "kpi" ? "small" : type === "table" ? "large" : "medium",
    };
    setVisuals((current) => [...current, visual]);
    setSelectedId(visual.id);
  }

  function patchSelected(patch: Partial<Visual>) {
    if (!selected) return;
    setVisuals((current) =>
      current.map((visual) => (visual.id === selected.id ? { ...visual, ...patch } : visual)),
    );
  }

  function removeSelected() {
    if (!selected) return;
    setVisuals((current) => current.filter((visual) => visual.id !== selected.id));
    setSelectedId("");
  }

  function reorder(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setVisuals((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === draggedId);
      const to = next.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedId(null);
  }

  function downloadSpec() {
    const payload = {
      version: 4,
      title: "Reporte CC Analytics",
      owner: profile.id,
      scope: { department: profile.department, zone: profile.zone },
      visuals,
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    link.download = "reporte-cc-analytics.json";
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice("Configuración del reporte exportada correctamente.");
  }

  return (
    <div className="animate-in space-y-4">
      <section className="rounded-2xl border border-purple-400/20 bg-gradient-to-r from-purple-500/[.08] to-cyan-500/[.035] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
              <Sparkles size={14} /> Constructor visual universal
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Reportes</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Agrega visuales, arrástralos para reordenar, cambia tamaño y configura campos sin programar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setVisuals(defaultVisuals())} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-zinc-300">
              Restablecer
            </button>
            <button onClick={downloadSpec} className="inline-flex items-center gap-2 rounded-xl border border-purple-400/20 bg-purple-500/10 px-4 py-2.5 text-xs font-bold text-purple-200">
              <Download size={15} /> Exportar JSON
            </button>
            <button onClick={() => setNotice("Diseño guardado en la sesión actual.")} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-black">
              <Save size={15} /> Guardar diseño
            </button>
          </div>
        </div>
        {notice && <p className="mt-4 rounded-xl border border-white/[.06] bg-black/20 p-3 text-xs text-zinc-300">{notice}</p>}
      </section>

      <div className="grid gap-4 2xl:grid-cols-[230px_minmax(0,1fr)_280px]">
        <aside className="space-y-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
          <div>
            <p className="text-xs font-black text-white">Elementos</p>
            <p className="mt-1 text-[10px] text-zinc-600">Pulsa para agregar al lienzo.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 2xl:grid-cols-1">
            {visualCatalog.map(({ type, label, icon: Icon }) => (
              <button key={type} onClick={() => addVisual(type)} className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.025] p-3 text-left text-xs font-bold text-zinc-300 transition hover:border-purple-400/30 hover:bg-purple-500/[.07]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-purple-300"><Icon size={16} /></span>
                {label}
              </button>
            ))}
          </div>
          <div className="border-t border-white/[.06] pt-4">
            <p className="flex items-center gap-2 text-xs font-black text-white"><Bot size={15} className="text-cyan-300" /> Crear con IA</p>
            <textarea className="mt-3 h-24 w-full resize-none rounded-xl border border-white/[.08] bg-[#0d0d12] p-3 text-xs outline-none focus:border-cyan-400/30" placeholder="Ej.: crea un ranking de vendedores por monto..." />
            <button onClick={() => setNotice("El copiloto visual quedará conectado al modelo semántico en la siguiente capa.")} className="mt-2 w-full rounded-xl bg-cyan-500/10 p-2.5 text-xs font-black text-cyan-300">Generar reporte</button>
          </div>
        </aside>

        <main className="rounded-2xl border border-white/[.07] bg-[#0d0d12] p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-black text-white"><LayoutGrid size={15} className="text-purple-300" /> Lienzo del reporte</p>
              <p className="mt-1 text-[10px] text-zinc-600">{loading ? "Cargando datos..." : `${totalRows.toLocaleString("es-HN")} registros · L ${totalAmount.toLocaleString("es-HN", { maximumFractionDigits: 2 })}`}</p>
            </div>
            <span className="rounded-full border border-emerald-400/15 bg-emerald-500/[.06] px-3 py-1.5 text-[9px] font-black text-emerald-300">MODO EDICIÓN</span>
          </div>
          <div className="grid grid-cols-12 gap-3 rounded-xl border border-dashed border-white/[.07] bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:24px_24px] p-3">
            {visuals.map((visual) => (
              <VisualCard
                key={visual.id}
                visual={visual}
                rows={rows}
                selected={selectedId === visual.id}
                onSelect={() => setSelectedId(visual.id)}
                onDragStart={() => setDraggedId(visual.id)}
                onDrop={() => reorder(visual.id)}
              />
            ))}
            {!visuals.length && <div className="col-span-12 grid min-h-80 place-items-center text-center text-sm text-zinc-600">Agrega un elemento desde el panel izquierdo.</div>}
          </div>
        </main>

        <aside className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
          <p className="flex items-center gap-2 text-xs font-black text-white"><Settings2 size={15} className="text-purple-300" /> Propiedades</p>
          {!selected ? (
            <div className="mt-8 text-center text-xs leading-5 text-zinc-600">Selecciona un visual del lienzo para configurarlo.</div>
          ) : (
            <div className="mt-4 space-y-4">
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Título<input value={selected.title} onChange={(event) => patchSelected({ title: event.target.value })} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#0d0d12] p-3 text-xs text-white outline-none focus:border-purple-400/40" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Tipo<select value={selected.type} onChange={(event) => patchSelected({ type: event.target.value as VisualType })} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#0d0d12] p-3 text-xs text-white">{visualCatalog.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Dimensión<select value={selected.dimension} onChange={(event) => patchSelected({ dimension: event.target.value })} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#0d0d12] p-3 text-xs text-white">{dimensions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Medida<select value={selected.measure} onChange={(event) => patchSelected({ measure: event.target.value })} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#0d0d12] p-3 text-xs text-white">{measures.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Tamaño</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["small", "medium", "large"] as Size[]).map((size) => (
                    <button key={size} onClick={() => patchSelected({ size })} className={`rounded-lg border p-2 text-[10px] font-bold ${selected.size === size ? "border-purple-400/40 bg-purple-500/10 text-purple-200" : "border-white/[.07] text-zinc-500"}`}>{size === "small" ? "Pequeño" : size === "medium" ? "Mediano" : "Grande"}</button>
                  ))}
                </div>
              </div>
              <button onClick={removeSelected} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs font-black text-rose-300"><Trash2 size={15} /> Eliminar visual</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function VisualCard({ visual, rows, selected, onSelect, onDragStart, onDrop }: {
  visual: Visual;
  rows: SalesRow[];
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const points = useMemo(() => aggregate(rows, visual), [rows, visual]);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const width = visual.size === "small" ? "col-span-12 md:col-span-4" : visual.size === "medium" ? "col-span-12 xl:col-span-6" : "col-span-12";
  return (
    <section
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      className={`${width} min-h-44 overflow-hidden rounded-2xl border bg-[#121218] transition ${selected ? "border-purple-400/60 shadow-[0_0_0_2px_rgba(168,85,247,.12)]" : "border-white/[.07] hover:border-white/[.14]"}`}
    >
      <header className="flex cursor-grab items-center justify-between border-b border-white/[.06] px-4 py-3 active:cursor-grabbing">
        <div className="min-w-0"><p className="truncate text-xs font-black text-white">{visual.title}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">{dimensions.find((item) => item.value === visual.dimension)?.label} · {measures.find((item) => item.value === visual.measure)?.label}</p></div>
        <div className="flex items-center gap-2 text-zinc-600"><GripVertical size={15} />{visual.size === "large" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</div>
      </header>
      <div className="h-64 p-4">
        {visual.type === "kpi" && <div className="grid h-full place-items-center text-center"><div><p className="text-4xl font-black text-white">{formatValue(total, visual.measure)}</p><p className="mt-2 text-xs text-zinc-500">Resultado del período seleccionado</p></div></div>}
        {visual.type === "bar" && <ResponsiveContainer width="100%" height="100%"><BarChart data={points} margin={{ left: -15 }}><CartesianGrid stroke="#24242b" vertical={false} /><XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 9 }} interval="preserveStartEnd" /><YAxis stroke="#71717a" tick={{ fontSize: 9 }} /><Tooltip contentStyle={{ background: "#111116", border: "1px solid #30243d", borderRadius: 10 }} /><Bar dataKey="value" fill="#a855f7" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}
        {visual.type === "line" && <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ left: -15 }}><CartesianGrid stroke="#24242b" vertical={false} /><XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 9 }} /><YAxis stroke="#71717a" tick={{ fontSize: 9 }} /><Tooltip contentStyle={{ background: "#111116", border: "1px solid #30243d", borderRadius: 10 }} /><Line type="monotone" dataKey="value" stroke="#c084fc" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>}
        {visual.type === "pie" && <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={points.slice(0, 8)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>{points.slice(0, 8).map((point, index) => <Cell key={point.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={{ background: "#111116", border: "1px solid #30243d", borderRadius: 10 }} /></PieChart></ResponsiveContainer>}
        {visual.type === "table" && <div className="h-full overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#121218] text-zinc-600"><tr><th className="pb-3">Categoría</th><th className="pb-3 text-right">Valor</th></tr></thead><tbody>{points.map((point) => <tr key={point.name} className="border-t border-white/[.05]"><td className="py-2.5 text-zinc-300">{point.name}</td><td className="py-2.5 text-right font-bold text-white">{formatValue(point.value, visual.measure)}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
  );
}
