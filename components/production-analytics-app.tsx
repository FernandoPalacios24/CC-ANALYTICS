"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileBarChart,
  FileSpreadsheet,
  Filter,
  Headphones,
  HeartHandshake,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Map,
  Megaphone,
  Menu,
  MonitorUp,
  PanelLeftClose,
  PencilLine,
  PhoneCall,
  Presentation,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserCog,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import type {
  Department,
  Profile,
} from "@/components/analytics-app-v2";
import { DepartmentImportCenter } from "@/components/department-import-center";
import { ProductionAuditCenter } from "@/components/production-audit-center";
import {
  ProductionUserAccess,
  type ProductionCreateUserInput,
} from "@/components/production-user-access";
import { RealAlertCenter } from "@/components/real-alert-center";
import {
  RealDepartmentDashboard,
  type ProductionFilters,
} from "@/components/real-department-dashboard";
import { RealExecutiveDashboard } from "@/components/real-executive-dashboard";
import { RealSalesDashboard } from "@/components/real-sales-dashboard";
import { SalesGoalsCenter } from "@/components/sales-goals-center";
import {
  canSeeNav,
  departmentDefaultModule,
  moduleForHeading,
  moduleOwner,
  productionModules,
  salesDepartments,
} from "@/lib/production-platform";
import { supabase } from "@/lib/supabase-client";

const ReportStudioV3 = lazy(() =>
  import("@/components/report-studio-v3").then((module) => ({
    default: module.ReportStudioV3,
  })),
);
const SalesDataHubV2 = lazy(() =>
  import("@/components/sales-data-hub-v2").then((module) => ({
    default: module.SalesDataHubV2,
  })),
);
const SalesCorrectionCenter = lazy(() =>
  import("@/components/sales-correction-center").then((module) => ({
    default: module.SalesCorrectionCenter,
  })),
);

type NavEntry = {
  heading: string;
  icon: React.ElementType;
  section: "principal" | "comercial" | "gestión" | "control";
};

const iconByHeading: Record<string, React.ElementType> = {
  "Dashboard ejecutivo": LayoutDashboard,
  "Dashboard de mi área": LayoutDashboard,
  "Ventas digitales": BarChart3,
  "Ventas residenciales": BriefcaseBusiness,
  "Ventas residenciales rurales": Map,
  "Ventas corporativas": BriefcaseBusiness,
  "Marketing digital": Megaphone,
  "ROA y ROAS": CircleDollarSign,
  "Call center": PhoneCall,
  "Recursos humanos": Users,
  Finanzas: WalletCards,
  Operaciones: Settings,
  Instalaciones: Wrench,
  "Soporte técnico": Headphones,
  Inventario: Boxes,
  Cobertura: Map,
  Clientes: HeartHandshake,
  Reportes: FileBarChart,
  "Importar datos": FileSpreadsheet,
  "Usuarios y permisos": UserCog,
  "Auditoría y seguridad": ShieldCheck,
  "Centro de alertas": Bell,
  Proyecciones: Sparkles,
};

function sectionForHeading(heading: string): NavEntry["section"] {
  if (["Dashboard ejecutivo", "Dashboard de mi área"].includes(heading)) {
    return "principal";
  }
  if (
    [
      "Ventas digitales",
      "Ventas residenciales",
      "Ventas residenciales rurales",
      "Ventas corporativas",
      "Marketing digital",
      "ROA y ROAS",
      "Call center",
      "Clientes",
      "Cobertura",
    ].includes(heading)
  ) {
    return "comercial";
  }
  if (
    [
      "Recursos humanos",
      "Finanzas",
      "Operaciones",
      "Instalaciones",
      "Soporte técnico",
      "Inventario",
      "Reportes",
      "Proyecciones",
    ].includes(heading)
  ) {
    return "gestión";
  }
  return "control";
}

const sectionLabels: Record<NavEntry["section"], string> = {
  principal: "Inicio",
  comercial: "Operación comercial",
  gestión: "Gestión y análisis",
  control: "Control y seguridad",
};

function currentMonthLabel() {
  return new Intl.DateTimeFormat("es-HN", {
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .replace(/^./, (value) => value.toUpperCase());
}

function monthLabels(total = 36) {
  const now = new Date();
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return new Intl.DateTimeFormat("es-HN", {
      month: "long",
      year: "numeric",
    })
      .format(date)
      .replace(/^./, (value) => value.toUpperCase());
  });
}

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
  const match = normalized.match(/^([a-z]+)\s+(?:de\s+)?(\d{4})$/);
  if (!match || !months[match[1]]) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return `${match[2]}-${String(months[match[1]]).padStart(2, "0")}-01`;
}

function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function salesDepartmentFor(active: string, profile: Profile) {
  if (active === "Dashboard de mi área" && salesDepartments.includes(profile.department)) {
    return profile.department;
  }
  if (active === "Proyecciones" && salesDepartments.includes(profile.department)) {
    return profile.department;
  }
  const module = moduleForHeading(active);
  return module?.moduleKey === "sales" ? module.ownerDepartment || null : null;
}

function filterMode(active: string, profile: Profile) {
  if (
    [
      "Reportes",
      "Usuarios y permisos",
      "Auditoría y seguridad",
      "Ingreso de ventas",
      "Corrección de datos",
      "Metas de ventas",
    ].includes(active)
  ) {
    return "none" as const;
  }
  if (
    active === "Dashboard ejecutivo" ||
    salesDepartmentFor(active, profile) ||
    (active === "Proyecciones" && profile.role === "Administrador")
  ) {
    return "sales" as const;
  }
  return "month-region" as const;
}

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

function ModuleLoading() {
  return (
    <section className="grid min-h-72 place-items-center rounded-2xl border border-white/[.07] bg-white/[.025]">
      <div className="text-center text-xs text-zinc-500">
        <span className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
        Cargando módulo...
      </div>
    </section>
  );
}

export function ProductionAnalyticsApp({
  initialProfile,
  initialProfiles,
  onSignOut,
  onUpdateAccess,
  onCreateUser,
  onUpdateProfile,
}: {
  initialProfile: Profile;
  initialProfiles: Profile[];
  onSignOut: () => void;
  onUpdateAccess: (profile: Profile) => Promise<string | null>;
  onCreateUser: (
    input: ProductionCreateUserInput,
  ) => Promise<{ profile?: Profile; error?: string }>;
  onUpdateProfile: (name: string) => Promise<Profile>;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [profiles, setProfiles] = useState(
    initialProfiles.length ? initialProfiles : [initialProfile],
  );
  const [active, setActive] = useState(
    initialProfile.role === "Administrador"
      ? "Dashboard ejecutivo"
      : "Dashboard de mi área",
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [filters, setFilters] = useState<ProductionFilters>({
    month: currentMonthLabel(),
    region:
      initialProfile.role === "Administrador"
        ? "Todas las zonas"
        : initialProfile.zone,
    city: "Todas las ciudades",
    channel: "Todos los canales",
  });
  const [cities, setCities] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);

  useEffect(() => {
    setProfile(initialProfile);
    setProfiles(initialProfiles.length ? initialProfiles : [initialProfile]);
  }, [initialProfile, initialProfiles]);

  const salesOperationsAllowed =
    profile.role === "Administrador" ||
    (salesDepartments.includes(profile.department) &&
      ["Líder de departamento", "Supervisor", "Operador"].includes(profile.role));
  const salesCorrectionsAllowed =
    profile.role === "Administrador" ||
    (salesDepartments.includes(profile.department) &&
      ["Líder de departamento", "Supervisor"].includes(profile.role));

  const navigation = useMemo<NavEntry[]>(() => {
    const base = productionModules
      .filter((module) => {
        if (
          profile.role === "Administrador" &&
          module.heading === "Dashboard de mi área"
        ) {
          return false;
        }
        return canSeeNav(profile, module.heading);
      })
      .map((module) => ({
        heading: module.heading,
        icon: iconByHeading[module.heading] || LayoutDashboard,
        section: sectionForHeading(module.heading),
      }));

    const extra: NavEntry[] = [];
    if (salesOperationsAllowed) {
      extra.push({
        heading: "Ingreso de ventas",
        icon: FileSpreadsheet,
        section: "comercial",
      });
    }
    if (salesCorrectionsAllowed) {
      extra.push(
        {
          heading: "Metas de ventas",
          icon: Target,
          section: "comercial",
        },
        {
          heading: "Corrección de datos",
          icon: PencilLine,
          section: "control",
        },
      );
    }

    return [...base, ...extra].filter((entry) =>
      entry.heading.toLowerCase().includes(search.toLowerCase()),
    );
  }, [profile, salesCorrectionsAllowed, salesOperationsAllowed, search]);

  useEffect(() => {
    if (!navigation.some((entry) => entry.heading === active)) {
      setActive(
        profile.role === "Administrador"
          ? "Dashboard ejecutivo"
          : "Dashboard de mi área",
      );
    }
  }, [active, navigation, profile.role]);

  const mode = filterMode(active, profile);
  const selectedSalesDepartment = salesDepartmentFor(active, profile);

  useEffect(() => {
    if (mode !== "sales") {
      setCities([]);
      setChannels([]);
      return;
    }
    let cancelled = false;
    async function loadOptions() {
      const start = monthIso(filters.month);
      const end = nextMonth(start);
      let query = supabase
        .from("analytics_sales")
        .select("city,medium")
        .gte("sale_date", start)
        .lt("sale_date", end)
        .limit(50000);
      if (selectedSalesDepartment) {
        query = query.eq("department", selectedSalesDepartment);
      }
      if (filters.region !== "Todas las zonas") {
        query = query.eq("zone", filters.region);
      }
      const { data } = await query;
      if (cancelled) return;
      const nextCities = Array.from(
        new Set(
          (data || [])
            .map((row) => row.city)
            .filter((value): value is string => Boolean(value?.trim())),
        ),
      ).sort();
      const nextChannels = Array.from(
        new Set(
          (data || [])
            .map((row) => row.medium)
            .filter((value): value is string => Boolean(value?.trim())),
        ),
      ).sort();
      setCities(nextCities);
      setChannels(nextChannels);
      setFilters((current) => ({
        ...current,
        city:
          current.city === "Todas las ciudades" ||
          nextCities.includes(current.city)
            ? current.city
            : "Todas las ciudades",
        channel:
          current.channel === "Todos los canales" ||
          nextChannels.includes(current.channel)
            ? current.channel
            : "Todos los canales",
      }));
    }
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [filters.month, filters.region, mode, selectedSalesDepartment]);

  function go(heading: string) {
    setActive(heading);
    setMobile(false);
  }

  function openPresentation() {
    const popup = window.open(
      "/presentacion",
      "cc-analytics-presentacion",
      "popup=yes,width=1920,height=1080,left=0,top=0",
    );
    if (!popup) window.location.href = "/presentacion";
    else popup.focus();
  }

  function content() {
    if (active === "Dashboard ejecutivo") {
      return <RealExecutiveDashboard profile={profile} filters={filters} />;
    }
    if (active === "Dashboard de mi área") {
      if (salesDepartments.includes(profile.department)) {
        return (
          <RealSalesDashboard
            profile={profile}
            department={profile.department}
            title={`${profile.department} en tiempo real`}
            filters={filters}
          />
        );
      }
      return (
        <RealDepartmentDashboard
          profile={profile}
          department={profile.department}
          moduleKey={departmentDefaultModule[profile.department]}
          title={`${profile.department} en tiempo real`}
          filters={filters}
          onOpenImport={
            profile.role === "Analista"
              ? undefined
              : () => go("Importar datos")
          }
        />
      );
    }
    if (active === "Ingreso de ventas") {
      return <SalesDataHubV2 profile={profile} profiles={profiles} />;
    }
    if (active === "Corrección de datos") {
      return (
        <SalesCorrectionCenter
          profile={profile}
          profiles={profiles}
          onClose={() => go("Dashboard de mi área")}
        />
      );
    }
    if (active === "Metas de ventas") {
      return <SalesGoalsCenter profile={profile} profiles={profiles} />;
    }
    if (active === "Reportes") {
      return <ReportStudioV3 profile={profile} profiles={profiles} />;
    }
    if (active === "Importar datos") {
      return (
        <DepartmentImportCenter
          profile={profile}
          filters={filters}
          initialDepartment={
            profile.role === "Administrador" ? "Marketing" : profile.department
          }
        />
      );
    }
    if (active === "Usuarios y permisos") {
      return (
        <ProductionUserAccess
          profiles={profiles}
          onProfilesChange={setProfiles}
          onUpdate={async (updated) => {
            const error = await onUpdateAccess(updated);
            if (!error) {
              setProfiles((current) =>
                current.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              );
              if (updated.id === profile.id) setProfile(updated);
            }
            return error;
          }}
          onCreate={onCreateUser}
        />
      );
    }
    if (active === "Auditoría y seguridad") {
      return <ProductionAuditCenter profiles={profiles} />;
    }
    if (active === "Centro de alertas") {
      return (
        <RealAlertCenter
          profile={profile}
          filters={filters}
          onNavigate={go}
        />
      );
    }
    if (active === "Proyecciones") {
      if (profile.role === "Administrador") {
        return <RealExecutiveDashboard profile={profile} filters={filters} />;
      }
      if (salesDepartments.includes(profile.department)) {
        return (
          <RealSalesDashboard
            profile={profile}
            department={profile.department}
            title={`Proyección de ${profile.department}`}
            filters={filters}
          />
        );
      }
      return (
        <RealDepartmentDashboard
          profile={profile}
          department={profile.department}
          moduleKey={departmentDefaultModule[profile.department]}
          title={`Proyección de ${profile.department}`}
          filters={filters}
          projectionMode
        />
      );
    }

    const module = moduleForHeading(active);
    if (module) {
      const department = moduleOwner(module, profile);
      if (module.moduleKey === "sales") {
        return (
          <RealSalesDashboard
            profile={profile}
            department={department}
            title={module.title}
            filters={filters}
          />
        );
      }
      if (module.kind === "metrics") {
        return (
          <RealDepartmentDashboard
            profile={profile}
            department={department}
            moduleKey={module.moduleKey}
            title={module.title}
            filters={filters}
            onOpenImport={
              profile.role === "Analista" ||
              salesDepartments.includes(profile.department)
                ? undefined
                : () => go("Importar datos")
            }
          />
        );
      }
    }

    return (
      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[.05] p-8 text-center text-sm text-amber-200">
        Este módulo no está disponible para el alcance actual.
      </section>
    );
  }

  const sections: NavEntry["section"][] = [
    "principal",
    "comercial",
    "gestión",
    "control",
  ];

  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[.06] bg-[#09090d]/95 backdrop-blur-xl transition-all duration-300 ${
          collapsed ? "w-[76px]" : "w-[250px]"
        } ${mobile ? "translate-x-0" : "max-lg:-translate-x-full"}`}
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar módulo..."
                className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-700"
              />
            </div>
          </div>
        )}

        <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-5">
          {sections.map((section) => {
            const entries = navigation.filter(
              (entry) => entry.section === section,
            );
            if (!entries.length) return null;
            return (
              <div key={section}>
                {!collapsed && (
                  <p className="px-3 pb-2 pt-4 text-[9px] font-black uppercase tracking-[.2em] text-zinc-700">
                    {sectionLabels[section]}
                  </p>
                )}
                {entries.map((entry) => {
                  const Icon = entry.icon;
                  const selected = active === entry.heading;
                  return (
                    <button
                      key={entry.heading}
                      title={entry.heading}
                      onClick={() => go(entry.heading)}
                      className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        selected
                          ? "bg-gradient-to-r from-purple-600/20 to-purple-500/[.04] text-purple-200 shadow-[inset_2px_0_0_#a855f7]"
                          : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-300"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      <Icon size={17} />
                      {!collapsed && (
                        <span className="truncate text-[11px] font-semibold">
                          {entry.heading}
                        </span>
                      )}
                      {selected && !collapsed && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-purple-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/[.06] p-3">
          <button
            onClick={() => setProfileOpen(true)}
            title="Abrir mi perfil"
            className={`flex w-full items-center gap-3 rounded-xl bg-white/[.025] p-2 text-left transition hover:bg-purple-500/10 ${
              collapsed ? "justify-center" : ""
            }`}
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
        className={`transition-all duration-300 ${
          collapsed ? "lg:ml-[76px]" : "lg:ml-[250px]"
        }`}
      >
        <header className="sticky top-0 z-30 flex h-[74px] items-center justify-between border-b border-white/[.06] bg-[#08080b]/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Abrir menú"
              onClick={() => setMobile((value) => !value)}
              className="rounded-xl border border-white/[.07] p-2.5 text-zinc-400 lg:hidden"
            >
              {mobile ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[.16em] text-purple-400/70">
                Cable Color · {profile.department} · {profile.zone}
              </p>
              <h1 className="mt-1 truncate text-base font-black text-white sm:text-lg">
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

        <main className="mx-auto max-w-[1800px] p-4 sm:p-6">
          {mode !== "none" && (
            <FilterBar
              mode={mode}
              profile={profile}
              filters={filters}
              setFilters={setFilters}
              cities={cities}
              channels={channels}
            />
          )}

          <Suspense fallback={<ModuleLoading />}>{content()}</Suspense>

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
      )}

      {profileOpen && (
        <ProductionProfilePanel
          profile={profile}
          profiles={profiles}
          onClose={() => setProfileOpen(false)}
          onSave={async (name) => {
            const updated = await onUpdateProfile(name);
            setProfile(updated);
            setProfiles((current) =>
              current.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            );
            setProfileOpen(false);
          }}
        />
      )}

      {active === "Reportes" &&
        (profile.role === "Administrador" ||
          (profile.role === "Líder de departamento" &&
            salesDepartments.includes(profile.department))) && (
          <aside className="fixed bottom-6 right-6 z-[70] w-[330px] overflow-hidden rounded-2xl border border-purple-400/25 bg-[#101016]/95 shadow-[0_25px_80px_rgba(0,0,0,.55),0_0_45px_rgba(168,85,247,.14)] backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-white/[.07] p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-purple-500/10 text-purple-300">
                <Presentation size={22} />
              </span>
              <div>
                <h2 className="text-sm font-black text-white">
                  Presentación en vivo
                </h2>
                <p className="mt-1 text-[10px] leading-4 text-zinc-500">
                  Podio, ranking y ventas actualizadas para una segunda pantalla.
                </p>
              </div>
            </div>
            <div className="p-4">
              <button
                onClick={openPresentation}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3 text-xs font-black"
              >
                <MonitorUp size={17} /> Abrir en segunda pantalla
              </button>
            </div>
          </aside>
        )}
    </div>
  );
}

function FilterBar({
  mode,
  profile,
  filters,
  setFilters,
  cities,
  channels,
}: {
  mode: "sales" | "month-region";
  profile: Profile;
  filters: ProductionFilters;
  setFilters: React.Dispatch<React.SetStateAction<ProductionFilters>>;
  cities: string[];
  channels: string[];
}) {
  const selectClass =
    "appearance-none rounded-xl border border-white/[.07] bg-[#111116] py-2.5 pl-3 pr-8 text-[11px] font-semibold text-zinc-300 outline-none disabled:opacity-70";
  const regionValues =
    profile.role === "Administrador"
      ? ["Todas las zonas", "Nacional", "Zona Norte", "Zona Centro", "Zona Sur"]
      : [profile.zone];

  const options: {
    key: keyof ProductionFilters;
    values: string[];
    disabled?: boolean;
  }[] = [
    { key: "month", values: monthLabels() },
    {
      key: "region",
      values: regionValues,
      disabled: profile.role !== "Administrador",
    },
  ];
  if (mode === "sales") {
    options.push(
      { key: "city", values: ["Todas las ciudades", ...cities] },
      { key: "channel", values: ["Todos los canales", ...channels] },
    );
  }

  return (
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.025] px-3 text-zinc-500">
        <Filter size={14} />
        <span className="text-[10px] font-bold uppercase tracking-wider">
          Filtros
        </span>
      </div>
      {options.map((option) => (
        <label key={option.key} className="relative shrink-0">
          <select
            value={filters[option.key]}
            disabled={option.disabled}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                [option.key]: event.target.value,
              }))
            }
            className={selectClass}
          >
            {option.values.map((value) => (
              <option key={value}>{value}</option>
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

function ProductionProfilePanel({
  profile,
  profiles,
  onClose,
  onSave,
}: {
  profile: Profile;
  profiles: Profile[];
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const manager = profiles.find((item) => item.id === profile.managerId);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onSave(name.trim());
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex justify-end bg-black/75"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/[.08] bg-[#0d0d12] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
              Mi cuenta
            </p>
            <h2 className="mt-1 text-xl font-black">Perfil y acceso</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/[.08] p-2.5 text-zinc-400"
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

        <div className="mt-6 space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Nombre visible
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white outline-none focus:border-purple-400/50"
            />
          </label>
          {[
            ["Correo", profile.email],
            ["Cargo / perfil", profile.jobProfile],
            ["Departamento", profile.department],
            ["Zona", profile.zone],
            ["Rol", profile.role],
            ["Reporta a", manager?.name || "Nivel superior"],
          ].map(([label, value]) => (
            <label
              key={label}
              className="block text-[10px] font-black uppercase tracking-wider text-zinc-600"
            >
              {label}
              <input
                value={value}
                readOnly
                className="mt-2 w-full rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-zinc-400"
              />
            </label>
          ))}
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[.05] p-4 text-[10px] leading-5 text-emerald-200">
            <ShieldCheck className="mr-2 inline" size={14} />
            Perfil completo y alcance aplicado. Cargo, departamento, zona, rol y superior solo pueden ser modificados por Administración.
          </div>
          {error && (
            <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
              {error}
            </p>
          )}
          <button
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-black disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar nombre"}
          </button>
        </div>
      </aside>
    </div>
  );
}
