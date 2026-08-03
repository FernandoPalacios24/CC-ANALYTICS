"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CloudUpload,
  Database,
  FileSpreadsheet,
  Loader2,
  X,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Department, Profile } from "@/components/analytics-app-v2";
import type { ProductionFilters } from "@/components/real-department-dashboard";
import {
  moduleOptionsForDepartment,
  salesDepartments,
} from "@/lib/production-platform";
import { supabase } from "@/lib/supabase-client";

type RawRow = Record<string, unknown>;

type DetectedMetric = {
  key: string;
  label: string;
  unit:
    | "number"
    | "count"
    | "currency"
    | "percent"
    | "minutes"
    | "hours"
    | "days"
    | "ratio";
  value: number;
  numericRows: number;
  totalRows: number;
};

type CommitResult = {
  loaded_records?: number;
  removed_records?: number;
  removed_imported_metrics?: number;
  imported_metrics?: number;
  protected_manual_metrics?: number;
  superseded_imports?: number;
};

const departments: Department[] = [
  "Ventas Digitales",
  "Ventas Residenciales",
  "Ventas Residenciales Rurales",
  "Ventas Corporativas",
  "Marketing",
  "Call Center",
  "Recursos Humanos",
  "Finanzas",
  "Operaciones",
];

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
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const match = normalized.match(/^([a-z]+)\s+(\d{4})$/);
  if (!match || !months[match[1]]) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return `${match[2]}-${String(months[match[1]]).padStart(2, "0")}-01`;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text
    .replace(/[()]/g, "")
    .replace(/L\.?|HNL|USD|\$|%/gi, "")
    .replace(/\s/g, "")
    .replace(/,/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function detectUnit(label: string): DetectedMetric["unit"] {
  const key = normalizeKey(label);
  if (
    /(monto|ingreso|costo|valor|inversion|cartera|factura|revenue|spend)/.test(
      key,
    )
  ) {
    return "currency";
  }
  if (
    /(porcentaje|percent|tasa|rate|cumplimiento|sla|csat|cobertura|disponibilidad|margen)/.test(
      key,
    )
  ) {
    return "percent";
  }
  if (/(minuto|minutes|tiempo_respuesta)/.test(key)) return "minutes";
  if (/(hora|hours)/.test(key)) return "hours";
  if (/(dias|days)/.test(key)) return "days";
  if (/(ratio|roas|roa|rotacion)/.test(key)) return "ratio";
  if (
    /(cantidad|total|numero|count|ventas|clientes|llamadas|tickets|ordenes|empleados|vacantes)/.test(
      key,
    )
  ) {
    return "count";
  }
  return "number";
}

function detectMetrics(rows: RawRow[]) {
  if (!rows.length) return [];
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return headers.flatMap((header): DetectedMetric[] => {
    const numbers = rows
      .map((row) => parseNumber(row[header]))
      .filter((value): value is number => value !== null);
    const nonEmpty = rows.filter((row) =>
      String(row[header] ?? "").trim(),
    ).length;
    if (!numbers.length || !nonEmpty || numbers.length / nonEmpty < 0.6) {
      return [];
    }
    const unit = detectUnit(header);
    const averageUnits: DetectedMetric["unit"][] = [
      "percent",
      "minutes",
      "hours",
      "days",
      "ratio",
    ];
    const value = averageUnits.includes(unit)
      ? numbers.reduce((sum, current) => sum + current, 0) / numbers.length
      : numbers.reduce((sum, current) => sum + current, 0);
    return [
      {
        key: normalizeKey(header),
        label: header,
        unit,
        value,
        numericRows: numbers.length,
        totalRows: rows.length,
      },
    ];
  });
}

function formatValue(metric: DetectedMetric) {
  if (metric.unit === "currency") {
    return new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: "HNL",
      maximumFractionDigits: 0,
    }).format(metric.value);
  }
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "ratio") return `${metric.value.toFixed(2)}x`;
  return new Intl.NumberFormat("es-HN", {
    maximumFractionDigits: 2,
  }).format(metric.value);
}

const inputClass =
  "w-full rounded-xl border border-white/[.09] bg-[#111116] p-3 text-xs text-white outline-none focus:border-purple-400/50";

export function DepartmentImportCenter({
  profile,
  filters,
  initialDepartment,
  onClose,
}: {
  profile: Profile;
  filters: ProductionFilters;
  initialDepartment: Department;
  onClose?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [department, setDepartment] = useState<Department>(initialDepartment);
  const modules = useMemo(
    () => moduleOptionsForDepartment(department),
    [department],
  );
  const [moduleKey, setModuleKey] = useState(
    modules[0]?.moduleKey || "general",
  );
  const [zone, setZone] = useState(
    filters.region !== "Todas las zonas"
      ? filters.region
      : profile.zone === "Nacional"
        ? "Nacional"
        : profile.zone,
  );
  const [rows, setRows] = useState<RawRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [metrics, setMetrics] = useState<DetectedMetric[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const periodMonth = monthIso(filters.month);

  async function parseFile(file: File) {
    setError("");
    setNotice("");
    try {
      let parsed: RawRow[] = [];
      let sheet = "CSV";
      if (file.name.toLowerCase().endsWith(".csv")) {
        parsed = await new Promise<RawRow[]>((resolve, reject) => {
          Papa.parse<RawRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (result) => resolve(result.data),
            error: reject,
          });
        });
      } else {
        const buffer = await file.arrayBuffer();
        const book = XLSX.read(buffer, { cellDates: true });
        sheet = book.SheetNames[0];
        parsed = XLSX.utils.sheet_to_json<RawRow>(book.Sheets[sheet], {
          defval: "",
          raw: false,
        });
      }
      const cleaned = parsed.filter((row) =>
        Object.values(row).some((value) => String(value ?? "").trim()),
      );
      if (!cleaned.length) {
        throw new Error("El archivo no contiene filas utilizables.");
      }
      setRows(cleaned);
      setFileName(file.name);
      setSheetName(sheet);
      setMetrics(detectMetrics(cleaned));
    } catch (parseError) {
      setRows([]);
      setMetrics([]);
      setFileName("");
      setError(
        parseError instanceof Error
          ? parseError.message
          : "No se pudo leer el archivo.",
      );
    }
  }

  async function abortImport(importId: string, reason: string) {
    await supabase.rpc("analytics_abort_department_import", {
      target_import_id: importId,
      target_reason: reason,
    });
  }

  async function save() {
    if (!rows.length || !fileName) return;
    if (salesDepartments.includes(department)) {
      setError(
        "Las ventas deben cargarse desde Ingreso de ventas para conservar vendedor, corte, coincidencia y sustitución acumulada.",
      );
      return;
    }
    if (!moduleKey) {
      setError("Selecciona el módulo que recibirá la información.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const { data: created, error: importError } = await supabase
      .from("analytics_imports")
      .insert({
        file_name: fileName,
        department,
        zone,
        module: moduleKey,
        row_count: rows.length,
        uploaded_by: profile.id,
        period_start: periodMonth,
        period_end: periodMonth,
        snapshot_as_of: periodMonth,
        import_mode: "replace",
      })
      .select("id")
      .single();

    if (importError || !created) {
      setError(importError?.message || "No se pudo registrar la importación.");
      setSaving(false);
      return;
    }

    const importId = created.id as string;

    for (let start = 0; start < rows.length; start += 500) {
      const batch = rows.slice(start, start + 500).map((payload) => ({
        import_id: importId,
        department,
        zone,
        module: moduleKey,
        period: periodMonth.slice(0, 7),
        payload,
        created_by: profile.id,
      }));
      const { error: recordError } = await supabase
        .from("analytics_records")
        .insert(batch);
      if (recordError) {
        await abortImport(importId, recordError.message);
        setError(
          `La carga fue cancelada sin reemplazar el período anterior: ${recordError.message}`,
        );
        setSaving(false);
        return;
      }
    }

    const metricPayload = metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      value: metric.value,
      notes: `${fileName} · ${sheetName} · ${metric.numericRows}/${metric.totalRows} filas numéricas`,
    }));

    const { data: commitData, error: commitError } = await supabase.rpc(
      "analytics_commit_department_import",
      {
        current_import_id: importId,
        target_department: department,
        target_zone: zone,
        target_module: moduleKey,
        target_period_month: periodMonth,
        target_metrics: metricPayload,
      },
    );

    if (commitError) {
      await abortImport(importId, commitError.message);
      setError(
        `La carga fue cancelada sin reemplazar el período anterior: ${commitError.message}`,
      );
      setSaving(false);
      return;
    }

    const result = (commitData || {}) as CommitResult;
    setNotice(
      `${Number(result.loaded_records || rows.length).toLocaleString("es-HN")} filas y ${Number(result.imported_metrics || 0)} indicadores confirmados. ${Number(result.removed_records || 0)} filas del corte anterior fueron sustituidas.${Number(result.protected_manual_metrics || 0) ? ` ${result.protected_manual_metrics} correcciones manuales permanecieron protegidas.` : ""}`,
    );
    setSaving(false);
    window.dispatchEvent(new CustomEvent("cc-analytics-data-changed"));
  }

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">
            Carga real · Supabase
          </p>
          <h2 className="mt-1 text-xl font-black">
            Importar datos departamentales
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            La sustitución solo se confirma cuando todas las filas e indicadores nuevos quedaron guardados.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-xl border border-white/[.08] p-2.5 text-zinc-400"
          >
            <X size={18} />
          </button>
        )}
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

      <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Departamento
            <select
              value={department}
              disabled={profile.role !== "Administrador"}
              onChange={(event) => {
                const next = event.target.value as Department;
                setDepartment(next);
                const nextModules = moduleOptionsForDepartment(next);
                setModuleKey(nextModules[0]?.moduleKey || "general");
              }}
              className={`mt-2 ${inputClass} disabled:opacity-60`}
            >
              {(profile.role === "Administrador"
                ? departments
                : [profile.department]
              ).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Módulo destino
            <select
              value={moduleKey}
              onChange={(event) => setModuleKey(event.target.value)}
              className={`mt-2 ${inputClass}`}
            >
              {modules.map((module) => (
                <option
                  key={`${module.ownerDepartment}-${module.moduleKey}`}
                  value={module.moduleKey}
                >
                  {module.title}
                </option>
              ))}
              {!modules.length && (
                <option value="general">Indicadores generales</option>
              )}
            </select>
          </label>

          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Zona
            <select
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              className={`mt-2 ${inputClass}`}
            >
              {["Nacional", "Zona Norte", "Zona Centro", "Zona Sur", profile.zone]
                .filter(
                  (value, index, all) =>
                    value && all.indexOf(value) === index,
                )
                .map((item) => (
                  <option key={item}>{item}</option>
                ))}
            </select>
          </label>

          <div className="rounded-xl border border-purple-400/15 bg-purple-500/[.05] p-4 text-[10px] leading-5 text-zinc-400">
            <b className="text-purple-300">Período:</b> {filters.month}. Una carga fallida no toca el corte vigente.
          </div>
        </div>

        <div
          onClick={() => !saving && inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void parseFile(file);
          }}
          className="mt-5 grid min-h-56 cursor-pointer place-items-center rounded-2xl border border-dashed border-cyan-400/25 bg-cyan-500/[.025] p-8 text-center"
        >
          <div>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <CloudUpload size={24} />
            </span>
            <h3 className="mt-4 font-black">Arrastra Excel o CSV</h3>
            <p className="mt-2 text-xs text-zinc-500">
              Detecta columnas numéricas y conserva todas las filas para reportes.
            </p>
            <button
              type="button"
              className="mt-5 rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-black"
            >
              Seleccionar archivo
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void parseFile(file);
              }}
            />
          </div>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
          <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-black">Vista previa y métricas detectadas</h3>
              <p className="mt-1 text-[10px] text-zinc-600">
                {fileName} · {sheetName} · {rows.length.toLocaleString("es-HN")} filas
              </p>
            </div>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Database size={16} />
              )}
              Confirmar carga completa
            </button>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.key}
                className="rounded-xl border border-white/[.06] bg-white/[.02] p-4"
              >
                <p className="truncate text-xs font-bold text-zinc-200">
                  {metric.label}
                </p>
                <p className="mt-2 text-lg font-black text-cyan-300">
                  {formatValue(metric)}
                </p>
                <p className="mt-1 text-[9px] text-zinc-600">
                  {metric.numericRows}/{metric.totalRows} filas numéricas · {metric.unit}
                </p>
              </div>
            ))}
            {!metrics.length && (
              <div className="col-span-full rounded-xl border border-amber-500/15 bg-amber-500/[.05] p-4 text-xs text-amber-200">
                No se detectaron columnas numéricas. Las filas todavía pueden guardarse para el laboratorio de reportes.
              </div>
            )}
          </div>

          <div className="max-h-80 overflow-auto border-t border-white/[.06]">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#17171e] text-[10px] uppercase tracking-wider text-zinc-600">
                <tr>
                  {Object.keys(rows[0]).map((header) => (
                    <th key={header} className="whitespace-nowrap px-4 py-3">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, index) => (
                  <tr key={index} className="border-t border-white/[.05]">
                    {Object.keys(rows[0]).map((header) => (
                      <td
                        key={header}
                        className="max-w-64 truncate px-4 py-3 text-zinc-400"
                      >
                        {String(row[header] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-[10px] leading-5 text-zinc-500">
        <FileSpreadsheet className="mr-2 inline text-cyan-300" size={14} />
        Las ventas residenciales y digitales usan el motor especializado de vendedores, fechas de corte y coincidencia inteligente.
      </section>
    </div>
  );
}
