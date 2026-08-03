"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock3,
  Database,
  Loader2,
  PencilLine,
  RefreshCw,
  Save,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Department, Profile } from "@/components/analytics-app-v2";
import { canEditMetrics } from "@/lib/production-platform";
import { supabase } from "@/lib/supabase-client";

type MetricDefinition = {
  id: string;
  department: string;
  module_key: string;
  metric_key: string;
  label: string;
  description: string | null;
  unit: MetricUnit;
  aggregation: "sum" | "average" | "latest" | "minimum" | "maximum";
  sort_order: number;
};

type MetricValue = {
  id: string;
  metric_id: string;
  department: string;
  module_key: string;
  zone: string;
  period_month: string;
  value: number | string;
  target_value: number | string | null;
  source_type: "manual" | "import" | "calculated";
  source_import_id: string | null;
  notes: string | null;
  updated_at: string;
};

type MetricUnit =
  | "number"
  | "count"
  | "currency"
  | "percent"
  | "minutes"
  | "hours"
  | "days"
  | "ratio";

type MetricRow = MetricDefinition & {
  value: number;
  previous: number;
  target: number | null;
  source: MetricValue["source_type"] | null;
  updatedAt: string | null;
  notes: string | null;
  projection: number;
};

export type ProductionFilters = {
  month: string;
  region: string;
  city: string;
  channel: string;
};

function monthLabelToIso(label: string) {
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
  const normalized = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const match = normalized.match(/^([a-z]+)\s+(\d{4})$/);
  if (!match || !months[match[1]]) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return `${match[2]}-${String(months[match[1]]).padStart(2, "0")}-01`;
}

function previousMonth(monthIso: string) {
  const [year, month] = monthIso.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregate(values: MetricValue[], definition: MetricDefinition) {
  if (!values.length) return 0;
  const numbers = values.map((row) => numberValue(row.value));
  if (definition.aggregation === "average") {
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }
  if (definition.aggregation === "minimum") return Math.min(...numbers);
  if (definition.aggregation === "maximum") return Math.max(...numbers);
  if (definition.aggregation === "latest") {
    const latest = [...values].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    return numberValue(latest?.value);
  }
  return numbers.reduce((sum, value) => sum + value, 0);
}

function aggregateTarget(values: MetricValue[], definition: MetricDefinition) {
  const targets = values.filter((row) => row.target_value !== null);
  if (!targets.length) return null;
  const numbers = targets.map((row) => numberValue(row.target_value));
  if (["average", "latest"].includes(definition.aggregation)) {
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }
  if (definition.aggregation === "minimum") return Math.min(...numbers);
  if (definition.aggregation === "maximum") return Math.max(...numbers);
  return numbers.reduce((sum, value) => sum + value, 0);
}

function formatMetric(value: number, unit: MetricUnit) {
  if (unit === "currency") {
    return new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: "HNL",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  if (unit === "minutes") return `${value.toFixed(0)} min`;
  if (unit === "hours") return `${value.toFixed(1)} h`;
  if (unit === "days") return `${value.toFixed(1)} días`;
  return new Intl.NumberFormat("es-HN", {
    maximumFractionDigits: unit === "count" ? 0 : 2,
  }).format(value);
}

function change(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function projection(value: number, definition: MetricDefinition, monthIso: string) {
  if (!["sum"].includes(definition.aggregation)) return value;
  const now = new Date();
  const selected = new Date(`${monthIso}T12:00:00`);
  if (
    selected.getFullYear() !== now.getFullYear() ||
    selected.getMonth() !== now.getMonth()
  ) {
    return value;
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsed = Math.max(1, now.getDate());
  return (value / elapsed) * daysInMonth;
}

function sourceLabel(source: MetricValue["source_type"] | null) {
  if (source === "import") return "Archivo";
  if (source === "calculated") return "Calculado";
  if (source === "manual") return "Manual";
  return "Sin datos";
}

const inputClass =
  "w-full rounded-xl border border-white/[.09] bg-[#111116] px-3 py-2.5 text-xs text-white outline-none focus:border-purple-400/50";

export function RealDepartmentDashboard({
  profile,
  department,
  moduleKey,
  title,
  filters,
  projectionMode = false,
  onOpenImport,
}: {
  profile: Profile;
  department: Department;
  moduleKey: string;
  title: string;
  filters: ProductionFilters;
  projectionMode?: boolean;
  onOpenImport?: () => void;
}) {
  const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
  const [values, setValues] = useState<MetricValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [editZone, setEditZone] = useState(
    filters.region !== "Todas las zonas"
      ? filters.region
      : profile.zone === "Nacional"
        ? "Nacional"
        : profile.zone,
  );
  const [drafts, setDrafts] = useState<
    Record<string, { value: string; target: string; notes: string }>
  >({});

  const periodMonth = useMemo(() => monthLabelToIso(filters.month), [filters.month]);
  const previousPeriod = useMemo(() => previousMonth(periodMonth), [periodMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const definitionQuery = supabase
      .from("analytics_metric_definitions")
      .select(
        "id,department,module_key,metric_key,label,description,unit,aggregation,sort_order",
      )
      .eq("department", department)
      .eq("module_key", moduleKey)
      .eq("active", true)
      .order("sort_order")
      .order("label");

    let valueQuery = supabase
      .from("analytics_metric_values")
      .select(
        "id,metric_id,department,module_key,zone,period_month,value,target_value,source_type,source_import_id,notes,updated_at",
      )
      .eq("department", department)
      .eq("module_key", moduleKey)
      .in("period_month", [periodMonth, previousPeriod]);

    if (filters.region !== "Todas las zonas") {
      valueQuery = valueQuery.eq("zone", filters.region);
    }

    const [definitionResult, valueResult] = await Promise.all([
      definitionQuery,
      valueQuery,
    ]);

    if (definitionResult.error || valueResult.error) {
      setError(
        definitionResult.error?.message ||
          valueResult.error?.message ||
          "No se pudieron cargar los indicadores.",
      );
      setLoading(false);
      return;
    }

    const nextDefinitions = (definitionResult.data || []) as MetricDefinition[];
    const nextValues = (valueResult.data || []) as MetricValue[];
    setDefinitions(nextDefinitions);
    setValues(nextValues);

    const zoneValues = nextValues.filter(
      (row) => row.period_month === periodMonth && row.zone === editZone,
    );
    setDrafts(
      Object.fromEntries(
        nextDefinitions.map((definition) => {
          const value = zoneValues.find((row) => row.metric_id === definition.id);
          return [
            definition.id,
            {
              value: value ? String(value.value) : "0",
              target: value?.target_value === null || value?.target_value === undefined
                ? ""
                : String(value.target_value),
              notes: value?.notes || "",
            },
          ];
        }),
      ),
    );
    setLoading(false);
  }, [department, editZone, filters.region, moduleKey, periodMonth, previousPeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`metrics-${department}-${moduleKey}-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analytics_metric_values" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [department, load, moduleKey, profile.id]);

  const rows = useMemo<MetricRow[]>(() => {
    return definitions.map((definition) => {
      const currentValues = values.filter(
        (row) =>
          row.metric_id === definition.id && row.period_month === periodMonth,
      );
      const previousValues = values.filter(
        (row) =>
          row.metric_id === definition.id && row.period_month === previousPeriod,
      );
      const current = aggregate(currentValues, definition);
      const latest = [...currentValues].sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      )[0];
      return {
        ...definition,
        value: current,
        previous: aggregate(previousValues, definition),
        target: aggregateTarget(currentValues, definition),
        source: latest?.source_type || null,
        updatedAt: latest?.updated_at || null,
        notes: latest?.notes || null,
        projection: projection(current, definition, periodMonth),
      };
    });
  }, [definitions, periodMonth, previousPeriod, values]);

  const editable =
    canEditMetrics(profile) &&
    (profile.role === "Administrador" || profile.department === department);

  const latestUpdate = rows
    .map((row) => row.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  async function saveAll() {
    if (!editable) return;
    setSaving(true);
    setNotice("");
    for (const definition of definitions) {
      const draft = drafts[definition.id] || { value: "0", target: "", notes: "" };
      const { error: saveError } = await supabase.rpc(
        "analytics_upsert_department_metric",
        {
          target_department: department,
          target_module_key: moduleKey,
          target_metric_key: definition.metric_key,
          target_label: definition.label,
          target_unit: definition.unit,
          target_zone: editZone,
          target_period_month: periodMonth,
          target_value: numberValue(draft.value),
          target_target_value: draft.target.trim() ? numberValue(draft.target) : null,
          target_notes: draft.notes,
          target_source_type: "manual",
          target_source_import_id: null,
        },
      );
      if (saveError) {
        setNotice(`No se pudo guardar ${definition.label}: ${saveError.message}`);
        setSaving(false);
        return;
      }
    }
    setNotice("Indicadores actualizados y registrados en la bitácora.");
    setSaving(false);
    setEditorOpen(false);
    await load();
    window.dispatchEvent(new CustomEvent("cc-analytics-data-changed"));
  }

  const chartData = rows.map((row) => ({
    name: row.label,
    actual: Number(row.value.toFixed(2)),
    meta: row.target === null ? 0 : Number(row.target.toFixed(2)),
    proyeccion: projectionMode ? Number(row.projection.toFixed(2)) : 0,
  }));

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
            Datos reales · {department}
          </p>
          <h2 className="mt-1 text-xl font-black">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {filters.month} · {filters.region}. Los indicadores sin carga permanecen en cero.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenImport && (
            <button
              onClick={onOpenImport}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-500/[.05] px-4 py-2.5 text-xs font-bold text-cyan-200"
            >
              <Database size={15} /> Importar datos
            </button>
          )}
          {editable && (
            <button
              onClick={() => setEditorOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-black"
            >
              <PencilLine size={15} /> Editar indicadores
            </button>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
            Actualizar
          </button>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
          <AlertTriangle className="mr-2 inline" size={15} /> {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-3 text-xs text-emerald-300">
          <Check className="mr-2 inline" size={15} /> {notice}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.slice(0, 4).map((row) => {
          const delta = change(row.value, row.previous);
          const positive = delta >= 0;
          const displayed = projectionMode ? row.projection : row.value;
          return (
            <section
              key={row.id}
              className="relative overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025] p-5"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-purple-400 to-violet-700" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">
                    {row.label}
                  </p>
                  <p className="mt-3 text-2xl font-black">
                    {formatMetric(displayed, row.unit)}
                  </p>
                </div>
                <span className="rounded-xl bg-purple-500/10 p-2.5 text-purple-300">
                  {projectionMode ? <Target size={19} /> : <BarChart3 size={19} />}
                </span>
              </div>
              <div className={`mt-3 flex items-center gap-1 text-xs font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
                {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {Math.abs(delta).toFixed(1)}%
                <span className="font-normal text-zinc-600">vs mes anterior</span>
              </div>
              <p className="mt-2 text-[9px] text-zinc-600">
                Fuente: {sourceLabel(row.source)}
              </p>
            </section>
          );
        })}
        {!rows.length && !loading && (
          <section className="col-span-full rounded-2xl border border-dashed border-white/[.08] p-10 text-center text-sm text-zinc-600">
            Este módulo todavía no tiene indicadores definidos. Carga un archivo para crearlos automáticamente.
          </section>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <div className="mb-5">
            <h3 className="text-sm font-black">Indicadores, metas y proyección</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Todos los valores provienen de Supabase y conservan su fuente.
            </p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 5, right: 10, bottom: 30 }}>
                <CartesianGrid stroke="#24242b" strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#52525b"
                  tick={{ fontSize: 9 }}
                  angle={-18}
                  textAnchor="end"
                  height={65}
                />
                <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "#121218",
                    border: "1px solid #30243d",
                    borderRadius: 12,
                    fontSize: 11,
                  }}
                />
                <Legend />
                <Bar dataKey="actual" name="Actual" fill="#a855f7" radius={[6, 6, 0, 0]} />
                <Bar dataKey="meta" name="Meta" fill="#334155" radius={[6, 6, 0, 0]} />
                {projectionMode && (
                  <Bar dataKey="proyeccion" name="Proyección" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
          <div className="border-b border-white/[.06] p-5">
            <h3 className="text-sm font-black">Control de información</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Estado de carga y cumplimiento por indicador.
            </p>
          </div>
          <div className="max-h-80 overflow-auto">
            {rows.map((row) => {
              const progress = row.target && row.target !== 0
                ? (row.value / row.target) * 100
                : null;
              return (
                <div key={row.id} className="border-b border-white/[.05] p-4 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-zinc-200">{row.label}</p>
                      <p className="mt-1 text-[9px] text-zinc-600">
                        {sourceLabel(row.source)} · {row.updatedAt ? new Date(row.updatedAt).toLocaleString("es-HN") : "sin actualización"}
                      </p>
                    </div>
                    <span className="text-xs font-black text-purple-200">
                      {progress === null ? "SIN META" : `${progress.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[.05]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500"
                      style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <p className="text-right text-[9px] text-zinc-700">
        <Clock3 className="mr-1 inline" size={11} />
        Última actualización: {latestUpdate ? new Date(latestUpdate).toLocaleString("es-HN") : "sin datos cargados"}
      </p>

      {editorOpen && (
        <div className="fixed inset-0 z-[160] grid place-items-center bg-black/80 p-4">
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-purple-400/20 bg-[#0d0d12] shadow-2xl">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[.07] bg-[#0d0d12]/95 p-5 backdrop-blur-xl">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-purple-300">
                  Corrección controlada
                </p>
                <h3 className="mt-1 text-lg font-black">Editar indicadores de {title}</h3>
              </div>
              <button
                onClick={() => setEditorOpen(false)}
                className="rounded-xl border border-white/[.08] p-2.5 text-zinc-400"
              >
                <X size={18} />
              </button>
            </header>
            <div className="p-5">
              <div className="mb-5 grid gap-4 sm:grid-cols-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                  Zona que se actualizará
                  <select
                    value={editZone}
                    onChange={(event) => setEditZone(event.target.value)}
                    className={`mt-2 ${inputClass}`}
                  >
                    {["Nacional", "Zona Norte", "Zona Centro", "Zona Sur", profile.zone]
                      .filter((value, index, all) => value && all.indexOf(value) === index)
                      .map((zone) => <option key={zone}>{zone}</option>)}
                  </select>
                </label>
                <div className="rounded-xl border border-purple-400/15 bg-purple-500/[.05] p-4 text-[10px] leading-5 text-zinc-400">
                  Cada modificación registra usuario, fecha, indicador, valor anterior, valor nuevo y fuente en la bitácora.
                </div>
              </div>

              <div className="space-y-3">
                {definitions.map((definition) => {
                  const draft = drafts[definition.id] || { value: "0", target: "", notes: "" };
                  return (
                    <div key={definition.id} className="grid gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-4 lg:grid-cols-[1.1fr_.7fr_.7fr_1.3fr] lg:items-end">
                      <div>
                        <p className="text-xs font-black text-zinc-200">{definition.label}</p>
                        <p className="mt-1 text-[9px] text-zinc-600">{definition.description || definition.metric_key}</p>
                      </div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                        Valor
                        <input
                          type="number"
                          step="any"
                          value={draft.value}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [definition.id]: { ...draft, value: event.target.value },
                          }))}
                          className={`mt-2 ${inputClass}`}
                        />
                      </label>
                      <label className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                        Meta
                        <input
                          type="number"
                          step="any"
                          value={draft.target}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [definition.id]: { ...draft, target: event.target.value },
                          }))}
                          className={`mt-2 ${inputClass}`}
                        />
                      </label>
                      <label className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                        Nota / justificación
                        <input
                          value={draft.notes}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [definition.id]: { ...draft, notes: event.target.value },
                          }))}
                          placeholder="Origen o explicación del ajuste"
                          className={`mt-2 ${inputClass}`}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => void saveAll()}
                disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-black disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar indicadores y registrar cambios
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
