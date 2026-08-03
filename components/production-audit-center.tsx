"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileClock,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

type AuditEvent = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  department: string | null;
  zone: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const actionLabels: Record<string, string> = {
  data_import_created: "Importación registrada",
  department_import_replaced: "Corte departamental sustituido",
  sales_snapshot_replaced: "Corte de ventas sustituido",
  sales_snapshot_appended: "Corte de ventas agregado",
  department_metric_saved: "Indicador departamental actualizado",
  seller_saved: "Vendedor guardado",
  seller_corrected: "Vendedor corregido",
  seller_retired: "Vendedor retirado",
  seller_restored: "Vendedor reactivado",
  seller_goal_saved: "Meta de vendedor actualizada",
  posted_sale_corrected: "Venta posteada corregida",
  announced_sale_corrected: "Venta anunciada corregida",
  profile_access_updated: "Acceso de usuario actualizado",
  user_create_requested: "Creación de usuario solicitada",
  user_created: "Usuario creado",
  user_credentials_updated: "Credenciales de usuario actualizadas",
  user_create_failed: "Creación de usuario fallida",
  user_profile_failed: "Creación de perfil fallida",
  report_template_created: "Plantilla de reporte creada",
  report_template_updated: "Plantilla de reporte actualizada",
  report_template_deleted: "Plantilla de reporte eliminada",
};

function csvCell(value: unknown) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function severity(action: string) {
  if (action.includes("failed")) return "critical";
  if (action.includes("corrected") || action.includes("replaced")) return "warning";
  return "normal";
}

function metadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return "Sin detalles adicionales";
  const preferred = [
    "reason",
    "email",
    "seller_name",
    "file_name",
    "module",
    "period_month",
    "before_value",
    "after_value",
    "removed_records",
    "removed_imported_metrics",
  ];
  const entries = preferred
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
    .map((key) => `${key.replaceAll("_", " ")}: ${String(metadata[key])}`);
  if (entries.length) return entries.join(" · ");
  return Object.entries(metadata)
    .slice(0, 4)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
    .join(" · ");
}

export function ProductionAuditCenter({
  profiles,
}: {
  profiles: Profile[];
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("Todos los eventos");
  const [department, setDepartment] = useState("Todos los departamentos");
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: queryError } = await supabase
      .from("analytics_audit_log")
      .select(
        "id,actor_id,action,entity_type,entity_id,department,zone,metadata,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (queryError) {
      setError(queryError.message);
      setEvents([]);
    } else {
      setEvents((data || []) as AuditEvent[]);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileNames = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.name])),
    [profiles],
  );

  const actions = useMemo(
    () => [
      "Todos los eventos",
      ...Array.from(new Set(events.map((event) => event.action))).sort(),
    ],
    [events],
  );
  const departments = useMemo(
    () => [
      "Todos los departamentos",
      ...Array.from(
        new Set(events.map((event) => event.department).filter(Boolean) as string[]),
      ).sort(),
    ],
    [events],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (action !== "Todos los eventos" && event.action !== action) return false;
      if (
        department !== "Todos los departamentos" &&
        event.department !== department
      ) {
        return false;
      }
      if (!query) return true;
      const actor = event.actor_id
        ? profileNames.get(event.actor_id) || "Usuario registrado"
        : "Sistema";
      return `${event.action} ${actionLabels[event.action] || ""} ${event.entity_type} ${event.entity_id || ""} ${event.department || ""} ${event.zone || ""} ${actor} ${metadataSummary(event.metadata)}`
        .toLowerCase()
        .includes(query);
    });
  }, [action, department, events, profileNames, search]);

  const totals = useMemo(
    () => ({
      all: visible.length,
      critical: visible.filter((event) => severity(event.action) === "critical").length,
      corrections: visible.filter((event) => severity(event.action) === "warning").length,
      users: visible.filter((event) => event.entity_type === "analytics_profile").length,
    }),
    [visible],
  );

  function exportCsv() {
    const lines = [
      [
        "Fecha",
        "Evento",
        "Responsable",
        "Departamento",
        "Zona",
        "Entidad",
        "Referencia",
        "Detalle",
      ].map(csvCell).join(","),
      ...visible.map((event) =>
        [
          new Date(event.created_at).toLocaleString("es-HN"),
          actionLabels[event.action] || event.action,
          event.actor_id
            ? profileNames.get(event.actor_id) || "Usuario registrado"
            : "Sistema",
          event.department || "Global",
          event.zone || "Nacional",
          event.entity_type,
          event.entity_id || "",
          metadataSummary(event.metadata),
        ].map(csvCell).join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["\ufeff", lines.join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `auditoria-cc-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
            Trazabilidad corporativa
          </p>
          <h2 className="mt-1 text-xl font-black">Auditoría y seguridad</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Altas, permisos, importaciones, sustituciones, metas y correcciones con usuario y fecha.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportCsv}
            disabled={!visible.length}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-500/[.05] px-4 py-2.5 text-xs font-bold text-cyan-200 disabled:opacity-40"
          >
            <Download size={15} /> Exportar CSV
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <RefreshCw size={15} />
            )}
            Actualizar
          </button>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
          <AlertTriangle className="mr-2 inline" size={15} /> {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Eventos visibles</p>
          <p className="mt-2 text-3xl font-black">{totals.all}</p>
        </section>
        <section className="rounded-2xl border border-rose-500/15 bg-rose-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">Fallos</p>
          <p className="mt-2 text-3xl font-black">{totals.critical}</p>
        </section>
        <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">Correcciones</p>
          <p className="mt-2 text-3xl font-black">{totals.corrections}</p>
        </section>
        <section className="rounded-2xl border border-purple-500/15 bg-purple-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-300">Eventos de usuario</p>
          <p className="mt-2 text-3xl font-black">{totals.users}</p>
        </section>
      </div>

      <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_.6fr]">
          <label className="relative">
            <Search className="absolute left-3 top-3 text-zinc-600" size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar responsable, evento o referencia..."
              className="w-full rounded-xl border border-white/[.08] bg-[#111116] py-2.5 pl-9 pr-3 text-xs outline-none"
            />
          </label>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-xl border border-white/[.08] bg-[#111116] px-3 py-2.5 text-xs"
          >
            {actions.map((value) => (
              <option key={value} value={value}>
                {value === "Todos los eventos"
                  ? value
                  : actionLabels[value] || value}
              </option>
            ))}
          </select>
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className="rounded-xl border border-white/[.08] bg-[#111116] px-3 py-2.5 text-xs"
          >
            {departments.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-xl border border-white/[.08] bg-[#111116] px-3 py-2.5 text-xs"
          >
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
            <option value={365}>1 año</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-left text-xs">
            <thead className="border-b border-white/[.06] bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th>Evento</th>
                <th>Responsable</th>
                <th>Departamento</th>
                <th>Zona</th>
                <th>Entidad</th>
                <th>Referencia</th>
                <th className="pr-5">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => {
                const level = severity(event.action);
                return (
                  <tr key={event.id} className="border-b border-white/[.05] align-top">
                    <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                      {new Date(event.created_at).toLocaleString("es-HN")}
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black ${
                          level === "critical"
                            ? "bg-rose-500/10 text-rose-300"
                            : level === "warning"
                              ? "bg-amber-500/10 text-amber-300"
                              : "bg-emerald-500/10 text-emerald-300"
                        }`}
                      >
                        {level === "critical" ? (
                          <AlertTriangle size={10} />
                        ) : level === "warning" ? (
                          <FileClock size={10} />
                        ) : (
                          <CheckCircle2 size={10} />
                        )}
                        {actionLabels[event.action] || event.action}
                      </span>
                    </td>
                    <td className="font-bold text-purple-200">
                      {event.actor_id
                        ? profileNames.get(event.actor_id) || "Usuario registrado"
                        : "Sistema"}
                    </td>
                    <td>{event.department || "Global"}</td>
                    <td>{event.zone || "Nacional"}</td>
                    <td className="text-zinc-500">{event.entity_type}</td>
                    <td className="max-w-52 truncate text-zinc-500">
                      {event.entity_id || "—"}
                    </td>
                    <td className="max-w-[420px] pr-5 text-[10px] leading-5 text-zinc-500">
                      {metadataSummary(event.metadata)}
                    </td>
                  </tr>
                );
              })}
              {!visible.length && !loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-zinc-600">
                    <ShieldCheck className="mx-auto mb-3 text-emerald-300" size={28} />
                    No existen eventos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
