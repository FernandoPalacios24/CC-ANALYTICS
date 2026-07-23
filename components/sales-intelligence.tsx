"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Download,
  FileText,
  Loader2,
  MapPin,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Department, Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

type MonthKey =
  | "2026-01"
  | "2026-02"
  | "2026-03"
  | "2026-04"
  | "2026-05"
  | "2026-06"
  | "2026-07";
type Seller = {
  name: string;
  probation: boolean;
  values: Record<MonthKey, number>;
};
type Team = {
  id: string;
  supervisor: string;
  goal: number;
  own: Record<MonthKey, number>;
  total: Record<MonthKey, number>;
  sellers: Seller[];
};
type ReportPageKey = "projection" | "performance" | "market";
type SalesRecord = {
  seller_profile_id: string | null;
  seller_name: string;
  team: string | null;
  sale_date: string;
  city: string | null;
  contract_service: string | null;
};

const months: { key: MonthKey; label: string }[] = [
  { key: "2026-01", label: "Enero 2026" },
  { key: "2026-02", label: "Febrero 2026" },
  { key: "2026-03", label: "Marzo 2026" },
  { key: "2026-04", label: "Abril 2026" },
  { key: "2026-05", label: "Mayo 2026" },
  { key: "2026-06", label: "Junio 2026" },
  { key: "2026-07", label: "Julio 2026" },
];

const values = (...items: number[]): Record<MonthKey, number> => ({
  "2026-01": items[0],
  "2026-02": items[1],
  "2026-03": items[2],
  "2026-04": items[3],
  "2026-05": items[4],
  "2026-06": items[5],
  "2026-07": items[6],
});

const teams: Team[] = [
  {
    id: "pedro",
    supervisor: "Pedro",
    goal: 151,
    own: values(3, 4, 5, 4, 5, 6, 4),
    total: values(50, 55, 66, 58, 70, 74, 42),
    sellers: [
      {
        name: "Víctor Josué Cárcamo",
        probation: false,
        values: values(11, 12, 13, 14, 16, 18, 15),
      },
      {
        name: "Claudia Julissa Ochoa",
        probation: false,
        values: values(8, 9, 10, 11, 12, 14, 12),
      },
      {
        name: "Cintia Lariza Romero",
        probation: true,
        values: values(6, 7, 8, 9, 10, 11, 7),
      },
      {
        name: "Ana Isidora Erazo",
        probation: true,
        values: values(5, 6, 6, 7, 8, 9, 4),
      },
    ],
  },
  {
    id: "pamela",
    supervisor: "Pamela",
    goal: 81,
    own: values(2, 2, 3, 2, 3, 4, 3),
    total: values(22, 25, 31, 29, 35, 32, 26),
    sellers: [
      {
        name: "Kenia Soraya Fúnez",
        probation: false,
        values: values(4, 5, 6, 7, 8, 8, 7),
      },
      {
        name: "Keysi Kristhina Martínez",
        probation: true,
        values: values(3, 4, 5, 5, 6, 6, 6),
      },
      {
        name: "Stefany Alejandra Peraza",
        probation: true,
        values: values(3, 3, 4, 4, 5, 5, 4),
      },
      {
        name: "Estephany Abigail Oliva",
        probation: true,
        values: values(2, 2, 3, 3, 4, 4, 3),
      },
      {
        name: "Edin Gabriel Villanueva",
        probation: true,
        values: values(2, 3, 3, 3, 4, 5, 3),
      },
    ],
  },
  {
    id: "norlin",
    supervisor: "Norlin",
    goal: 30,
    own: values(0, 1, 1, 1, 2, 0, 2),
    total: values(0, 5, 8, 12, 16, 0, 19),
    sellers: [
      {
        name: "Herika Xiomara Chávez",
        probation: false,
        values: values(0, 1, 2, 3, 4, 0, 4),
      },
      {
        name: "Mariela Alejandra Espinoza",
        probation: false,
        values: values(0, 1, 1, 2, 3, 0, 3),
      },
      {
        name: "Yeslin Alejandra Escoto",
        probation: true,
        values: values(0, 1, 1, 2, 2, 0, 3),
      },
      {
        name: "Elsa Patricia Mejía",
        probation: true,
        values: values(0, 0, 1, 1, 2, 0, 2),
      },
      {
        name: "Maydelin Nicoll Rivera",
        probation: true,
        values: values(0, 1, 1, 1, 2, 0, 2),
      },
      {
        name: "Anahy Johany Rivera",
        probation: true,
        values: values(0, 0, 1, 1, 1, 0, 2),
      },
      {
        name: "Álvaro Alexander Pineda",
        probation: false,
        values: values(0, 0, 1, 1, 2, 0, 1),
      },
    ],
  },
  {
    id: "alejandra",
    supervisor: "Alejandra",
    goal: 44,
    own: values(1, 1, 1, 1, 1, 2, 1),
    total: values(12, 15, 18, 13, 16, 14, 11),
    sellers: [
      {
        name: "Yajaira Nataly Ortiz",
        probation: false,
        values: values(2, 3, 3, 2, 3, 3, 2),
      },
      {
        name: "Angie Isamar Márquez",
        probation: false,
        values: values(2, 2, 3, 2, 3, 2, 1),
      },
      {
        name: "Kevin Alexander Urbina",
        probation: true,
        values: values(1, 2, 2, 2, 2, 2, 2),
      },
      {
        name: "Laury Rashell Varela",
        probation: true,
        values: values(1, 2, 2, 2, 2, 2, 2),
      },
      {
        name: "Sandra Nicole Cornejo",
        probation: true,
        values: values(1, 1, 2, 1, 2, 2, 2),
      },
      {
        name: "Kevin Alejandro Álvarez",
        probation: true,
        values: values(1, 1, 1, 1, 1, 1, 1),
      },
    ],
  },
  {
    id: "andrea",
    supervisor: "Andrea",
    goal: 44,
    own: values(0, 1, 1, 0, 1, 0, 1),
    total: values(2, 3, 4, 2, 5, 1, 3),
    sellers: [
      {
        name: "Doris Michelle Macedo",
        probation: true,
        values: values(1, 1, 1, 1, 2, 1, 1),
      },
      {
        name: "Ashley Steisy Villeda",
        probation: true,
        values: values(1, 1, 2, 1, 2, 0, 1),
      },
    ],
  },
];

const monthCityData: Record<MonthKey, { name: string; value: number }[]> = {
  "2026-01": [
    { name: "San Pedro Sula", value: 58 },
    { name: "Choloma", value: 12 },
    { name: "Villa Nueva", value: 8 },
    { name: "El Progreso", value: 5 },
    { name: "La Lima", value: 3 },
  ],
  "2026-02": [
    { name: "San Pedro Sula", value: 61 },
    { name: "Choloma", value: 14 },
    { name: "Villa Nueva", value: 8 },
    { name: "El Progreso", value: 7 },
    { name: "La Lima", value: 4 },
  ],
  "2026-03": [
    { name: "San Pedro Sula", value: 69 },
    { name: "Choloma", value: 17 },
    { name: "Villa Nueva", value: 11 },
    { name: "El Progreso", value: 8 },
    { name: "La Lima", value: 5 },
  ],
  "2026-04": [
    { name: "San Pedro Sula", value: 64 },
    { name: "Choloma", value: 15 },
    { name: "Villa Nueva", value: 8 },
    { name: "El Progreso", value: 6 },
    { name: "La Lima", value: 4 },
  ],
  "2026-05": [
    { name: "San Pedro Sula", value: 70 },
    { name: "Choloma", value: 17 },
    { name: "Villa Nueva", value: 10 },
    { name: "El Progreso", value: 8 },
    { name: "La Lima", value: 5 },
  ],
  "2026-06": [
    { name: "San Pedro Sula", value: 66 },
    { name: "Choloma", value: 17 },
    { name: "Villa Nueva", value: 10 },
    { name: "El Progreso", value: 7 },
    { name: "La Lima", value: 4 },
    { name: "Chamelecón", value: 5 },
    { name: "Puerto Cortés", value: 1 },
  ],
  "2026-07": [
    { name: "San Pedro Sula", value: 67 },
    { name: "Choloma", value: 20 },
    { name: "Villa Nueva", value: 4 },
    { name: "El Progreso", value: 4 },
    { name: "La Lima", value: 3 },
    { name: "Chamelecón", value: 2 },
    { name: "Omoa", value: 1 },
  ],
};

const packageData = [
  { name: "3PLAY FIBER OTT CCVEO 150MB L650", value: 42 },
  { name: "3PLAY FIBER HOME PVR 150MB L650", value: 14 },
  { name: "3PLAY FIBER OTT CCVEO 200MB L750", value: 13 },
  { name: "3PLAY OTT CCVEO 150MB L650", value: 9 },
  { name: "2PLAY FIBER HOME 150MB L625", value: 6 },
  { name: "2PLAY FIBER HOME 100MB L550", value: 6 },
  { name: "INTERNET FIBER HOME 150MB L625", value: 5 },
  { name: "3PLAY FIBER OTT CCVEO 800MB L1100", value: 4 },
  { name: "Otros paquetes", value: 2 },
];

const colors = [
  "#c026d3",
  "#7c3aed",
  "#2563eb",
  "#f59e0b",
  "#16a34a",
  "#06b6d4",
  "#db2777",
];
const tooltipStyle = {
  contentStyle: {
    background: "#111119",
    border: "1px solid #6b21a8",
    borderRadius: 10,
    fontSize: 11,
  },
};

function monthLabel(key: MonthKey) {
  const configured = months.find((month) => month.key === key)?.label;
  if (configured) return configured;
  const [year, month] = key.split("-").map(Number);
  return year && month
    ? new Intl.DateTimeFormat("es-HN", { month: "long", year: "numeric" })
        .format(new Date(year, month - 1, 1))
        .replace(/^./, (letter) => letter.toUpperCase())
    : key;
}

function totalFor(teamList: Team[], month: MonthKey) {
  return teamList.reduce((sum, team) => sum + team.total[month], 0);
}

function teamForSupervisor(
  supervisor: Profile,
  profiles: Profile[],
  index = 0,
) {
  const base =
    teams.find((team) =>
      supervisor.name.toLowerCase().includes(team.supervisor.toLowerCase()),
    ) ?? teams[index % teams.length];
  const assigned = profiles.filter(
    (profile) => profile.managerId === supervisor.id,
  );
  const sellersForProfile = assigned.length
    ? assigned.map((profile, sellerIndex) => {
        const known = teams
          .flatMap((team) => team.sellers)
          .find(
            (seller) =>
              normalizeName(seller.name) === normalizeName(profile.name),
          );
        return {
          ...(known ?? base.sellers[sellerIndex % base.sellers.length]),
          name: profile.name,
        };
      })
    : base.sellers;
  return {
    ...base,
    id: supervisor.id,
    supervisor: supervisor.name,
    sellers: sellersForProfile,
  };
}

function accessibleTeamsFor(profile: Profile, profiles: Profile[]) {
  if (profile.role === "Administrador") {
    const supervisors = profiles.filter(
      (candidate) => candidate.role === "Supervisor",
    );
    return supervisors.length
      ? supervisors.map((supervisor, index) =>
          teamForSupervisor(supervisor, profiles, index),
        )
      : teams;
  }
  if (profile.role === "Líder de departamento") {
    const supervisors = profiles.filter(
      (candidate) =>
        candidate.managerId === profile.id && candidate.role === "Supervisor",
    );
    return supervisors.length
      ? supervisors.map((supervisor, index) =>
          teamForSupervisor(supervisor, profiles, index),
        )
      : teams;
  }
  if (profile.role === "Supervisor")
    return [teamForSupervisor(profile, profiles)];
  const manager = profiles.find(
    (candidate) => candidate.id === profile.managerId,
  );
  const base = manager
    ? teamForSupervisor(manager, profiles)
    : teamForSupervisor(profile, profiles);
  const known = base.sellers.find(
    (seller) => normalizeName(seller.name) === normalizeName(profile.name),
  );
  const seller = { ...(known ?? base.sellers[0]), name: profile.name };
  return [
    {
      ...base,
      own: values(0, 0, 0, 0, 0, 0, 0),
      total: seller.values,
      sellers: [seller],
    },
  ];
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function useSalesRecords() {
  const [records, setRecords] = useState<SalesRecord[]>([]);
  useEffect(() => {
    let active = true;
    void supabase
      .from("analytics_sales")
      .select(
        "seller_profile_id,seller_name,team,sale_date,city,contract_service",
      )
      .order("sale_date", { ascending: true })
      .limit(10000)
      .then(({ data }) => {
        if (active && data) setRecords(data as SalesRecord[]);
      });
    return () => {
      active = false;
    };
  }, []);
  return records;
}

function hydrateTeams(teamList: Team[], records: SalesRecord[]) {
  if (!records.length) return teamList;
  const monthKeys = Array.from(
    new Set([
      ...months.map((month) => month.key),
      ...records.map((row) => row.sale_date.slice(0, 7)),
    ]),
  );
  return teamList.map((team) => {
    const ownRows = records.filter(
      (row) =>
        normalizeName(row.seller_name) === normalizeName(team.supervisor),
    );
    const sellersForTeam = team.sellers.map((seller) => {
      const sellerRows = records.filter(
        (row) => normalizeName(row.seller_name) === normalizeName(seller.name),
      );
      return {
        ...seller,
        values: Object.fromEntries(
          monthKeys.map((month) => [
            month,
            sellerRows.filter((row) => row.sale_date.startsWith(month)).length,
          ]),
        ),
      };
    });
    const own = Object.fromEntries(
      monthKeys.map((month) => [
        month,
        ownRows.filter((row) => row.sale_date.startsWith(month)).length,
      ]),
    );
    const total = Object.fromEntries(
      monthKeys.map((month) => [
        month,
        own[month] +
          sellersForTeam.reduce(
            (sum, seller) => sum + (seller.values[month] || 0),
            0,
          ),
      ]),
    );
    return { ...team, own, total, sellers: sellersForTeam };
  });
}

function performanceColor(value: number) {
  if (value >= 15) return { name: "Verde", color: "#22c55e" };
  if (value >= 11) return { name: "Amarillo", color: "#eab308" };
  if (value >= 7) return { name: "Naranja", color: "#f97316" };
  return { name: "Rojo", color: "#ef4444" };
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-purple-400/15 bg-[#0d0d14] ${className}`}
    >
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  accent = "text-white",
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-purple-400/20 bg-black/25 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[.14em] text-zinc-500">
          {label}
        </p>
        <Icon size={16} className="text-purple-400" />
      </div>
      <p className={`mt-2 text-2xl font-black ${accent}`}>{value}</p>
    </div>
  );
}

export function SalesOrganizationDashboard({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const records = useSalesRecords();
  const accessibleTeams = hydrateTeams(
    accessibleTeamsFor(profile, profiles),
    records,
  );
  const forcedTeam =
    profile.role === "Supervisor" ||
    profile.role === "Analista" ||
    profile.role === "Operador";
  const [selected, setSelected] = useState(
    forcedTeam ? accessibleTeams[0].id : "all",
  );
  const visibleTeams =
    selected === "all"
      ? accessibleTeams
      : accessibleTeams.filter((team) => team.id === selected);
  const current = totalFor(visibleTeams, "2026-07");
  const previous = totalFor(visibleTeams, "2026-06");
  const goal = visibleTeams.reduce((sum, team) => sum + team.goal, 0);
  const projection = Math.round((current / 13) * 26);
  const assignedProfiles = profiles.filter(
    (item) => item.managerId === profile.id,
  ).length;

  return (
    <div className="animate-in space-y-4">
      <Panel className="p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">
              Jerarquía comercial
            </p>
            <h2 className="mt-1 text-xl font-black">
              Rendimiento por supervisor y equipo
            </h2>
            <p className="mt-2 text-xs text-zinc-500">
              Las ventas propias del supervisor se suman automáticamente a las
              de sus vendedores asignados.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg border px-3 py-2 text-[9px] font-black ${records.length ? "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-400" : "border-amber-500/20 bg-amber-500/[.06] text-amber-400"}`}
            >
              {records.length
                ? `${records.length.toLocaleString("es-HN")} REGISTROS SUPABASE`
                : "DATOS DEMOSTRATIVOS"}
            </span>
            {!forcedTeam && (
              <select
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200"
              >
                <option value="all">Todos los supervisores</option>
                {accessibleTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.supervisor}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Venta al corte"
          value={String(current)}
          icon={BarChart3}
        />
        <Metric
          label="Mes comparado"
          value={String(previous)}
          accent={current >= previous ? "text-emerald-400" : "text-rose-400"}
          icon={current >= previous ? TrendingUp : TrendingDown}
        />
        <Metric
          label="Proyección cierre"
          value={String(projection)}
          accent="text-orange-400"
          icon={Target}
        />
        <Metric
          label="Cumplimiento"
          value={`${Math.round((projection / goal) * 100)}%`}
          accent="text-green-400"
          icon={Trophy}
        />
        <Metric
          label="Perfiles asignados"
          value={String(
            assignedProfiles ||
              visibleTeams.reduce((sum, team) => sum + team.sellers.length, 0),
          )}
          accent="text-cyan-400"
          icon={Users}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Panel className="overflow-hidden">
          <div className="border-b border-white/[.06] p-5">
            <h3 className="text-sm font-bold">Supervisores</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Vista separada y consolidada del departamento
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="bg-purple-950/25 text-[10px] uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Supervisor</th>
                  <th>Ventas propias</th>
                  <th>Vendedores</th>
                  <th>Equipo total</th>
                  <th>Vs. mes</th>
                  <th>Proyección</th>
                  <th>% meta</th>
                </tr>
              </thead>
              <tbody>
                {visibleTeams.map((team) => {
                  const diff = team.total["2026-07"] - team.total["2026-06"];
                  const projected = Math.round(
                    (team.total["2026-07"] / 13) * 26,
                  );
                  return (
                    <tr key={team.id} className="border-t border-white/[.05]">
                      <td className="px-5 py-3 font-bold text-purple-200">
                        {team.supervisor}
                      </td>
                      <td>{team.own["2026-07"]}</td>
                      <td>{team.total["2026-07"] - team.own["2026-07"]}</td>
                      <td className="font-black text-white">
                        {team.total["2026-07"]}
                      </td>
                      <td
                        className={
                          diff >= 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {diff > 0 ? "+" : ""}
                        {diff}
                      </td>
                      <td className="text-orange-400">{projected}</td>
                      <td className="text-green-400">
                        {Math.round((projected / team.goal) * 100)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="p-5">
          <h3 className="text-sm font-bold">Aporte de cada equipo</h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            Participación sobre la venta actual
          </p>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={visibleTeams.map((team) => ({
                    name: team.supervisor,
                    value: team.total["2026-07"],
                  }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={86}
                  paddingAngle={3}
                >
                  {visibleTeams.map((team, index) => (
                    <Cell key={team.id} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {visibleTeams.map((team, index) => (
              <div key={team.id} className="text-[10px] text-zinc-400">
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full"
                  style={{ background: colors[index % colors.length] }}
                />
                {team.supervisor}:{" "}
                <b className="text-white">{team.total["2026-07"]}</b>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      {visibleTeams.map((team) => (
        <Panel key={team.id} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.06] p-5">
            <div>
              <h3 className="text-sm font-bold">Equipo de {team.supervisor}</h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                Cada vendedor por separado y ventas propias del supervisor
              </p>
            </div>
            <span className="rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-bold text-purple-300">
              TOTAL {team.total["2026-07"]}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-white/[.02] text-[10px] uppercase text-zinc-600">
                <tr>
                  <th className="px-5 py-3">Integrante</th>
                  <th>Tipo</th>
                  <th>Junio</th>
                  <th>Julio</th>
                  <th>Variación</th>
                  <th>Semáforo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-purple-400/15 bg-purple-500/[.04]">
                  <td className="px-5 py-3 font-bold text-purple-200">
                    {team.supervisor}
                  </td>
                  <td>Ventas propias del supervisor</td>
                  <td>{team.own["2026-06"]}</td>
                  <td className="font-black">{team.own["2026-07"]}</td>
                  <td>{team.own["2026-07"] - team.own["2026-06"]}</td>
                  <td>
                    <span className="text-cyan-400">APORTE DIRECTO</span>
                  </td>
                  <td>Supervisor</td>
                </tr>
                {team.sellers.map((seller) => {
                  const state = performanceColor(seller.values["2026-07"]);
                  const diff =
                    seller.values["2026-07"] - seller.values["2026-06"];
                  return (
                    <tr
                      key={seller.name}
                      className="border-t border-white/[.05]"
                    >
                      <td className="px-5 py-3 font-semibold text-zinc-200">
                        {seller.name}
                      </td>
                      <td>Vendedor</td>
                      <td>{seller.values["2026-06"]}</td>
                      <td className="font-black">{seller.values["2026-07"]}</td>
                      <td
                        className={
                          diff >= 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {diff > 0 ? "+" : ""}
                        {diff}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: state.color }}
                          />
                          {state.name}
                        </span>
                      </td>
                      <td
                        className={
                          seller.probation ? "text-amber-400" : "text-zinc-500"
                        }
                      >
                        {seller.probation ? "En prueba" : "Activo"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function ReportStudio({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const records = useSalesRecords();
  const salesDepartments: Department[] = [
    "Ventas Digitales",
    "Ventas Residenciales",
    "Ventas Residenciales Rurales",
    "Ventas Corporativas",
  ];
  const [department, setDepartment] = useState<Department>(
    profile.department === "Administración"
      ? "Ventas Digitales"
      : profile.department,
  );
  const [currentMonth, setCurrentMonth] = useState<MonthKey>("2026-07");
  const [comparisonMonth, setComparisonMonth] = useState<MonthKey>("2026-06");
  const [supervisor, setSupervisor] = useState("all");
  const [seller, setSeller] = useState("all");
  const [enabledPages, setEnabledPages] = useState<
    Record<ReportPageKey, boolean>
  >({ projection: true, performance: true, market: true });
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const pageRefs = useRef<Record<ReportPageKey, HTMLDivElement | null>>({
    projection: null,
    performance: null,
    market: null,
  });

  const reportTeams = hydrateTeams(
    accessibleTeamsFor(profile, profiles),
    records,
  );
  const monthOptions = Array.from(
    new Set([
      ...months.map((month) => month.key),
      ...records.map((row) => row.sale_date.slice(0, 7)),
    ]),
  )
    .sort()
    .map((key) => ({ key, label: monthLabel(key) }));
  const selectedTeams =
    supervisor === "all"
      ? reportTeams
      : reportTeams.filter((team) => team.id === supervisor);
  const sellerOptions = selectedTeams.flatMap((team) =>
    team.sellers.map((item) => ({ ...item, team: team.supervisor })),
  );
  const selectedSeller =
    seller === "all"
      ? null
      : (sellerOptions.find((item) => item.name === seller) ?? null);
  const current = selectedSeller
    ? selectedSeller.values[currentMonth]
    : totalFor(selectedTeams, currentMonth);
  const previous = selectedSeller
    ? selectedSeller.values[comparisonMonth]
    : totalFor(selectedTeams, comparisonMonth);
  const goal = selectedSeller
    ? 15
    : selectedTeams.reduce((sum, team) => sum + team.goal, 0);
  const projection = Math.round((current / 13) * 26);
  const diff = current - previous;
  const ratio = totalFor(reportTeams, currentMonth)
    ? current / totalFor(reportTeams, currentMonth)
    : 1;
  const selectedNames = new Set(
    (selectedSeller ? [selectedSeller] : sellerOptions).map((item) =>
      normalizeName(item.name),
    ),
  );
  const filteredRecords = records.filter(
    (row) =>
      row.sale_date.startsWith(currentMonth) &&
      selectedNames.has(normalizeName(row.seller_name)),
  );
  const actualCities = Object.entries(
    filteredRecords.reduce<Record<string, number>>((accumulator, row) => {
      const city = row.city || "Sin ciudad";
      accumulator[city] = (accumulator[city] || 0) + 1;
      return accumulator;
    }, {}),
  ).map(([name, value]) => ({ name, value }));
  const currentCities = actualCities.length
    ? actualCities
    : (monthCityData[currentMonth] || monthCityData["2026-07"])
        .map((city) => ({
          ...city,
          value: Math.max(
            city.value && current ? 1 : 0,
            Math.round(city.value * ratio),
          ),
        }))
        .filter((city) => city.value > 0);
  const actualPackages = Object.entries(
    filteredRecords.reduce<Record<string, number>>((accumulator, row) => {
      const item = row.contract_service || "Sin paquete";
      accumulator[item] = (accumulator[item] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 9);
  const currentPackages = actualPackages.length ? actualPackages : packageData;
  const reportSellers = (selectedSeller ? [selectedSeller] : sellerOptions)
    .map((item) => ({
      ...item,
      current: item.values[currentMonth],
      previous: item.values[comparisonMonth],
    }))
    .sort((a, b) => b.current - a.current);
  const probationSelling = reportSellers.filter(
    (item) => item.probation && item.current > 0,
  ).length;
  const sellersSelling = reportSellers.filter(
    (item) => item.current > 0,
  ).length;
  const probationPercent = sellersSelling
    ? Math.round((probationSelling / sellersSelling) * 100)
    : 0;
  const traffic = ["Verde", "Amarillo", "Naranja", "Rojo"].map((name) => ({
    name,
    count: reportSellers.filter(
      (item) => performanceColor(item.current).name === name,
    ).length,
  }));
  const bestTeam = [...selectedTeams].sort(
    (a, b) => b.total[currentMonth] - a.total[currentMonth],
  )[0];
  const strongestCity = [...currentCities].sort((a, b) => b.value - a.value)[0];
  const weakestCity = [...currentCities].sort((a, b) => a.value - b.value)[0];
  const dailyBase = [6, 10, 7, 9, 4, 8, 13, 7, 6, 7, 6, 7, 11];
  const baseTotal = dailyBase.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  const daily = dailyBase.map((value, index) => {
    const sold = Math.round((value * current) / Math.max(baseTotal, 1));
    cumulative += sold;
    return {
      day: index + 1,
      sold,
      cumulative,
      target: Math.round((goal / 26) * (index + 1)),
    };
  });
  const automaticAnalysis = [
    `${monthLabel(currentMonth)} ${diff >= 0 ? "supera" : "queda por debajo de"} ${monthLabel(comparisonMonth)} por ${Math.abs(diff)} ventas (${previous ? Math.abs(Math.round((diff / previous) * 100)) : 100}%).`,
    `Al ritmo actual, el cierre proyectado es de ${projection} contratos, equivalente al ${Math.round((projection / Math.max(goal, 1)) * 100)}% de la meta seleccionada.`,
    bestTeam
      ? `${bestTeam.supervisor} lidera el corte con ${bestTeam.total[currentMonth]} ventas, incluyendo ${bestTeam.own[currentMonth]} ventas propias.`
      : "No hay supervisores en la selección.",
    strongestCity
      ? `${strongestCity.name} concentra la mayor venta (${strongestCity.value}); ${weakestCity?.name ?? "la ciudad con menor volumen"} requiere seguimiento comercial.`
      : "No hay ciudades en la selección.",
  ];

  function togglePage(page: ReportPageKey) {
    setEnabledPages((currentState) => ({
      ...currentState,
      [page]: !currentState[page],
    }));
  }
  function downloadCsv() {
    const rows = [
      [
        "Departamento",
        "Supervisor",
        "Vendedor",
        monthLabel(comparisonMonth),
        monthLabel(currentMonth),
        "Variación",
      ],
      ...reportSellers.map((item) => [
        department,
        item.team,
        item.name,
        item.previous,
        item.current,
        item.current - item.previous,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cc-analytics-${currentMonth}-vs-${comparisonMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function generatePdf() {
    const pageKeys = (Object.keys(enabledPages) as ReportPageKey[]).filter(
      (key) => enabledPages[key],
    );
    if (!pageKeys.length) {
      setStatus("Selecciona al menos una página para el PDF.");
      return;
    }
    setExporting(true);
    setStatus("");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: [1280, 720],
        compress: true,
      });
      for (let index = 0; index < pageKeys.length; index += 1) {
        const node = pageRefs.current[pageKeys[index]];
        if (!node) continue;
        const canvas = await html2canvas(node, {
          backgroundColor: "#07070b",
          scale: 1.6,
          useCORS: true,
          logging: false,
        });
        if (index > 0) pdf.addPage([1280, 720], "landscape");
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.92),
          "JPEG",
          0,
          0,
          1280,
          720,
          undefined,
          "FAST",
        );
      }
      pdf.save(
        `CC-Analytics-${department.replaceAll(" ", "-")}-${currentMonth}-vs-${comparisonMonth}.pdf`,
      );
      setStatus("PDF generado con la combinación seleccionada.");
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

  const pageBase =
    "relative aspect-video min-w-[1050px] overflow-hidden rounded-[24px] border border-purple-400/30 bg-[#07070b] p-7 text-white shadow-[0_0_35px_rgba(168,85,247,.12)]";
  return (
    <div className="animate-in space-y-5">
      <Panel className="p-5">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">
              Constructor de presentaciones
            </p>
            <h2 className="mt-1 text-xl font-black">
              Reportes combinables y PDF ejecutivo
            </h2>
            <p className="mt-2 text-xs text-zinc-500">
              Formato basado en la presentación de Ventas Digitales,
              reutilizable para Ventas Residenciales y Residenciales Rurales.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-300"
            >
              <Download size={15} /> Descargar datos
            </button>
            <button
              onClick={() => void generatePdf()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-3 text-xs font-black disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileText size={16} />
              )}{" "}
              {exporting ? "Generando..." : "Generar PDF"}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Departamento
            <select
              disabled={profile.role !== "Administrador"}
              value={department}
              onChange={(event) =>
                setDepartment(event.target.value as Department)
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white disabled:opacity-60"
            >
              {(profile.role === "Administrador"
                ? salesDepartments
                : [profile.department]
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Mes principal
            <select
              value={currentMonth}
              onChange={(event) =>
                setCurrentMonth(event.target.value as MonthKey)
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white"
            >
              {monthOptions.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Comparar contra
            <select
              value={comparisonMonth}
              onChange={(event) =>
                setComparisonMonth(event.target.value as MonthKey)
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white"
            >
              {monthOptions.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Supervisor
            <select
              value={supervisor}
              onChange={(event) => {
                setSupervisor(event.target.value);
                setSeller("all");
              }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white"
            >
              <option value="all">Todos</option>
              {reportTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.supervisor}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Vendedor
            <select
              value={seller}
              onChange={(event) => setSeller(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#111116] p-3 text-xs text-white"
            >
              <option value="all">Todos</option>
              {sellerOptions.map((item) => (
                <option key={`${item.team}-${item.name}`} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              { key: "projection", label: "Venta y proyección" },
              { key: "performance", label: "Vendedores y semáforo" },
              { key: "market", label: "Ciudades y paquetes" },
            ] as { key: ReportPageKey; label: string }[]
          ).map((page) => (
            <button
              key={page.key}
              onClick={() => togglePage(page.key)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold ${enabledPages[page.key] ? "border-purple-400/30 bg-purple-500/10 text-purple-200" : "border-white/[.06] text-zinc-600"}`}
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded ${enabledPages[page.key] ? "bg-purple-600" : "bg-zinc-800"}`}
              >
                {enabledPages[page.key] && <Check size={11} />}
              </span>
              {page.label}
            </button>
          ))}
        </div>
        {status && (
          <p className="mt-4 text-xs font-semibold text-emerald-400">
            {status}
          </p>
        )}
      </Panel>

      <div className="space-y-5 overflow-x-auto pb-3">
        {enabledPages.projection && (
          <div
            ref={(node) => {
              pageRefs.current.projection = node;
            }}
            className={pageBase}
          >
            <ReportHeader title="VENTA Y PROYECCIÓN" department={department} />
            <div className="mt-4 grid h-[500px] grid-cols-[1.7fr_.9fr] gap-4">
              <div className="grid grid-rows-[1.25fr_.75fr] gap-4">
                <ReportBox
                  title={`PROYECCIÓN ${monthLabel(currentMonth).toUpperCase()}`}
                >
                  <div className="h-[225px]">
                    <ResponsiveContainer>
                      <AreaChart data={daily}>
                        <CartesianGrid stroke="#2b173d" vertical={false} />
                        <XAxis
                          dataKey="day"
                          stroke="#71717a"
                          tick={{ fontSize: 9 }}
                        />
                        <YAxis stroke="#71717a" tick={{ fontSize: 9 }} />
                        <Tooltip {...tooltipStyle} />
                        <Area
                          type="monotone"
                          dataKey="cumulative"
                          name="Acumulado"
                          stroke="#d946ef"
                          fill="#a855f733"
                          strokeWidth={3}
                        />
                        <Area
                          type="monotone"
                          dataKey="target"
                          name="Meta acumulada"
                          stroke="#f97316"
                          fill="transparent"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ReportBox>
                <ReportBox title="VENTA POR SUPERVISOR">
                  <table className="w-full text-[10px]">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="py-2 text-left">Supervisor</th>
                        <th>Meta</th>
                        <th>{monthLabel(comparisonMonth)}</th>
                        <th>{monthLabel(currentMonth)}</th>
                        <th>Dif.</th>
                        <th>Propia</th>
                        <th>Proyección</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeams.map((team) => (
                        <tr key={team.id} className="border-t border-white/10">
                          <td className="py-2 font-bold text-purple-200">
                            {team.supervisor}
                          </td>
                          <td className="text-center">{team.goal}</td>
                          <td className="text-center">
                            {team.total[comparisonMonth]}
                          </td>
                          <td className="text-center font-bold">
                            {team.total[currentMonth]}
                          </td>
                          <td
                            className={`text-center ${team.total[currentMonth] >= team.total[comparisonMonth] ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {team.total[currentMonth] -
                              team.total[comparisonMonth]}
                          </td>
                          <td className="text-center text-cyan-400">
                            {team.own[currentMonth]}
                          </td>
                          <td className="text-center text-orange-400">
                            {Math.round((team.total[currentMonth] / 13) * 26)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ReportBox>
              </div>
              <div className="grid grid-rows-[auto_1fr] gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Meta" value={String(goal)} icon={Target} />
                  <Metric
                    label="Venta actual"
                    value={String(current)}
                    accent="text-cyan-400"
                    icon={BarChart3}
                  />
                  <Metric
                    label="Proyección"
                    value={String(projection)}
                    accent="text-orange-400"
                    icon={TrendingUp}
                  />
                  <Metric
                    label="% de meta"
                    value={`${Math.round((projection / Math.max(goal, 1)) * 100)}%`}
                    accent="text-green-400"
                    icon={Trophy}
                  />
                </div>
                <ReportBox title="ANÁLISIS AUTOMÁTICO">
                  <div className="space-y-3">
                    {automaticAnalysis.map((line) => (
                      <div
                        key={line}
                        className="flex gap-2 text-[11px] leading-5 text-zinc-300"
                      >
                        <Sparkles
                          size={14}
                          className="mt-1 shrink-0 text-purple-400"
                        />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                </ReportBox>
              </div>
            </div>
            <ReportFooter current={currentMonth} comparison={comparisonMonth} />
          </div>
        )}

        {enabledPages.performance && (
          <div
            ref={(node) => {
              pageRefs.current.performance = node;
            }}
            className={pageBase}
          >
            <ReportHeader
              title="VENDEDORES Y SEMÁFORO"
              department={department}
            />
            <div className="mt-4 grid h-[500px] grid-cols-[1fr_1.05fr] gap-5">
              <ReportBox title="RANKING DE VENDEDORES">
                <div className="max-h-[400px] overflow-hidden">
                  <table className="w-full text-[10px]">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="py-2 text-left">Vendedor</th>
                        <th>Supervisor</th>
                        <th>{monthLabel(comparisonMonth)}</th>
                        <th>{monthLabel(currentMonth)}</th>
                        <th>Variación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportSellers.slice(0, 18).map((item) => (
                        <tr
                          key={`${item.team}-${item.name}`}
                          className="border-t border-white/10"
                        >
                          <td className="py-1.5 font-semibold text-zinc-200">
                            {item.name}
                          </td>
                          <td className="text-center text-purple-300">
                            {item.team}
                          </td>
                          <td className="text-center">{item.previous}</td>
                          <td className="text-center font-bold">
                            {item.current}
                          </td>
                          <td
                            className={`text-center ${item.current >= item.previous ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {item.current - item.previous}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ReportBox>
              <div className="grid grid-rows-[.82fr_1.18fr] gap-4">
                <ReportBox title="PERSONAL EN TEMPORADA DE PRUEBA">
                  <div className="grid grid-cols-[180px_1fr] items-center">
                    <div className="relative h-40">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={[
                              { value: probationPercent },
                              { value: 100 - probationPercent },
                            ]}
                            dataKey="value"
                            innerRadius={48}
                            outerRadius={70}
                            startAngle={90}
                            endAngle={-270}
                          >
                            <Cell fill="#a855f7" />
                            <Cell fill="#27272a" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 grid place-items-center text-3xl font-black text-purple-400">
                        {probationPercent}%
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-zinc-300">
                      <b className="text-2xl text-purple-400">
                        {probationPercent}%
                      </b>{" "}
                      del personal que ha vendido está en temporada de prueba.
                    </p>
                  </div>
                </ReportBox>
                <ReportBox title="SEMÁFORO DE PRODUCTIVIDAD">
                  <div className="grid grid-cols-4 gap-2">
                    {traffic.map((state) => (
                      <div
                        key={state.name}
                        className="rounded-xl border border-white/10 bg-black/20 p-3 text-center"
                      >
                        <span
                          className="mx-auto block h-3 w-3 rounded-full"
                          style={{
                            background: performanceColor(
                              state.name === "Verde"
                                ? 15
                                : state.name === "Amarillo"
                                  ? 11
                                  : state.name === "Naranja"
                                    ? 7
                                    : 0,
                            ).color,
                          }}
                        />
                        <p className="mt-2 text-[9px] uppercase text-zinc-500">
                          {state.name}
                        </p>
                        <p className="text-2xl font-black">{state.count}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MiniStat
                      icon={Users}
                      label="Asesores"
                      value={String(reportSellers.length)}
                    />
                    <MiniStat
                      icon={UserRoundCheck}
                      label="Vendiendo"
                      value={String(sellersSelling)}
                    />
                    <MiniStat
                      icon={AlertTriangle}
                      label="En riesgo"
                      value={String(
                        traffic.find((item) => item.name === "Rojo")?.count ??
                          0,
                      )}
                    />
                  </div>
                </ReportBox>
              </div>
            </div>
            <ReportFooter current={currentMonth} comparison={comparisonMonth} />
          </div>
        )}

        {enabledPages.market && (
          <div
            ref={(node) => {
              pageRefs.current.market = node;
            }}
            className={pageBase}
          >
            <ReportHeader title="VENTAS POR CIUDADES" department={department} />
            <div className="mt-4 grid h-[500px] grid-cols-[1.2fr_.8fr] gap-5">
              <div className="grid grid-rows-[1fr_1fr] gap-4">
                <ReportBox title="CANTIDAD VENDIDA POR CIUDAD">
                  <div className="h-[205px]">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={currentCities}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={86}
                          label={({ percent }) =>
                            `${Math.round((percent ?? 0) * 100)}%`
                          }
                        >
                          {currentCities.map((city, index) => (
                            <Cell
                              key={city.name}
                              fill={colors[index % colors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip {...tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ReportBox>
                <ReportBox title="PAQUETES MÁS VENDIDOS">
                  <div className="h-[205px]">
                    <ResponsiveContainer>
                      <BarChart
                        data={currentPackages}
                        layout="vertical"
                        margin={{ left: 15, right: 25 }}
                      >
                        <CartesianGrid stroke="#2b173d" horizontal={false} />
                        <XAxis
                          type="number"
                          stroke="#71717a"
                          tick={{ fontSize: 9 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={235}
                          stroke="#a1a1aa"
                          tick={{ fontSize: 8 }}
                        />
                        <Tooltip {...tooltipStyle} />
                        <Bar
                          dataKey="value"
                          fill="#a855f7"
                          radius={[0, 5, 5, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ReportBox>
              </div>
              <div className="grid grid-rows-[1fr_1fr] gap-4">
                <ReportBox title="CONCENTRACIÓN Y OPORTUNIDADES">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="grid h-16 w-16 place-items-center rounded-full border border-purple-400/40 bg-purple-500/10">
                        <MapPin className="text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">
                          {strongestCity?.name} representa
                        </p>
                        <p className="text-4xl font-black text-purple-400">
                          {current
                            ? Math.round(
                                ((strongestCity?.value ?? 0) / current) * 100,
                              )
                            : 0}
                          %
                        </p>
                        <p className="text-xs text-zinc-400">
                          de la venta seleccionada
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-purple-400/20 pt-4">
                      <p className="text-[10px] font-bold uppercase text-purple-300">
                        Ciudades a mejorar
                      </p>
                      {[...currentCities]
                        .sort((a, b) => a.value - b.value)
                        .slice(0, 4)
                        .map((city) => (
                          <p
                            key={city.name}
                            className="mt-2 flex items-center gap-2 text-xs text-zinc-300"
                          >
                            <Target size={13} className="text-purple-400" />
                            {city.name} · {city.value}
                          </p>
                        ))}
                    </div>
                  </div>
                </ReportBox>
                <ReportBox title="PAQUETE LÍDER">
                  <div className="flex h-full items-center gap-5">
                    <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border border-purple-400/50 bg-purple-500/10">
                      <Trophy size={38} className="text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">
                        El paquete más vendido es
                      </p>
                      <p className="mt-2 text-2xl font-black text-purple-400">
                        L 650
                      </p>
                      <p className="mt-1 text-sm text-zinc-300">
                        con{" "}
                        <b className="text-2xl text-purple-300">
                          {currentPackages[0]?.value ?? 0}
                        </b>{" "}
                        contratos
                      </p>
                    </div>
                  </div>
                </ReportBox>
              </div>
            </div>
            <ReportFooter current={currentMonth} comparison={comparisonMonth} />
          </div>
        )}
      </div>
    </div>
  );
}

function ReportHeader({
  title,
  department,
}: {
  title: string;
  department: Department;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-3xl font-black tracking-tight">
          {title.split(" ").map((word, index) => (
            <span
              key={`${word}-${index}`}
              className={
                index === title.split(" ").length - 1 ? "text-purple-500" : ""
              }
            >
              {word}{" "}
            </span>
          ))}
        </h2>
        <p className="mt-1 text-[9px] font-bold uppercase tracking-[.2em] text-zinc-600">
          {department} · Cable Color Honduras
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-purple-400/30 bg-purple-500/10 font-black text-purple-300">
          CC
        </div>
        <div>
          <p className="text-sm font-black tracking-[.12em]">CABLE COLOR</p>
          <p className="text-[8px] uppercase tracking-[.22em] text-purple-400">
            Analytics
          </p>
        </div>
      </div>
    </div>
  );
}
function ReportBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-purple-400/30 bg-[#0b0b11]">
      <div className="border-b border-purple-400/20 bg-gradient-to-r from-purple-950/80 to-purple-900/20 px-4 py-2 text-[10px] font-black uppercase tracking-wider">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
function ReportFooter({
  current,
  comparison,
}: {
  current: MonthKey;
  comparison: MonthKey;
}) {
  return (
    <div className="absolute bottom-2 left-7 right-7 flex items-center justify-between text-[8px] uppercase tracking-[.18em] text-zinc-700">
      <span>CC ANALYTICS · Informe generado automáticamente</span>
      <span>
        {monthLabel(current)} vs {monthLabel(comparison)}
      </span>
    </div>
  );
}
function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
      <Icon size={17} className="mx-auto text-purple-400" />
      <p className="mt-1 text-[8px] uppercase text-zinc-500">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
