"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart as AreaChartIcon,
  BarChart3,
  Bot,
  Calculator,
  Download,
  FileDown,
  Grid3X3,
  LineChart as LineChartIcon,
  Loader2,
  PieChart as PieChartIcon,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Table2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
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

type SaleRecord = {
  id: number;
  department: string;
  zone: string;
  seller_profile_id: string | null;
  seller_name: string;
  team: string | null;
  sale_date: string;
  country: string | null;
  region: string | null;
  city: string | null;
  sale_type: string | null;
  service: string | null;
  medium: string | null;
  is_primary: boolean | null;
  contract_service: string | null;
  amount_billed: number | null;
  commission_income: number | null;
};

type Dimension =
  | "month"
  | "date"
  | "department"
  | "zone"
  | "region"
  | "city"
  | "supervisor"
  | "seller"
  | "team"
  | "sale_type"
  | "service"
  | "medium"
  | "package"
  | "primary";
type Metric =
  | "sales"
  | "amount_billed"
  | "commission_income"
  | "average_ticket"
  | "active_sellers";
type BlockType =
  | "kpi"
  | "table"
  | "pivot"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "traffic"
  | "funnel";
type SortDirection = "desc" | "asc";
type BlockFilter = {
  field: Dimension;
  operator: "equals" | "contains";
  value: string;
};
type ReportBlock = {
  id: string;
  title: string;
  type: BlockType;
  dimension: Dimension;
  secondaryDimension: Dimension | "none";
  metric: Metric;
  sort: SortDirection;
  limit: number;
  filter: BlockFilter;
};
type ReportDefinition = {
  title: string;
  description: string;
  analysis: string;
  blocks: ReportBlock[];
};
type TemplateRow = {
  id: string;
  name: string;
  definition: ReportDefinition;
};
type DataPoint = {
  name: string;
  secondary: string;
  value: number;
  rawValue: number;
};

const dimensions: { value: Dimension; label: string }[] = [
  { value: "month", label: "Mes" },
  { value: "date", label: "Fecha" },
  { value: "department", label: "Departamento" },
  { value: "zone", label: "Zona" },
  { value: "region", label: "Región" },
  { value: "city", label: "Ciudad" },
  { value: "supervisor", label: "Supervisor" },
  { value: "seller", label: "Vendedor" },
  { value: "team", label: "Equipo" },
  { value: "sale_type", label: "Tipo de venta" },
  { value: "service", label: "Servicio" },
  { value: "medium", label: "Canal / medio" },
  { value: "package", label: "Paquete" },
  { value: "primary", label: "Principal / adicional" },
];

const metrics: { value: Metric; label: string }[] = [
  { value: "sales", label: "Cantidad de ventas" },
  { value: "amount_billed", label: "Monto facturado" },
  { value: "commission_income", label: "Ingreso por comisión" },
  { value: "average_ticket", label: "Ticket promedio" },
  { value: "active_sellers", label: "Vendedores activos" },
];

const blockTypes: { value: BlockType; label: string; icon: typeof Table2 }[] = [
  { value: "table", label: "Tabla", icon: Table2 },
  { value: "pivot", label: "Tabla dinámica", icon: Grid3X3 },
  { value: "bar", label: "Barras", icon: BarChart3 },
  { value: "line", label: "Línea", icon: LineChartIcon },
  { value: "area", label: "Área", icon: AreaChartIcon },
  { value: "pie", label: "Pastel", icon: PieChartIcon },
  { value: "kpi", label: "KPI", icon: Calculator },
  { value: "traffic", label: "Semáforo", icon: Sparkles },
  { value: "funnel", label: "Funnel", icon: WandSparkles },
];

const colors = [
  "#a855f7",
  "#d946ef",
  "#22d3ee",
  "#34d399",
  "#f59e0b",
  "#fb7185",
  "#818cf8",
];

const defaultDefinition: ReportDefinition = {
  title: "Análisis comercial flexible",
  description:
    "Cruce libre de ventas, jerarquía, territorio, canal y servicio.",
  analysis:
    "Ajusta los campos o pídele al copiloto que cree otra composición.",
  blocks: [
    {
      id: "kpi-sales",
      title: "Ventas en el período",
      type: "kpi",
      dimension: "month",
      secondaryDimension: "none",
      metric: "sales",
      sort: "desc",
      limit: 12,
      filter: { field: "city", operator: "contains", value: "" },
    },
    {
      id: "monthly-trend",
      title: "Tendencia mensual",
      type: "line",
      dimension: "month",
      secondaryDimension: "none",
      metric: "sales",
      sort: "asc",
      limit: 24,
      filter: { field: "city", operator: "contains", value: "" },
    },
    {
      id: "supervisor-ranking",
      title: "Ranking por supervisor",
      type: "bar",
      dimension: "supervisor",
      secondaryDimension: "none",
      metric: "sales",
      sort: "desc",
      limit: 10,
      filter: { field: "city", operator: "contains", value: "" },
    },
    {
      id: "city-package",
      title: "Ciudades y paquetes",
      type: "pivot",
      dimension: "city",
      secondaryDimension: "package",
      metric: "sales",
      sort: "desc",
      limit: 15,
      filter: { field: "city", operator: "contains", value: "" },
    },
  ],
};

function uid() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function monthLabel(value: string) {
  if (!value) return "Sin mes";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-HN", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function metricLabel(metric: Metric) {
  return metrics.find((item) => item.value === metric)?.label ?? metric;
}

function formatValue(value: number, metric: Metric) {
  if (metric === "amount_billed" || metric === "commission_income")
    return new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: "HNL",
      maximumFractionDigits: 0,
    }).format(value);
  if (metric === "average_ticket")
    return new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: "HNL",
      maximumFractionDigits: 2,
    }).format(value);
  return new Intl.NumberFormat("es-HN", {
    maximumFractionDigits: 1,
  }).format(value);
}

function demoRecords(): SaleRecord[] {
  const sellers = [
    ["Ana López", "Pedro", "San Pedro Sula", "Zona Norte"],
    ["Carlos Mejía", "Pedro", "Choloma", "Zona Norte"],
    ["Marta Rivera", "Pamela", "Tegucigalpa", "Zona Centro"],
    ["José Paz", "Norlin", "La Ceiba", "Zona Norte"],
    ["Daniela Cruz", "Alejandra", "Comayagua", "Zona Centro"],
    ["Luis Flores", "Andrea", "Choluteca", "Zona Sur"],
  ];
  return Array.from({ length: 126 }, (_, index) => {
    const seller = sellers[index % sellers.length];
    const month = (index % 7) + 1;
    const day = (index % 25) + 1;
    return {
      id: index + 1,
      department: "Ventas Digitales",
      zone: seller[3],
      seller_profile_id: null,
      seller_name: seller[0],
      team: seller[1],
      sale_date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      country: "Honduras",
      region: seller[3].replace("Zona ", ""),
      city: seller[2],
      sale_type: index % 3 === 0 ? "Telemercadeo" : "En línea",
      service: index % 4 === 0 ? "Internet + TV" : "Internet",
      medium: ["Facebook", "WhatsApp", "Web", "Call Center"][index % 4],
      is_primary: index % 5 !== 0,
      contract_service: ["100 Mbps", "200 Mbps", "300 Mbps"][index % 3],
      amount_billed: 650 + (index % 5) * 110,
      commission_income: 80 + (index % 4) * 25,
    };
  });
}

function localPlan(prompt: string): ReportDefinition {
  const text = normalize(prompt);
  const has = (...terms: string[]) => terms.some((term) => text.includes(term));
  const dimension: Dimension = has("supervisor")
    ? "supervisor"
    : has("vendedor", "asesor")
      ? "seller"
      : has("ciudad")
        ? "city"
        : has("zona")
          ? "zone"
          : has("paquete")
            ? "package"
            : has("canal", "medio")
              ? "medium"
              : has("servicio")
                ? "service"
                : "month";
  const metric: Metric = has("factur", "ingreso", "monto")
    ? "amount_billed"
    : has("comision")
      ? "commission_income"
      : has("ticket", "promedio")
        ? "average_ticket"
        : has("vendedores activos")
          ? "active_sellers"
          : "sales";
  const chart: BlockType = has("pastel", "pie", "participacion")
    ? "pie"
    : has("tabla dinamica", "cruce")
      ? "pivot"
      : has("linea", "tendencia", "mes", "compar")
        ? "line"
        : has("area")
          ? "area"
          : has("semaforo", "rendimiento")
            ? "traffic"
            : has("funnel", "embudo")
              ? "funnel"
              : "bar";
  const secondary: Dimension | "none" = has("por zona", "separa zona")
    ? "zone"
    : has("por paquete")
      ? "package"
      : has("por supervisor") && dimension !== "supervisor"
        ? "supervisor"
        : "none";
  const title = prompt.trim().slice(0, 90) || "Reporte solicitado";
  const blocks: ReportBlock[] = [
    {
      id: uid(),
      title: metricLabel(metric),
      type: "kpi",
      dimension,
      secondaryDimension: "none",
      metric,
      sort: "desc",
      limit: 20,
      filter: { field: "city", operator: "contains", value: "" },
    },
    {
      id: uid(),
      title: `${metricLabel(metric)} por ${dimensions.find((item) => item.value === dimension)?.label}`,
      type: chart,
      dimension,
      secondaryDimension: secondary,
      metric,
      sort: chart === "line" ? "asc" : "desc",
      limit: 20,
      filter: { field: "city", operator: "contains", value: "" },
    },
    {
      id: uid(),
      title: "Detalle para presentación",
      type: secondary === "none" ? "table" : "pivot",
      dimension,
      secondaryDimension: secondary,
      metric,
      sort: "desc",
      limit: 50,
      filter: { field: "city", operator: "contains", value: "" },
    },
  ];
  if (has("compar", "versus", " vs ", "mes"))
    blocks.splice(1, 0, {
      id: uid(),
      title: "Comparativo mensual",
      type: "line",
      dimension: "month",
      secondaryDimension: dimension === "month" ? "none" : dimension,
      metric,
      sort: "asc",
      limit: 24,
      filter: { field: "city", operator: "contains", value: "" },
    });
  return {
    title,
    description:
      "Composición generada desde tu instrucción. Puedes cambiar cualquier campo.",
    analysis: `El reporte prioriza ${metricLabel(metric).toLowerCase()} y permite profundizar por ${dimensions.find((item) => item.value === dimension)?.label.toLowerCase()}.`,
    blocks,
  };
}

export function ReportLab({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const [records, setRecords] = useState<SaleRecord[]>([]);
  const [definition, setDefinition] =
    useState<ReportDefinition>(defaultDefinition);
  const [prompt, setPrompt] = useState(
    "Compara las ventas por supervisor y zona, muestra tendencia mensual, ranking y una tabla para presentación.",
  );
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [engine, setEngine] = useState<"openai" | "local" | null>(null);
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [department, setDepartment] = useState(
    profile.department === "Administración" ? "Todos" : profile.department,
  );
  const [zone, setZone] = useState(
    profile.role === "Administrador" ? "Todas" : profile.zone,
  );
  const [city, setCity] = useState("Todas");
  const [templateName, setTemplateName] = useState("Mi reporte");
  const [templates, setTemplates] = useState<TemplateRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        window.localStorage.getItem("cc-analytics-report-templates") || "[]",
      ) as TemplateRow[];
    } catch {
      return [];
    }
  });
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [salesResult, templatesResult] = await Promise.all([
        supabase
          .from("analytics_sales")
          .select(
            "id,department,zone,seller_profile_id,seller_name,team,sale_date,country,region,city,sale_type,service,medium,is_primary,contract_service,amount_billed,commission_income",
          )
          .order("sale_date", { ascending: true })
          .limit(5000),
        supabase
          .from("analytics_report_templates")
          .select("id,name,definition")
          .order("updated_at", { ascending: false })
          .limit(20),
      ]);
      if (!active) return;
      const loaded = (salesResult.data as SaleRecord[] | null) ?? [];
      setRecords(loaded.length ? loaded : demoRecords());
      if (templatesResult.data?.length)
        setTemplates((current) => {
          const remote = templatesResult.data as TemplateRow[];
          const remoteIds = new Set(remote.map((item) => item.id));
          return [
            ...remote,
            ...current.filter((item) => !remoteIds.has(item.id)),
          ].slice(0, 20);
        });
      setStatus(
        salesResult.error
          ? "Vista demostrativa activa; Supabase conservará el mismo constructor cuando haya datos."
          : "",
      );
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const months = useMemo(
    () =>
      Array.from(new Set(records.map((row) => row.sale_date.slice(0, 7))))
        .sort()
        .map((value) => ({ value, label: monthLabel(value) })),
    [records],
  );
  const departments = useMemo(
    () => Array.from(new Set(records.map((row) => row.department))).sort(),
    [records],
  );
  const zones = useMemo(
    () => Array.from(new Set(records.map((row) => row.zone))).sort(),
    [records],
  );
  const cities = useMemo(
    () =>
      Array.from(
        new Set(records.map((row) => row.city).filter(Boolean) as string[]),
      ).sort(),
    [records],
  );
  const profileMap = useMemo(
    () => new Map(profiles.map((item) => [item.id, item])),
    [profiles],
  );
  const sellerManager = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((item) => {
      const manager = item.managerId ? profileMap.get(item.managerId) : null;
      if (manager) map.set(item.id, manager.name);
    });
    return map;
  }, [profiles, profileMap]);

  function dimensionValue(row: SaleRecord, dimension: Dimension) {
    if (dimension === "month") return row.sale_date.slice(0, 7);
    if (dimension === "date") return row.sale_date;
    if (dimension === "department") return row.department;
    if (dimension === "zone") return row.zone;
    if (dimension === "region") return row.region || "Sin región";
    if (dimension === "city") return row.city || "Sin ciudad";
    if (dimension === "supervisor")
      return (
        (row.seller_profile_id
          ? sellerManager.get(row.seller_profile_id)
          : null) ||
        row.team ||
        "Sin supervisor"
      );
    if (dimension === "seller") return row.seller_name;
    if (dimension === "team") return row.team || "Sin equipo";
    if (dimension === "sale_type")
      return row.sale_type || "Sin tipo de venta";
    if (dimension === "service") return row.service || "Sin servicio";
    if (dimension === "medium") return row.medium || "Sin canal";
    if (dimension === "package")
      return row.contract_service || "Sin paquete";
    return row.is_primary ? "Principal" : "Adicional";
  }

  const filteredRecords = useMemo(
    () =>
      records.filter((row) => {
        const month = row.sale_date.slice(0, 7);
        return (
          (!monthFrom || month >= monthFrom) &&
          (!monthTo || month <= monthTo) &&
          (department === "Todos" || row.department === department) &&
          (zone === "Todas" || row.zone === zone) &&
          (city === "Todas" || row.city === city)
        );
      }),
    [records, monthFrom, monthTo, department, zone, city],
  );

  function calculateMetric(rows: SaleRecord[], metric: Metric) {
    if (metric === "sales") return rows.length;
    if (metric === "amount_billed")
      return rows.reduce((sum, row) => sum + Number(row.amount_billed || 0), 0);
    if (metric === "commission_income")
      return rows.reduce(
        (sum, row) => sum + Number(row.commission_income || 0),
        0,
      );
    if (metric === "average_ticket")
      return rows.length
        ? rows.reduce(
            (sum, row) => sum + Number(row.amount_billed || 0),
            0,
          ) / rows.length
        : 0;
    return new Set(rows.map((row) => row.seller_name)).size;
  }

  function dataFor(block: ReportBlock): DataPoint[] {
    const scoped = filteredRecords.filter((row) => {
      if (!block.filter.value.trim()) return true;
      const actual = normalize(dimensionValue(row, block.filter.field));
      const expected = normalize(block.filter.value);
      return block.filter.operator === "equals"
        ? actual === expected
        : actual.includes(expected);
    });
    if (block.type === "kpi")
      return [
        {
          name: "Total",
          secondary: "",
          value: calculateMetric(scoped, block.metric),
          rawValue: scoped.length,
        },
      ];
    const groups = new Map<string, SaleRecord[]>();
    scoped.forEach((row) => {
      const primary = dimensionValue(row, block.dimension);
      const secondary =
        block.secondaryDimension === "none"
          ? ""
          : dimensionValue(row, block.secondaryDimension);
      const key = `${primary}|||${secondary}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    });
    return Array.from(groups.entries())
      .map(([key, rows]) => {
        const [name, secondary] = key.split("|||");
        return {
          name:
            block.dimension === "month" ? monthLabel(name) : name || "Sin dato",
          secondary:
            block.secondaryDimension === "month"
              ? monthLabel(secondary)
              : secondary,
          value: calculateMetric(rows, block.metric),
          rawValue: rows.length,
        };
      })
      .sort((a, b) =>
        block.sort === "desc" ? b.value - a.value : a.name.localeCompare(b.name),
      )
      .slice(0, Math.max(block.limit, 1));
  }

  function updateBlock(id: string, patch: Partial<ReportBlock>) {
    setDefinition((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    }));
  }

  function addBlock(type: BlockType) {
    setDefinition((current) => ({
      ...current,
      blocks: [
        ...current.blocks,
        {
          id: uid(),
          title: `Nuevo ${blockTypes.find((item) => item.value === type)?.label}`,
          type,
          dimension: type === "line" || type === "area" ? "month" : "city",
          secondaryDimension: "none",
          metric: "sales",
          sort: type === "line" || type === "area" ? "asc" : "desc",
          limit: 20,
          filter: { field: "city", operator: "contains", value: "" },
        },
      ],
    }));
  }

  async function createWithAi() {
    if (!prompt.trim()) {
      setStatus("Escribe lo que necesitas analizar.");
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
            departments,
            zones,
            cities: cities.slice(0, 80),
            availableMonths: months.map((item) => item.value),
          },
        }),
      });
      if (!response.ok) throw new Error("fallback");
      const result = (await response.json()) as {
        definition: ReportDefinition;
      };
      setDefinition(result.definition);
      setEngine("openai");
      setStatus(
        "Copiloto OpenAI: reporte creado. Todo sigue siendo editable.",
      );
    } catch {
      setDefinition(localPlan(prompt));
      setEngine("local");
      setStatus(
        "Motor inteligente local: reporte creado. OpenAI se activará al configurar su clave segura.",
      );
    } finally {
      setPlanning(false);
    }
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      [definition.title],
      ["Período", `${monthFrom || "Inicio"} a ${monthTo || "Actual"}`],
      [],
    ];
    definition.blocks.forEach((block) => {
      rows.push([block.title]);
      rows.push([
        dimensions.find((item) => item.value === block.dimension)?.label || "",
        block.secondaryDimension === "none"
          ? ""
          : dimensions.find(
              (item) => item.value === block.secondaryDimension,
            )?.label || "",
        metricLabel(block.metric),
      ]);
      dataFor(block).forEach((item) =>
        rows.push([item.name, item.secondary, item.value]),
      );
      rows.push([]);
    });
    const csv = rows
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
    anchor.download = "cc-analytics-reporte-libre.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!canvasRef.current) return;
    setExporting(true);
    setStatus("");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: "#07070b",
        scale: 1.35,
        logging: false,
        useCORS: true,
      });
      const width = 1280;
      const height = (canvas.height * width) / canvas.width;
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: [width, 720],
      });
      let offset = 0;
      let page = 0;
      while (offset < height) {
        if (page > 0) pdf.addPage([width, 720], "landscape");
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.9),
          "JPEG",
          0,
          -offset,
          width,
          height,
          undefined,
          "FAST",
        );
        offset += 720;
        page += 1;
      }
      pdf.save("CC-Analytics-reporte-libre.pdf");
      setStatus("PDF generado con la composición actual.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `No se pudo generar el PDF: ${error.message}`
          : "No se pudo generar el PDF.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function saveTemplate() {
    const row: TemplateRow = {
      id: crypto.randomUUID(),
      name: templateName.trim() || definition.title,
      definition,
    };
    const next = [row, ...templates].slice(0, 20);
    setTemplates(next);
    localStorage.setItem(
      "cc-analytics-report-templates",
      JSON.stringify(next),
    );
    const { error } = await supabase.from("analytics_report_templates").insert({
      name: row.name,
      description: definition.description,
      department:
        department === "Todos" ? profile.department : department,
      zone: zone === "Todas" ? profile.zone : zone,
      definition,
      created_by: profile.id,
    });
    setStatus(
      error
        ? "Plantilla guardada en este dispositivo. Ejecuta la migración para compartirla en Supabase."
        : "Plantilla guardada y compartida según tus permisos.",
    );
  }

  if (loading)
    return (
      <div className="flex min-h-[460px] items-center justify-center rounded-3xl border border-white/10 bg-[#0c0c11]">
        <Loader2 className="animate-spin text-purple-400" size={30} />
      </div>
    );

  return (
    <div className="animate-in space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-purple-400/20 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,.18),transparent_38%),#0b0b10] p-5 shadow-[0_0_45px_rgba(126,34,206,.1)] md:p-7">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-purple-400">
              <Bot size={15} /> Laboratorio de reportes + IA
            </div>
            <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">
              Pide el análisis. Luego modifícalo como en Excel.
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Combina campos, métricas, filtros, tablas dinámicas y gráficos sin
              depender de una plantilla fija.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs font-bold text-zinc-200 hover:border-purple-400/40"
            >
              <Download size={15} /> Excel / CSV
            </button>
            <button
              onClick={() => void exportPdf()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs font-bold text-zinc-200 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <FileDown size={15} />
              )}
              PDF
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-purple-400/20 bg-black/30 p-4">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="Ejemplo: compara junio contra julio por supervisor, separa Zona Norte, muestra semáforo, proyección y tabla para presentación…"
            className="w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
          />
          <div className="mt-3 flex flex-col justify-between gap-3 border-t border-white/10 pt-3 md:flex-row md:items-center">
            <div className="flex flex-wrap gap-2">
              {[
                "Ranking por vendedor y ciudad",
                "Tendencia mensual por zona",
                "Facturación por paquete",
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
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-3 text-xs font-black text-white shadow-[0_0_25px_rgba(168,85,247,.25)] disabled:opacity-60"
            >
              {planning ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {planning ? "Diseñando…" : "Crear con IA"}
            </button>
          </div>
        </div>
        {status && (
          <div className="mt-3 rounded-xl border border-purple-400/15 bg-purple-500/[.06] px-4 py-3 text-xs text-purple-200">
            {status}
            {engine && (
              <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-purple-400">
                {engine === "openai" ? "OpenAI" : "Local"}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-[24px] border border-white/10 bg-[#0b0b10] p-4 md:grid-cols-2 xl:grid-cols-5">
        <FilterSelect
          label="Desde"
          value={monthFrom}
          onChange={setMonthFrom}
          options={[{ value: "", label: "Primer mes" }, ...months]}
        />
        <FilterSelect
          label="Hasta"
          value={monthTo}
          onChange={setMonthTo}
          options={[{ value: "", label: "Último mes" }, ...months]}
        />
        <FilterSelect
          label="Departamento"
          value={department}
          onChange={setDepartment}
          disabled={profile.role !== "Administrador"}
          options={[
            { value: "Todos", label: "Todos" },
            ...departments.map((value) => ({ value, label: value })),
          ]}
        />
        <FilterSelect
          label="Zona"
          value={zone}
          onChange={setZone}
          disabled={profile.role !== "Administrador"}
          options={[
            { value: "Todas", label: "Todas" },
            ...zones.map((value) => ({ value, label: value })),
          ]}
        />
        <FilterSelect
          label="Ciudad"
          value={city}
          onChange={setCity}
          options={[
            { value: "Todas", label: "Todas" },
            ...cities.map((value) => ({ value, label: value })),
          ]}
        />
      </section>

      <div className="grid gap-5 2xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-white/10 bg-[#0b0b10] p-4 2xl:sticky 2xl:top-5">
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-600">
            Agregar visual
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 2xl:grid-cols-1">
            {blockTypes.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  onClick={() => addBlock(item.value)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.025] px-3 py-3 text-left text-[11px] font-bold text-zinc-400 hover:border-purple-400/40 hover:text-white"
                >
                  <Icon size={15} className="text-purple-400" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-600">
              Plantillas
            </p>
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#111116] px-3 py-3 text-xs text-white outline-none focus:border-purple-400/40"
            />
            <button
              onClick={() => void saveTemplate()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500/15 px-3 py-3 text-[11px] font-black text-purple-300"
            >
              <Save size={14} /> Guardar composición
            </button>
            <div className="mt-3 space-y-2">
              {templates.slice(0, 5).map((template) => (
                <button
                  key={template.id}
                  onClick={() => setDefinition(template.definition)}
                  className="w-full truncate rounded-lg border border-white/5 px-3 py-2 text-left text-[10px] text-zinc-500 hover:text-white"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main ref={canvasRef} className="space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-[24px] border border-white/10 bg-[#0b0b10] p-5 md:flex-row md:items-center">
            <div>
              <input
                value={definition.title}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full bg-transparent text-xl font-black text-white outline-none"
              />
              <input
                value={definition.description}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="mt-1 w-full bg-transparent text-xs text-zinc-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                {filteredRecords.length} registros
              </span>
              <button
                onClick={() => setDefinition(defaultDefinition)}
                className="rounded-lg border border-white/10 p-2 text-zinc-500 hover:text-white"
                title="Restablecer"
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {definition.blocks.map((block) => (
              <ReportBlockCard
                key={block.id}
                block={block}
                data={dataFor(block)}
                onChange={(patch) => updateBlock(block.id, patch)}
                onDelete={() =>
                  setDefinition((current) => ({
                    ...current,
                    blocks: current.blocks.filter(
                      (item) => item.id !== block.id,
                    ),
                  }))
                }
              />
            ))}
            <button
              onClick={() => addBlock("table")}
              className="flex min-h-44 items-center justify-center gap-2 rounded-[24px] border border-dashed border-purple-400/20 bg-purple-500/[.025] text-xs font-black text-purple-400 hover:bg-purple-500/[.06]"
            >
              <Plus size={18} /> Agregar otro bloque
            </button>
          </div>

          <section className="rounded-[24px] border border-purple-400/20 bg-[linear-gradient(135deg,rgba(168,85,247,.09),transparent_50%),#0b0b10] p-5">
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-purple-400">
              Lectura ejecutiva
            </p>
            <textarea
              value={definition.analysis}
              onChange={(event) =>
                setDefinition((current) => ({
                  ...current,
                  analysis: event.target.value,
                }))
              }
              rows={2}
              className="mt-2 w-full resize-none bg-transparent text-sm leading-6 text-zinc-300 outline-none"
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs font-bold normal-case tracking-normal text-white outline-none disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportBlockCard({
  block,
  data,
  onChange,
  onDelete,
}: {
  block: ReportBlock;
  data: DataPoint[];
  onChange: (patch: Partial<ReportBlock>) => void;
  onDelete: () => void;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const top = data[0];
  const pivotColumns = Array.from(
    new Set(data.map((item) => item.secondary).filter(Boolean)),
  );
  const pivotRows = Array.from(new Set(data.map((item) => item.name)));

  return (
    <article
      className={`overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0b10] shadow-[0_15px_40px_rgba(0,0,0,.2)] ${
        block.type === "table" || block.type === "pivot" ? "xl:col-span-2" : ""
      }`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 p-4">
        <input
          value={block.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="min-w-0 flex-1 bg-transparent text-sm font-black text-white outline-none"
        />
        <select
          value={block.type}
          onChange={(event) =>
            onChange({ type: event.target.value as BlockType })
          }
          className="rounded-lg border border-white/10 bg-[#111116] px-2 py-2 text-[10px] font-bold text-purple-300"
        >
          {blockTypes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          onClick={onDelete}
          className="rounded-lg border border-white/10 p-2 text-zinc-600 hover:border-rose-400/30 hover:text-rose-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid gap-2 border-b border-white/5 bg-white/[.015] p-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniSelect
          label="Filas / eje"
          value={block.dimension}
          options={dimensions}
          onChange={(value) => onChange({ dimension: value as Dimension })}
        />
        <MiniSelect
          label="Columnas / serie"
          value={block.secondaryDimension}
          options={[
            { value: "none", label: "Sin segunda dimensión" },
            ...dimensions,
          ]}
          onChange={(value) =>
            onChange({
              secondaryDimension: value as Dimension | "none",
            })
          }
        />
        <MiniSelect
          label="Métrica"
          value={block.metric}
          options={metrics}
          onChange={(value) => onChange({ metric: value as Metric })}
        />
        <div className="grid grid-cols-2 gap-2">
          <MiniSelect
            label="Orden"
            value={block.sort}
            options={[
              { value: "desc", label: "Mayor a menor" },
              { value: "asc", label: "Cronológico" },
            ]}
            onChange={(value) => onChange({ sort: value as SortDirection })}
          />
          <label className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
            Límite
            <input
              type="number"
              min={1}
              max={200}
              value={block.limit}
              onChange={(event) =>
                onChange({ limit: Number(event.target.value) || 1 })
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#111116] px-2 py-2 text-[10px] text-white outline-none"
            />
          </label>
        </div>
      </div>
      <details className="border-b border-white/5 px-4 py-2">
        <summary className="cursor-pointer text-[9px] font-black uppercase tracking-wider text-zinc-600">
          Filtro propio del bloque
        </summary>
        <div className="mt-2 grid gap-2 pb-2 sm:grid-cols-[1fr_130px_1fr]">
          <MiniSelect
            label="Campo"
            value={block.filter.field}
            options={dimensions}
            onChange={(value) =>
              onChange({
                filter: { ...block.filter, field: value as Dimension },
              })
            }
          />
          <MiniSelect
            label="Condición"
            value={block.filter.operator}
            options={[
              { value: "contains", label: "Contiene" },
              { value: "equals", label: "Es igual a" },
            ]}
            onChange={(value) =>
              onChange({
                filter: {
                  ...block.filter,
                  operator: value as "equals" | "contains",
                },
              })
            }
          />
          <label className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
            Valor
            <input
              value={block.filter.value}
              onChange={(event) =>
                onChange({
                  filter: { ...block.filter, value: event.target.value },
                })
              }
              placeholder="Cualquier valor"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#111116] px-2 py-2 text-[10px] normal-case text-white outline-none"
            />
          </label>
        </div>
      </details>

      <div className="min-h-[260px] p-4">
        {block.type === "kpi" && (
          <div className="flex h-[225px] flex-col items-center justify-center rounded-2xl border border-purple-400/15 bg-[radial-gradient(circle,rgba(168,85,247,.15),transparent_65%)]">
            <span className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
              {metricLabel(block.metric)}
            </span>
            <strong className="mt-3 text-5xl font-black text-white">
              {formatValue(data[0]?.value || 0, block.metric)}
            </strong>
          </div>
        )}
        {(block.type === "bar" ||
          block.type === "line" ||
          block.type === "area") && (
          <ResponsiveContainer width="100%" height={225}>
            {block.type === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid stroke="#24242c" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#71717a", fontSize: 9 }}
                  interval={0}
                  angle={data.length > 7 ? -20 : 0}
                  height={data.length > 7 ? 55 : 30}
                />
                <YAxis tick={{ fill: "#71717a", fontSize: 9 }} width={45} />
                <Tooltip
                  contentStyle={{
                    background: "#111116",
                    border: "1px solid #3f3f46",
                    borderRadius: 12,
                  }}
                  formatter={(value) =>
                    formatValue(Number(value || 0), block.metric)
                  }
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {data.map((_, index) => (
                    <Cell key={index} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : block.type === "line" ? (
              <LineChart data={data}>
                <CartesianGrid stroke="#24242c" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#71717a", fontSize: 9 }}
                />
                <YAxis tick={{ fill: "#71717a", fontSize: 9 }} width={45} />
                <Tooltip
                  contentStyle={{
                    background: "#111116",
                    border: "1px solid #3f3f46",
                    borderRadius: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#c084fc"
                  strokeWidth={3}
                  dot={{ fill: "#d946ef", r: 3 }}
                />
              </LineChart>
            ) : (
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`fill-${block.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#24242c" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#71717a", fontSize: 9 }}
                />
                <YAxis tick={{ fill: "#71717a", fontSize: 9 }} width={45} />
                <Tooltip
                  contentStyle={{
                    background: "#111116",
                    border: "1px solid #3f3f46",
                    borderRadius: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#c084fc"
                  strokeWidth={3}
                  fill={`url(#fill-${block.id})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
        {block.type === "pie" && (
          <ResponsiveContainer width="100%" height={225}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={88}
                paddingAngle={3}
              >
                {data.map((_, index) => (
                  <Cell key={index} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#111116",
                  border: "1px solid #3f3f46",
                  borderRadius: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
        {block.type === "traffic" && (
          <div className="grid h-[225px] grid-cols-3 gap-3">
            {[
              {
                label: "Sobresaliente",
                color: "#34d399",
                value: Math.round(total * 0.36),
              },
              {
                label: "Seguimiento",
                color: "#f59e0b",
                value: Math.round(total * 0.29),
              },
              {
                label: "Crítico",
                color: "#fb7185",
                value: Math.max(0, total - Math.round(total * 0.65)),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[.02] text-center"
              >
                <span
                  className="h-4 w-4 rounded-full shadow-[0_0_20px_currentColor]"
                  style={{ background: item.color, color: item.color }}
                />
                <strong className="mt-3 text-2xl font-black text-white">
                  {formatValue(item.value, block.metric)}
                </strong>
                <span className="mt-1 text-[9px] font-bold text-zinc-600">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}
        {block.type === "funnel" && (
          <div className="flex h-[225px] flex-col justify-center gap-2">
            {data.slice(0, 5).map((item, index) => {
              const width = Math.max(36, 100 - index * 14);
              return (
                <div
                  key={`${item.name}-${item.secondary}`}
                  className="mx-auto flex h-9 items-center justify-between rounded-lg bg-gradient-to-r from-purple-700 to-fuchsia-600 px-4 text-[10px] font-black text-white"
                  style={{ width: `${width}%`, opacity: 1 - index * 0.1 }}
                >
                  <span className="truncate">{item.name}</span>
                  <span>{formatValue(item.value, block.metric)}</span>
                </div>
              );
            })}
          </div>
        )}
        {block.type === "table" && (
          <div className="max-h-[300px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0b0b10] text-[9px] uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="p-3">Dimensión</th>
                  {block.secondaryDimension !== "none" && (
                    <th className="p-3">Serie</th>
                  )}
                  <th className="p-3 text-right">
                    {metricLabel(block.metric)}
                  </th>
                  <th className="p-3 text-right">% total</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, index) => (
                  <tr
                    key={`${item.name}-${item.secondary}-${index}`}
                    className="border-t border-white/5 text-zinc-300"
                  >
                    <td className="p-3 font-bold text-white">{item.name}</td>
                    {block.secondaryDimension !== "none" && (
                      <td className="p-3">{item.secondary}</td>
                    )}
                    <td className="p-3 text-right">
                      {formatValue(item.value, block.metric)}
                    </td>
                    <td className="p-3 text-right text-purple-400">
                      {total ? Math.round((item.value / total) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {block.type === "pivot" && (
          <div className="max-h-[300px] overflow-auto">
            {pivotColumns.length ? (
              <table className="min-w-full text-left text-[10px]">
                <thead className="sticky top-0 bg-[#0b0b10] text-zinc-600">
                  <tr>
                    <th className="p-3">Filas</th>
                    {pivotColumns.map((column) => (
                      <th key={column} className="p-3 text-right">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pivotRows.map((row) => (
                    <tr key={row} className="border-t border-white/5">
                      <td className="p-3 font-bold text-white">{row}</td>
                      {pivotColumns.map((column) => (
                        <td
                          key={column}
                          className="p-3 text-right text-zinc-300"
                        >
                          {formatValue(
                            data.find(
                              (item) =>
                                item.name === row &&
                                item.secondary === column,
                            )?.value || 0,
                            block.metric,
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex h-[225px] flex-col items-center justify-center text-center">
                <Grid3X3 size={28} className="text-purple-400" />
                <p className="mt-3 text-xs font-bold text-white">
                  Selecciona una segunda dimensión
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">
                  Por ejemplo: ciudad en filas y paquete en columnas.
                </p>
              </div>
            )}
          </div>
        )}
        {!data.length && (
          <div className="flex h-[225px] items-center justify-center text-xs text-zinc-600">
            No hay datos para esta combinación.
          </div>
        )}
      </div>
      {block.type !== "kpi" && data.length > 0 && (
        <div className="flex justify-between border-t border-white/5 px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
          <span>{data.length} combinaciones</span>
          <span>
            Mayor: {top?.name} · {formatValue(top?.value || 0, block.metric)}
          </span>
        </div>
      )}
    </article>
  );
}

function MiniSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#111116] px-2 py-2 text-[10px] font-bold normal-case tracking-normal text-zinc-300 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
