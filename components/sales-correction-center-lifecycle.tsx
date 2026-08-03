"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  History,
  Loader2,
  Megaphone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { SalesCorrectionCenter as CoreSalesCorrectionCenter } from "./sales-correction-center";
import { supabase } from "@/lib/supabase-client";

type PostedSale = {
  id: number;
  seller_id: string | null;
  seller_name: string;
  seller_code: string | null;
  supervisor_profile_id: string | null;
  sale_date: string;
  sale_units: number | null;
  amount_billed: number | string | null;
  city: string | null;
  service: string | null;
  contract_service: string | null;
  source_type: string | null;
};

type AnnouncedSale = {
  id: number;
  seller_id: string | null;
  seller_name: string;
  seller_code: string | null;
  supervisor_profile_id: string;
  announced_at: string;
  expected_post_date: string | null;
  sale_units: number | null;
  amount_announced: number | string | null;
  city: string | null;
  service: string | null;
  contract_service: string | null;
  notes: string | null;
};

type Cancellation = {
  id: number;
  sale_id: number;
  seller_id: string | null;
  seller_name: string;
  seller_code: string | null;
  supervisor_profile_id: string;
  original_sale_date: string;
  cancellation_date: string;
  cancellation_month: string;
  category: CancellationCategory;
  reason: string;
  sale_units: number;
  amount_billed: number | string | null;
  city: string | null;
  service: string | null;
  contract_service: string | null;
  source_type: string | null;
  created_at: string;
};

type CancellationCategory =
  | "devolucion"
  | "cliente_desistio"
  | "duplicada"
  | "error_registro"
  | "sin_cobertura"
  | "pago_rechazado"
  | "fraude"
  | "otra";

type PanelTab = "posted" | "announced" | "history";

type CancelDraft = {
  sale: PostedSale;
  category: CancellationCategory;
  date: string;
  reason: string;
};

type PostDraft = {
  sale: AnnouncedSale;
  date: string;
  reason: string;
};

type DeleteDraft = {
  sale: AnnouncedSale;
  reason: string;
};

const categoryOptions: Array<{ value: CancellationCategory; label: string }> = [
  { value: "devolucion", label: "Devolución" },
  { value: "cliente_desistio", label: "Cliente desistió" },
  { value: "duplicada", label: "Venta duplicada" },
  { value: "error_registro", label: "Error de registro" },
  { value: "sin_cobertura", label: "Sin cobertura" },
  { value: "pago_rechazado", label: "Pago rechazado" },
  { value: "fraude", label: "Fraude o documentación inválida" },
  { value: "otra", label: "Otra causa" },
];

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  return today().slice(0, 7);
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function units(value: number | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const clean = value.slice(0, 10);
  const date = new Date(`${clean}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? clean
    : new Intl.DateTimeFormat("es-HN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function categoryLabel(value: CancellationCategory) {
  return categoryOptions.find((item) => item.value === value)?.label || value;
}

function supervisorsFor(profile: Profile, profiles: Profile[]) {
  const active = profiles.filter(
    (candidate) => candidate.active && candidate.role === "Supervisor",
  );
  if (profile.role === "Administrador") return active;
  if (profile.role === "Líder de departamento") {
    return active.filter((candidate) => candidate.managerId === profile.id);
  }
  return active.filter((candidate) => candidate.id === profile.id);
}

const inputClass =
  "mt-2 w-full rounded-xl border border-white/[.09] bg-[#111116] p-3 text-xs text-white outline-none focus:border-purple-400/50";

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-black/85 p-4"
      onClick={onClose}
    >
      <section
        className="my-6 w-full max-w-2xl rounded-2xl border border-purple-400/20 bg-[#0d0d13] p-6 shadow-[0_30px_110px_rgba(0,0,0,.8)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
              Movimiento auditado
            </p>
            <h3 className="mt-1 text-xl font-black">{title}</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/[.08] p-2.5 text-zinc-500 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function LifecyclePanel({
  profile,
  profiles,
  onClose,
}: {
  profile: Profile;
  profiles: Profile[];
  onClose: () => void;
}) {
  const supervisors = useMemo(
    () => supervisorsFor(profile, profiles),
    [profile, profiles],
  );
  const [supervisorId, setSupervisorId] = useState(
    profile.role === "Supervisor" ? profile.id : supervisors[0]?.id || "",
  );
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState<PanelTab>("posted");
  const [posted, setPosted] = useState<PostedSale[]>([]);
  const [announced, setAnnounced] = useState<AnnouncedSale[]>([]);
  const [history, setHistory] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [cancelDraft, setCancelDraft] = useState<CancelDraft | null>(null);
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<DeleteDraft | null>(null);

  useEffect(() => {
    if (!supervisorId && supervisors[0]) setSupervisorId(supervisors[0].id);
  }, [supervisorId, supervisors]);

  async function load() {
    setLoading(true);
    setNotice("");
    const { start, end } = monthRange(month);

    let postedQuery = supabase
      .from("analytics_sales")
      .select(
        "id,seller_id,seller_name,seller_code,supervisor_profile_id,sale_date,sale_units,amount_billed,city,service,contract_service,source_type",
      )
      .gte("sale_date", start)
      .lt("sale_date", end)
      .order("sale_date", { ascending: false })
      .limit(50000);

    let announcedQuery = supabase
      .from("analytics_announced_sales")
      .select(
        "id,seller_id,seller_name,seller_code,supervisor_profile_id,announced_at,expected_post_date,sale_units,amount_announced,city,service,contract_service,notes",
      )
      .gte("announced_at", `${start}T00:00:00`)
      .lt("announced_at", `${end}T00:00:00`)
      .order("announced_at", { ascending: false })
      .limit(30000);

    let historyQuery = supabase
      .from("analytics_sale_cancellations")
      .select(
        "id,sale_id,seller_id,seller_name,seller_code,supervisor_profile_id,original_sale_date,cancellation_date,cancellation_month,category,reason,sale_units,amount_billed,city,service,contract_service,source_type,created_at",
      )
      .gte("cancellation_date", start)
      .lt("cancellation_date", end)
      .order("cancellation_date", { ascending: false })
      .limit(50000);

    if (supervisorId) {
      postedQuery = postedQuery.eq("supervisor_profile_id", supervisorId);
      announcedQuery = announcedQuery.eq("supervisor_profile_id", supervisorId);
      historyQuery = historyQuery.eq("supervisor_profile_id", supervisorId);
    }

    const [postedResult, announcedResult, historyResult] = await Promise.all([
      postedQuery,
      announcedQuery,
      historyQuery,
    ]);
    const firstError =
      postedResult.error || announcedResult.error || historyResult.error;
    if (firstError) setNotice(`ERROR: ${firstError.message}`);
    setPosted((postedResult.data || []) as PostedSale[]);
    setAnnounced((announcedResult.data || []) as AnnouncedSale[]);
    setHistory((historyResult.data || []) as Cancellation[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, supervisorId]);

  async function cancelPostedSale() {
    if (!cancelDraft) return;
    setSaving(true);
    const { error } = await supabase.rpc("analytics_cancel_posted_sale", {
      target_id: cancelDraft.sale.id,
      target_category: cancelDraft.category,
      target_reason: cancelDraft.reason,
      target_cancellation_date: cancelDraft.date,
    });
    if (error) {
      setNotice(`ERROR: ${error.message}`);
    } else {
      setNotice(
        cancelDraft.category === "devolucion"
          ? "La venta pasó a devolución y quedó guardada en el historial mensual."
          : "La venta fue cancelada y dejó de sumar en dashboards y rankings.",
      );
      setCancelDraft(null);
      window.dispatchEvent(new CustomEvent("cc-analytics-data-changed"));
      await load();
    }
    setSaving(false);
  }

  async function postAnnouncedSale() {
    if (!postDraft) return;
    setSaving(true);
    const { error } = await supabase.rpc("analytics_post_announced_sale", {
      target_id: postDraft.sale.id,
      target_post_date: postDraft.date,
      target_reason: postDraft.reason,
    });
    if (error) {
      setNotice(`ERROR: ${error.message}`);
    } else {
      setNotice(
        "La anunciada fue convertida en venta posteada. Ya suma en el ranking y dejó de aparecer como pendiente.",
      );
      setPostDraft(null);
      window.dispatchEvent(new CustomEvent("cc-analytics-data-changed"));
      await load();
    }
    setSaving(false);
  }

  async function deleteAnnouncedSale() {
    if (!deleteDraft) return;
    setSaving(true);
    const { error } = await supabase.rpc("analytics_delete_announced_sale", {
      target_id: deleteDraft.sale.id,
      target_reason: deleteDraft.reason,
    });
    if (error) {
      setNotice(`ERROR: ${error.message}`);
    } else {
      setNotice("La venta anunciada fue eliminada del listado pendiente y quedó auditada.");
      setDeleteDraft(null);
      window.dispatchEvent(new CustomEvent("cc-analytics-data-changed"));
      await load();
    }
    setSaving(false);
  }

  const totals = useMemo(() => {
    const returned = history.filter((item) => item.category === "devolucion");
    return {
      activeUnits: posted.reduce((sum, sale) => sum + units(sale.sale_units), 0),
      pendingUnits: announced.reduce(
        (sum, sale) => sum + units(sale.sale_units),
        0,
      ),
      cancelledUnits: history.reduce(
        (sum, item) => sum + units(item.sale_units),
        0,
      ),
      returnedUnits: returned.reduce(
        (sum, item) => sum + units(item.sale_units),
        0,
      ),
      returnedAmount: returned.reduce(
        (sum, item) => sum + numberValue(item.amount_billed),
        0,
      ),
    };
  }, [announced, history, posted]);

  const tabItems = [
    {
      id: "posted" as const,
      label: "Cancelar posteadas",
      count: totals.activeUnits,
      icon: CircleDollarSign,
    },
    {
      id: "announced" as const,
      label: "Anunciadas pendientes",
      count: totals.pendingUnits,
      icon: Megaphone,
    },
    {
      id: "history" as const,
      label: "Cancelaciones y devoluciones",
      count: totals.cancelledUnits,
      icon: History,
    },
  ];

  return (
    <div className="fixed inset-0 z-[170] overflow-y-auto bg-[#08080b] text-white">
      <header className="sticky top-0 z-20 flex min-h-[74px] items-center justify-between border-b border-white/[.07] bg-[#09090d]/95 px-4 backdrop-blur-xl sm:px-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-rose-300">
            Ciclo de ventas · {profile.department} · {profile.zone}
          </p>
          <h2 className="mt-1 text-lg font-black">
            Cancelaciones, devoluciones y posteo de anunciadas
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-400 hover:text-white"
        >
          <X size={19} />
        </button>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-4 p-4 sm:p-6">
        <section className="rounded-2xl border border-rose-400/15 bg-rose-500/[.035] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-rose-300">
                <ShieldCheck size={14} /> Historial protegido
              </div>
              <h3 className="mt-2 text-2xl font-black">
                Cada movimiento queda registrado por mes y motivo
              </h3>
              <p className="mt-2 max-w-4xl text-xs leading-5 text-zinc-500">
                Una venta cancelada deja de sumar inmediatamente. Cuando la causa es devolución, conserva su cantidad, monto, vendedor, fecha original y explicación para el consolidado mensual.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={supervisorId}
                onChange={(event) => setSupervisorId(event.target.value)}
                disabled={profile.role === "Supervisor" || supervisors.length <= 1}
                className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200 disabled:opacity-70"
              >
                {supervisors.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.name} · {supervisor.zone}
                  </option>
                ))}
              </select>
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200"
              />
              <button
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-3 text-xs font-bold text-zinc-300 disabled:opacity-50"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Actualizar
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Posteadas vigentes</p>
            <p className="mt-2 text-2xl font-black text-emerald-300">{totals.activeUnits}</p>
          </div>
          <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Anunciadas pendientes</p>
            <p className="mt-2 text-2xl font-black text-amber-300">{totals.pendingUnits}</p>
          </div>
          <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Devoluciones del mes</p>
            <p className="mt-2 text-2xl font-black text-rose-300">{totals.returnedUnits}</p>
          </div>
          <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Monto devuelto</p>
            <p className="mt-2 text-xl font-black text-rose-200">{money(totals.returnedAmount)}</p>
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/[.07] bg-white/[.02] p-2">
          {tabItems.map(({ id, label, count, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold ${
                tab === id
                  ? "bg-purple-600 text-white"
                  : "text-zinc-500 hover:bg-white/[.04] hover:text-zinc-200"
              }`}
            >
              <Icon size={15} /> {label}
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[9px]">{count}</span>
            </button>
          ))}
        </div>

        {notice && (
          <p
            className={`rounded-xl border p-3 text-xs ${
              notice.startsWith("ERROR")
                ? "border-rose-500/20 bg-rose-500/[.07] text-rose-300"
                : "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300"
            }`}
          >
            {notice}
          </p>
        )}

        {loading ? (
          <section className="grid min-h-72 place-items-center rounded-2xl border border-white/[.07] bg-white/[.025] text-xs text-zinc-500">
            <span className="flex items-center gap-3">
              <Loader2 className="animate-spin" /> Cargando ciclo de ventas...
            </span>
          </section>
        ) : tab === "posted" ? (
          <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-left text-xs">
                <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th className="px-5 py-3">Vendedor</th>
                    <th>Fecha</th>
                    <th>Cantidad</th>
                    <th>Monto</th>
                    <th>Ciudad</th>
                    <th>Servicio / paquete</th>
                    <th>Origen</th>
                    <th className="pr-5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {posted.map((sale) => (
                    <tr key={sale.id} className="border-t border-white/[.05]">
                      <td className="px-5 py-3">
                        <p className="font-bold text-zinc-200">{sale.seller_name}</p>
                        <p className="mt-1 text-[10px] text-zinc-600">{sale.seller_code || `Registro #${sale.id}`}</p>
                      </td>
                      <td>{formatDate(sale.sale_date)}</td>
                      <td className="text-base font-black text-emerald-300">{units(sale.sale_units)}</td>
                      <td>{money(sale.amount_billed)}</td>
                      <td>{sale.city || "—"}</td>
                      <td>
                        <p>{sale.service || "—"}</p>
                        <p className="mt-1 text-[10px] text-zinc-600">{sale.contract_service || "Sin paquete"}</p>
                      </td>
                      <td>{sale.source_type === "manual" ? "MANUAL" : sale.source_type === "announced" ? "ANUNCIADA" : "ARCHIVO"}</td>
                      <td className="pr-5 text-right">
                        <button
                          onClick={() =>
                            setCancelDraft({
                              sale,
                              category: "devolucion",
                              date: today(),
                              reason: "",
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[10px] font-black text-rose-300"
                        >
                          <Undo2 size={13} /> Cancelar / devolver
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!posted.length && (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-zinc-600">
                        No hay ventas posteadas vigentes en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "announced" ? (
          <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th className="px-5 py-3">Vendedor</th>
                    <th>Anunciada</th>
                    <th>Posteo esperado</th>
                    <th>Cantidad</th>
                    <th>Monto</th>
                    <th>Ciudad</th>
                    <th className="pr-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {announced.map((sale) => (
                    <tr key={sale.id} className="border-t border-white/[.05]">
                      <td className="px-5 py-3">
                        <p className="font-bold text-zinc-200">{sale.seller_name}</p>
                        <p className="mt-1 text-[10px] text-zinc-600">{sale.seller_code || `Registro #${sale.id}`}</p>
                      </td>
                      <td>{formatDate(sale.announced_at)}</td>
                      <td>{formatDate(sale.expected_post_date)}</td>
                      <td className="text-base font-black text-amber-300">{units(sale.sale_units)}</td>
                      <td>{money(sale.amount_announced)}</td>
                      <td>{sale.city || "—"}</td>
                      <td className="pr-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() =>
                              setPostDraft({
                                sale,
                                date: today(),
                                reason: "Posteo confirmado",
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300"
                          >
                            <Check size={13} /> Pasar a posteada
                          </button>
                          <button
                            onClick={() => setDeleteDraft({ sale, reason: "" })}
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[10px] font-black text-rose-300"
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!announced.length && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-zinc-600">
                        No hay ventas anunciadas pendientes en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
            <div className="border-b border-white/[.06] p-5">
              <h3 className="font-black">Historial mensual de cancelaciones y devoluciones</h3>
              <p className="mt-1 text-[10px] text-zinc-600">
                El mes corresponde a la fecha en que se canceló o devolvió la venta, no a la fecha original de posteo.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-left text-xs">
                <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th className="px-5 py-3">Vendedor</th>
                    <th>Venta original</th>
                    <th>Fecha movimiento</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Monto</th>
                    <th>Ciudad / servicio</th>
                    <th>Motivo detallado</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-t border-white/[.05]">
                      <td className="px-5 py-3">
                        <p className="font-bold text-zinc-200">{item.seller_name}</p>
                        <p className="mt-1 text-[10px] text-zinc-600">{item.seller_code || `Venta #${item.sale_id}`}</p>
                      </td>
                      <td>{formatDate(item.original_sale_date)}</td>
                      <td>{formatDate(item.cancellation_date)}</td>
                      <td>
                        <span className={item.category === "devolucion" ? "font-black text-rose-300" : "font-black text-amber-300"}>
                          {categoryLabel(item.category).toUpperCase()}
                        </span>
                      </td>
                      <td className="text-base font-black">{units(item.sale_units)}</td>
                      <td>{money(item.amount_billed)}</td>
                      <td>
                        <p>{item.city || "—"}</p>
                        <p className="mt-1 text-[10px] text-zinc-600">{item.service || item.contract_service || "Sin detalle"}</p>
                      </td>
                      <td className="max-w-md whitespace-normal leading-5 text-zinc-300">{item.reason}</td>
                    </tr>
                  ))}
                  {!history.length && (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-zinc-600">
                        No hay cancelaciones ni devoluciones registradas en este mes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {cancelDraft && (
        <Modal
          title="Cancelar venta posteada"
          subtitle="La venta dejará de sumar en todos los dashboards. Su información original permanecerá en el historial mensual."
          onClose={() => setCancelDraft(null)}
        >
          <div className="mt-6 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-xs text-zinc-400">
            <b className="text-white">{cancelDraft.sale.seller_name}</b> · {units(cancelDraft.sale.sale_units)} venta(s) · {money(cancelDraft.sale.amount_billed)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Tipo de cancelación
              <select
                value={cancelDraft.category}
                onChange={(event) =>
                  setCancelDraft({
                    ...cancelDraft,
                    category: event.target.value as CancellationCategory,
                  })
                }
                className={inputClass}
              >
                {categoryOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Fecha del movimiento
              <input
                type="date"
                value={cancelDraft.date}
                onChange={(event) =>
                  setCancelDraft({ ...cancelDraft, date: event.target.value })
                }
                className={inputClass}
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600 sm:col-span-2">
              Explicación obligatoria
              <textarea
                value={cancelDraft.reason}
                onChange={(event) =>
                  setCancelDraft({ ...cancelDraft, reason: event.target.value })
                }
                placeholder="Ej.: el cliente devolvió el servicio por mudanza fuera de cobertura"
                className={`${inputClass} min-h-28`}
              />
            </label>
          </div>
          {cancelDraft.category === "devolucion" && (
            <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-200">
              <RotateCcw className="mr-2 inline" size={14} /> Esta venta quedará identificada como devolución dentro del mes seleccionado.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setCancelDraft(null)} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Volver</button>
            <button
              disabled={saving || !cancelDraft.date || cancelDraft.reason.trim().length < 5}
              onClick={() => void cancelPostedSale()}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-xs font-black disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Undo2 size={15} />}
              Confirmar movimiento
            </button>
          </div>
        </Modal>
      )}

      {postDraft && (
        <Modal
          title="Convertir anunciada en posteada"
          subtitle="Se creará una venta real vinculada al mismo vendedor. La anunciada desaparecerá del listado pendiente y sumará en el ranking en vivo."
          onClose={() => setPostDraft(null)}
        >
          <div className="mt-6 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-xs text-zinc-400">
            <b className="text-white">{postDraft.sale.seller_name}</b> · {units(postDraft.sale.sale_units)} venta(s) · {money(postDraft.sale.amount_announced)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Fecha real de posteo
              <input
                type="date"
                value={postDraft.date}
                onChange={(event) => setPostDraft({ ...postDraft, date: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600 sm:col-span-2">
              Confirmación / referencia
              <textarea
                value={postDraft.reason}
                onChange={(event) => setPostDraft({ ...postDraft, reason: event.target.value })}
                className={`${inputClass} min-h-24`}
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setPostDraft(null)} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Volver</button>
            <button
              disabled={saving || !postDraft.date || postDraft.reason.trim().length < 5}
              onClick={() => void postAnnouncedSale()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <ArrowRight size={15} />}
              Crear venta posteada
            </button>
          </div>
        </Modal>
      )}

      {deleteDraft && (
        <Modal
          title="Eliminar venta anunciada"
          subtitle="Desaparecerá del listado pendiente. No se borrará la auditoría del movimiento."
          onClose={() => setDeleteDraft(null)}
        >
          <div className="mt-6 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-xs text-zinc-400">
            <b className="text-white">{deleteDraft.sale.seller_name}</b> · {units(deleteDraft.sale.sale_units)} venta(s)
          </div>
          <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Motivo de eliminación
            <textarea
              value={deleteDraft.reason}
              onChange={(event) => setDeleteDraft({ ...deleteDraft, reason: event.target.value })}
              placeholder="Ej.: se anunció por error o el cliente canceló antes del posteo"
              className={`${inputClass} min-h-28`}
            />
          </label>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setDeleteDraft(null)} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Volver</button>
            <button
              disabled={saving || deleteDraft.reason.trim().length < 5}
              onClick={() => void deleteAnnouncedSale()}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-xs font-black disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
              Eliminar anunciada
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function SalesCorrectionCenter({
  profile,
  profiles,
  onClose,
}: {
  profile: Profile;
  profiles: Profile[];
  onClose: () => void;
}) {
  const [lifecycleOpen, setLifecycleOpen] = useState(false);

  return (
    <>
      <CoreSalesCorrectionCenter
        profile={profile}
        profiles={profiles}
        onClose={onClose}
      />
      <button
        type="button"
        onClick={() => setLifecycleOpen(true)}
        className="fixed bottom-6 right-6 z-[145] inline-flex items-center gap-3 rounded-2xl border border-rose-400/25 bg-[#171018] px-5 py-4 text-xs font-black text-rose-200 shadow-[0_20px_70px_rgba(0,0,0,.65)] hover:border-rose-300/50"
      >
        <RotateCcw size={18} />
        Cancelaciones / devoluciones
      </button>
      {lifecycleOpen && (
        <LifecyclePanel
          profile={profile}
          profiles={profiles}
          onClose={() => setLifecycleOpen(false)}
        />
      )}
    </>
  );
}
