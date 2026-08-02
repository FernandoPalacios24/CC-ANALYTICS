"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CircleDollarSign,
  Loader2,
  Megaphone,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

type Seller = {
  id: string;
  department: string;
  zone: string;
  supervisor_profile_id: string;
  seller_code: string | null;
  full_name: string;
  hire_date: string;
  probation_days: number;
  probation_end_date: string;
  is_on_probation: boolean;
  effective_status: "activo" | "salida_pendiente" | "inactivo";
  inactive_effective_date: string | null;
};

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
  sale_type: string | null;
  medium: string | null;
  source_type: string | null;
  manual_override: boolean;
  correction_reason: string | null;
  updated_at: string | null;
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
  status: "anunciada" | "posteada" | "cancelada";
  manual_override: boolean;
  correction_reason: string | null;
  updated_at: string | null;
};

type Tab = "sellers" | "posted" | "announced";

type SellerDraft = {
  id: string;
  supervisorId: string;
  name: string;
  code: string;
  hireDate: string;
  probationDays: number;
  reason: string;
};

type PostedDraft = {
  id: number;
  sellerId: string;
  date: string;
  units: number;
  amount: string;
  city: string;
  service: string;
  packageName: string;
  saleType: string;
  medium: string;
  reason: string;
};

type AnnouncedDraft = {
  id: number;
  sellerId: string;
  date: string;
  expectedDate: string;
  units: number;
  amount: string;
  city: string;
  service: string;
  packageName: string;
  notes: string;
  status: AnnouncedSale["status"];
  reason: string;
};

function todayMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-HN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function amount(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    maximumFractionDigits: 2,
  }).format(amount(value));
}

function units(value: number | null) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function supervisorOptions(profile: Profile, profiles: Profile[]) {
  const active = profiles.filter(
    (candidate) => candidate.active && candidate.role === "Supervisor",
  );
  if (profile.role === "Administrador") return active;
  if (profile.role === "Líder de departamento") {
    return active.filter((candidate) => candidate.managerId === profile.id);
  }
  return active.filter((candidate) => candidate.id === profile.id);
}

function Field({
  label,
  children,
  span = false,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <label
      className={`text-[10px] font-black uppercase tracking-wider text-zinc-600 ${
        span ? "sm:col-span-2" : ""
      }`}
    >
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "mt-2 w-full rounded-xl border border-white/[.09] bg-[#111116] p-3 text-xs text-white outline-none focus:border-purple-400/50";

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-black/80 p-4"
      onClick={onClose}
    >
      <section
        className="my-6 w-full max-w-3xl rounded-2xl border border-purple-400/20 bg-[#0e0e14] p-6 shadow-[0_25px_100px_rgba(0,0,0,.75)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
              Corrección controlada
            </p>
            <h3 className="mt-1 text-xl font-black text-white">{title}</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
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

function SellerEditor({
  draft,
  setDraft,
  supervisors,
  saving,
  onClose,
  onSave,
}: {
  draft: SellerDraft;
  setDraft: (draft: SellerDraft) => void;
  supervisors: Profile[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title="Editar vendedor"
      subtitle="El cambio actualiza su ficha oficial y mantiene vinculadas todas sus ventas históricas."
      onClose={onClose}
    >
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" span>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Código">
          <input
            value={draft.code}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Supervisor">
          <select
            value={draft.supervisorId}
            onChange={(event) =>
              setDraft({ ...draft, supervisorId: event.target.value })
            }
            className={inputClass}
          >
            {supervisors.map((supervisor) => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.name} · {supervisor.zone}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de ingreso">
          <input
            type="date"
            value={draft.hireDate}
            onChange={(event) =>
              setDraft({ ...draft, hireDate: event.target.value })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Días de prueba">
          <input
            type="number"
            min={0}
            max={365}
            value={draft.probationDays}
            onChange={(event) =>
              setDraft({ ...draft, probationDays: Number(event.target.value) })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Motivo de corrección" span>
          <textarea
            value={draft.reason}
            onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
            placeholder="Ej.: corrección de fecha de ingreso según expediente"
            className={`${inputClass} min-h-24`}
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">
          Cancelar
        </button>
        <button
          disabled={saving || draft.reason.trim().length < 5 || !draft.name.trim()}
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Guardar corrección
        </button>
      </div>
    </ModalShell>
  );
}

function PostedEditor({
  draft,
  setDraft,
  sellers,
  saving,
  onClose,
  onSave,
}: {
  draft: PostedDraft;
  setDraft: (draft: PostedDraft) => void;
  sellers: Seller[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title="Editar venta posteada"
      subtitle="La corrección queda protegida frente a futuras sustituciones automáticas y registrada en auditoría."
      onClose={onClose}
    >
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Vendedor" span>
          <select
            value={draft.sellerId}
            onChange={(event) => setDraft({ ...draft, sellerId: event.target.value })}
            className={inputClass}
          >
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.full_name} · {seller.effective_status.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de venta">
          <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Cantidad de ventas">
          <input type="number" min={1} max={100000} value={draft.units} onChange={(event) => setDraft({ ...draft, units: Number(event.target.value) })} className={inputClass} />
        </Field>
        <Field label="Monto total">
          <input type="number" min={0} step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Ciudad">
          <input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Servicio">
          <input value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Paquete">
          <input value={draft.packageName} onChange={(event) => setDraft({ ...draft, packageName: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Tipo de venta">
          <input value={draft.saleType} onChange={(event) => setDraft({ ...draft, saleType: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Canal">
          <input value={draft.medium} onChange={(event) => setDraft({ ...draft, medium: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Motivo de corrección" span>
          <textarea value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Ej.: el archivo reportó 3 ventas y el dato correcto es 4" className={`${inputClass} min-h-24`} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Cancelar</button>
        <button disabled={saving || !draft.sellerId || !draft.date || draft.units < 1 || draft.reason.trim().length < 5} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar corrección
        </button>
      </div>
    </ModalShell>
  );
}

function AnnouncedEditor({
  draft,
  setDraft,
  sellers,
  saving,
  onClose,
  onSave,
}: {
  draft: AnnouncedDraft;
  setDraft: (draft: AnnouncedDraft) => void;
  sellers: Seller[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title="Editar venta anunciada"
      subtitle="Puedes corregir la venta, reasignarla o cambiar su estado sin borrar su historial."
      onClose={onClose}
    >
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Vendedor" span>
          <select value={draft.sellerId} onChange={(event) => setDraft({ ...draft, sellerId: event.target.value })} className={inputClass}>
            {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name}</option>)}
          </select>
        </Field>
        <Field label="Fecha anunciada">
          <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Posteo esperado">
          <input type="date" value={draft.expectedDate} onChange={(event) => setDraft({ ...draft, expectedDate: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Cantidad">
          <input type="number" min={1} max={100000} value={draft.units} onChange={(event) => setDraft({ ...draft, units: Number(event.target.value) })} className={inputClass} />
        </Field>
        <Field label="Monto">
          <input type="number" min={0} step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Ciudad">
          <input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Servicio">
          <input value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Paquete">
          <input value={draft.packageName} onChange={(event) => setDraft({ ...draft, packageName: event.target.value })} className={inputClass} />
        </Field>
        <Field label="Estado">
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AnnouncedSale["status"] })} className={inputClass}>
            <option value="anunciada">Anunciada</option>
            <option value="posteada">Posteada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </Field>
        <Field label="Observación" span>
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className={`${inputClass} min-h-20`} />
        </Field>
        <Field label="Motivo de corrección" span>
          <textarea value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Explica por qué se modifica el registro" className={`${inputClass} min-h-24`} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Cancelar</button>
        <button disabled={saving || !draft.sellerId || !draft.date || draft.units < 1 || draft.reason.trim().length < 5} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-xs font-black disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar corrección
        </button>
      </div>
    </ModalShell>
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
  const supervisors = useMemo(() => supervisorOptions(profile, profiles), [profile, profiles]);
  const [supervisorId, setSupervisorId] = useState(
    profile.role === "Supervisor" ? profile.id : supervisors[0]?.id || "",
  );
  const [month, setMonth] = useState(todayMonth());
  const [tab, setTab] = useState<Tab>("sellers");
  const [query, setQuery] = useState("");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [posted, setPosted] = useState<PostedSale[]>([]);
  const [announced, setAnnounced] = useState<AnnouncedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [sellerDraft, setSellerDraft] = useState<SellerDraft | null>(null);
  const [postedDraft, setPostedDraft] = useState<PostedDraft | null>(null);
  const [announcedDraft, setAnnouncedDraft] = useState<AnnouncedDraft | null>(null);

  useEffect(() => {
    if (!supervisorId && supervisors[0]) setSupervisorId(supervisors[0].id);
  }, [supervisorId, supervisors]);

  async function load() {
    setLoading(true);
    setNotice("");
    const { start, end } = monthRange(month);

    let sellerQuery = supabase
      .from("analytics_seller_report")
      .select("id,department,zone,supervisor_profile_id,seller_code,full_name,hire_date,probation_days,probation_end_date,is_on_probation,effective_status,inactive_effective_date")
      .order("full_name");
    let postedQuery = supabase
      .from("analytics_sales")
      .select("id,seller_id,seller_name,seller_code,supervisor_profile_id,sale_date,sale_units,amount_billed,city,service,contract_service,sale_type,medium,source_type,manual_override,correction_reason,updated_at")
      .gte("sale_date", start)
      .lt("sale_date", end)
      .order("sale_date", { ascending: false })
      .limit(50000);
    let announcedQuery = supabase
      .from("analytics_announced_sales")
      .select("id,seller_id,seller_name,seller_code,supervisor_profile_id,announced_at,expected_post_date,sale_units,amount_announced,city,service,contract_service,notes,status,manual_override,correction_reason,updated_at")
      .gte("announced_at", `${start}T00:00:00`)
      .lt("announced_at", `${end}T00:00:00`)
      .order("announced_at", { ascending: false })
      .limit(30000);

    if (supervisorId) {
      sellerQuery = sellerQuery.eq("supervisor_profile_id", supervisorId);
      postedQuery = postedQuery.eq("supervisor_profile_id", supervisorId);
      announcedQuery = announcedQuery.eq("supervisor_profile_id", supervisorId);
    }

    const [sellerResult, postedResult, announcedResult] = await Promise.all([
      sellerQuery,
      postedQuery,
      announcedQuery,
    ]);
    const error = sellerResult.error || postedResult.error || announcedResult.error;
    if (error) setNotice(`ERROR: ${error.message}`);
    setSellers((sellerResult.data || []) as Seller[]);
    setPosted((postedResult.data || []) as PostedSale[]);
    setAnnounced((announcedResult.data || []) as AnnouncedSale[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, supervisorId]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleSellers = sellers.filter((seller) =>
    `${seller.full_name} ${seller.seller_code || ""}`.toLowerCase().includes(normalizedQuery),
  );
  const visiblePosted = posted.filter((sale) =>
    `${sale.seller_name} ${sale.seller_code || ""} ${sale.city || ""} ${sale.service || ""}`.toLowerCase().includes(normalizedQuery),
  );
  const visibleAnnounced = announced.filter((sale) =>
    `${sale.seller_name} ${sale.seller_code || ""} ${sale.city || ""} ${sale.service || ""}`.toLowerCase().includes(normalizedQuery),
  );

  async function saveSellerCorrection() {
    if (!sellerDraft) return;
    setSaving(true);
    const { error } = await supabase.rpc("analytics_correct_seller", {
      target_id: sellerDraft.id,
      target_supervisor_id: sellerDraft.supervisorId,
      target_full_name: sellerDraft.name,
      target_seller_code: sellerDraft.code || null,
      target_hire_date: sellerDraft.hireDate,
      target_probation_days: sellerDraft.probationDays,
      target_reason: sellerDraft.reason,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice("Vendedor corregido. El cambio quedó registrado en auditoría.");
      setSellerDraft(null);
      await load();
    }
    setSaving(false);
  }

  async function savePostedCorrection() {
    if (!postedDraft) return;
    setSaving(true);
    const { error } = await supabase.rpc("analytics_correct_posted_sale", {
      target_id: postedDraft.id,
      target_seller_id: postedDraft.sellerId,
      target_sale_date: postedDraft.date,
      target_sale_units: postedDraft.units,
      target_amount_billed: postedDraft.amount === "" ? null : Number(postedDraft.amount),
      target_city: postedDraft.city || null,
      target_service: postedDraft.service || null,
      target_contract_service: postedDraft.packageName || null,
      target_sale_type: postedDraft.saleType || null,
      target_medium: postedDraft.medium || null,
      target_reason: postedDraft.reason,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice("Venta posteada corregida y protegida de sustituciones automáticas.");
      setPostedDraft(null);
      await load();
    }
    setSaving(false);
  }

  async function saveAnnouncedCorrection() {
    if (!announcedDraft) return;
    setSaving(true);
    const { error } = await supabase.rpc("analytics_correct_announced_sale", {
      target_id: announcedDraft.id,
      target_seller_id: announcedDraft.sellerId,
      target_announced_date: announcedDraft.date,
      target_expected_post_date: announcedDraft.expectedDate || null,
      target_sale_units: announcedDraft.units,
      target_amount_announced: announcedDraft.amount === "" ? null : Number(announcedDraft.amount),
      target_city: announcedDraft.city || null,
      target_service: announcedDraft.service || null,
      target_contract_service: announcedDraft.packageName || null,
      target_notes: announcedDraft.notes || null,
      target_status: announcedDraft.status,
      target_reason: announcedDraft.reason,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice("Venta anunciada corregida. El cambio quedó registrado en auditoría.");
      setAnnouncedDraft(null);
      await load();
    }
    setSaving(false);
  }

  async function changeSellerStatus(seller: Seller) {
    const retiring = seller.effective_status === "activo";
    if (!window.confirm(`${retiring ? "¿Retirar" : "¿Reactivar"} a ${seller.full_name}?`)) return;
    setSaving(true);
    const { error } = await supabase.rpc(
      retiring ? "analytics_retire_seller" : "analytics_restore_seller",
      { target_id: seller.id },
    );
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice(retiring ? "Retiro procesado sin borrar historial." : "Vendedor reactivado.");
      await load();
    }
    setSaving(false);
  }

  const tabs = [
    { id: "sellers" as const, label: "Vendedores", icon: Users, count: sellers.length },
    { id: "posted" as const, label: "Ventas posteadas", icon: CircleDollarSign, count: posted.reduce((sum, sale) => sum + units(sale.sale_units), 0) },
    { id: "announced" as const, label: "Ventas anunciadas", icon: Megaphone, count: announced.reduce((sum, sale) => sum + units(sale.sale_units), 0) },
  ];

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-[#08080b] text-white">
      <header className="sticky top-0 z-20 flex min-h-[74px] items-center justify-between border-b border-white/[.07] bg-[#09090d]/95 px-4 backdrop-blur-xl sm:px-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-purple-300">Control de integridad · {profile.department} · {profile.zone}</p>
          <h1 className="mt-1 text-lg font-black">Corrección de ventas y vendedores</h1>
        </div>
        <button aria-label="Cerrar correcciones" onClick={onClose} className="rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-400 hover:text-white"><X size={19} /></button>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-4 p-4 sm:p-6">
        <section className="rounded-2xl border border-purple-400/15 bg-purple-500/[.04] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-purple-300"><ShieldCheck size={14} /> Edición auditada</div>
              <h2 className="mt-2 text-2xl font-black">Nada se altera sin dejar rastro</h2>
              <p className="mt-2 max-w-4xl text-xs leading-5 text-zinc-500">Cada corrección exige un motivo y guarda usuario, fecha, valores anteriores y valores nuevos. Los registros corregidos quedan protegidos de la sustitución automática de archivos.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} disabled={profile.role === "Supervisor" || supervisors.length <= 1} className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200 disabled:opacity-70">
                {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name} · {supervisor.zone}</option>)}
              </select>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200" />
              <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-3 text-xs font-bold text-zinc-300 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar</button>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/[.07] bg-white/[.02] p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold ${tab === id ? "bg-purple-600 text-white" : "text-zinc-500 hover:bg-white/[.04]"}`}><Icon size={15} /> {label} <span className="rounded-full bg-black/20 px-2 py-0.5 text-[9px]">{count}</span></button>
            ))}
          </div>
          <label className="flex min-w-64 items-center gap-2 rounded-xl border border-white/[.07] bg-[#111116] px-3 py-2.5"><Search size={14} className="text-zinc-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vendedor, código, ciudad..." className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-700" /></label>
        </div>

        {notice && <p className={`rounded-xl border p-3 text-xs ${notice.startsWith("ERROR") ? "border-rose-500/20 bg-rose-500/[.07] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300"}`}>{notice}</p>}

        {loading ? (
          <section className="grid min-h-72 place-items-center rounded-2xl border border-white/[.07] bg-white/[.025] text-xs text-zinc-500"><span className="flex items-center gap-3"><Loader2 className="animate-spin" /> Cargando registros autorizados...</span></section>
        ) : tab === "sellers" ? (
          <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Vendedor</th><th>Supervisor</th><th>Ingreso</th><th>Fin de prueba</th><th>Condición</th><th>Estado</th><th className="pr-5 text-right">Acciones</th></tr></thead><tbody>
              {visibleSellers.map((seller) => {
                const supervisor = profiles.find((item) => item.id === seller.supervisor_profile_id);
                return <tr key={seller.id} className="border-t border-white/[.05]"><td className="px-5 py-3"><p className="font-bold text-zinc-200">{seller.full_name}</p><p className="mt-1 text-[10px] text-zinc-600">{seller.seller_code || "Sin código"}</p></td><td>{supervisor?.name || "—"}</td><td>{formatDate(seller.hire_date)}</td><td>{formatDate(seller.probation_end_date)}</td><td className={seller.is_on_probation ? "text-cyan-300" : "text-emerald-300"}>{seller.is_on_probation ? "EN PRUEBA" : "PERMANENTE"}</td><td>{seller.effective_status.replace("_", " ").toUpperCase()}</td><td className="pr-5 text-right"><div className="flex justify-end gap-2"><button onClick={() => setSellerDraft({ id: seller.id, supervisorId: seller.supervisor_profile_id, name: seller.full_name, code: seller.seller_code || "", hireDate: seller.hire_date, probationDays: seller.probation_days, reason: "" })} className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-300"><PencilLine size={13} /> Editar</button><button disabled={saving} onClick={() => void changeSellerStatus(seller)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black ${seller.effective_status === "activo" ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>{seller.effective_status === "activo" ? <UserMinus size={13} /> : <RotateCcw size={13} />}{seller.effective_status === "activo" ? "Retirar" : "Reactivar"}</button></div></td></tr>;
              })}
              {!visibleSellers.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-zinc-600">No hay vendedores para este filtro.</td></tr>}
            </tbody></table></div>
          </section>
        ) : tab === "posted" ? (
          <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
            <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Vendedor</th><th>Fecha</th><th>Cantidad</th><th>Monto</th><th>Ciudad</th><th>Servicio / paquete</th><th>Origen</th><th>Control</th><th className="pr-5 text-right">Acción</th></tr></thead><tbody>
              {visiblePosted.map((sale) => <tr key={sale.id} className="border-t border-white/[.05]"><td className="px-5 py-3"><p className="font-bold text-zinc-200">{sale.seller_name}</p><p className="mt-1 text-[10px] text-zinc-600">{sale.seller_code || `Registro #${sale.id}`}</p></td><td>{formatDate(sale.sale_date)}</td><td className="text-base font-black text-emerald-300">{units(sale.sale_units)}</td><td>{money(sale.amount_billed)}</td><td>{sale.city || "—"}</td><td><p>{sale.service || "—"}</p><p className="mt-1 text-[10px] text-zinc-600">{sale.contract_service || "Sin paquete"}</p></td><td>{sale.source_type === "manual" ? "MANUAL" : "ARCHIVO"}</td><td>{sale.manual_override ? <span className="text-purple-300">CORRECCIÓN PROTEGIDA</span> : <span className="text-zinc-600">ORIGINAL</span>}{sale.correction_reason && <p className="mt-1 max-w-48 truncate text-[9px] text-zinc-600" title={sale.correction_reason}>{sale.correction_reason}</p>}</td><td className="pr-5 text-right"><button onClick={() => setPostedDraft({ id: sale.id, sellerId: sale.seller_id || sellers[0]?.id || "", date: sale.sale_date, units: units(sale.sale_units), amount: sale.amount_billed == null ? "" : String(sale.amount_billed), city: sale.city || "", service: sale.service || "", packageName: sale.contract_service || "", saleType: sale.sale_type || "", medium: sale.medium || "", reason: "" })} className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-300"><PencilLine size={13} /> Editar venta</button></td></tr>)}
              {!visiblePosted.length && <tr><td colSpan={9} className="px-5 py-10 text-center text-zinc-600">No hay ventas posteadas en este período.</td></tr>}
            </tbody></table></div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
            <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Vendedor</th><th>Anunciada</th><th>Esperada</th><th>Cantidad</th><th>Monto</th><th>Ciudad</th><th>Estado</th><th>Control</th><th className="pr-5 text-right">Acción</th></tr></thead><tbody>
              {visibleAnnounced.map((sale) => <tr key={sale.id} className="border-t border-white/[.05]"><td className="px-5 py-3"><p className="font-bold text-zinc-200">{sale.seller_name}</p><p className="mt-1 text-[10px] text-zinc-600">{sale.seller_code || `Registro #${sale.id}`}</p></td><td>{formatDate(sale.announced_at)}</td><td>{formatDate(sale.expected_post_date)}</td><td className="text-base font-black text-amber-300">{units(sale.sale_units)}</td><td>{money(sale.amount_announced)}</td><td>{sale.city || "—"}</td><td>{sale.status.toUpperCase()}</td><td>{sale.manual_override ? <span className="text-purple-300">CORRECCIÓN PROTEGIDA</span> : <span className="text-zinc-600">ORIGINAL</span>}{sale.correction_reason && <p className="mt-1 max-w-48 truncate text-[9px] text-zinc-600" title={sale.correction_reason}>{sale.correction_reason}</p>}</td><td className="pr-5 text-right"><button onClick={() => setAnnouncedDraft({ id: sale.id, sellerId: sale.seller_id || sellers[0]?.id || "", date: dateOnly(sale.announced_at), expectedDate: dateOnly(sale.expected_post_date), units: units(sale.sale_units), amount: sale.amount_announced == null ? "" : String(sale.amount_announced), city: sale.city || "", service: sale.service || "", packageName: sale.contract_service || "", notes: sale.notes || "", status: sale.status, reason: "" })} className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-300"><PencilLine size={13} /> Editar venta</button></td></tr>)}
              {!visibleAnnounced.length && <tr><td colSpan={9} className="px-5 py-10 text-center text-zinc-600">No hay ventas anunciadas en este período.</td></tr>}
            </tbody></table></div>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-[10px] leading-5 text-zinc-500"><CalendarDays size={15} className="mb-2 text-cyan-300" /><b className="text-zinc-300">Mes editable:</b> cambia el período para corregir información histórica.</div>
          <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-[10px] leading-5 text-zinc-500"><Check size={15} className="mb-2 text-emerald-300" /><b className="text-zinc-300">Sin pérdida:</b> editar no borra reportes ni rompe el vínculo del vendedor.</div>
          <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-[10px] leading-5 text-zinc-500"><ShieldCheck size={15} className="mb-2 text-purple-300" /><b className="text-zinc-300">Auditoría:</b> toda corrección conserva antes, después, responsable y motivo.</div>
        </section>
      </main>

      {sellerDraft && <SellerEditor draft={sellerDraft} setDraft={setSellerDraft} supervisors={supervisors} saving={saving} onClose={() => setSellerDraft(null)} onSave={() => void saveSellerCorrection()} />}
      {postedDraft && <PostedEditor draft={postedDraft} setDraft={setPostedDraft} sellers={sellers} saving={saving} onClose={() => setPostedDraft(null)} onSave={() => void savePostedCorrection()} />}
      {announcedDraft && <AnnouncedEditor draft={announcedDraft} setDraft={setAnnouncedDraft} sellers={sellers} saving={saving} onClose={() => setAnnouncedDraft(null)} onSave={() => void saveAnnouncedCorrection()} />}
    </div>
  );
}
