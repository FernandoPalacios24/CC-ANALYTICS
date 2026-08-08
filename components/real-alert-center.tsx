"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
  UserCog,
} from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import type { ProductionFilters } from "@/components/real-department-dashboard";
import { supabase } from "@/lib/supabase-client";

type MetricValue = {
  id: string;
  department: string;
  module_key: string;
  zone: string;
  period_month: string;
  value: number | string;
  target_value: number | string | null;
  updated_at: string;
  analytics_metric_definitions: { label: string; unit: string } | null;
};

type ProfileCompleteness = {
  id: string;
  full_name: string;
  department: string;
  zone: string;
  role: string;
  status: string;
  complete: boolean;
  missing_fields: string[] | null;
};

type ImportRow = {
  id: string;
  file_name: string;
  department: string;
  zone: string;
  module: string;
  created_at: string;
};

type SaleQuality = {
  id: number;
  seller_name: string;
  seller_id: string | null;
  supervisor_profile_id: string | null;
  sale_date: string;
  department: string;
  zone: string;
};

type AuditRow = {
  id: number;
  action: string;
  department: string | null;
  zone: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AlertItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  action?: string;
  icon: React.ElementType;
};

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
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function severityStyle(severity: AlertItem["severity"]) {
  if (severity === "critical") return "border-rose-500/20 bg-rose-500/[.06] text-rose-300";
  if (severity === "warning") return "border-amber-500/20 bg-amber-500/[.06] text-amber-200";
  return "border-cyan-500/20 bg-cyan-500/[.05] text-cyan-200";
}

export function RealAlertCenter({
  profile,
  filters,
  onNavigate,
}: {
  profile: Profile;
  filters: ProductionFilters;
  onNavigate?: (heading: string) => void;
}) {
  const [metrics, setMetrics] = useState<MetricValue[]>([]);
  const [profiles, setProfiles] = useState<ProfileCompleteness[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [sales, setSales] = useState<SaleQuality[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const period = useMemo(() => monthIso(filters.month), [filters.month]);
  const end = useMemo(() => nextMonth(period), [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    let metricQuery = supabase
      .from("analytics_metric_values")
      .select("id,department,module_key,zone,period_month,value,target_value,updated_at,analytics_metric_definitions(label,unit)")
      .eq("period_month", period)
      .not("target_value", "is", null);
    let importQuery = supabase
      .from("analytics_imports")
      .select("id,file_name,department,zone,module,created_at")
      .gte("created_at", `${period}T00:00:00`)
      .lt("created_at", `${end}T00:00:00`)
      .order("created_at", { ascending: false });
    let salesQuery = supabase
      .from("analytics_sales")
      .select("id,seller_name,seller_id,supervisor_profile_id,sale_date,department,zone")
      .gte("sale_date", period)
      .lt("sale_date", end)
      .or("seller_id.is.null,supervisor_profile_id.is.null")
      .limit(500);

    if (filters.region !== "Todas las zonas") {
      metricQuery = metricQuery.eq("zone", filters.region);
      importQuery = importQuery.eq("zone", filters.region);
      salesQuery = salesQuery.eq("zone", filters.region);
    }

    const auditSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [metricResult, profileResult, importResult, salesResult, auditResult] = await Promise.all([
      metricQuery,
      supabase
        .from("analytics_profile_completeness")
        .select("id,full_name,department,zone,role,status,complete,missing_fields")
        .eq("complete", false),
      importQuery,
      salesQuery,
      supabase
        .from("analytics_audit_log")
        .select("id,action,department,zone,metadata,created_at")
        .gte("created_at", auditSince)
        .in("action", [
          "user_create_failed",
          "user_profile_failed",
          "user_invite_failed",
        ])
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const firstError = metricResult.error || profileResult.error || importResult.error || salesResult.error || auditResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setMetrics((metricResult.data || []) as unknown as MetricValue[]);
    setProfiles((profileResult.data || []) as ProfileCompleteness[]);
    setImports((importResult.data || []) as ImportRow[]);
    setSales((salesResult.data || []) as SaleQuality[]);
    setAudits((auditResult.data || []) as AuditRow[]);
    setLoading(false);
  }, [end, filters.region, period]);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("cc-analytics-data-changed", handler);
    return () => window.removeEventListener("cc-analytics-data-changed", handler);
  }, [load]);

  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];

    metrics.forEach((metric) => {
      const actual = numberValue(metric.value);
      const target = numberValue(metric.target_value);
      if (!target || actual >= target) return;
      const label = metric.analytics_metric_definitions?.label || metric.module_key;
      const progress = (actual / target) * 100;
      items.push({
        id: `metric-${metric.id}`,
        severity: progress < 70 ? "critical" : "warning",
        title: `${label} debajo de la meta`,
        detail: `${metric.department} · ${metric.zone}: ${progress.toFixed(1)}% de cumplimiento.`,
        action: metric.department === profile.department ? "Dashboard de mi área" : undefined,
        icon: Target,
      });
    });

    profiles.forEach((row) => {
      if (profile.role !== "Administrador" && row.department !== profile.department) return;
      items.push({
        id: `profile-${row.id}`,
        severity: "warning",
        title: `Perfil incompleto: ${row.full_name || "Sin nombre"}`,
        detail: `Falta completar: ${(row.missing_fields || []).join(", ") || "información obligatoria"}.`,
        action: profile.role === "Administrador" ? "Usuarios y permisos" : undefined,
        icon: UserCog,
      });
    });

    sales.forEach((sale) => {
      items.push({
        id: `sale-${sale.id}`,
        severity: sale.supervisor_profile_id ? "warning" : "critical",
        title: `Venta sin vinculación completa`,
        detail: `${sale.seller_name} · ${sale.sale_date}. ${sale.seller_id ? "Falta supervisor." : "Falta vendedor oficial."}`,
        action: "Corrección de datos",
        icon: ShieldAlert,
      });
    });

    audits.forEach((audit) => {
      if (profile.role !== "Administrador") return;
      items.push({
        id: `audit-${audit.id}`,
        severity: "critical",
        title: "Fallo administrativo registrado",
        detail: `${audit.action} · ${new Date(audit.created_at).toLocaleString("es-HN")}.`,
        action: "Auditoría y seguridad",
        icon: AlertTriangle,
      });
    });

    const expectedDepartments = profile.role === "Administrador"
      ? ["Ventas Digitales", "Ventas Residenciales", "Ventas Residenciales Rurales", "Ventas Corporativas", "Marketing", "Call Center", "Recursos Humanos", "Finanzas", "Operaciones"]
      : [profile.department];
    expectedDepartments.forEach((department) => {
      if (!imports.some((item) => item.department === department)) {
        items.push({
          id: `import-${department}`,
          severity: "info",
          title: `${department} sin archivo del período`,
          detail: `No existe una importación registrada para ${filters.month}. Los indicadores permanecen en cero o conservan entradas manuales.`,
          action: department === profile.department || profile.role === "Administrador" ? "Importar datos" : undefined,
          icon: Database,
        });
      }
    });

    return items.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [audits, filters.month, imports, metrics, profile, profiles, sales]);

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Validaciones reales</p>
          <h2 className="mt-1 text-xl font-black">Centro de alertas</h2>
          <p className="mt-1 text-xs text-zinc-500">Metas, perfiles, importaciones, ventas sin vincular y fallos administrativos.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          Actualizar
        </button>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
          <AlertTriangle className="mr-2 inline" size={15} /> {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="rounded-2xl border border-rose-500/15 bg-rose-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">Críticas</p>
          <p className="mt-2 text-3xl font-black">{alerts.filter((item) => item.severity === "critical").length}</p>
        </section>
        <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">Advertencias</p>
          <p className="mt-2 text-3xl font-black">{alerts.filter((item) => item.severity === "warning").length}</p>
        </section>
        <section className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Informativas</p>
          <p className="mt-2 text-3xl font-black">{alerts.filter((item) => item.severity === "info").length}</p>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
        <div className="border-b border-white/[.06] p-5">
          <h3 className="font-black">Acciones requeridas</h3>
          <p className="mt-1 text-[10px] text-zinc-600">No se generan alertas ficticias ni temporizadores simulados.</p>
        </div>
        <div>
          {alerts.map((alert) => {
            const Icon = alert.icon;
            return (
              <div key={alert.id} className="flex flex-col gap-3 border-b border-white/[.05] p-4 last:border-0 sm:flex-row sm:items-center">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${severityStyle(alert.severity)}`}><Icon size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-zinc-200">{alert.title}</p>
                  <p className="mt-1 text-[10px] leading-5 text-zinc-500">{alert.detail}</p>
                </div>
                {alert.action && onNavigate && (
                  <button
                    onClick={() => onNavigate(alert.action!)}
                    className="rounded-xl border border-purple-400/15 bg-purple-500/[.06] px-4 py-2 text-[10px] font-black text-purple-200"
                  >
                    Resolver
                  </button>
                )}
              </div>
            );
          })}
          {!alerts.length && !loading && (
            <div className="grid min-h-56 place-items-center p-8 text-center">
              <div>
                <CheckCircle2 className="mx-auto text-emerald-300" size={30} />
                <p className="mt-3 text-sm font-black text-emerald-200">Sin alertas pendientes</p>
                <p className="mt-1 text-xs text-zinc-600">Los datos visibles superaron las validaciones actuales.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
