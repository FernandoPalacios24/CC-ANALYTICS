"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CloudUpload,
  Download,
  FileBarChart,
  FileSpreadsheet,
  Filter,
  Gauge,
  Headphones,
  HeartHandshake,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Map,
  Megaphone,
  Menu,
  PanelLeftClose,
  PhoneCall,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserCog,
  Users,
  WalletCards,
  Wifi,
  Wrench,
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
import { citySales, monthly, salesTrend, sellers } from "@/lib/data";
import {
  ReportStudio,
  SalesOrganizationDashboard,
} from "@/components/sales-intelligence";

export type Department =
  | "Administración"
  | "Ventas Digitales"
  | "Ventas Residenciales"
  | "Ventas Residenciales Rurales"
  | "Ventas Corporativas"
  | "Marketing"
  | "Call Center"
  | "Recursos Humanos"
  | "Finanzas"
  | "Operaciones";
export type Role =
  | "Administrador"
  | "Líder de departamento"
  | "Supervisor"
  | "Analista"
  | "Operador";
export type Zone = string;
export type Profile = {
  id: string;
  name: string;
  email: string;
  department: Department;
  jobProfile: string;
  zone: Zone;
  role: Role;
  managerId: string | null;
  initials: string;
  active: boolean;
};
export type NewUserInput = {
  name: string;
  email: string;
  password: string;
  department: Department;
  jobProfile: string;
  zone: Zone;
  role: Role;
  managerId: string | null;
};
export type ImportedRow = Record<string, unknown>;
export type Upload = {
  id: string;
  file: string;
  rows: number;
  department: Department;
  zone: Zone;
  user: string;
  date: string;
};
type Filters = { month: string; region: string; city: string; channel: string };

const departments: Department[] = [
  "Administración",
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
const zones: Zone[] = ["Nacional", "Zona Norte", "Zona Centro", "Zona Sur"];
const jobProfiles = [
  "Community Manager",
  "Ejecutivo de ventas",
  "Líder de departamento",
  "Supervisor",
  "Analista",
  "Operador",
  "Administrador",
];
const roles: Role[] = [
  "Administrador",
  "Líder de departamento",
  "Supervisor",
  "Analista",
  "Operador",
];

function departmentsForJobProfile(jobProfile: string) {
  return jobProfile === "Community Manager"
    ? departments.filter(
        (department) =>
          department === "Ventas Digitales" || department === "Marketing",
      )
    : departments;
}

function zonesWithCurrent(zone: Zone) {
  return zones.includes(zone) ? zones : [zone, ...zones];
}

function jobProfilesWithCurrent(jobProfile: string) {
  return jobProfiles.includes(jobProfile)
    ? jobProfiles
    : [jobProfile, ...jobProfiles];
}

function managerCandidates(
  profiles: Profile[],
  role: Role,
  department: Department,
  zone: Zone,
  currentId?: string,
) {
  if (role === "Supervisor")
    return profiles.filter(
      (profile) =>
        profile.id !== currentId &&
        profile.role === "Líder de departamento" &&
        profile.department === department &&
        (profile.zone === zone || profile.zone === "Nacional"),
    );
  if (role === "Analista" || role === "Operador")
    return profiles.filter(
      (profile) =>
        profile.id !== currentId &&
        profile.role === "Supervisor" &&
        profile.department === department &&
        profile.zone === zone,
    );
  return [];
}

function defaultJobProfile(role: Role) {
  if (role === "Líder de departamento") return "Líder de departamento";
  if (role === "Supervisor") return "Supervisor";
  if (role === "Operador") return "Operador";
  if (role === "Administrador") return "Administrador";
  return "Analista";
}

const initialProfiles: Profile[] = [
  {
    id: "demo-admin",
    name: "Fernando Palacios",
    email: "fernando.palacios@cablecolor.hn",
    department: "Administración",
    jobProfile: "Administrador",
    zone: "Nacional",
    role: "Administrador",
    managerId: null,
    initials: "FP",
    active: true,
  },
  {
    id: "demo-sales",
    name: "Andrea Sabillón",
    email: "andrea.sabillon@cablecolor.hn",
    department: "Ventas Digitales",
    jobProfile: "Community Manager",
    zone: "Zona Norte",
    role: "Líder de departamento",
    managerId: null,
    initials: "AS",
    active: true,
  },
];

const moduleInfo = [
  {
    name: "Dashboard ejecutivo",
    icon: LayoutDashboard,
    departments: ["Administración"],
  },
  {
    name: "Dashboard de mi área",
    icon: LayoutDashboard,
    departments: departments.filter((x) => x !== "Administración"),
  },
  {
    name: "Ventas digitales",
    icon: BarChart3,
    departments: ["Administración", "Ventas Digitales"],
  },
  {
    name: "Ventas residenciales",
    icon: Building2,
    departments: ["Administración", "Ventas Residenciales"],
  },
  {
    name: "Ventas residenciales rurales",
    icon: Map,
    departments: ["Administración", "Ventas Residenciales Rurales"],
  },
  {
    name: "Ventas corporativas",
    icon: BriefcaseBusiness,
    departments: ["Administración", "Ventas Corporativas"],
  },
  {
    name: "Marketing digital",
    icon: Megaphone,
    departments: ["Administración", "Marketing"],
  },
  {
    name: "ROA y ROAS",
    icon: CircleDollarSign,
    departments: ["Administración", "Marketing", "Finanzas"],
  },
  {
    name: "Call center",
    icon: PhoneCall,
    departments: ["Administración", "Call Center"],
  },
  {
    name: "Recursos humanos",
    icon: Users,
    departments: ["Administración", "Recursos Humanos"],
  },
  {
    name: "Finanzas",
    icon: WalletCards,
    departments: ["Administración", "Finanzas"],
  },
  {
    name: "Operaciones",
    icon: Settings,
    departments: ["Administración", "Operaciones"],
  },
  {
    name: "Instalaciones",
    icon: Wrench,
    departments: ["Administración", "Operaciones"],
  },
  {
    name: "Soporte técnico",
    icon: Headphones,
    departments: ["Administración", "Operaciones", "Call Center"],
  },
  {
    name: "Inventario",
    icon: Boxes,
    departments: ["Administración", "Operaciones"],
  },
  {
    name: "Cobertura",
    icon: Map,
    departments: [
      "Administración",
      "Operaciones",
      "Ventas Digitales",
      "Ventas Residenciales",
      "Ventas Corporativas",
    ],
  },
  {
    name: "Clientes",
    icon: HeartHandshake,
    departments: [
      "Administración",
      "Ventas Digitales",
      "Ventas Residenciales",
      "Ventas Corporativas",
      "Call Center",
    ],
  },
  { name: "Reportes", icon: FileBarChart, departments: departments },
  { name: "Importar datos", icon: FileSpreadsheet, departments: departments },
  {
    name: "Usuarios y permisos",
    icon: UserCog,
    departments: ["Administración"],
  },
  { name: "Centro de alertas", icon: Bell, departments: departments },
  {
    name: "Proyecciones",
    icon: Sparkles,
    departments: [
      "Administración",
      "Ventas Digitales",
      "Ventas Residenciales",
      "Ventas Corporativas",
      "Marketing",
      "Finanzas",
      "Operaciones",
    ],
  },
] as const;

const tip = {
  contentStyle: {
    background: "#121218",
    border: "1px solid #30243d",
    borderRadius: 12,
    fontSize: 11,
  },
  labelStyle: { color: "#a1a1aa" },
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-purple-400/30 bg-purple-500/10 font-black tracking-tighter text-purple-300 shadow-[0_0_34px_rgba(157,78,221,.18)]">
        CC
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_10px_#e879f9]" />
      </div>
      {!compact && (
        <div>
          <div className="text-[15px] font-black tracking-[.18em] text-white">
            CC ANALYTICS
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[.28em] text-purple-300/70">
            Business Intelligence
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-2xl ${className}`}>{children}</section>
  );
}
function ChartHead({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
        <p className="mt-1 text-[11px] text-zinc-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function Kpi({
  label,
  value,
  change,
  icon: Icon,
  down = false,
}: {
  label: string;
  value: string;
  change: string;
  icon: React.ElementType;
  down?: boolean;
}) {
  return (
    <Card className="glow-line p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-zinc-500">
            {label}
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-white">
            {value}
          </p>
        </div>
        <div className="rounded-xl bg-purple-500/10 p-2.5 text-purple-300">
          <Icon size={19} />
        </div>
      </div>
      <div
        className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${down ? "text-rose-400" : "text-emerald-400"}`}
      >
        {down ? <TrendingDown size={14} /> : <TrendingUp size={14} />} {change}
        <span className="font-normal text-zinc-600">vs mes anterior</span>
      </div>
    </Card>
  );
}

function ExecutiveDashboard({ go }: { go: (name: string) => void }) {
  return (
    <div className="animate-in space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Ventas acumuladas"
          value="274"
          change="18.6%"
          icon={Target}
        />
        <Kpi
          label="Ingresos del mes"
          value="L 4.82M"
          change="12.3%"
          icon={CircleDollarSign}
        />
        <Kpi label="Cumplimiento" value="91.3%" change="7.4%" icon={Gauge} />
        <Kpi
          label="Clientes activos"
          value="48,219"
          change="3.1%"
          icon={Users}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SalesDaily />
        <MonthlyChart />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <CityChart />
        <DepartmentStatus />
      </div>
      <Ranking go={go} />
    </div>
  );
}

function SalesDaily() {
  return (
    <Card className="p-5">
      <ChartHead
        title="Ventas diarias"
        subtitle="Ritmo comercial · julio vs junio"
      >
        <span className="rounded-lg bg-purple-500/10 px-2.5 py-1 text-[10px] font-bold text-purple-300">
          PROYECCIÓN 318
        </span>
      </ChartHead>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={salesTrend}>
            <defs>
              <linearGradient id="salesV2" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#a855f7" stopOpacity={0.42} />
                <stop offset="1" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="#24242b"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              stroke="#52525b"
              tick={{ fontSize: 10 }}
              axisLine={false}
            />
            <YAxis stroke="#52525b" tick={{ fontSize: 10 }} axisLine={false} />
            <Tooltip {...tip} />
            <Area
              type="monotone"
              dataKey="actual"
              name="Julio"
              stroke="#b56cff"
              strokeWidth={2.5}
              fill="url(#salesV2)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
function MonthlyChart() {
  return (
    <Card className="p-5">
      <ChartHead
        title="Comparativo mensual"
        subtitle="Ventas totales · últimos 6 meses"
      />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly}>
            <CartesianGrid
              stroke="#24242b"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              stroke="#52525b"
              tick={{ fontSize: 10 }}
              axisLine={false}
            />
            <YAxis stroke="#52525b" tick={{ fontSize: 10 }} axisLine={false} />
            <Tooltip {...tip} />
            <Bar dataKey="sales" radius={[7, 7, 2, 2]}>
              {monthly.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === monthly.length - 1 ? "#a855f7" : "#332544"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
function CityChart() {
  return (
    <Card className="p-5">
      <ChartHead
        title="Ventas por ciudad"
        subtitle="Distribución de contratos en Región Norte"
      />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={citySales} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid
              stroke="#24242b"
              strokeDasharray="3 4"
              horizontal={false}
            />
            <XAxis
              type="number"
              stroke="#52525b"
              tick={{ fontSize: 10 }}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="city"
              width={78}
              stroke="#71717a"
              tick={{ fontSize: 10 }}
              axisLine={false}
            />
            <Tooltip {...tip} />
            <Bar
              dataKey="value"
              fill="#8b5cf6"
              radius={[0, 7, 7, 0]}
              barSize={13}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
function DepartmentStatus() {
  const data = [
      { name: "Ventas", value: 91 },
      { name: "Marketing", value: 84 },
      { name: "Operaciones", value: 88 },
      { name: "RRHH", value: 79 },
    ],
    colors = ["#a855f7", "#7c3aed", "#6366f1", "#d946ef"];
  return (
    <Card className="p-5">
      <ChartHead
        title="Cumplimiento por departamento"
        subtitle="Vista exclusiva de administración"
      />
      <div className="h-52">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={55}
              outerRadius={82}
              paddingAngle={3}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i]} />
              ))}
            </Pie>
            <Tooltip {...tip} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.map((x, i) => (
          <div key={x.name} className="text-[10px] text-zinc-500">
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full"
              style={{ background: colors[i] }}
            />
            {x.name} <b className="text-zinc-300">{x.value}%</b>
          </div>
        ))}
      </div>
    </Card>
  );
}
function Ranking({ go }: { go: (name: string) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-3">
        <ChartHead
          title="Ranking de vendedores"
          subtitle="Resultados individuales del periodo"
        >
          <button
            onClick={() => go("Reportes")}
            className="text-[11px] font-semibold text-purple-300 hover:text-purple-200"
          >
            Ver reporte →
          </button>
        </ChartHead>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="border-y border-white/[.06] bg-white/[.018] text-[10px] uppercase tracking-wider text-zinc-600">
            <tr>
              <th className="px-5 py-3">Vendedor</th>
              <th>Equipo</th>
              <th>Ventas</th>
              <th>Cumplimiento</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s, i) => (
              <tr
                key={s.name}
                className="border-b border-white/[.045] last:border-0"
              >
                <td className="px-5 py-3.5">
                  <span className="font-semibold text-zinc-200">
                    {i + 1}. {s.name}
                  </span>
                </td>
                <td className="text-zinc-500">{s.team}</td>
                <td className="font-bold text-white">{s.sales}</td>
                <td className="text-zinc-400">
                  {Math.round((s.sales / s.goal) * 100)}%
                </td>
                <td className="font-semibold text-zinc-300">{s.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const areaConfigs: Record<
  string,
  {
    labels: [string, string, string, string];
    values: [string, string, string, string];
    icon: React.ElementType;
  }
> = {
  "Ventas digitales": {
    labels: ["Contratos", "Monto vendido", "Conversión", "ARPU"],
    values: ["274", "L 4.82M", "11.0%", "L 742"],
    icon: BarChart3,
  },
  "Ventas residenciales": {
    labels: ["Altas nuevas", "Ingresos", "Cobertura", "Conversión"],
    values: ["1,482", "L 8.14M", "86.4%", "13.8%"],
    icon: Building2,
  },
  "Ventas corporativas": {
    labels: ["Cuentas activas", "MRR", "Pipeline", "Cierres"],
    values: ["184", "L 2.91M", "L 6.4M", "28"],
    icon: BriefcaseBusiness,
  },
  "Call center": {
    labels: ["Llamadas", "Atendidas", "Nivel de servicio", "Abandono"],
    values: ["4,816", "4,392", "91.2%", "4.7%"],
    icon: PhoneCall,
  },
  Instalaciones: {
    labels: ["Programadas", "Completadas", "Pendientes", "SLA"],
    values: ["146", "118", "28", "94.6%"],
    icon: Wrench,
  },
  "Soporte técnico": {
    labels: ["Tickets", "Resueltos", "Primera respuesta", "CSAT"],
    values: ["392", "341", "8 min", "92.1%"],
    icon: Headphones,
  },
  Inventario: {
    labels: ["Unidades", "Valor total", "Stock crítico", "Rotación"],
    values: ["8,426", "L 12.3M", "14", "3.8x"],
    icon: Boxes,
  },
  Cobertura: {
    labels: ["Hogares pasados", "Cobertura", "Zonas nuevas", "Disponibilidad"],
    values: ["184K", "78.4%", "12", "99.1%"],
    icon: Map,
  },
  Clientes: {
    labels: ["Activos", "Altas", "Bajas", "NPS"],
    values: ["48,219", "1,482", "621", "68"],
    icon: HeartHandshake,
  },
  Proyecciones: {
    labels: ["Cierre previsto", "Probabilidad", "Brecha de meta", "Tendencia"],
    values: ["318", "87%", "-32", "+18.6%"],
    icon: Sparkles,
  },
};

function AreaDashboard({
  name,
  department,
}: {
  name: string;
  department: Department;
}) {
  const c =
    areaConfigs[name] ||
    areaConfigs[
      department === "Marketing" ? "Proyecciones" : "Ventas digitales"
    ];
  const seed = name.length + department.length;
  const trend = monthly.map((x, i) => ({
    month: x.month,
    value: Math.round(x.sales * (0.55 + (seed % 6) * 0.08) + i * seed),
  }));
  return (
    <div className="animate-in space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {c.labels.map((label, i) => (
          <Kpi
            key={label}
            label={label}
            value={c.values[i]}
            change={`${4 + ((seed + i) % 11)}.2%`}
            icon={c.icon}
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="p-5">
          <ChartHead
            title={`Evolución de ${name.toLowerCase()}`}
            subtitle={`Información exclusiva de ${department}`}
          />
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="areaV2" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="1" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#24242b" vertical={false} />
                <XAxis dataKey="month" stroke="#52525b" />
                <YAxis stroke="#52525b" />
                <Tooltip {...tip} />
                <Area
                  dataKey="value"
                  stroke="#c084fc"
                  fill="url(#areaV2)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <ActionSummary department={department} />
      </div>
    </div>
  );
}
function ActionSummary({ department }: { department: Department }) {
  return (
    <Card className="p-5">
      <ChartHead
        title="Resumen de gestión"
        subtitle={`Pendientes de ${department}`}
      />
      <div className="space-y-3">
        {[
          "Indicadores dentro de objetivo",
          "Actividad pendiente de revisión",
          "Carga de datos actualizada",
          "Próximo corte programado",
        ].map((x, i) => (
          <div
            key={x}
            className="flex items-center justify-between rounded-xl border border-white/[.05] bg-white/[.02] p-3"
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-2 w-2 rounded-full ${i === 1 ? "bg-amber-400" : "bg-purple-400"}`}
              />
              <span className="text-xs text-zinc-300">{x}</span>
            </div>
            <span className="text-[10px] font-bold text-zinc-600">
              {i === 1 ? "REVISAR" : "OK"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MarketingDashboard() {
  const data = [
    { d: "S1", leads: 480 },
    { d: "S2", leads: 620 },
    { d: "S3", leads: 710 },
    { d: "S4", leads: 670 },
  ];
  return (
    <div className="animate-in space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Inversión"
          value="L 195K"
          change="8.2%"
          icon={WalletCards}
        />
        <Kpi label="Leads" value="2,480" change="21.4%" icon={Users} />
        <Kpi
          label="Costo por lead"
          value="L 78.63"
          change="5.1%"
          icon={Calculator}
          down
        />
        <Kpi
          label="Campañas activas"
          value="18"
          change="3 nuevas"
          icon={Megaphone}
        />
      </div>
      <Card className="p-5">
        <ChartHead
          title="Generación de leads"
          subtitle="Eficiencia semanal de campañas digitales"
        />
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={data}>
              <CartesianGrid stroke="#24242b" vertical={false} />
              <XAxis dataKey="d" stroke="#52525b" />
              <YAxis stroke="#52525b" />
              <Tooltip {...tip} />
              <Area
                dataKey="leads"
                fill="#a855f733"
                stroke="#c084fc"
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
function RoasDashboard() {
  const data = [
    { channel: "Meta", roas: 5.2, roa: 18 },
    { channel: "Google", roas: 4.1, roa: 14 },
    { channel: "Orgánico", roas: 7.4, roa: 27 },
    { channel: "Referidos", roas: 6.1, roa: 23 },
  ];
  return (
    <div className="animate-in space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="ROAS global"
          value="4.82x"
          change="0.64x"
          icon={TrendingUp}
        />
        <Kpi label="ROA global" value="18.4%" change="2.8%" icon={Gauge} />
        <Kpi
          label="Ingresos atribuidos"
          value="L 941K"
          change="14.2%"
          icon={CircleDollarSign}
        />
        <Kpi
          label="Costo por venta"
          value="L 711"
          change="9.7%"
          icon={Calculator}
          down
        />
      </div>
      <Card className="p-5">
        <ChartHead
          title="Rentabilidad por canal"
          subtitle="ROAS y retorno sobre activos, sin repetir el dashboard de marketing"
        />
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid stroke="#24242b" vertical={false} />
              <XAxis dataKey="channel" stroke="#52525b" />
              <YAxis stroke="#52525b" />
              <Tooltip {...tip} />
              <Legend />
              <Bar
                dataKey="roas"
                name="ROAS"
                fill="#a855f7"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="roa"
                name="ROA %"
                fill="#4338ca"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
function HrDashboard() {
  return (
    <div className="animate-in space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Colaboradores" value="426" change="4.2%" icon={Users} />
        <Kpi
          label="Rotación"
          value="3.8%"
          change="0.7%"
          icon={TrendingDown}
          down
        />
        <Kpi
          label="Vacantes"
          value="18"
          change="3 nuevas"
          icon={BriefcaseBusiness}
        />
        <Kpi
          label="Productividad"
          value="87.4%"
          change="5.9%"
          icon={Activity}
        />
      </div>
      <AreaDashboard name="Recursos humanos" department="Recursos Humanos" />
    </div>
  );
}
function FinanceDashboard() {
  const cash = [
    { m: "Feb", income: 3.8, cost: 2.4 },
    { m: "Mar", income: 4.2, cost: 2.7 },
    { m: "Abr", income: 3.9, cost: 2.5 },
    { m: "May", income: 4.5, cost: 2.8 },
    { m: "Jun", income: 4.7, cost: 2.9 },
    { m: "Jul", income: 4.82, cost: 3.0 },
  ];
  return (
    <div className="animate-in space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Ingresos"
          value="L 4.82M"
          change="12.3%"
          icon={CircleDollarSign}
        />
        <Kpi
          label="Costos"
          value="L 3.01M"
          change="4.8%"
          icon={WalletCards}
          down
        />
        <Kpi
          label="Margen EBITDA"
          value="37.6%"
          change="2.4%"
          icon={TrendingUp}
        />
        <Kpi
          label="Cartera vencida"
          value="L 286K"
          change="6.7%"
          icon={AlertTriangle}
          down
        />
      </div>
      <Card className="p-5">
        <ChartHead
          title="Ingresos vs costos"
          subtitle="Evolución financiera · millones de lempiras"
        />
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={cash}>
              <CartesianGrid stroke="#24242b" vertical={false} />
              <XAxis dataKey="m" stroke="#52525b" />
              <YAxis stroke="#52525b" />
              <Tooltip {...tip} />
              <Legend />
              <Line
                dataKey="income"
                name="Ingresos"
                stroke="#c084fc"
                strokeWidth={3}
              />
              <Line
                dataKey="cost"
                name="Costos"
                stroke="#71717a"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
function OperationsDashboard() {
  return (
    <div className="animate-in space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Órdenes abiertas" value="318" change="12%" icon={Wrench} />
        <Kpi label="Instalaciones hoy" value="84" change="9%" icon={Wifi} />
        <Kpi
          label="SLA cumplido"
          value="94.6%"
          change="2.1%"
          icon={ShieldCheck}
        />
        <Kpi
          label="Tiempo promedio"
          value="3h 42m"
          change="18m"
          icon={Activity}
        />
      </div>
      <AreaDashboard name="Operaciones" department="Operaciones" />
    </div>
  );
}

function ReportsDashboard({ department }: { department: Department }) {
  const [done, setDone] = useState(false);
  function download() {
    const csv = `Departamento,Periodo,Indicador,Valor\n${department},Julio 2026,Cumplimiento,91.3%\n${department},Julio 2026,Eficiencia,87.4%`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `reporte-${department.toLowerCase().replaceAll(" ", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setDone(true);
  }
  return (
    <div className="animate-in space-y-4">
      <Card className="p-6">
        <ChartHead
          title="Centro de reportes"
          subtitle={`Reportes autorizados para ${department}`}
        />
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Resumen mensual",
            "Indicadores operativos",
            "Comparativo de gestión",
          ].map((x, i) => (
            <button
              onClick={download}
              key={x}
              className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5 text-left transition hover:border-purple-400/30"
            >
              <FileBarChart className="text-purple-400" />
              <p className="mt-4 text-sm font-bold text-white">{x}</p>
              <p className="mt-2 text-[11px] text-zinc-500">
                Exportar datos de {department}
              </p>
              <span className="mt-4 flex items-center gap-2 text-[10px] font-bold text-purple-300">
                <Download size={13} /> DESCARGAR CSV {i + 1}
              </span>
            </button>
          ))}
        </div>
        {done && (
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Check size={15} /> Reporte generado correctamente.
          </p>
        )}
      </Card>
    </div>
  );
}

function ImportDashboard({
  profile,
  uploads,
  onUpload,
}: {
  profile: Profile;
  uploads: Upload[];
  onUpload: (u: Upload) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Department>(profile.department);
  const [error, setError] = useState("");
  async function load(file: File) {
    setName(file.name);
    setError("");
    try {
      let parsed: ImportedRow[] = [];
      if (file.name.toLowerCase().endsWith(".csv")) {
        parsed = await new Promise((resolve, reject) =>
          Papa.parse<ImportedRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (r) => resolve(r.data),
            error: reject,
          }),
        );
      } else {
        const buffer = await file.arrayBuffer();
        const book = XLSX.read(buffer);
        parsed = XLSX.utils.sheet_to_json<ImportedRow>(
          book.Sheets[book.SheetNames[0]],
        );
      }
      setRows(parsed.slice(0, 50));
      onUpload({
        id: crypto.randomUUID(),
        file: file.name,
        rows: parsed.length,
        department: scope,
        zone: profile.zone,
        user: profile.name,
        date: new Date().toLocaleString("es-HN"),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo procesar el archivo",
      );
    }
  }
  return (
    <div className="animate-in space-y-4">
      <Card className="p-6">
        <ChartHead
          title="Carga departamental de datos"
          subtitle="Excel y CSV quedan identificados con usuario y departamento"
        >
          <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-bold text-purple-300">
            <LockKeyhole size={13} /> ALCANCE CONTROLADO
          </div>
        </ChartHead>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3">
          <span className="text-xs text-zinc-500">
            Los datos se cargarán en:
          </span>
          {profile.role === "Administrador" ? (
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Department)}
              className="rounded-lg border border-purple-400/20 bg-[#111116] px-3 py-2 text-xs font-bold text-purple-300 outline-none"
            >
              {departments
                .filter((x) => x !== "Administración")
                .map((x) => (
                  <option key={x}>{x}</option>
                ))}
            </select>
          ) : (
            <span className="rounded-lg bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-300">
              {profile.department}
            </span>
          )}
          <span className="ml-auto text-[10px] text-zinc-600">
            Responsable: {profile.name}
          </span>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) load(f);
          }}
          onClick={() => ref.current?.click()}
          className="group grid min-h-56 place-items-center rounded-2xl border border-dashed border-purple-400/30 bg-purple-500/[.035] p-8 text-center transition hover:border-purple-400/60"
        >
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-purple-500/10 text-purple-300">
              <CloudUpload />
            </div>
            <h3 className="mt-4 font-bold text-white">
              Arrastra tu archivo aquí
            </h3>
            <p className="mt-2 text-xs text-zinc-500">
              Formatos .xlsx, .xls y .csv
            </p>
            <button className="mt-5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white">
              Seleccionar archivo
            </button>
            <input
              ref={ref}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) load(f);
              }}
            />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
      </Card>
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-bold text-white">
                Vista previa · {scope}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {name} · {rows.length} filas visibles
              </p>
            </div>
            <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-400">
              CARGA REGISTRADA
            </span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#17171e] text-zinc-500">
                <tr>
                  {Object.keys(rows[0]).map((k) => (
                    <th className="whitespace-nowrap px-4 py-3" key={k}>
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-white/[.05]">
                    {Object.keys(rows[0]).map((k) => (
                      <td
                        className="whitespace-nowrap px-4 py-3 text-zinc-300"
                        key={k}
                      >
                        {String(r[k] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {uploads.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5">
            <ChartHead
              title="Historial reciente"
              subtitle="Archivos registrados durante esta sesión"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-white/[.02] text-zinc-600">
                <tr>
                  <th className="px-5 py-3">Archivo</th>
                  <th>Departamento</th>
                  <th>Filas</th>
                  <th>Usuario</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id} className="border-t border-white/[.05]">
                    <td className="px-5 py-3 text-zinc-200">{u.file}</td>
                    <td className="text-purple-300">{u.department}</td>
                    <td>{u.rows}</td>
                    <td>{u.user}</td>
                    <td className="text-zinc-500">{u.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function PersistentImportDashboard({
  profile,
  uploads,
  onUpload,
}: {
  profile: Profile;
  uploads: Upload[];
  onUpload: (upload: Upload, rows: ImportedRow[]) => Promise<string | null>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportedRow[]>([]);
  const [scope, setScope] = useState<Department>(
    profile.department === "Administración"
      ? "Ventas Digitales"
      : profile.department,
  );
  const [zoneScope, setZoneScope] = useState<Zone>(
    profile.role === "Administrador" ? "Zona Norte" : profile.zone,
  );
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  async function load(file: File) {
    setLoading(true);
    setStatus("");
    setFileName(file.name);
    try {
      let parsed: ImportedRow[] = [];
      if (file.name.toLowerCase().endsWith(".csv"))
        parsed = await new Promise((resolve, reject) =>
          Papa.parse<ImportedRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (r) => resolve(r.data),
            error: reject,
          }),
        );
      else {
        const buffer = await file.arrayBuffer();
        const book = XLSX.read(buffer, { cellDates: true });
        const detailSheet = book.Sheets.Detalle;
        parsed = XLSX.utils.sheet_to_json<ImportedRow>(
          detailSheet || book.Sheets[book.SheetNames[0]],
          detailSheet ? { range: 2, defval: null } : { defval: null },
        );
      }
      if (!parsed.length)
        throw new Error("El archivo no contiene filas válidas.");
      setPreview(parsed.slice(0, 50));
      const upload: Upload = {
        id: crypto.randomUUID(),
        file: file.name,
        rows: parsed.length,
        department: scope,
        zone: zoneScope,
        user: profile.name,
        date: new Date().toLocaleString("es-HN"),
      };
      const error = await onUpload(upload, parsed);
      if (error) throw new Error(error);
      setStatus(
        `${parsed.length.toLocaleString("es-HN")} filas guardadas en ${scope} · ${zoneScope}.`,
      );
    } catch (e) {
      setStatus(
        `ERROR: ${e instanceof Error ? e.message : "No se pudo procesar el archivo."}`,
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="animate-in space-y-4">
      <Card className="p-6">
        <ChartHead
          title="Carga departamental de datos"
          subtitle="Excel y CSV se almacenan en el Supabase compartido"
        >
          <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-bold text-purple-300">
            <LockKeyhole size={13} /> RLS POR ÁREA Y ZONA
          </div>
        </ChartHead>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-3">
          <span className="text-xs text-zinc-500">Destino:</span>
          {profile.role === "Administrador" ? (
            <>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Department)}
                className="rounded-lg border border-purple-400/20 bg-[#111116] px-3 py-2 text-xs font-bold text-purple-300 outline-none"
              >
                {departments
                  .filter((x) => x !== "Administración")
                  .map((x) => (
                    <option key={x}>{x}</option>
                  ))}
              </select>
              <select
                value={zoneScope}
                onChange={(e) => setZoneScope(e.target.value)}
                className="rounded-lg border border-purple-400/20 bg-[#111116] px-3 py-2 text-xs font-bold text-purple-300 outline-none"
              >
                {zones
                  .filter((x) => x !== "Nacional")
                  .map((x) => (
                    <option key={x}>{x}</option>
                  ))}
              </select>
            </>
          ) : (
            <>
              <span className="rounded-lg bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-300">
                {scope}
              </span>
              <span className="rounded-lg bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-300">
                {zoneScope}
              </span>
            </>
          )}
          <span className="ml-auto text-[10px] text-zinc-600">
            Responsable: {profile.name}
          </span>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void load(file);
          }}
          onClick={() => !loading && ref.current?.click()}
          className="grid min-h-56 cursor-pointer place-items-center rounded-2xl border border-dashed border-purple-400/30 bg-purple-500/[.035] p-8 text-center transition hover:border-purple-400/60"
        >
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-purple-500/10 text-purple-300">
              <CloudUpload />
            </div>
            <h3 className="mt-4 font-bold text-white">
              {loading ? "Guardando datos..." : "Arrastra tu archivo aquí"}
            </h3>
            <p className="mt-2 text-xs text-zinc-500">
              Formatos .xlsx, .xls y .csv
            </p>
            <button
              disabled={loading}
              className="mt-5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Seleccionar archivo
            </button>
            <input
              ref={ref}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void load(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        {status && (
          <p
            className={`mt-4 rounded-xl border p-3 text-xs ${status.startsWith("ERROR") ? "border-rose-500/20 bg-rose-500/[.06] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300"}`}
          >
            {status}
          </p>
        )}
      </Card>
      {preview.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5">
            <p className="text-sm font-bold text-white">
              Vista previa · {fileName}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Primeras {preview.length} filas · {scope} · {zoneScope}
            </p>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#17171e] text-zinc-500">
                <tr>
                  {Object.keys(preview[0]).map((key) => (
                    <th className="whitespace-nowrap px-4 py-3" key={key}>
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index} className="border-t border-white/[.05]">
                    {Object.keys(preview[0]).map((key) => (
                      <td
                        className="whitespace-nowrap px-4 py-3 text-zinc-300"
                        key={key}
                      >
                        {String(row[key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {uploads.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5">
            <ChartHead
              title="Historial reciente"
              subtitle="Cargas confirmadas en Supabase"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-white/[.02] text-zinc-600">
                <tr>
                  <th className="px-5 py-3">Archivo</th>
                  <th>Departamento</th>
                  <th>Zona</th>
                  <th>Filas</th>
                  <th>Usuario</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id} className="border-t border-white/[.05]">
                    <td className="px-5 py-3 text-zinc-200">{upload.file}</td>
                    <td className="text-purple-300">{upload.department}</td>
                    <td className="text-zinc-300">{upload.zone}</td>
                    <td>{upload.rows}</td>
                    <td>{upload.user}</td>
                    <td className="text-zinc-500">{upload.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function UsersDashboard({
  profiles,
  setProfiles,
}: {
  profiles: Profile[];
  setProfiles: (p: Profile[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    department: "Ventas Digitales" as Department,
    jobProfile: "Analista",
    zone: "Zona Norte" as Zone,
    role: "Analista" as Role,
  });
  function add() {
    if (!draft.name || !draft.email) return;
    setProfiles([
      ...profiles,
      {
        id: crypto.randomUUID(),
        ...draft,
        managerId: null,
        initials: draft.name
          .split(" ")
          .map((x) => x[0])
          .slice(0, 2)
          .join("")
          .toUpperCase(),
        active: true,
      },
    ]);
    setCreating(false);
    setDraft({
      name: "",
      email: "",
      department: "Ventas Digitales",
      jobProfile: "Analista",
      zone: "Zona Norte",
      role: "Analista",
    });
  }
  function toggle(id: string) {
    setProfiles(
      profiles.map((p) => (p.id === id ? { ...p, active: !p.active } : p)),
    );
  }
  return (
    <div className="animate-in space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <ChartHead
            title="Usuarios y permisos"
            subtitle="Solo el administrador puede asignar departamentos y activar accesos"
          />
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold"
          >
            <Plus size={15} /> Nuevo usuario
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-y border-white/[.06] bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-5 py-3">Usuario</th>
                <th>Departamento</th>
                <th>Rol</th>
                <th>Alcance</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-white/[.05]">
                  <td className="px-5 py-3">
                    <p className="font-bold text-zinc-200">{p.name}</p>
                    <p className="mt-1 text-[10px] text-zinc-600">{p.email}</p>
                  </td>
                  <td className="font-semibold text-purple-300">
                    {p.department}
                  </td>
                  <td>{p.role}</td>
                  <td className="text-zinc-500">
                    {p.role === "Administrador"
                      ? "Todos los departamentos"
                      : "Solo su departamento"}
                  </td>
                  <td>
                    <button
                      onClick={() => toggle(p.id)}
                      className={`rounded-full px-3 py-1 text-[10px] font-bold ${p.active ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
                    >
                      {p.active ? "ACTIVO" : "INACTIVO"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-black">Crear usuario</h3>
              <button onClick={() => setCreating(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Nombre completo"
                className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs outline-none focus:border-purple-400/50"
              />
              <input
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="Correo corporativo"
                className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs outline-none focus:border-purple-400/50"
              />
              <select
                value={draft.department}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    department: e.target.value as Department,
                  })
                }
                className="rounded-xl border border-white/10 bg-[#111116] p-3 text-xs"
              >
                {departments.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                value={draft.role}
                onChange={(e) =>
                  setDraft({ ...draft, role: e.target.value as Role })
                }
                className="rounded-xl border border-white/10 bg-[#111116] p-3 text-xs"
              >
                {["Administrador", "Gerente", "Analista", "Operador"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
              <button
                onClick={add}
                className="mt-2 rounded-xl bg-purple-600 p-3 text-xs font-bold"
              >
                Guardar usuario
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AccessManagementDashboard({
  profiles,
  onUpdate,
  onInvite,
}: {
  profiles: Profile[];
  onUpdate: (profile: Profile) => Promise<string | null>;
  onInvite: (
    input: NewUserInput,
  ) => Promise<{ profile?: Profile; error?: string }>;
}) {
  const [rows, setRows] = useState(profiles);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  function change(id: string, patch: Partial<Profile>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
  async function save(row: Profile) {
    setSaving(row.id);
    setNotice("");
    const error = await onUpdate(row);
    setNotice(
      error
        ? `No se pudo guardar: ${error}`
        : `Acceso de ${row.name} actualizado en CC HUB.`,
    );
    setSaving(null);
  }
  async function invite(input: NewUserInput) {
    setNotice("");
    const result = await onInvite(input);
    if (result.error) {
      setNotice(`No se pudo invitar: ${result.error}`);
      return result;
    }
    if (result.profile)
      setRows((current) => [
        ...current.filter((row) => row.id !== result.profile!.id),
        result.profile!,
      ]);
    setNotice(
      `Invitación enviada a ${input.email}. La cuenta tendrá acceso a CC HUB y CC ANALYTICS.`,
    );
    setCreating(false);
    return result;
  }
  const failed = notice.startsWith("No");
  return (
    <div className="animate-in space-y-4">
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <ChartHead
            title="Usuarios y permisos"
            subtitle="Una sola cuenta de Supabase para CC HUB y CC ANALYTICS"
          />
          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-purple-400/15 bg-purple-500/[.06] px-3 py-2 text-[10px] font-bold text-purple-300">
              IDENTIDAD COMPARTIDA
            </span>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold shadow-[0_0_24px_rgba(168,85,247,.2)]"
            >
              <Plus size={15} /> Invitar usuario
            </button>
          </div>
        </div>
        {notice && (
          <p
            className={`mt-3 rounded-xl border p-3 text-xs ${failed ? "border-rose-500/20 bg-rose-500/[.06] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300"}`}
          >
            {notice}
          </p>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1480px] text-left text-xs">
            <thead className="border-b border-white/[.06] bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-5 py-3">Usuario</th>
                <th>Cargo / perfil</th>
                <th>Departamento</th>
                <th>Zona</th>
                <th>Rol</th>
                <th>Reporta a</th>
                <th>Alcance</th>
                <th>Estado</th>
                <th className="pr-5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/[.05]">
                  <td className="px-5 py-3">
                    <p className="font-bold text-zinc-200">{row.name}</p>
                    <p className="mt-1 text-[10px] text-zinc-600">
                      {row.email}
                    </p>
                  </td>
                  <td>
                    <select
                      value={row.jobProfile}
                      disabled={row.role === "Administrador"}
                      onChange={(e) => {
                        const jobProfile = e.target.value;
                        const available = departmentsForJobProfile(jobProfile);
                        change(row.id, {
                          jobProfile,
                          managerId: null,
                          department: available.includes(row.department)
                            ? row.department
                            : available[0],
                        });
                      }}
                      className="max-w-44 rounded-lg border border-white/[.08] bg-[#111116] px-2 py-2 text-xs disabled:opacity-60"
                    >
                      {jobProfilesWithCurrent(row.jobProfile).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.department}
                      disabled={row.role === "Administrador"}
                      onChange={(e) =>
                        change(row.id, {
                          department: e.target.value as Department,
                          managerId: null,
                        })
                      }
                      className="rounded-lg border border-white/[.08] bg-[#111116] px-2 py-2 text-xs text-purple-300 disabled:opacity-60"
                    >
                      {departmentsForJobProfile(row.jobProfile).map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.zone}
                      disabled={row.role === "Administrador"}
                      onChange={(e) =>
                        change(row.id, {
                          zone: e.target.value,
                          managerId: null,
                        })
                      }
                      className="rounded-lg border border-white/[.08] bg-[#111116] px-2 py-2 text-xs text-purple-300 disabled:opacity-60"
                    >
                      {zonesWithCurrent(row.zone).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.role}
                      onChange={(e) =>
                        change(row.id, {
                          role: e.target.value as Role,
                          managerId: null,
                          department:
                            e.target.value === "Administrador"
                              ? "Administración"
                              : row.department,
                          jobProfile:
                            e.target.value === "Administrador"
                              ? "Administrador"
                              : defaultJobProfile(e.target.value as Role),
                          zone:
                            e.target.value === "Administrador"
                              ? "Nacional"
                              : row.zone === "Nacional"
                                ? "Zona Norte"
                                : row.zone,
                        })
                      }
                      className="rounded-lg border border-white/[.08] bg-[#111116] px-2 py-2 text-xs"
                    >
                      {roles.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td>
                    {managerCandidates(
                      rows,
                      row.role,
                      row.department,
                      row.zone,
                      row.id,
                    ).length ? (
                      <select
                        value={row.managerId || ""}
                        onChange={(e) =>
                          change(row.id, { managerId: e.target.value || null })
                        }
                        className="max-w-48 rounded-lg border border-white/[.08] bg-[#111116] px-2 py-2 text-xs text-cyan-300"
                      >
                        <option value="">Sin asignar</option>
                        {managerCandidates(
                          rows,
                          row.role,
                          row.department,
                          row.zone,
                          row.id,
                        ).map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-zinc-600">
                        {row.role === "Administrador" ||
                        row.role === "Líder de departamento"
                          ? "Nivel superior"
                          : "Sin superior disponible"}
                      </span>
                    )}
                  </td>
                  <td className="text-zinc-500">
                    {row.role === "Administrador"
                      ? "Todos los departamentos y zonas"
                      : row.role === "Líder de departamento"
                        ? `${row.department} · supervisores y equipos`
                        : row.role === "Supervisor"
                          ? `${row.zone} · propia + vendedores asignados`
                          : `${row.department} · ${row.zone}`}
                  </td>
                  <td>
                    <button
                      onClick={() => change(row.id, { active: !row.active })}
                      className={`rounded-full px-3 py-1 text-[10px] font-bold ${row.active ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
                    >
                      {row.active ? "ACTIVO" : "INACTIVO"}
                    </button>
                  </td>
                  <td className="pr-5 text-right">
                    <button
                      disabled={saving === row.id}
                      onClick={() => void save(row)}
                      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-[10px] font-bold disabled:opacity-50"
                    >
                      <Check size={13} />
                      {saving === row.id ? "GUARDANDO" : "GUARDAR"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {creating && (
        <InviteUserModal
          profiles={rows}
          onClose={() => setCreating(false)}
          onSubmit={invite}
        />
      )}
    </div>
  );
}

function InviteUserModal({
  profiles,
  onClose,
  onSubmit,
}: {
  profiles: Profile[];
  onClose: () => void;
  onSubmit: (
    input: NewUserInput,
  ) => Promise<{ profile?: Profile; error?: string }>;
}) {
  const [draft, setDraft] = useState<NewUserInput>({
    name: "",
    email: "",
    password: "",
    department: "Ventas Digitales",
    jobProfile: "Community Manager",
    zone: "Zona Norte",
    role: "Analista",
    managerId: null,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    const result = await onSubmit(draft);
    if (result.error) {
      setError(result.error);
      setSending(false);
    }
  }
  function role(value: Role) {
    setDraft((current) => ({
      ...current,
      role: value,
      managerId: null,
      department:
        value === "Administrador"
          ? "Administración"
          : current.department === "Administración"
            ? "Ventas Digitales"
            : current.department,
      jobProfile:
        value === "Administrador"
          ? "Administrador"
          : value === "Líder de departamento" ||
              value === "Supervisor" ||
              value === "Operador"
            ? defaultJobProfile(value)
          : current.jobProfile === "Administrador"
            ? "Analista"
            : current.jobProfile,
      zone:
        value === "Administrador"
          ? "Nacional"
          : current.zone === "Nacional"
            ? "Zona Norte"
            : current.zone,
    }));
  }
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-2xl p-6">
        <form onSubmit={submit} onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">
                Alta compartida
              </p>
              <h3 className="mt-1 text-xl font-black">Invitar nuevo usuario</h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Se creará una sola cuenta con acceso a CC HUB y CC ANALYTICS.
                Supabase enviará la verificación al correo.
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="rounded-xl border border-white/[.08] p-2 text-zinc-500"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Nombre completo
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white outline-none focus:border-purple-400/50"
                placeholder="Nombre y apellido"
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Correo
              <input
                required
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white outline-none focus:border-purple-400/50"
                placeholder="usuario@cablecolor.hn"
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Contraseña temporal
              <input
                required
                minLength={8}
                type="password"
                value={draft.password}
                onChange={(e) =>
                  setDraft({ ...draft, password: e.target.value })
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white outline-none focus:border-purple-400/50"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Rol
              <select
                value={draft.role}
                onChange={(e) => role(e.target.value as Role)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white"
              >
                {roles.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Cargo / perfil
              <select
                disabled={draft.role === "Administrador"}
                value={draft.jobProfile}
                onChange={(e) => {
                  const jobProfile = e.target.value;
                  const available = departmentsForJobProfile(jobProfile);
                  setDraft({
                    ...draft,
                    jobProfile,
                    managerId: null,
                    department: available.includes(draft.department)
                      ? draft.department
                      : available[0],
                  });
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white disabled:opacity-60"
              >
                {jobProfiles.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Departamento
              <select
                disabled={draft.role === "Administrador"}
                value={draft.department}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    department: e.target.value as Department,
                    managerId: null,
                  })
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white disabled:opacity-60"
              >
                {departmentsForJobProfile(draft.jobProfile).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Zona
              <select
                disabled={draft.role === "Administrador"}
                value={draft.zone}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    zone: e.target.value,
                    managerId: null,
                  })
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white disabled:opacity-60"
              >
                {zones.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {draft.role !== "Administrador" &&
              draft.role !== "Líder de departamento" && (
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 sm:col-span-2">
                  Reporta a
                  <select
                    value={draft.managerId || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        managerId: e.target.value || null,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white"
                  >
                    <option value="">Sin asignar todavía</option>
                    {managerCandidates(
                      profiles,
                      draft.role,
                      draft.department,
                      draft.zone,
                    ).map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name} · {manager.role} · {manager.zone}
                      </option>
                    ))}
                  </select>
                </label>
              )}
          </div>
          <div className="mt-5 rounded-xl border border-purple-400/15 bg-purple-500/[.05] p-3 text-[10px] leading-5 text-zinc-400">
            <b className="text-purple-300">Acceso automático:</b> el líder ve
            sus supervisores y equipos; el supervisor ve su venta propia más
            la de sus vendedores; los demás quedan limitados a su asignación.
          </div>
          {error && (
            <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400"
            >
              Cancelar
            </button>
            <button
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black disabled:opacity-50"
            >
              <Plus size={15} />
              {sending ? "Creando cuenta..." : "Crear y enviar invitación"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function AlertsDashboard() {
  const [read, setRead] = useState(false);
  const alerts = [
    "12 instalaciones superan el SLA",
    "Meta de ventas al 91.3%",
    "Nueva carga de Marketing pendiente de revisión",
    "Inventario de routers al 18%",
    "7 tickets críticos sin asignar",
  ];
  return (
    <div className="animate-in">
      <Card className="p-6">
        <ChartHead
          title="Centro de alertas"
          subtitle="Eventos relevantes según los permisos del usuario"
        >
          <button
            onClick={() => setRead(true)}
            className="text-[11px] font-bold text-purple-300"
          >
            Marcar todas como leídas
          </button>
        </ChartHead>
        <div className="space-y-3">
          {alerts.map((x, i) => (
            <div
              key={x}
              className={`flex items-center gap-4 rounded-xl border p-4 ${read ? "border-white/[.04] bg-white/[.01] opacity-60" : "border-white/[.07] bg-white/[.025]"}`}
            >
              <div
                className={`grid h-9 w-9 place-items-center rounded-xl ${i < 2 ? "bg-amber-500/10 text-amber-400" : "bg-purple-500/10 text-purple-400"}`}
              >
                <AlertTriangle size={17} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-zinc-200">{x}</p>
                <p className="mt-1 text-[10px] text-zinc-600">
                  Actualizado hace {i * 6 + 2} minutos
                </p>
              </div>
              {!read && <span className="h-2 w-2 rounded-full bg-purple-400" />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ProfilePanel({
  profile,
  profiles,
  onSelect,
  onClose,
}: {
  profile: Profile;
  profiles: Profile[];
  onSelect: (p: Profile) => void;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const admin = profiles.find((p) => p.role === "Administrador");
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/[.08] bg-[#0d0d12] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">
              Mi cuenta
            </p>
            <h2 className="mt-1 text-xl font-black">Perfil y acceso</h2>
          </div>
          <button
            aria-label="Cerrar perfil"
            onClick={onClose}
            className="rounded-xl border border-white/[.07] p-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-7 flex items-center gap-4 rounded-2xl border border-purple-400/15 bg-purple-500/[.05] p-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-lg font-black">
            {profile.initials}
          </div>
          <div>
            <p className="font-black">{profile.name}</p>
            <p className="mt-1 text-xs text-zinc-500">{profile.email}</p>
            <span className="mt-2 inline-block rounded-full bg-purple-500/10 px-2.5 py-1 text-[9px] font-bold text-purple-300">
              {profile.role}
            </span>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Cargo / perfil
            <input
              value={profile.jobProfile}
              disabled
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-400"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Departamento asignado
            <input
              value={profile.department}
              disabled
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-300"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Zona asignada
            <input
              value={profile.zone}
              disabled
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-400"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Correo corporativo
            <input
              value={profile.email}
              readOnly
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-300"
            />
          </label>
          <button
            onClick={() => setSaved(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-bold"
          >
            <Check size={15} /> Guardar perfil
          </button>
          {profile.role !== "Administrador" && admin && (
            <button
              onClick={() => onSelect(admin)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/20 bg-purple-500/[.06] p-3 text-xs font-bold text-purple-300"
            >
              <ShieldCheck size={15} /> Volver a vista administrador
            </button>
          )}
          {saved && (
            <p className="text-center text-xs font-semibold text-emerald-400">
              Perfil actualizado correctamente.
            </p>
          )}
        </div>
        {profile.role === "Administrador" && (
          <div className="mt-8 border-t border-white/[.07] pt-6">
            <p className="text-xs font-bold">Probar permisos por perfil</p>
            <p className="mt-1 text-[10px] text-zinc-600">
              Vista demostrativa para validar lo que verá cada departamento.
            </p>
            <div className="mt-3 space-y-2">
              {profiles
                .filter((p) => p.active)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${p.id === profile.id ? "border-purple-400/30 bg-purple-500/10" : "border-white/[.05] bg-white/[.02]"}`}
                  >
                    <div>
                      <p className="text-xs font-bold text-zinc-200">
                        {p.name}
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {p.department}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-zinc-600" />
                  </button>
                ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function AccountPanel({
  profile,
  onClose,
  onSave,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onSave(name.trim());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo actualizar el perfil.",
      );
      setSaving(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/[.08] bg-[#0d0d12] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">
              Mi cuenta
            </p>
            <h2 className="mt-1 text-xl font-black">Perfil y acceso</h2>
          </div>
          <button
            aria-label="Cerrar perfil"
            onClick={onClose}
            className="rounded-xl border border-white/[.07] p-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-7 flex items-center gap-4 rounded-2xl border border-purple-400/15 bg-purple-500/[.05] p-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-lg font-black">
            {profile.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate font-black">{profile.name}</p>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {profile.email}
            </p>
            <span className="mt-2 inline-block rounded-full bg-purple-500/10 px-2.5 py-1 text-[9px] font-bold text-purple-300">
              {profile.role}
            </span>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Nombre completo
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-200 outline-none focus:border-purple-400/50"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Cargo / perfil
            <input
              value={profile.jobProfile}
              disabled
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-400"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Departamento asignado
            <input
              value={profile.department}
              disabled
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-400"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Zona asignada
            <input
              value={profile.zone}
              disabled
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-400"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Correo corporativo
            <input
              value={profile.email}
              readOnly
              className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-400"
            />
          </label>
          <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-3 text-[10px] leading-5 text-zinc-500">
            El cargo, departamento, zona, rol y estado de acceso solo pueden ser
            modificados por un administrador.
          </div>
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <button
            disabled={saving || !name.trim()}
            onClick={() => void submit()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-bold disabled:opacity-50"
          >
            <Check size={15} />
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function FilterBar({
  filters,
  setFilters,
  profile,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  profile: Profile;
}) {
  const opts: { key: keyof Filters; values: string[] }[] = [
    { key: "month", values: ["Julio 2026", "Junio 2026", "Mayo 2026"] },
    {
      key: "region",
      values:
        profile.role === "Administrador"
          ? ["Todas las zonas", ...zones]
          : [profile.zone],
    },
    {
      key: "city",
      values: [
        "Todas las ciudades",
        "San Pedro Sula",
        "Choloma",
        "El Progreso",
        "La Lima",
      ],
    },
    {
      key: "channel",
      values: [
        "Todos los canales",
        "Digital",
        "Telemercadeo",
        "Punto de venta",
      ],
    },
  ];
  return (
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.025] px-3 text-zinc-500">
        <Filter size={14} />
        <span className="text-[10px] font-bold uppercase tracking-wider">
          Filtros
        </span>
      </div>
      {opts.map((o) => (
        <label key={o.key} className="relative shrink-0">
          <select
            value={filters[o.key]}
            disabled={o.key === "region" && profile.role !== "Administrador"}
            onChange={(e) =>
              setFilters({ ...filters, [o.key]: e.target.value })
            }
            className="appearance-none rounded-xl border border-white/[.07] bg-[#111116] py-2.5 pl-3 pr-8 text-[11px] font-semibold text-zinc-300 outline-none disabled:opacity-70"
          >
            <option disabled>{o.key}</option>
            {o.values.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-2.5 top-3 text-zinc-600"
          />
        </label>
      ))}
      <span className="flex shrink-0 items-center gap-2 rounded-xl border border-purple-400/10 bg-purple-500/[.05] px-3 text-[10px] font-bold text-purple-300">
        <LockKeyhole size={12} />
        {profile.role === "Administrador"
          ? "Vista global"
          : `${profile.department} · ${profile.zone}`}
      </span>
    </div>
  );
}

export function AnalyticsApp({
  initialProfile,
  initialProfiles: loadedProfiles,
  onSignOut,
  onUpdateAccess,
  onInviteUser,
  onUpdateProfile,
  onImportData,
}: {
  initialProfile: Profile;
  initialProfiles: Profile[];
  onSignOut: () => void;
  onUpdateAccess: (profile: Profile) => Promise<string | null>;
  onInviteUser: (
    input: NewUserInput,
  ) => Promise<{ profile?: Profile; error?: string }>;
  onUpdateProfile: (name: string) => Promise<Profile>;
  onImportData: (upload: Upload, rows: ImportedRow[]) => Promise<string | null>;
}) {
  const [profiles, setProfiles] = useState<Profile[]>(
    loadedProfiles.length ? loadedProfiles : [initialProfile],
  );
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [active, setActive] = useState("Dashboard ejecutivo");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [filters, setFilters] = useState<Filters>({
    month: "Julio 2026",
    region:
      initialProfile.role === "Administrador"
        ? "Todas las zonas"
        : initialProfile.zone,
    city: "Todas las ciudades",
    channel: "Todos los canales",
  });
  const allowed = useMemo(
    () =>
      moduleInfo.filter(
        (m) =>
          m.departments.includes(profile.department as never) &&
          m.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [profile, search],
  );
  function go(name: string) {
    setActive(name);
    setMobile(false);
  }
  function content() {
    if (active === "Dashboard ejecutivo") return <ExecutiveDashboard go={go} />;
    if (active === "Dashboard de mi área")
      return (
        <AreaDashboard
          name={profile.department}
          department={profile.department}
        />
      );
    if (
      active === "Ventas digitales" ||
      active === "Ventas residenciales" ||
      active === "Ventas residenciales rurales" ||
      active === "Ventas corporativas"
    )
      return (
        <SalesOrganizationDashboard profile={profile} profiles={profiles} />
      );
    if (active === "Marketing digital") return <MarketingDashboard />;
    if (active === "ROA y ROAS") return <RoasDashboard />;
    if (active === "Recursos humanos") return <HrDashboard />;
    if (active === "Finanzas") return <FinanceDashboard />;
    if (active === "Operaciones") return <OperationsDashboard />;
    if (active === "Reportes")
      return <ReportStudio profile={profile} profiles={profiles} />;
    if (active === "Importar datos")
      return (
        <PersistentImportDashboard
          profile={profile}
          uploads={uploads.filter(
            (u) =>
              profile.role === "Administrador" ||
              (u.department === profile.department && u.zone === profile.zone),
          )}
          onUpload={async (upload, rows) => {
            const error = await onImportData(upload, rows);
            if (!error) setUploads((current) => [upload, ...current]);
            return error;
          }}
        />
      );
    if (active === "Usuarios y permisos" && profile.role === "Administrador")
      return (
        <AccessManagementDashboard
          profiles={profiles}
          onUpdate={async (updated) => {
            const error = await onUpdateAccess(updated);
            if (!error)
              setProfiles((current) =>
                current.map((row) => (row.id === updated.id ? updated : row)),
              );
            return error;
          }}
          onInvite={async (input) => {
            const result = await onInviteUser(input);
            if (result.profile)
              setProfiles((current) => [
                ...current.filter((row) => row.id !== result.profile!.id),
                result.profile!,
              ]);
            return result;
          }}
        />
      );
    if (active === "Centro de alertas") return <AlertsDashboard />;
    return <AreaDashboard name={active} department={profile.department} />;
  }
  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[.06] bg-[#09090d]/95 backdrop-blur-xl transition-all duration-300 ${collapsed ? "w-[76px]" : "w-[250px]"} ${mobile ? "translate-x-0" : "max-lg:-translate-x-full"}`}
      >
        <div className="flex h-[74px] items-center justify-between border-b border-white/[.06] px-4">
          <Logo compact={collapsed} />
          {!collapsed && (
            <button
              aria-label="Contraer menú"
              onClick={() => setCollapsed(true)}
              className="rounded-lg p-2 text-zinc-600 hover:bg-white/5"
            >
              <PanelLeftClose size={17} />
            </button>
          )}
          {collapsed && (
            <button
              aria-label="Expandir menú"
              onClick={() => setCollapsed(false)}
              className="absolute -right-3 top-24 rounded-full border border-white/10 bg-zinc-900 p-1"
            >
              <ChevronRight size={12} />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="px-3 pt-4">
            <div className="flex items-center gap-2 rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-2.5">
              <Search size={14} className="text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar módulo..."
                className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-700"
              />
            </div>
          </div>
        )}
        <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-5">
          <p
            className={`px-3 py-2 text-[9px] font-bold uppercase tracking-[.2em] text-zinc-700 ${collapsed ? "hidden" : ""}`}
          >
            {profile.role === "Administrador"
              ? "Plataforma global"
              : profile.department}
          </p>
          {allowed.map((m) => {
            const Icon = m.icon;
            const on = active === m.name;
            return (
              <button
                title={m.name}
                key={m.name}
                onClick={() => go(m.name)}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-gradient-to-r from-purple-600/20 to-purple-500/[.04] text-purple-200 shadow-[inset_2px_0_0_#a855f7]" : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-300"}`}
              >
                <Icon size={17} />
                <span
                  className={`truncate text-[11px] font-semibold ${collapsed ? "hidden" : ""}`}
                >
                  {m.name}
                </span>
                {on && !collapsed && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-purple-400" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/[.06] p-3">
          <button
            onClick={() => setProfileOpen(true)}
            title="Abrir mi perfil"
            className={`flex w-full items-center gap-3 rounded-xl bg-white/[.025] p-2 text-left transition hover:bg-purple-500/10 ${collapsed ? "justify-center" : ""}`}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-xs font-black">
              {profile.initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-zinc-200">
                  {profile.name}
                </p>
                <p className="truncate text-[9px] uppercase tracking-wider text-purple-400">
                  {profile.jobProfile} · {profile.zone}
                </p>
              </div>
            )}
          </button>
        </div>
      </aside>
      <div
        className={`transition-all duration-300 ${collapsed ? "lg:ml-[76px]" : "lg:ml-[250px]"}`}
      >
        <header className="sticky top-0 z-30 flex h-[74px] items-center justify-between border-b border-white/[.06] bg-[#08080b]/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              aria-label="Abrir menú"
              onClick={() => setMobile(!mobile)}
              className="rounded-xl border border-white/[.07] p-2.5 text-zinc-400 lg:hidden"
            >
              {mobile ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-purple-400/70">
                Cable Color · {profile.department} · {profile.zone}
              </p>
              <h1 className="mt-1 text-base font-black text-white sm:text-lg">
                {active}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[.04] px-3 py-2 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400">
                ACCESO AUTORIZADO
              </span>
            </div>
            <button
              aria-label="Abrir alertas"
              onClick={() => go("Centro de alertas")}
              className="relative rounded-xl border border-white/[.07] bg-white/[.025] p-2.5 text-zinc-400 hover:text-purple-300"
            >
              <Bell size={17} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400" />
            </button>
            <button
              aria-label="Cerrar sesión"
              onClick={onSignOut}
              className="rounded-xl border border-white/[.07] bg-white/[.025] p-2.5 text-zinc-400 hover:text-rose-300"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1700px] p-4 sm:p-6">
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            profile={profile}
          />
          {content()}
          <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-white/[.05] py-5 text-[10px] text-zinc-700 sm:flex-row">
            <span>CC ANALYTICS · Cable Color Honduras</span>
            <span>
              Perfil activo: {profile.name} · {profile.jobProfile} · {profile.department} · {profile.zone}
            </span>
          </footer>
        </main>
      </div>
      {mobile && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}{" "}
      {profileOpen && (
        <AccountPanel
          profile={profile}
          onClose={() => setProfileOpen(false)}
          onSave={async (name) => {
            const updated = await onUpdateProfile(name);
            setProfile(updated);
            setProfiles((current) =>
              current.map((row) => (row.id === updated.id ? updated : row)),
            );
            setProfileOpen(false);
          }}
        />
      )}
    </div>
  );
}
