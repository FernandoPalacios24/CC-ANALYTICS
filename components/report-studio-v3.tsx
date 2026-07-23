"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  FileDown,
  Filter,
  Grid3X3,
  Layers3,
  LineChart as LineChartIcon,
  Loader2,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

type SourceMode = "sales" | "imports";
type StudioMode = "ai" | "quick" | "advanced";
type VisualType =
  | "kpi"
  | "table"
  | "pivot"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "traffic"
  | "funnel";
type Aggregation = "count" | "sum" | "average" | "min" | "max" | "distinct";
type Calculation =
  | "none"
  | "share"
  | "projection"
  | "month_change"
  | "goal_progress";
type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater"
  | "less"
  | "between";
type GenericRow = Record<string, unknown>;
type FilterRule = {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  valueTo: string;
};
type ReportWidget = {
  id: string;
  title: string;
  type: VisualType;
  rowField: string;
  columnField: string;
  valueField: string;
  aggregation: Aggregation;
  calculation: Calculation;
  formula: string;
  sort: "asc" | "desc";
  limit: number;
  filters: FilterRule[];
};
type ReportSpec = {
  version: 3;
  title: string;
  description: string;
  analysis: string;
  source: SourceMode;
  goal: number;
  globalFilters: FilterRule[];
  widgets: ReportWidget[];
};
type TemplateRow = {
  id: string;
  name: string;
  definition: unknown;
};
type FieldInfo = {
  key: string;
  label: string;
  kind: "number" | "date" | "text";
};
type DataPoint = {
  name: string;
  secondary: string;
  value: number;
};

const COLORS = [
  "#a855f7",
  "#d946ef",
  "#22d3ee",
  "#34d399",
  "#f59e0b",
  "#fb7185",
  "#818cf8",
];

const VISUALS: {
  value: VisualType;
  label: string;
  icon: typeof Table2;
}[] = [
  { value: "kpi", label: "Indicador", icon: Calculator },
  { value: "table", label: "Tabla", icon: Table2 },
  { value: "pivot", label: "Tabla dinámica", icon: Grid3X3 },
  { value: "bar", label: "Barras", icon: BarChart3 },
  { value: "line", label: "Línea", icon: LineChartIcon },
  { value: "area", label: "Área", icon: Layers3 },
  { value: "pie", label: "Distribución", icon: PieChartIcon },
  { value: "traffic", label: "Semáforo", icon: Sparkles },
  { value: "funnel", label: "Embudo", icon: WandSparkles },
];

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "Es igual a" },
  { value: "not_equals", label: "No es igual a" },
  { value: "contains", label: "Contiene" },
  { value: "not_contains", label: "No contiene" },
  { value: "greater", label: "Mayor que" },
  { value: "less", label: "Menor que" },
  { value: "between", label: "Entre" },
];

const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: "count", label: "Contar registros" },
  { value: "sum", label: "Sumar" },
  { value: "average", label: "Promedio" },
  { value: "min", label: "Mínimo" },
  { value: "max", label: "Máximo" },
  { value: "distinct", label: "Valores únicos" },
];

const CALCULATIONS: { value: Calculation; label: string }[] = [
  { value: "none", label: "Sin cálculo adicional" },
  { value: "share", label: "% de participación" },
  { value: "projection", label: "Proyección al cierre" },
  { value: "month_change", label: "% variación vs mes anterior" },
  { value: "goal_progress", label: "% cumplimiento de meta" },
];

const SALES_FIELD_ORDER = [
  "Mes",
  "Fecha",
  "Departamento",
  "Zona",
  "Región",
  "Ciudad",
  "Supervisor",
  "Vendedor",
  "Equipo",
  "Tipo de venta",
  "Servicio",
  "Canal",
  "Principal",
  "Paquete",
  "Monto facturado",
  "Ingreso comisión",
];

function uid(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numberFrom(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-HN", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("es-HN", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function emptyFilter(field = ""): FilterRule {
  return {
    id: uid("filter"),
    field,
    operator: "equals",
    value: "",
    valueTo: "",
  };
}

function emptyWidget(type: VisualType = "bar"): ReportWidget {
  return {
    id: uid("widget"),
    title: "Nuevo análisis",
    type,
    rowField: "Mes",
    columnField: "",
    valueField: "__rows",
    aggregation: "count",
    calculation: "none",
    formula: "",
    sort: type === "line" || type === "area" ? "asc" : "desc",
    limit: 20,
    filters: [],
  };
}

function defaultReport(): ReportSpec {
  return {
    version: 3,
    title: "Resumen ejecutivo comercial",
    description: "Ventas, tendencia, jerarquía y territorio en una sola vista.",
    analysis:
      "Edita cualquier bloque o pide al copiloto una nueva combinación.",
    source: "sales",
    goal: 300,
    globalFilters: [],
    widgets: [
      {
        ...emptyWidget("kpi"),
        id: "sales-total",
        title: "Ventas del período",
        rowField: "",
        limit: 1,
      },
      {
        ...emptyWidget("kpi"),
        id: "sales-projection",
        title: "Proyección de cierre",
        rowField: "",
        calculation: "projection",
        limit: 1,
      },
      {
        ...emptyWidget("line"),
        id: "sales-trend",
        title: "Evolución mensual",
        rowField: "Mes",
        sort: "asc",
      },
      {
        ...emptyWidget("bar"),
        id: "sales-supervisor",
        title: "Ranking de supervisores",
        rowField: "Supervisor",
        limit: 12,
      },
      {
        ...emptyWidget("table"),
        id: "sales-detail",
        title: "Detalle por vendedor",
        rowField: "Vendedor",
        columnField: "Supervisor",
        limit: 50,
      },
    ],
  };
}

function isReportSpec(value: unknown): value is ReportSpec {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReportSpec>;
  return candidate.version === 3 && Array.isArray(candidate.widgets);
}

function salesRows(
  rows: GenericRow[],
  profiles: Profile[],
): GenericRow[] {
  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const managerMap = new Map(
    profiles.map((item) => [
      item.id,
      item.managerId ? profileMap.get(item.managerId)?.name : null,
    ]),
  );
  return rows.map((row) => {
    const date = String(row.sale_date ?? "");
    const sellerId = String(row.seller_profile_id ?? "");
    return {
      Mes: date.slice(0, 7),
      Fecha: date,
      Departamento: row.department,
      Zona: row.zone,
      Región: row.region || "Sin región",
      Ciudad: row.city || "Sin ciudad",
      Supervisor:
        managerMap.get(sellerId) || row.team || "Sin supervisor asignado",
      Vendedor: row.seller_name || "Sin vendedor",
      Equipo: row.team || "Sin equipo",
      "Tipo de venta": row.sale_type || "Sin tipo",
      Servicio: row.service || "Sin servicio",
      Canal: row.medium || "Sin canal",
      Principal: row.is_primary ? "Sí" : "No",
      Paquete: row.contract_service || "Sin paquete",
      "Monto facturado": numberFrom(row.amount_billed),
      "Ingreso comisión": numberFrom(row.commission_income),
    };
  });
}

function importedRows(rows: GenericRow[]): GenericRow[] {
  return rows.map((row) => {
    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as GenericRow)
        : {};
    return {
      ...payload,
      Departamento: row.department,
      Zona: row.zone,
      Período: row.period || "",
    };
  });
}

function discoverFields(rows: GenericRow[]): FieldInfo[] {
  const values = new Map<string, unknown[]>();
  rows.slice(0, 750).forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (key.startsWith("_") || key === "payload") return;
      const list = values.get(key) || [];
      if (value !== null && value !== undefined && value !== "")
        list.push(value);
      values.set(key, list.slice(0, 80));
    });
  });
  return Array.from(values.entries())
    .map(([key, samples]) => {
      const numeric = samples.filter(
        (value) =>
          typeof value === "number" ||
          /^-?[\d,.]+$/.test(
            String(value).replace(/[L$%\s]/g, ""),
          ),
      ).length;
      const dates = samples.filter((value) =>
        /^\d{4}-\d{2}(-\d{2})?$/.test(String(value)),
      ).length;
      const kind: FieldInfo["kind"] =
        samples.length && numeric / samples.length >= 0.75
          ? "number"
          : samples.length && dates / samples.length >= 0.75
            ? "date"
            : "text";
      return { key, label: key, kind };
    })
    .sort((a, b) => {
      const ai = SALES_FIELD_ORDER.indexOf(a.key);
      const bi = SALES_FIELD_ORDER.indexOf(b.key);
      if (ai >= 0 || bi >= 0)
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return a.label.localeCompare(b.label);
    });
}

function passesFilter(row: GenericRow, rule: FilterRule) {
  if (!rule.field || !rule.value.trim()) return true;
  const actual = row[rule.field];
  const left = normalize(actual);
  const right = normalize(rule.value);
  if (rule.operator === "equals") return left === right;
  if (rule.operator === "not_equals") return left !== right;
  if (rule.operator === "contains") return left.includes(right);
  if (rule.operator === "not_contains") return !left.includes(right);
  if (rule.operator === "greater")
    return numberFrom(actual) > numberFrom(rule.value);
  if (rule.operator === "less")
    return numberFrom(actual) < numberFrom(rule.value);
  const number = numberFrom(actual);
  return (
    number >= numberFrom(rule.value) && number <= numberFrom(rule.valueTo)
  );
}

function baseAggregate(
  rows: GenericRow[],
  field: string,
  aggregation: Aggregation,
) {
  if (field === "__rows" || aggregation === "count") return rows.length;
  const raw = rows
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && value !== "");
  if (aggregation === "distinct")
    return new Set(raw.map((value) => normalize(value))).size;
  const values = raw.map(numberFrom);
  if (!values.length) return 0;
  if (aggregation === "sum")
    return values.reduce((sum, value) => sum + value, 0);
  if (aggregation === "average")
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === "min") return Math.min(...values);
  return Math.max(...values);
}

function formulaValue(rows: GenericRow[], formula: string, goal: number) {
  if (!formula.trim()) return null;
  let expression = formula.toUpperCase();
  expression = expression.replace(
    /(SUMA|SUM)\(\[([^\]]+)\]\)/g,
    (_, __, field: string) =>
      String(baseAggregate(rows, field, "sum")),
  );
  expression = expression.replace(
    /(PROMEDIO|AVG)\(\[([^\]]+)\]\)/g,
    (_, __, field: string) =>
      String(baseAggregate(rows, field, "average")),
  );
  expression = expression.replace(
    /(UNIQUE|UNICOS|DISTINCT)\(\[([^\]]+)\]\)/g,
    (_, __, field: string) =>
      String(baseAggregate(rows, field, "distinct")),
  );
  expression = expression.replace(/CONTEO\(\)|COUNT\(\)/g, String(rows.length));
  expression = expression.replace(/\bMETA\b/g, String(goal));
  if (!/^[\d+\-*/().\s]+$/.test(expression)) return null;
  try {
    const value = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(Number(value)) ? Number(value) : null;
  } catch {
    return null;
  }
}

function metricForRows(
  rows: GenericRow[],
  widget: ReportWidget,
  goal: number,
) {
  const formula = formulaValue(rows, widget.formula, goal);
  if (formula !== null) return formula;
  const base = baseAggregate(rows, widget.valueField, widget.aggregation);
  if (widget.calculation === "goal_progress")
    return goal ? (base / goal) * 100 : 0;
  if (widget.calculation === "projection") {
    const dates = rows
      .map((row) => String(row.Fecha ?? row["Fecha Facturación"] ?? ""))
      .filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value))
      .sort();
    const latest = dates.at(-1);
    if (!latest) return base;
    const day = Number(latest.slice(8, 10));
    const [year, month] = latest.slice(0, 7).split("-").map(Number);
    const monthDays = new Date(year, month, 0).getDate();
    return day ? (base / day) * monthDays : base;
  }
  if (widget.calculation === "month_change") {
    const months = Array.from(
      new Set(
        rows
          .map((row) =>
            String(row.Mes ?? row.Período ?? row["Fecha Facturación"] ?? "").slice(
              0,
              7,
            ),
          )
          .filter((value) => /^\d{4}-\d{2}$/.test(value)),
      ),
    ).sort();
    const current = months.at(-1);
    const previous = months.at(-2);
    if (!current || !previous) return 0;
    const currentRows = rows.filter((row) =>
      String(row.Mes ?? row.Período ?? row["Fecha Facturación"] ?? "").startsWith(
        current,
      ),
    );
    const previousRows = rows.filter((row) =>
      String(row.Mes ?? row.Período ?? row["Fecha Facturación"] ?? "").startsWith(
        previous,
      ),
    );
    const currentValue = baseAggregate(
      currentRows,
      widget.valueField,
      widget.aggregation,
    );
    const previousValue = baseAggregate(
      previousRows,
      widget.valueField,
      widget.aggregation,
    );
    return previousValue
      ? ((currentValue - previousValue) / previousValue) * 100
      : 0;
  }
  return base;
}

function dataForWidget(
  allRows: GenericRow[],
  widget: ReportWidget,
  goal: number,
  globalFilters: FilterRule[],
) {
  const rows = allRows.filter((row) =>
    [...globalFilters, ...widget.filters].every((rule) =>
      passesFilter(row, rule),
    ),
  );
  if (widget.type === "kpi" || !widget.rowField)
    return [
      {
        name: "Total",
        secondary: "",
        value: metricForRows(rows, widget, goal),
      },
    ];
  const groups = new Map<string, GenericRow[]>();
  rows.forEach((row) => {
    const primary = String(row[widget.rowField] ?? "Sin dato");
    const secondary = widget.columnField
      ? String(row[widget.columnField] ?? "Sin dato")
      : "";
    const key = `${primary}|||${secondary}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  let points: DataPoint[] = Array.from(groups.entries()).map(([key, group]) => {
    const [name, secondary] = key.split("|||");
    return {
      name:
        widget.rowField === "Mes" || widget.rowField === "Período"
          ? monthLabel(name)
          : name,
      secondary,
      value: metricForRows(group, widget, goal),
    };
  });
  if (widget.calculation === "share") {
    const total = points.reduce((sum, point) => sum + point.value, 0);
    points = points.map((point) => ({
      ...point,
      value: total ? (point.value / total) * 100 : 0,
    }));
  }
  points.sort((a, b) =>
    widget.sort === "desc"
      ? b.value - a.value
      : a.name.localeCompare(b.name, "es", { numeric: true }),
  );
  return points.slice(0, Math.max(1, widget.limit));
}

function findField(
  fields: FieldInfo[],
  ...terms: string[]
): string | undefined {
  const normalizedTerms = terms.map(normalize);
  return fields.find((field) =>
    normalizedTerms.some(
      (term) =>
        normalize(field.label).includes(term) ||
        term.includes(normalize(field.label)),
    ),
  )?.key;
}

function makePlan(
  prompt: string,
  fields: FieldInfo[],
  source: SourceMode,
  goal: number,
): ReportSpec {
  const text = normalize(prompt);
  const has = (...terms: string[]) => terms.some((term) => text.includes(term));
  const field = (...terms: string[]) => findField(fields, ...terms);
  const groupCandidates = [
    has("supervisor") ? field("supervisor", "equipo") : undefined,
    has("vendedor", "asesor", "gestor", "evr")
      ? field("vendedor", "asesor", "gestor")
      : undefined,
    has("ciudad") ? field("ciudad") : undefined,
    has("zona", "region") ? field("zona", "región") : undefined,
    has("paquete", "plan") ? field("paquete", "contrato servicio") : undefined,
    has("canal", "medio") ? field("canal", "medio") : undefined,
    has("servicio") ? field("servicio") : undefined,
    has("departamento") ? field("departamento") : undefined,
  ].filter(Boolean) as string[];
  const primaryGroup =
    groupCandidates[0] || field("mes", "período", "fecha") || fields[0]?.key || "";
  const secondaryGroup =
    groupCandidates.find((item) => item !== primaryGroup) || "";
  const amountField = has("factur", "monto", "ingreso")
    ? field("monto facturado", "monto venta", "facturación", "ingreso")
    : has("comision")
      ? field("comisión", "comision")
      : has("arpu", "ticket", "promedio")
        ? field("arpu", "monto facturado", "monto")
        : undefined;
  const valueField = amountField || "__rows";
  const aggregation: Aggregation = has("promedio", "arpu", "ticket")
    ? "average"
    : valueField === "__rows"
      ? "count"
      : "sum";
  const widgets: ReportWidget[] = [];
  const add = (
    type: VisualType,
    title: string,
    rowField = primaryGroup,
    calculation: Calculation = "none",
    columnField = secondaryGroup,
  ) =>
    widgets.push({
      ...emptyWidget(type),
      id: uid("ai"),
      title,
      rowField: type === "kpi" ? "" : rowField,
      columnField: type === "kpi" ? "" : columnField,
      valueField,
      aggregation,
      calculation,
      sort: type === "line" || type === "area" ? "asc" : "desc",
      limit: type === "table" || type === "pivot" ? 100 : 20,
    });

  add("kpi", has("factur", "monto") ? "Resultado total" : "Ventas totales");
  if (has("proyeccion", "proyecta", "cierre"))
    add("kpi", "Proyección de cierre", primaryGroup, "projection");
  if (has("meta", "cumplimiento"))
    add("kpi", "Cumplimiento de meta", primaryGroup, "goal_progress");
  if (has("compar", "versus", " vs ", "variacion"))
    add("kpi", "Variación mensual", primaryGroup, "month_change");

  const month = field("mes", "período", "fecha") || primaryGroup;
  if (has("tendencia", "evolucion", "mes", "compar", "historico"))
    add("line", "Evolución en el tiempo", month, "none", secondaryGroup);
  if (has("pastel", "distribucion", "participacion", "porcentaje"))
    add("pie", "Distribución", primaryGroup, "share");
  if (has("semaforo", "rendimiento"))
    add("traffic", "Semáforo de rendimiento");
  if (has("funnel", "embudo"))
    add("funnel", "Embudo comercial");
  if (has("tabla dinamica", "cruce"))
    add("pivot", "Cruce dinámico");
  if (has("tabla", "detalle", "listado", "presentacion"))
    add("table", "Detalle completo");
  if (
    !widgets.some((widget) =>
      ["bar", "line", "area", "pie", "traffic", "funnel"].includes(widget.type),
    )
  )
    add("bar", `Resultado por ${primaryGroup || "categoría"}`);
  if (!widgets.some((widget) => widget.type === "table"))
    add("table", "Datos para revisar y presentar");

  return {
    version: 3,
    title: prompt.trim().slice(0, 110) || "Reporte solicitado",
    description:
      "Creado por el copiloto. Puedes editar cada bloque sin comenzar de nuevo.",
    analysis: `Se analizaron ${valueField === "__rows" ? "registros" : valueField} agrupados por ${primaryGroup || "la selección disponible"}.`,
    source,
    goal,
    globalFilters: [],
    widgets: widgets.slice(0, 8),
  };
}

export function ReportStudioV3({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const [sales, setSales] = useState<GenericRow[]>([]);
  const [imports, setImports] = useState<GenericRow[]>([]);
  const [report, setReport] = useState<ReportSpec>(defaultReport);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [mode, setMode] = useState<StudioMode>("ai");
  const [prompt, setPrompt] = useState(
    "Compara junio y julio por supervisor, muestra la proyección, el semáforo y una tabla para presentar.",
  );
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [templateName, setTemplateName] = useState("Mi reporte");
  const [quickMeasure, setQuickMeasure] = useState("sales");
  const [quickAnalysis, setQuickAnalysis] = useState("ranking");
  const [quickGroup, setQuickGroup] = useState("Supervisor");
  const [quickVisual, setQuickVisual] = useState<VisualType>("bar");
  const [advancedRow, setAdvancedRow] = useState("Mes");
  const [advancedColumn, setAdvancedColumn] = useState("");
  const [advancedValue, setAdvancedValue] = useState("__rows");
  const [advancedAggregation, setAdvancedAggregation] =
    useState<Aggregation>("count");
  const [advancedVisual, setAdvancedVisual] = useState<VisualType>("bar");
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [salesResult, importsResult, templatesResult] = await Promise.all([
        supabase
          .from("analytics_sales")
          .select(
            "id,department,zone,seller_profile_id,seller_name,team,sale_date,country,region,city,sale_type,service,medium,is_primary,contract_service,amount_billed,commission_income",
          )
          .order("sale_date", { ascending: true })
          .limit(10_000),
        supabase
          .from("analytics_records")
          .select("id,department,zone,period,payload")
          .order("created_at", { ascending: true })
          .limit(10_000),
        supabase
          .from("analytics_report_templates")
          .select("id,name,definition")
          .order("updated_at", { ascending: false })
          .limit(30),
      ]);
      if (!active) return;
      setSales((salesResult.data as GenericRow[] | null) || []);
      setImports((importsResult.data as GenericRow[] | null) || []);
      if (!salesResult.data?.length && importsResult.data?.length)
        setReport((current) => ({ ...current, source: "imports" }));
      setTemplates(
        ((templatesResult.data as TemplateRow[] | null) || []).filter((item) =>
          isReportSpec(item.definition),
        ),
      );
      if (salesResult.error && importsResult.error)
        setStatus(
          "Todavía no hay una fuente disponible. Importa un Excel o CSV para comenzar.",
        );
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      report.source === "imports"
        ? importedRows(imports)
        : salesRows(sales, profiles),
    [report.source, imports, sales, profiles],
  );
  const fields = useMemo(() => discoverFields(rows), [rows]);
  const visibleFields = useMemo(
    () =>
      fields.filter((field) =>
        normalize(field.label).includes(normalize(fieldSearch)),
      ),
    [fields, fieldSearch],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        report.globalFilters.every((rule) => passesFilter(row, rule)),
      ),
    [rows, report.globalFilters],
  );

  function patchReport(patch: Partial<ReportSpec>) {
    setReport((current) => ({ ...current, ...patch }));
  }

  function patchWidget(id: string, patch: Partial<ReportWidget>) {
    setReport((current) => ({
      ...current,
      widgets: current.widgets.map((widget) =>
        widget.id === id ? { ...widget, ...patch } : widget,
      ),
    }));
  }

  function addWidget(type: VisualType) {
    const widget = {
      ...emptyWidget(type),
      rowField:
        type === "line" || type === "area"
          ? findField(fields, "mes", "período", "fecha") ||
            fields[0]?.key ||
            ""
          : fields[0]?.key || "",
    };
    setReport((current) => ({
      ...current,
      widgets: [...current.widgets, widget],
    }));
    setEditingId(widget.id);
  }

  function addAdvancedWidget() {
    const widget: ReportWidget = {
      ...emptyWidget(advancedVisual),
      id: uid("manual"),
      title: `${advancedAggregationLabel(advancedAggregation)} por ${
        advancedRow || "total"
      }`,
      rowField: advancedVisual === "kpi" ? "" : advancedRow,
      columnField: advancedVisual === "kpi" ? "" : advancedColumn,
      valueField: advancedValue,
      aggregation: advancedAggregation,
      sort:
        advancedVisual === "line" || advancedVisual === "area" ? "asc" : "desc",
      limit: advancedVisual === "table" ? 100 : 20,
    };
    patchReport({ widgets: [...report.widgets, widget] });
    setEditingId(widget.id);
    setStatus(
      "Bloque agregado. Puedes seguir creando otros con combinaciones diferentes.",
    );
  }

  function applyPromptFilters(text: string) {
    const normalized = normalize(text);
    const newFilters: FilterRule[] = [];
    fields.forEach((field) => {
      const values = Array.from(
        new Set(
          rows
            .map((row) => String(row[field.key] ?? ""))
            .filter((value) => value && value.length > 2),
        ),
      ).slice(0, 150);
      const match = values.find((value) =>
        normalized.includes(normalize(value)),
      );
      if (match && !["Mes", "Fecha"].includes(field.key))
        newFilters.push({
          ...emptyFilter(field.key),
          value: match,
        });
    });
    if (newFilters.length)
      patchReport({ globalFilters: newFilters.slice(0, 4) });
  }

  async function createWithAi() {
    if (!prompt.trim()) {
      setStatus("Escribe con tus propias palabras qué reporte necesitas.");
      return;
    }
    setPlanning(true);
    setStatus("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/report-copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          prompt,
          context: {
            source: report.source,
            goal: report.goal,
            fields: fields.map((field) => ({
              name: field.key,
              type: field.kind,
            })),
          },
        }),
      });
      if (!response.ok) throw new Error("fallback");
      const result = (await response.json()) as { definition: unknown };
      if (!isReportSpec(result.definition)) throw new Error("invalid");
      setReport(result.definition);
      applyPromptFilters(prompt);
      setStatus(
        "Reporte creado con OpenAI. Puedes seguir pidiéndole cambios o editarlo manualmente.",
      );
    } catch {
      setReport(makePlan(prompt, fields, report.source, report.goal));
      applyPromptFilters(prompt);
      setStatus(
        "Reporte creado. Puedes escribir otra instrucción para reemplazarlo o modificar cada bloque.",
      );
    } finally {
      setPlanning(false);
    }
  }

  function createQuickReport() {
    const salesField = findField(fields, "monto facturado", "monto venta");
    const commissionField = findField(fields, "comisión", "comision");
    const sellerField = findField(fields, "vendedor", "gestor", "asesor");
    const measure =
      quickMeasure === "billing" && salesField
        ? { field: salesField, aggregation: "sum" as Aggregation }
        : quickMeasure === "commission" && commissionField
          ? { field: commissionField, aggregation: "sum" as Aggregation }
          : quickMeasure === "ticket" && salesField
            ? { field: salesField, aggregation: "average" as Aggregation }
            : quickMeasure === "sellers" && sellerField
              ? { field: sellerField, aggregation: "distinct" as Aggregation }
              : { field: "__rows", aggregation: "count" as Aggregation };
    const calculation: Calculation =
      quickAnalysis === "comparison"
        ? "month_change"
        : quickAnalysis === "projection"
          ? "projection"
          : quickAnalysis === "share"
            ? "share"
            : "none";
    const widget: ReportWidget = {
      ...emptyWidget(quickVisual),
      id: uid("quick"),
      title: `${quickMeasureLabel(quickMeasure)} por ${quickGroup}`,
      rowField: quickGroup,
      valueField: measure.field,
      aggregation: measure.aggregation,
      calculation,
      sort:
        quickAnalysis === "trend" || quickVisual === "line" ? "asc" : "desc",
      limit: quickVisual === "table" ? 100 : 20,
    };
    const kpi = {
      ...widget,
      id: uid("quick-kpi"),
      title: quickMeasureLabel(quickMeasure),
      type: "kpi" as VisualType,
      rowField: "",
      columnField: "",
    };
    const detail = {
      ...widget,
      id: uid("quick-table"),
      title: "Detalle del análisis",
      type: "table" as VisualType,
      limit: 100,
    };
    patchReport({
      title: `${quickMeasureLabel(quickMeasure)} por ${quickGroup}`,
      description:
        "Reporte creado con el asistente rápido. Todos los campos siguen siendo editables.",
      widgets: [kpi, widget, detail],
      analysis: `Vista preparada para ${quickAnalysisLabel(quickAnalysis).toLowerCase()}.`,
    });
    setMode("advanced");
    setStatus("Reporte creado. Usa “Editar” solo si necesitas afinar algo.");
  }

  async function saveTemplate() {
    const row: TemplateRow = {
      id: crypto.randomUUID(),
      name: templateName.trim() || report.title,
      definition: report,
    };
    setTemplates((current) => [row, ...current].slice(0, 30));
    const { error } = await supabase.from("analytics_report_templates").insert({
      name: row.name,
      description: report.description,
      department: profile.department,
      zone: profile.zone,
      definition: report,
      created_by: profile.id,
    });
    setStatus(
      error
        ? "Plantilla guardada durante esta sesión. Supabase debe tener instalada la tabla de plantillas para compartirla."
        : "Plantilla guardada. Podrás reutilizarla sin construir el reporte otra vez.",
    );
  }

  function loadPreset(preset: string) {
    const base = defaultReport();
    const supervisor =
      findField(fields, "supervisor", "equipo") || fields[0]?.key || "";
    const seller =
      findField(fields, "vendedor", "gestor") || fields[0]?.key || "";
    const city = findField(fields, "ciudad") || fields[0]?.key || "";
    const packageField =
      findField(fields, "paquete", "contrato servicio") || fields[0]?.key || "";
    if (preset === "blank")
      patchReport({
        title: "Nuevo reporte",
        description: "Lienzo libre",
        widgets: [],
      });
    else if (preset === "traffic")
      patchReport({
        title: "Vendedores y semáforo",
        description: "Rendimiento comercial individual",
        widgets: [
          {
            ...emptyWidget("traffic"),
            title: "Semáforo de vendedores",
            rowField: seller,
          },
          {
            ...emptyWidget("table"),
            title: "Detalle de vendedores",
            rowField: seller,
            columnField: supervisor,
            limit: 100,
          },
        ],
      });
    else if (preset === "territory")
      patchReport({
        title: "Ciudades, zonas y paquetes",
        description: "Participación territorial y mezcla de producto",
        widgets: [
          {
            ...emptyWidget("bar"),
            title: "Ventas por ciudad",
            rowField: city,
          },
          {
            ...emptyWidget("pie"),
            title: "Paquetes contratados",
            rowField: packageField,
            calculation: "share",
          },
          {
            ...emptyWidget("pivot"),
            title: "Cruce ciudad y paquete",
            rowField: city,
            columnField: packageField,
            limit: 100,
          },
        ],
      });
    else if (preset === "supervisors")
      patchReport({
        title: "Supervisores y equipos",
        description: "Totales, comparativo y vendedores por supervisor",
        widgets: [
          {
            ...emptyWidget("bar"),
            title: "Ranking de supervisores",
            rowField: supervisor,
          },
          {
            ...emptyWidget("table"),
            title: "Vendedores por supervisor",
            rowField: seller,
            columnField: supervisor,
            limit: 100,
          },
        ],
      });
    else setReport(base);
    setMode("advanced");
    setStatus("Plantilla aplicada. Puedes usarla así o editar cualquier bloque.");
  }

  function exportCsv() {
    const output: (string | number)[][] = [
      [report.title],
      ["Fuente", report.source === "sales" ? "Ventas" : "Excel / CSV"],
      ["Meta", report.goal],
      [],
    ];
    report.widgets.forEach((widget) => {
      output.push([widget.title]);
      output.push([
        widget.rowField || "Total",
        widget.columnField,
        widget.formula ||
          `${widget.aggregation} ${widget.valueField === "__rows" ? "registros" : widget.valueField}`,
      ]);
      dataForWidget(rows, widget, report.goal, report.globalFilters).forEach(
        (point) => output.push([point.name, point.secondary, point.value]),
      );
      output.push([]);
    });
    const csv = output
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "CC-Analytics-reporte.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: "#07070b",
        scale: 1.3,
        logging: false,
      });
      const pageWidth = 1280;
      const renderedHeight = (canvas.height * pageWidth) / canvas.width;
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: [pageWidth, 720],
      });
      for (
        let offset = 0, page = 0;
        offset < renderedHeight;
        offset += 720, page += 1
      ) {
        if (page) pdf.addPage([pageWidth, 720], "landscape");
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.9),
          "JPEG",
          0,
          -offset,
          pageWidth,
          renderedHeight,
          undefined,
          "FAST",
        );
      }
      pdf.save("CC-Analytics-reporte.pdf");
      setStatus("PDF generado con la composición actual.");
    } catch {
      setStatus("No se pudo generar el PDF. Intenta nuevamente.");
    } finally {
      setExporting(false);
    }
  }

  if (loading)
    return (
      <div className="flex min-h-[480px] items-center justify-center rounded-3xl border border-white/10 bg-[#0b0b10]">
        <Loader2 className="animate-spin text-purple-400" size={30} />
      </div>
    );

  return (
    <div className="animate-in space-y-4">
      <section className="rounded-[26px] border border-purple-400/20 bg-[radial-gradient(circle_at_85%_0%,rgba(168,85,247,.2),transparent_38%),#0b0b10] p-5 md:p-7">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-purple-400">
              <Sparkles size={14} /> Estudio de reportes
            </p>
            <h2 className="mt-2 text-2xl font-black md:text-3xl">
              Crea el reporte sin aprender una herramienta complicada.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Empieza con IA, usa el asistente rápido o abre los controles
              avanzados cuando necesites una combinación especial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-300"
            >
              <Download size={15} /> Descargar datos
            </button>
            <button
              onClick={() => void exportPdf()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3 text-xs font-black disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <FileDown size={15} />
              )}
              Generar PDF
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/25 p-1.5">
          {(
            [
              ["ai", "Pedir con IA", Bot],
              ["quick", "Crear fácil", WandSparkles],
              ["advanced", "Modo avanzado", SlidersHorizontal],
            ] as [StudioMode, string, typeof Bot][]
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[11px] font-black transition ${
                mode === value
                  ? "bg-purple-500/20 text-purple-200 shadow-[inset_0_0_0_1px_rgba(192,132,252,.25)]"
                  : "text-zinc-600 hover:text-zinc-300"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {mode === "ai" && (
          <div className="mt-4 rounded-2xl border border-purple-400/20 bg-black/30 p-4 md:p-5">
            <p className="text-xs font-black text-white">
              ¿Qué quieres descubrir o presentar?
            </p>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-[#111116] p-4 text-sm leading-6 text-white outline-none focus:border-purple-400/50"
              placeholder="Ejemplo: necesito comparar junio y julio por supervisor, solo Zona Norte, con proyección, semáforo y detalle de vendedores para presentar a gerencia."
            />
            <div className="mt-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="flex flex-wrap gap-2">
                {[
                  "Resumen mensual para gerencia",
                  "Comparar supervisores y sus vendedores",
                  "Ciudades, paquetes y participación",
                  "Semáforo y proyección de cierre",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setPrompt(example)}
                    className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-zinc-500 hover:border-purple-400/40 hover:text-purple-300"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void createWithAi()}
                disabled={planning}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-6 py-3.5 text-xs font-black disabled:opacity-50"
              >
                {planning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {planning ? "Creando reporte…" : "Crear reporte"}
              </button>
            </div>
          </div>
        )}

        {mode === "quick" && (
          <div className="mt-4 grid gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 lg:grid-cols-4">
            <ChoiceGroup
              number="1"
              label="¿Qué quieres medir?"
              value={quickMeasure}
              onChange={setQuickMeasure}
              options={[
                ["sales", "Ventas"],
                ["billing", "Facturación"],
                ["commission", "Comisiones"],
                ["ticket", "Ticket / ARPU"],
                ["sellers", "Vendedores activos"],
              ]}
            />
            <ChoiceGroup
              number="2"
              label="¿Qué análisis necesitas?"
              value={quickAnalysis}
              onChange={setQuickAnalysis}
              options={[
                ["ranking", "Ranking"],
                ["trend", "Tendencia"],
                ["comparison", "Comparar meses"],
                ["projection", "Proyección"],
                ["share", "Participación %"],
              ]}
            />
            <ChoiceGroup
              number="3"
              label="¿Cómo lo quieres separar?"
              value={quickGroup}
              onChange={setQuickGroup}
              options={fields.slice(0, 18).map((field) => [
                field.key,
                field.label,
              ])}
            />
            <ChoiceGroup
              number="4"
              label="¿Cómo lo quieres ver?"
              value={quickVisual}
              onChange={(value) => setQuickVisual(value as VisualType)}
              options={[
                ["bar", "Barras"],
                ["line", "Línea"],
                ["pie", "Distribución"],
                ["table", "Tabla"],
                ["traffic", "Semáforo"],
              ]}
            />
            <button
              onClick={createQuickReport}
              className="rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-3.5 text-xs font-black lg:col-span-4"
            >
              Crear este reporte
            </button>
          </div>
        )}

        {mode === "advanced" && (
          <div className="mt-4 grid gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 xl:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-black text-white">
                Empieza con una plantilla o agrega tus propios bloques
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["executive", "Resumen ejecutivo"],
                  ["supervisors", "Supervisores"],
                  ["traffic", "Semáforo"],
                  ["territory", "Ciudades y paquetes"],
                  ["blank", "En blanco"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => loadPreset(value)}
                    className="rounded-xl border border-white/10 bg-white/[.025] px-3 py-3 text-[10px] font-bold text-zinc-400 hover:border-purple-400/40 hover:text-white"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {VISUALS.map((visual) => {
                const Icon = visual.icon;
                return (
                  <button
                    key={visual.value}
                    onClick={() => addWidget(visual.value)}
                    title={`Agregar ${visual.label}`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-zinc-500 hover:border-purple-400/40 hover:text-purple-300"
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {status && (
          <div className="mt-3 rounded-xl border border-purple-400/15 bg-purple-500/[.06] px-4 py-3 text-xs text-purple-200">
            {status}
          </div>
        )}
      </section>

      <section className="rounded-[22px] border border-white/10 bg-[#0b0b10]">
        <div className="flex flex-col justify-between gap-3 p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={report.source}
              onChange={(event) =>
                patchReport({ source: event.target.value as SourceMode })
              }
              className="rounded-xl border border-white/10 bg-[#111116] px-3 py-2.5 text-xs font-bold text-white"
            >
              <option value="sales">Ventas normalizadas</option>
              <option value="imports" disabled={!imports.length}>
                Excel / CSV importados {imports.length ? `(${imports.length})` : ""}
              </option>
            </select>
            <button
              onClick={() => setShowFilters((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${
                report.globalFilters.length
                  ? "border-purple-400/30 bg-purple-500/10 text-purple-300"
                  : "border-white/10 text-zinc-500"
              }`}
            >
              <Filter size={14} />
              Filtros
              {report.globalFilters.length > 0 &&
                ` (${report.globalFilters.length})`}
              {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-bold text-zinc-500">
              Meta
              <input
                type="number"
                value={report.goal}
                onChange={(event) =>
                  patchReport({ goal: Number(event.target.value) || 0 })
                }
                className="w-20 bg-transparent text-right text-xs text-white outline-none"
              />
            </label>
            <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
              {filteredRows.length.toLocaleString("es-HN")} registros visibles
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              className="w-36 rounded-xl border border-white/10 bg-[#111116] px-3 py-2.5 text-xs text-white outline-none"
            />
            <button
              onClick={() => void saveTemplate()}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-400/20 bg-purple-500/10 px-3 py-2.5 text-[10px] font-black text-purple-300"
            >
              <Save size={13} /> Guardar
            </button>
          </div>
        </div>
        {showFilters && (
          <div className="border-t border-white/10 p-4">
            <FilterBuilder
              rules={report.globalFilters}
              fields={fields}
              onChange={(globalFilters) => patchReport({ globalFilters })}
            />
          </div>
        )}
        {templates.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-white/5 px-4 py-3">
            <span className="shrink-0 py-2 text-[9px] font-black uppercase tracking-wider text-zinc-700">
              Mis plantillas
            </span>
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  if (isReportSpec(template.definition))
                    setReport(template.definition);
                }}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-500 hover:text-white"
              >
                {template.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {mode === "advanced" && (
        <section className="grid gap-4 rounded-[22px] border border-white/10 bg-[#0b0b10] p-4 xl:grid-cols-[240px_1fr]">
          <aside>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111116] px-3">
              <Search size={14} className="text-zinc-600" />
              <input
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                placeholder="Buscar columna"
                className="w-full bg-transparent py-3 text-xs text-white outline-none"
              />
            </div>
            <div className="mt-3 max-h-64 space-y-1 overflow-auto">
              {visibleFields.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-[10px] text-zinc-400"
                >
                  <span className="truncate">{field.label}</span>
                  <span className="ml-2 text-[8px] uppercase text-zinc-700">
                    {field.kind === "number"
                      ? "123"
                      : field.kind === "date"
                        ? "fecha"
                        : "texto"}
                  </span>
                </div>
              ))}
            </div>
          </aside>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-purple-400">
              Crear bloque desde columnas
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <EditorSelect
                label="Filas / eje"
                value={advancedRow}
                onChange={setAdvancedRow}
                options={[
                  ["", "Sin agrupación"],
                  ...fields.map((field) => [field.key, field.label]),
                ]}
              />
              <EditorSelect
                label="Columnas / comparación"
                value={advancedColumn}
                onChange={setAdvancedColumn}
                options={[
                  ["", "Sin segunda columna"],
                  ...fields.map((field) => [field.key, field.label]),
                ]}
              />
              <EditorSelect
                label="Valores"
                value={advancedValue}
                onChange={setAdvancedValue}
                options={[
                  ["__rows", "Registros / ventas"],
                  ...fields.map((field) => [field.key, field.label]),
                ]}
              />
              <EditorSelect
                label="Operación"
                value={advancedAggregation}
                onChange={(value) =>
                  setAdvancedAggregation(value as Aggregation)
                }
                options={AGGREGATIONS.map((item) => [
                  item.value,
                  item.label,
                ])}
              />
              <EditorSelect
                label="Visualización"
                value={advancedVisual}
                onChange={(value) => setAdvancedVisual(value as VisualType)}
                options={VISUALS.map((item) => [item.value, item.label])}
              />
              <button
                onClick={addAdvancedWidget}
                className="self-end rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3 text-[10px] font-black"
              >
                Agregar al reporte
              </button>
            </div>
          </div>
        </section>
      )}

      <main ref={canvasRef} className="space-y-4">
        <div className="flex flex-col justify-between gap-3 rounded-[22px] border border-white/10 bg-[#0b0b10] p-5 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <input
              value={report.title}
              onChange={(event) => patchReport({ title: event.target.value })}
              className="w-full bg-transparent text-xl font-black text-white outline-none"
            />
            <input
              value={report.description}
              onChange={(event) =>
                patchReport({ description: event.target.value })
              }
              className="mt-1 w-full bg-transparent text-xs text-zinc-500 outline-none"
            />
          </div>
          <button
            onClick={() => setReport(defaultReport())}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-bold text-zinc-500"
          >
            <RotateCcw size={13} /> Restablecer
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {report.widgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              data={dataForWidget(
                rows,
                widget,
                report.goal,
                report.globalFilters,
              )}
              fields={fields}
              goal={report.goal}
              editing={editingId === widget.id}
              onToggleEdit={() =>
                setEditingId((current) =>
                  current === widget.id ? null : widget.id,
                )
              }
              onChange={(patch) => patchWidget(widget.id, patch)}
              onDelete={() =>
                patchReport({
                  widgets: report.widgets.filter(
                    (item) => item.id !== widget.id,
                  ),
                })
              }
            />
          ))}
          <button
            onClick={() => addWidget("table")}
            className="flex min-h-40 items-center justify-center gap-2 rounded-[22px] border border-dashed border-purple-400/20 bg-purple-500/[.025] text-xs font-black text-purple-400"
          >
            <Plus size={17} /> Agregar bloque
          </button>
        </div>

        <section className="rounded-[22px] border border-purple-400/20 bg-[linear-gradient(135deg,rgba(168,85,247,.08),transparent_55%),#0b0b10] p-5">
          <p className="text-[9px] font-black uppercase tracking-[.2em] text-purple-400">
            Conclusión para presentación
          </p>
          <textarea
            value={report.analysis}
            onChange={(event) => patchReport({ analysis: event.target.value })}
            rows={2}
            className="mt-2 w-full resize-none bg-transparent text-sm leading-6 text-zinc-300 outline-none"
          />
        </section>
      </main>
    </div>
  );
}

function quickMeasureLabel(value: string) {
  return (
    {
      sales: "Ventas",
      billing: "Facturación",
      commission: "Comisiones",
      ticket: "Ticket / ARPU",
      sellers: "Vendedores activos",
    }[value] || "Resultado"
  );
}

function quickAnalysisLabel(value: string) {
  return (
    {
      ranking: "Ranking",
      trend: "Tendencia",
      comparison: "Comparación mensual",
      projection: "Proyección",
      share: "Participación porcentual",
    }[value] || "Análisis"
  );
}

function advancedAggregationLabel(value: Aggregation) {
  return (
    AGGREGATIONS.find((aggregation) => aggregation.value === value)?.label ||
    "Resultado"
  );
}

function ChoiceGroup({
  number,
  label,
  value,
  options,
  onChange,
}: {
  number: string;
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
      <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-purple-500/15 text-purple-300">
        {number}
      </span>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs font-bold normal-case tracking-normal text-white"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterBuilder({
  rules,
  fields,
  onChange,
}: {
  rules: FilterRule[];
  fields: FieldInfo[];
  onChange: (rules: FilterRule[]) => void;
}) {
  function patch(id: string, change: Partial<FilterRule>) {
    onChange(
      rules.map((rule) => (rule.id === id ? { ...rule, ...change } : rule)),
    );
  }
  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="grid gap-2 rounded-xl border border-white/5 bg-white/[.02] p-3 md:grid-cols-[1fr_160px_1fr_1fr_auto]"
        >
          <select
            value={rule.field}
            onChange={(event) => patch(rule.id, { field: event.target.value })}
            className="rounded-lg border border-white/10 bg-[#111116] px-3 py-2 text-xs text-white"
          >
            <option value="">Seleccionar columna</option>
            {fields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
          <select
            value={rule.operator}
            onChange={(event) =>
              patch(rule.id, {
                operator: event.target.value as FilterOperator,
              })
            }
            className="rounded-lg border border-white/10 bg-[#111116] px-3 py-2 text-xs text-white"
          >
            {OPERATORS.map((operator) => (
              <option key={operator.value} value={operator.value}>
                {operator.label}
              </option>
            ))}
          </select>
          <input
            value={rule.value}
            onChange={(event) => patch(rule.id, { value: event.target.value })}
            placeholder="Valor"
            className="rounded-lg border border-white/10 bg-[#111116] px-3 py-2 text-xs text-white outline-none"
          />
          {rule.operator === "between" && (
            <input
              value={rule.valueTo}
              onChange={(event) =>
                patch(rule.id, { valueTo: event.target.value })
              }
              placeholder="Hasta"
              className="rounded-lg border border-white/10 bg-[#111116] px-3 py-2 text-xs text-white outline-none"
            />
          )}
          <button
            onClick={() =>
              onChange(rules.filter((item) => item.id !== rule.id))
            }
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-600 hover:text-rose-400"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...rules, emptyFilter(fields[0]?.key)])}
        className="inline-flex items-center gap-2 rounded-xl border border-purple-400/20 px-4 py-2.5 text-[10px] font-black text-purple-300"
      >
        <Plus size={13} /> Agregar filtro
      </button>
    </div>
  );
}

function WidgetCard({
  widget,
  data,
  fields,
  goal,
  editing,
  onToggleEdit,
  onChange,
  onDelete,
}: {
  widget: ReportWidget;
  data: DataPoint[];
  fields: FieldInfo[];
  goal: number;
  editing: boolean;
  onToggleEdit: () => void;
  onChange: (patch: Partial<ReportWidget>) => void;
  onDelete: () => void;
}) {
  const isPercent =
    widget.calculation === "share" ||
    widget.calculation === "month_change" ||
    widget.calculation === "goal_progress";
  const format = (value: number) =>
    isPercent ? `${value.toFixed(1)}%` : compactNumber(value);
  return (
    <article
      className={`overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0b10] ${
        widget.type === "table" || widget.type === "pivot"
          ? "xl:col-span-2"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 p-4">
        <input
          value={widget.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="min-w-0 flex-1 bg-transparent text-sm font-black text-white outline-none"
        />
        <button
          onClick={onToggleEdit}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[9px] font-black ${
            editing
              ? "border-purple-400/30 bg-purple-500/10 text-purple-300"
              : "border-white/10 text-zinc-500"
          }`}
        >
          <Pencil size={12} /> {editing ? "Listo" : "Editar"}
        </button>
        <button
          onClick={onDelete}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-700 hover:text-rose-400"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {editing && (
        <div className="space-y-3 border-b border-purple-400/15 bg-purple-500/[.035] p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <EditorSelect
              label="Visual"
              value={widget.type}
              onChange={(value) => onChange({ type: value as VisualType })}
              options={VISUALS.map((item) => [item.value, item.label])}
            />
            <EditorSelect
              label="Filas / eje"
              value={widget.rowField}
              onChange={(value) => onChange({ rowField: value })}
              options={[
                ["", "Sin agrupación"],
                ...fields.map((field) => [field.key, field.label]),
              ]}
            />
            <EditorSelect
              label="Columnas / serie"
              value={widget.columnField}
              onChange={(value) => onChange({ columnField: value })}
              options={[
                ["", "Sin segunda columna"],
                ...fields.map((field) => [field.key, field.label]),
              ]}
            />
            <EditorSelect
              label="Valor"
              value={widget.valueField}
              onChange={(value) => onChange({ valueField: value })}
              options={[
                ["__rows", "Registros / ventas"],
                ...fields.map((field) => [field.key, field.label]),
              ]}
            />
            <EditorSelect
              label="Operación"
              value={widget.aggregation}
              onChange={(value) =>
                onChange({ aggregation: value as Aggregation })
              }
              options={AGGREGATIONS.map((item) => [item.value, item.label])}
            />
            <EditorSelect
              label="Cálculo"
              value={widget.calculation}
              onChange={(value) =>
                onChange({ calculation: value as Calculation })
              }
              options={CALCULATIONS.map((item) => [item.value, item.label])}
            />
            <EditorSelect
              label="Orden"
              value={widget.sort}
              onChange={(value) =>
                onChange({ sort: value as "asc" | "desc" })
              }
              options={[
                ["desc", "Mayor a menor"],
                ["asc", "Menor / cronológico"],
              ]}
            />
            <label className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
              Máximo de filas
              <input
                type="number"
                min={1}
                max={500}
                value={widget.limit}
                onChange={(event) =>
                  onChange({ limit: Number(event.target.value) || 1 })
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#111116] px-3 py-2.5 text-[10px] text-white"
              />
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-[9px] font-black uppercase tracking-wider text-purple-400">
              Fórmula personalizada y filtros del bloque
            </summary>
            <div className="mt-3 space-y-3">
              <label className="block text-[8px] font-black uppercase tracking-wider text-zinc-600">
                Fórmula
                <input
                  value={widget.formula}
                  onChange={(event) => onChange({ formula: event.target.value })}
                  placeholder="Ejemplo: SUMA([Monto facturado]) / CONTEO()"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#111116] px-3 py-2.5 text-xs normal-case text-white outline-none"
                />
                <span className="mt-1 block normal-case tracking-normal text-zinc-700">
                  Funciones: SUMA([columna]), PROMEDIO([columna]),
                  UNICOS([columna]), CONTEO() y META ({goal}).
                </span>
              </label>
              <FilterBuilder
                rules={widget.filters}
                fields={fields}
                onChange={(filters) => onChange({ filters })}
              />
            </div>
          </details>
        </div>
      )}
      <div className="min-h-[270px] p-4">
        <WidgetVisual widget={widget} data={data} format={format} />
      </div>
      <div className="flex justify-between border-t border-white/5 px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-zinc-700">
        <span>{data.length} resultados</span>
        <span>
          {widget.formula
            ? "Fórmula"
            : `${AGGREGATIONS.find((item) => item.value === widget.aggregation)?.label} · ${
                widget.valueField === "__rows"
                  ? "registros"
                  : widget.valueField
              }`}
        </span>
      </div>
    </article>
  );
}

function EditorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#111116] px-3 py-2.5 text-[10px] font-bold normal-case tracking-normal text-zinc-300"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function WidgetVisual({
  widget,
  data,
  format,
}: {
  widget: ReportWidget;
  data: DataPoint[];
  format: (value: number) => string;
}) {
  if (!data.length)
    return (
      <div className="flex h-[235px] items-center justify-center text-xs text-zinc-600">
        No hay datos para esta combinación.
      </div>
    );
  if (widget.type === "kpi")
    return (
      <div className="flex h-[235px] flex-col items-center justify-center rounded-2xl border border-purple-400/15 bg-[radial-gradient(circle,rgba(168,85,247,.16),transparent_65%)] text-center">
        <span className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
          {widget.title}
        </span>
        <strong className="mt-3 text-5xl font-black text-white">
          {format(data[0].value)}
        </strong>
      </div>
    );
  if (widget.type === "table")
    return <DataTable data={data} format={format} showSecondary={Boolean(widget.columnField)} />;
  if (widget.type === "pivot")
    return <PivotTable data={data} format={format} />;
  if (widget.type === "pie")
    return (
      <ResponsiveContainer width="100%" height={235}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={88}
            paddingAngle={3}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => format(Number(value || 0))}
          />
          <Legend wrapperStyle={{ fontSize: 9, color: "#71717a" }} />
        </PieChart>
      </ResponsiveContainer>
    );
  if (widget.type === "traffic") {
    const buckets = [
      { label: "Verde · 15+", color: "#34d399", count: 0 },
      { label: "Amarillo · 11–14", color: "#facc15", count: 0 },
      { label: "Naranja · 7–10", color: "#fb923c", count: 0 },
      { label: "Rojo · 0–6", color: "#fb7185", count: 0 },
    ];
    data.forEach((point) => {
      if (point.value >= 15) buckets[0].count += 1;
      else if (point.value >= 11) buckets[1].count += 1;
      else if (point.value >= 7) buckets[2].count += 1;
      else buckets[3].count += 1;
    });
    return (
      <div className="grid h-[235px] grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[.02] text-center"
          >
            <span
              className="h-4 w-4 rounded-full shadow-[0_0_18px_currentColor]"
              style={{ color: bucket.color, background: bucket.color }}
            />
            <strong className="mt-3 text-3xl font-black">
              {bucket.count}
            </strong>
            <span className="mt-1 text-[9px] text-zinc-600">
              {bucket.label}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (widget.type === "funnel")
    return (
      <div className="flex h-[235px] flex-col justify-center gap-2">
        {data.slice(0, 6).map((point, index) => (
          <div
            key={`${point.name}-${index}`}
            className="mx-auto flex h-8 items-center justify-between rounded-lg bg-gradient-to-r from-purple-700 to-fuchsia-600 px-4 text-[9px] font-black"
            style={{
              width: `${Math.max(34, 100 - index * 12)}%`,
              opacity: 1 - index * 0.08,
            }}
          >
            <span className="truncate">{point.name}</span>
            <span>{format(point.value)}</span>
          </div>
        ))}
      </div>
    );

  const { chartRows, series } = chartMatrix(data);
  return (
    <ResponsiveContainer width="100%" height={235}>
      {widget.type === "bar" ? (
        <BarChart data={chartRows}>
          <CartesianGrid stroke="#24242c" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#71717a", fontSize: 9 }}
            interval={0}
            angle={chartRows.length > 8 ? -20 : 0}
            height={chartRows.length > 8 ? 55 : 30}
          />
          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} width={45} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => format(Number(value || 0))}
          />
          {series.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={COLORS[index % COLORS.length]}
              radius={[7, 7, 0, 0]}
            />
          ))}
        </BarChart>
      ) : widget.type === "area" ? (
        <AreaChart data={chartRows}>
          <CartesianGrid stroke="#24242c" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 9 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} width={45} />
          <Tooltip contentStyle={tooltipStyle} />
          {series.map((key, index) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[index % COLORS.length]}
              fill={COLORS[index % COLORS.length]}
              fillOpacity={0.16}
              strokeWidth={2.5}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={chartRows}>
          <CartesianGrid stroke="#24242c" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 9 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} width={45} />
          <Tooltip contentStyle={tooltipStyle} />
          {series.map((key, index) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2.5}
              dot={{ r: 2.5 }}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

const tooltipStyle = {
  background: "#111116",
  border: "1px solid #3f3f46",
  borderRadius: 12,
  fontSize: 10,
};

function chartMatrix(data: DataPoint[]) {
  const series = Array.from(
    new Set(data.map((point) => point.secondary || "Resultado")),
  );
  const rows = new Map<string, GenericRow>();
  data.forEach((point) => {
    const row = rows.get(point.name) || { name: point.name };
    row[point.secondary || "Resultado"] = point.value;
    rows.set(point.name, row);
  });
  return { chartRows: Array.from(rows.values()), series };
}

function DataTable({
  data,
  format,
  showSecondary,
}: {
  data: DataPoint[];
  format: (value: number) => string;
  showSecondary: boolean;
}) {
  const total = data.reduce((sum, point) => sum + point.value, 0);
  return (
    <div className="max-h-[310px] overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-[#0b0b10] text-[9px] uppercase tracking-wider text-zinc-600">
          <tr>
            <th className="p-3">Categoría</th>
            {showSecondary && <th className="p-3">Comparación</th>}
            <th className="p-3 text-right">Resultado</th>
            <th className="p-3 text-right">% total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point, index) => (
            <tr
              key={`${point.name}-${point.secondary}-${index}`}
              className="border-t border-white/5 text-zinc-300"
            >
              <td className="p-3 font-bold text-white">{point.name}</td>
              {showSecondary && <td className="p-3">{point.secondary}</td>}
              <td className="p-3 text-right">{format(point.value)}</td>
              <td className="p-3 text-right text-purple-400">
                {total ? ((point.value / total) * 100).toFixed(1) : 0}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PivotTable({
  data,
  format,
}: {
  data: DataPoint[];
  format: (value: number) => string;
}) {
  const columns = Array.from(
    new Set(data.map((point) => point.secondary).filter(Boolean)),
  );
  const rows = Array.from(new Set(data.map((point) => point.name)));
  if (!columns.length)
    return (
      <div className="flex h-[235px] flex-col items-center justify-center text-center">
        <Grid3X3 className="text-purple-400" size={28} />
        <p className="mt-3 text-xs font-bold">Selecciona una columna</p>
        <p className="mt-1 text-[10px] text-zinc-600">
          Pulsa Editar y agrega una segunda columna para crear el cruce.
        </p>
      </div>
    );
  return (
    <div className="max-h-[310px] overflow-auto">
      <table className="min-w-full text-left text-[10px]">
        <thead className="sticky top-0 bg-[#0b0b10] text-zinc-600">
          <tr>
            <th className="p-3">Filas</th>
            {columns.map((column) => (
              <th key={column} className="p-3 text-right">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row} className="border-t border-white/5">
              <td className="p-3 font-bold text-white">{row}</td>
              {columns.map((column) => (
                <td key={column} className="p-3 text-right text-zinc-300">
                  {format(
                    data.find(
                      (point) =>
                        point.name === row && point.secondary === column,
                    )?.value || 0,
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
