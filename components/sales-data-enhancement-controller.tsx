"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Check,
  CircleDollarSign,
  Loader2,
  Megaphone,
  PencilLine,
  RefreshCw,
  Save,
  Target,
  UserCog,
  Users,
  X,
} from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import {
  analyticsProfileColumns,
  mapAnalyticsProfile,
  type AnalyticsProfileRow,
} from "@/lib/analytics-profile";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

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
};

type Goal = {
  id: string;
  seller_id: string;
  supervisor_profile_id: string;
  goal_month: string;
  goal_units: number;
  correction_reason: string;
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
};

type Tab = "goals" | "sellers" | "posted" | "announced";

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

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function units(value: number | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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

function supervisorOptions(profile: Profile, profiles: Profile[]) {
  const active = profiles.filter(
    (candidate) => candidate.active && candidate.role === "Supervisor",
  );
  if (profile.role === "Administrador") return active;
  if (profile.role === "Líder de departamento") {
    return active.filter((candidate) => candidate.managerId === profile.id);
  }
  if (profile.role === "Supervisor") return [profile];
  return [];
}

function parentRefresh() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === "Actualizar",
  );
  button?.click();
  window.dispatchEvent(new CustomEvent("cc-analytics-data-changed"));
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[.07] bg-white/[.025] ${className}`}>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`text-[10px] font-black uppercase tracking-wider text-zinc-600 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white outline-none focus:border-purple-400/40";

export function SalesDataEnhancementController() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sellerDirectory, setSellerDirectory] = useState<Seller[]>([]);
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("goals");
  const [supervisorId, setSupervisorId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [posted, setPosted] = useState<PostedSale[]>([]);
  const [announced, setAnnounced] = useState<AnnouncedSale[]>([]);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, number>>({});
  const [goalReason, setGoalReason] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [sellerDraft, setSellerDraft] = useState<SellerDraft | null>(null);
  const [postedDraft, setPostedDraft] = useState<PostedDraft | null>(null);
  const [announcedDraft, setAnnouncedDraft] = useState<AnnouncedDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;

    async function loadProfile() {
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) {
        setProfile(null);
        setProfiles([]);
        return;
      }

      const [{ data: current }, { data: directory }] = await Promise.all([
        supabase
          .from("analytics_profiles")
          .select(analyticsProfileColumns)
          .eq("id", data.session.user.id)
          .maybeSingle(),
        supabase
          .from("analytics_profiles")
          .select(analyticsProfileColumns)
          .order("full_name"),
      ]);

      if (!active || !current) return;
      try {
        const mapped = mapAnalyticsProfile(current as AnalyticsProfileRow);
        const mappedDirectory = (directory || []).flatMap((row) => {
          try {
            return [mapAnalyticsProfile(row as AnalyticsProfileRow)];
          } catch {
            return [];
          }
        });
        setProfile(mapped);
        setProfiles(
          mappedDirectory.some((item) => item.id === mapped.id)
            ? mappedDirectory
            : [mapped, ...mappedDirectory],
        );
      } catch {
        setProfile(null);
      }
    }

    void loadProfile();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void loadProfile());

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const supervisors = useMemo(
    () => (profile ? supervisorOptions(profile, profiles) : []),
    [profile, profiles],
  );

  useEffect(() => {
    if (!supervisorId && supervisors[0]) setSupervisorId(supervisors[0].id);
  }, [supervisorId, supervisors]);

  const loadSellerDirectory = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("analytics_seller_report")
      .select(
        "id,department,zone,supervisor_profile_id,seller_code,full_name,hire_date,probation_days,probation_end_date,is_on_probation,effective_status",
      )
      .order("full_name");
    setSellerDirectory((data || []) as Seller[]);
  }, [profile]);

  useEffect(() => {
    void loadSellerDirectory();
  }, [loadSellerDirectory]);

  useEffect(() => {
    if (!profile || !["Administrador", "Líder de departamento", "Supervisor"].includes(profile.role)) {
      return;
    }

    let observer: MutationObserver | null = null;
    let disposed = false;

    const removeInjected = () => {
      document
        .querySelectorAll<HTMLElement>("[data-cc-inline-edit='true']")
        .forEach((node) => node.remove());
    };

    const sync = () => {
      if (disposed) return;
      const header = Array.from(document.querySelectorAll<HTMLElement>("header")).find(
        (candidate) => candidate.querySelector("h1")?.textContent?.trim() === "Ingreso de ventas",
      );

      if (!header) {
        setHeaderHost(null);
        removeInjected();
        return;
      }

      let host = header.querySelector<HTMLElement>("#cc-sales-enhancement-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "cc-sales-enhancement-host";
        host.className = "ml-auto mr-2 flex items-center";
        header.insertBefore(host, header.lastElementChild);
      }
      setHeaderHost((current) => (current === host ? current : host));

      const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr"));
      rows.forEach((row) => {
        const actionButton = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
          const text = button.textContent?.trim();
          return text === "Retirar" || text === "Reactivar";
        });
        if (!actionButton) return;
        const actionCell = actionButton.closest("td");
        if (!actionCell || actionCell.querySelector("[data-cc-inline-edit='true']")) return;

        const firstCell = row.querySelector("td");
        const paragraphs = firstCell ? Array.from(firstCell.querySelectorAll("p")) : [];
        const name = paragraphs[0]?.textContent?.trim() || firstCell?.textContent?.trim() || "";
        const codeText = paragraphs[1]?.textContent?.trim() || "";
        const candidates = sellerDirectory.filter(
          (seller) => normalize(seller.full_name) === normalize(name),
        );
        const seller =
          candidates.find(
            (candidate) =>
              candidate.seller_code &&
              codeText &&
              !codeText.toLowerCase().includes("sin código") &&
              normalize(candidate.seller_code) === normalize(codeText),
          ) || candidates[0];
        if (!seller) return;

        const edit = document.createElement("button");
        edit.type = "button";
        edit.dataset.ccInlineEdit = "true";
        edit.className =
          "mr-2 inline-flex items-center gap-1 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-300";
        edit.textContent = "Editar";
        edit.addEventListener("click", () => {
          setSellerDraft({
            id: seller.id,
            supervisorId: seller.supervisor_profile_id,
            name: seller.full_name,
            code: seller.seller_code || "",
            hireDate: seller.hire_date,
            probationDays: seller.probation_days,
            reason: "",
          });
          setSupervisorId(seller.supervisor_profile_id);
          setTab("sellers");
          setOpen(true);
        });
        actionCell.insertBefore(edit, actionButton);
      });
    };

    sync();
    observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", sync, true);

    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener("click", sync, true);
      document.getElementById("cc-sales-enhancement-host")?.remove();
      removeInjected();
    };
  }, [profile, sellerDirectory]);

  const loadData = useCallback(async () => {
    if (!open || !supervisorId) return;
    setLoading(true);
    setNotice("");
    const { start, end } = monthBounds(month);

    const [sellerResult, goalResult, postedResult, announcedResult] = await Promise.all([
      supabase
        .from("analytics_seller_report")
        .select(
          "id,department,zone,supervisor_profile_id,seller_code,full_name,hire_date,probation_days,probation_end_date,is_on_probation,effective_status",
        )
        .eq("supervisor_profile_id", supervisorId)
        .order("full_name"),
      supabase
        .from("analytics_seller_goals")
        .select(
          "id,seller_id,supervisor_profile_id,goal_month,goal_units,correction_reason",
        )
        .eq("supervisor_profile_id", supervisorId)
        .eq("goal_month", start),
      supabase
        .from("analytics_sales")
        .select(
          "id,seller_id,seller_name,seller_code,supervisor_profile_id,sale_date,sale_units,amount_billed,city,service,contract_service,sale_type,medium,source_type,manual_override,correction_reason",
        )
        .eq("supervisor_profile_id", supervisorId)
        .gte("sale_date", start)
        .lt("sale_date", end)
        .order("sale_date", { ascending: false })
        .limit(10000),
      supabase
        .from("analytics_announced_sales")
        .select(
          "id,seller_id,seller_name,seller_code,supervisor_profile_id,announced_at,expected_post_date,sale_units,amount_announced,city,service,contract_service,notes,status,manual_override,correction_reason",
        )
        .eq("supervisor_profile_id", supervisorId)
        .gte("announced_at", `${start}T00:00:00`)
        .lt("announced_at", `${end}T00:00:00`)
        .order("announced_at", { ascending: false })
        .limit(10000),
    ]);

    const error =
      sellerResult.error || goalResult.error || postedResult.error || announcedResult.error;
    if (error) {
      setNotice(`ERROR: ${error.message}`);
      setLoading(false);
      return;
    }

    const sellerRows = (sellerResult.data || []) as Seller[];
    const goalRows = (goalResult.data || []) as Goal[];
    setSellers(sellerRows);
    setGoals(goalRows);
    setPosted((postedResult.data || []) as PostedSale[]);
    setAnnounced((announcedResult.data || []) as AnnouncedSale[]);
    setGoalDrafts(
      Object.fromEntries(
        sellerRows.map((seller) => [
          seller.id,
          Number(goalRows.find((goal) => goal.seller_id === seller.id)?.goal_units || 0),
        ]),
      ),
    );
    setLoading(false);
  }, [month, open, supervisorId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const goalMap = useMemo(
    () => new Map(goals.map((goal) => [goal.seller_id, Number(goal.goal_units)])),
    [goals],
  );

  const supervisorGoal = useMemo(
    () => sellers.reduce((sum, seller) => sum + Number(goalDrafts[seller.id] || 0), 0),
    [goalDrafts, sellers],
  );
  const postedUnits = useMemo(
    () => posted.reduce((sum, sale) => sum + units(sale.sale_units), 0),
    [posted],
  );
  const compliance = supervisorGoal ? (postedUnits / supervisorGoal) * 100 : 0;

  async function saveGoals() {
    const changed = sellers.filter(
      (seller) => Number(goalDrafts[seller.id] || 0) !== Number(goalMap.get(seller.id) || 0),
    );
    if (!changed.length) {
      setNotice("No hay cambios de meta pendientes.");
      return;
    }
    if (goalReason.trim().length < 5) {
      setNotice("ERROR: Escribe un motivo de al menos 5 caracteres.");
      return;
    }

    setSaving(true);
    setNotice("");
    for (const seller of changed) {
      const { error } = await supabase.rpc("analytics_set_seller_goal", {
        target_seller_id: seller.id,
        target_month: `${month}-01`,
        target_goal_units: Number(goalDrafts[seller.id] || 0),
        target_reason: goalReason.trim(),
      });
      if (error) {
        setNotice(`ERROR: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setGoalReason("");
    setNotice(
      `Metas guardadas. La meta automática del supervisor es ${supervisorGoal.toLocaleString("es-HN")} ventas.`,
    );
    await loadData();
    parentRefresh();
    setSaving(false);
  }

  async function saveSeller() {
    if (!sellerDraft) return;
    if (sellerDraft.reason.trim().length < 5) {
      setNotice("ERROR: Escribe un motivo de corrección de al menos 5 caracteres.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("analytics_correct_seller", {
      target_id: sellerDraft.id,
      target_supervisor_id: sellerDraft.supervisorId,
      target_full_name: sellerDraft.name,
      target_seller_code: sellerDraft.code || null,
      target_hire_date: sellerDraft.hireDate,
      target_probation_days: sellerDraft.probationDays,
      target_reason: sellerDraft.reason.trim(),
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice("Información del vendedor corregida y auditada.");
      setSellerDraft(null);
      await Promise.all([loadData(), loadSellerDirectory()]);
      parentRefresh();
    }
    setSaving(false);
  }

  async function savePosted() {
    if (!postedDraft) return;
    if (!postedDraft.sellerId) {
      setNotice("ERROR: Selecciona un vendedor.");
      return;
    }
    if (postedDraft.reason.trim().length < 5) {
      setNotice("ERROR: Escribe un motivo de corrección de al menos 5 caracteres.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("analytics_correct_posted_sale", {
      target_id: postedDraft.id,
      target_seller_id: postedDraft.sellerId,
      target_sale_date: postedDraft.date,
      target_sale_units: postedDraft.units,
      target_amount_billed: postedDraft.amount ? Number(postedDraft.amount) : null,
      target_city: postedDraft.city || null,
      target_service: postedDraft.service || null,
      target_contract_service: postedDraft.packageName || null,
      target_sale_type: postedDraft.saleType || null,
      target_medium: postedDraft.medium || null,
      target_reason: postedDraft.reason.trim(),
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice("Venta posteada corregida y protegida contra sustituciones automáticas.");
      setPostedDraft(null);
      await loadData();
      parentRefresh();
    }
    setSaving(false);
  }

  async function saveAnnounced() {
    if (!announcedDraft) return;
    if (!announcedDraft.sellerId) {
      setNotice("ERROR: Selecciona un vendedor.");
      return;
    }
    if (announcedDraft.reason.trim().length < 5) {
      setNotice("ERROR: Escribe un motivo de corrección de al menos 5 caracteres.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("analytics_correct_announced_sale", {
      target_id: announcedDraft.id,
      target_seller_id: announcedDraft.sellerId,
      target_announced_date: announcedDraft.date,
      target_expected_post_date: announcedDraft.expectedDate || null,
      target_sale_units: announcedDraft.units,
      target_amount_announced: announcedDraft.amount ? Number(announcedDraft.amount) : null,
      target_city: announcedDraft.city || null,
      target_service: announcedDraft.service || null,
      target_contract_service: announcedDraft.packageName || null,
      target_notes: announcedDraft.notes || null,
      target_status: announcedDraft.status,
      target_reason: announcedDraft.reason.trim(),
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice("Venta anunciada corregida y auditada.");
      setAnnouncedDraft(null);
      await loadData();
      parentRefresh();
    }
    setSaving(false);
  }

  const filteredPosted = useMemo(
    () => posted.filter((sale) => !sellerFilter || sale.seller_id === sellerFilter),
    [posted, sellerFilter],
  );
  const filteredAnnounced = useMemo(
    () => announced.filter((sale) => !sellerFilter || sale.seller_id === sellerFilter),
    [announced, sellerFilter],
  );

  if (!profile || !["Administrador", "Líder de departamento", "Supervisor"].includes(profile.role)) {
    return null;
  }

  return (
    <>
      {headerHost &&
        createPortal(
          <button
            type="button"
            onClick={() => {
              setTab("goals");
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-purple-400/20 bg-purple-500/10 px-4 py-2.5 text-xs font-black text-purple-200"
          >
            <PencilLine size={15} /> Editar y metas
          </button>,
          headerHost,
        )}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[140] overflow-y-auto bg-[#07070a] text-white">
            <header className="sticky top-0 z-30 flex min-h-[74px] items-center justify-between border-b border-white/[.07] bg-[#09090d]/95 px-4 backdrop-blur-xl sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-purple-300">
                  Corrección controlada · metas y ventas
                </p>
                <h1 className="mt-1 text-lg font-black">Editar información comercial</h1>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-zinc-400 hover:text-white"
              >
                <X size={19} />
              </button>
            </header>

            <main className="mx-auto max-w-[1800px] space-y-4 p-4 sm:p-6">
              <Card className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["goals", "Metas", Target],
                      ["sellers", "Vendedores", UserCog],
                      ["posted", "Ventas posteadas", BarChart3],
                      ["announced", "Ventas anunciadas", Megaphone],
                    ] as const).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-black ${
                          tab === id
                            ? "bg-purple-600 text-white"
                            : "bg-white/[.03] text-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        <Icon size={15} /> {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={supervisorId}
                      onChange={(event) => setSupervisorId(event.target.value)}
                      disabled={profile.role === "Supervisor" || supervisors.length <= 1}
                      className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200 disabled:opacity-60"
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
                      type="button"
                      onClick={() => void loadData()}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-3 text-xs font-bold text-zinc-300 disabled:opacity-50"
                    >
                      <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar
                    </button>
                  </div>
                </div>
              </Card>

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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Meta del supervisor</p>
                  <p className="mt-2 text-2xl font-black text-purple-300">{supervisorGoal}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">Suma automática de las metas individuales</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Ventas posteadas</p>
                  <p className="mt-2 text-2xl font-black text-emerald-300">{postedUnits}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Cumplimiento</p>
                  <p className="mt-2 text-2xl font-black text-cyan-300">{compliance.toFixed(1)}%</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Vendedores del equipo</p>
                  <p className="mt-2 text-2xl font-black">{sellers.length}</p>
                </Card>
              </div>

              {loading ? (
                <Card className="grid min-h-64 place-items-center p-8 text-zinc-500">
                  <span className="inline-flex items-center gap-3 text-xs">
                    <Loader2 className="animate-spin" /> Cargando información...
                  </span>
                </Card>
              ) : (
                <>
                  {tab === "goals" && (
                    <Card className="overflow-hidden">
                      <div className="border-b border-white/[.06] p-5">
                        <h2 className="font-black">Meta manual por vendedor</h2>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          La meta del supervisor se actualiza automáticamente con la suma del equipo.
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-left text-xs">
                          <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
                            <tr>
                              <th className="px-5 py-3">Vendedor</th>
                              <th>Estado</th>
                              <th>Meta actual</th>
                              <th>Meta nueva</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sellers.map((seller) => (
                              <tr key={seller.id} className="border-t border-white/[.05]">
                                <td className="px-5 py-3">
                                  <p className="font-bold text-zinc-200">{seller.full_name}</p>
                                  <p className="mt-1 text-[10px] text-zinc-600">{seller.seller_code || "Sin código"}</p>
                                </td>
                                <td>{seller.effective_status.replace("_", " ").toUpperCase()}</td>
                                <td className="text-purple-300">{goalMap.get(seller.id) || 0}</td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100000}
                                    value={goalDrafts[seller.id] ?? 0}
                                    onChange={(event) =>
                                      setGoalDrafts((current) => ({
                                        ...current,
                                        [seller.id]: Number(event.target.value),
                                      }))
                                    }
                                    className="w-32 rounded-lg border border-white/[.08] bg-[#111116] px-3 py-2 text-xs"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="grid gap-3 border-t border-white/[.06] p-5 md:grid-cols-[1fr_auto] md:items-end">
                        <Field label="Motivo de asignación o cambio">
                          <input
                            value={goalReason}
                            onChange={(event) => setGoalReason(event.target.value)}
                            placeholder="Ej.: Meta mensual acordada con el supervisor"
                            className={inputClass}
                          />
                        </Field>
                        <button
                          type="button"
                          onClick={() => void saveGoals()}
                          disabled={saving}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black disabled:opacity-50"
                        >
                          <Save size={15} /> Guardar metas
                        </button>
                      </div>
                    </Card>
                  )}

                  {tab === "sellers" && (
                    <Card className="overflow-hidden">
                      <div className="border-b border-white/[.06] p-5">
                        <h2 className="font-black">Información editable de vendedores</h2>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          Nombre, código, ingreso, período de prueba y supervisor pueden corregirse sin perder historial.
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-xs">
                          <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
                            <tr>
                              <th className="px-5 py-3">Vendedor</th>
                              <th>Ingreso</th>
                              <th>Fin de prueba</th>
                              <th>Estado</th>
                              <th className="pr-5 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sellers.map((seller) => (
                              <tr key={seller.id} className="border-t border-white/[.05]">
                                <td className="px-5 py-3">
                                  <p className="font-bold text-zinc-200">{seller.full_name}</p>
                                  <p className="mt-1 text-[10px] text-zinc-600">{seller.seller_code || "Sin código"}</p>
                                </td>
                                <td>{dateOnly(seller.hire_date)}</td>
                                <td>{dateOnly(seller.probation_end_date)}</td>
                                <td>{seller.is_on_probation ? "EN PRUEBA" : seller.effective_status.toUpperCase()}</td>
                                <td className="pr-5 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSellerDraft({
                                        id: seller.id,
                                        supervisorId: seller.supervisor_profile_id,
                                        name: seller.full_name,
                                        code: seller.seller_code || "",
                                        hireDate: seller.hire_date,
                                        probationDays: seller.probation_days,
                                        reason: "",
                                      })
                                    }
                                    className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-300"
                                  >
                                    <PencilLine size={13} /> Editar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {(tab === "posted" || tab === "announced") && (
                    <Card className="p-4">
                      <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                        Filtrar por vendedor
                        <select
                          value={sellerFilter}
                          onChange={(event) => setSellerFilter(event.target.value)}
                          className="ml-3 rounded-xl border border-white/[.08] bg-[#111116] px-4 py-2.5 text-xs text-white"
                        >
                          <option value="">Todos los vendedores</option>
                          {sellers.map((seller) => (
                            <option key={seller.id} value={seller.id}>{seller.full_name}</option>
                          ))}
                        </select>
                      </label>
                    </Card>
                  )}

                  {tab === "posted" && (
                    <Card className="overflow-hidden">
                      <div className="border-b border-white/[.06] p-5">
                        <h2 className="font-black">Ventas posteadas editables</h2>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          Cada corrección queda protegida para que una nueva carga de Excel no la borre.
                        </p>
                      </div>
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
                            {filteredPosted.map((sale) => (
                              <tr key={sale.id} className="border-t border-white/[.05]">
                                <td className="px-5 py-3 font-bold text-zinc-200">{sale.seller_name}</td>
                                <td>{dateOnly(sale.sale_date)}</td>
                                <td className="font-black text-emerald-300">{units(sale.sale_units)}</td>
                                <td>{money(sale.amount_billed)}</td>
                                <td>{sale.city || "—"}</td>
                                <td>{sale.service || "—"} · {sale.contract_service || "—"}</td>
                                <td>
                                  {sale.manual_override ? (
                                    <span className="text-purple-300">CORRECCIÓN PROTEGIDA</span>
                                  ) : (
                                    <span className="text-zinc-600">{sale.source_type || "importada"}</span>
                                  )}
                                </td>
                                <td className="pr-5 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPostedDraft({
                                        id: sale.id,
                                        sellerId: sale.seller_id || sellers[0]?.id || "",
                                        date: sale.sale_date,
                                        units: units(sale.sale_units),
                                        amount: sale.amount_billed == null ? "" : String(sale.amount_billed),
                                        city: sale.city || "",
                                        service: sale.service || "",
                                        packageName: sale.contract_service || "",
                                        saleType: sale.sale_type || "",
                                        medium: sale.medium || "",
                                        reason: "",
                                      })
                                    }
                                    className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-300"
                                  >
                                    <PencilLine size={13} /> Editar
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {!filteredPosted.length && (
                              <tr><td colSpan={8} className="px-5 py-8 text-center text-zinc-600">No hay ventas posteadas para este filtro.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {tab === "announced" && (
                    <Card className="overflow-hidden">
                      <div className="border-b border-white/[.06] p-5">
                        <h2 className="font-black">Ventas anunciadas editables</h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1050px] text-left text-xs">
                          <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
                            <tr>
                              <th className="px-5 py-3">Vendedor</th>
                              <th>Fecha</th>
                              <th>Cantidad</th>
                              <th>Monto</th>
                              <th>Estado</th>
                              <th>Servicio / paquete</th>
                              <th className="pr-5 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAnnounced.map((sale) => (
                              <tr key={sale.id} className="border-t border-white/[.05]">
                                <td className="px-5 py-3 font-bold text-zinc-200">{sale.seller_name}</td>
                                <td>{dateOnly(sale.announced_at)}</td>
                                <td className="font-black text-amber-300">{units(sale.sale_units)}</td>
                                <td>{money(sale.amount_announced)}</td>
                                <td>{sale.status.toUpperCase()}</td>
                                <td>{sale.service || "—"} · {sale.contract_service || "—"}</td>
                                <td className="pr-5 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAnnouncedDraft({
                                        id: sale.id,
                                        sellerId: sale.seller_id || sellers[0]?.id || "",
                                        date: dateOnly(sale.announced_at),
                                        expectedDate: dateOnly(sale.expected_post_date),
                                        units: units(sale.sale_units),
                                        amount: sale.amount_announced == null ? "" : String(sale.amount_announced),
                                        city: sale.city || "",
                                        service: sale.service || "",
                                        packageName: sale.contract_service || "",
                                        notes: sale.notes || "",
                                        status: sale.status,
                                        reason: "",
                                      })
                                    }
                                    className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-300"
                                  >
                                    <PencilLine size={13} /> Editar
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {!filteredAnnounced.length && (
                              <tr><td colSpan={7} className="px-5 py-8 text-center text-zinc-600">No hay ventas anunciadas para este filtro.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </main>
          </div>,
          document.body,
        )}

      {sellerDraft &&
        createPortal(
          <div className="fixed inset-0 z-[160] grid place-items-center bg-black/80 p-4 text-white">
            <Card className="w-full max-w-2xl p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Editar vendedor</h2>
                <button type="button" onClick={() => setSellerDraft(null)}><X size={18} /></button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Nombre completo" wide>
                  <input value={sellerDraft.name} onChange={(event) => setSellerDraft({ ...sellerDraft, name: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Código">
                  <input value={sellerDraft.code} onChange={(event) => setSellerDraft({ ...sellerDraft, code: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Supervisor">
                  <select value={sellerDraft.supervisorId} onChange={(event) => setSellerDraft({ ...sellerDraft, supervisorId: event.target.value })} className={inputClass}>
                    {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}
                  </select>
                </Field>
                <Field label="Fecha de ingreso">
                  <input type="date" value={sellerDraft.hireDate} onChange={(event) => setSellerDraft({ ...sellerDraft, hireDate: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Días de prueba">
                  <input type="number" min={0} max={365} value={sellerDraft.probationDays} onChange={(event) => setSellerDraft({ ...sellerDraft, probationDays: Number(event.target.value) })} className={inputClass} />
                </Field>
                <Field label="Motivo de corrección" wide>
                  <textarea value={sellerDraft.reason} onChange={(event) => setSellerDraft({ ...sellerDraft, reason: event.target.value })} className={`${inputClass} min-h-24`} />
                </Field>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setSellerDraft(null)} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Cancelar</button>
                <button type="button" onClick={() => void saveSeller()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black disabled:opacity-50"><Save size={15} /> Guardar corrección</button>
              </div>
            </Card>
          </div>,
          document.body,
        )}

      {postedDraft &&
        createPortal(
          <div className="fixed inset-0 z-[160] grid place-items-center overflow-y-auto bg-black/80 p-4 text-white">
            <Card className="w-full max-w-3xl p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Editar venta posteada</h2>
                <button type="button" onClick={() => setPostedDraft(null)}><X size={18} /></button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Vendedor" wide>
                  <select value={postedDraft.sellerId} onChange={(event) => setPostedDraft({ ...postedDraft, sellerId: event.target.value })} className={inputClass}>
                    {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Fecha"><input type="date" value={postedDraft.date} onChange={(event) => setPostedDraft({ ...postedDraft, date: event.target.value })} className={inputClass} /></Field>
                <Field label="Cantidad"><input type="number" min={1} value={postedDraft.units} onChange={(event) => setPostedDraft({ ...postedDraft, units: Number(event.target.value) })} className={inputClass} /></Field>
                <Field label="Monto"><input type="number" min={0} step="0.01" value={postedDraft.amount} onChange={(event) => setPostedDraft({ ...postedDraft, amount: event.target.value })} className={inputClass} /></Field>
                <Field label="Ciudad"><input value={postedDraft.city} onChange={(event) => setPostedDraft({ ...postedDraft, city: event.target.value })} className={inputClass} /></Field>
                <Field label="Servicio"><input value={postedDraft.service} onChange={(event) => setPostedDraft({ ...postedDraft, service: event.target.value })} className={inputClass} /></Field>
                <Field label="Paquete"><input value={postedDraft.packageName} onChange={(event) => setPostedDraft({ ...postedDraft, packageName: event.target.value })} className={inputClass} /></Field>
                <Field label="Tipo de venta"><input value={postedDraft.saleType} onChange={(event) => setPostedDraft({ ...postedDraft, saleType: event.target.value })} className={inputClass} /></Field>
                <Field label="Canal / medio"><input value={postedDraft.medium} onChange={(event) => setPostedDraft({ ...postedDraft, medium: event.target.value })} className={inputClass} /></Field>
                <Field label="Motivo de corrección" wide><textarea value={postedDraft.reason} onChange={(event) => setPostedDraft({ ...postedDraft, reason: event.target.value })} className={`${inputClass} min-h-24`} /></Field>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setPostedDraft(null)} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Cancelar</button>
                <button type="button" onClick={() => void savePosted()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black disabled:opacity-50"><Check size={15} /> Guardar venta</button>
              </div>
            </Card>
          </div>,
          document.body,
        )}

      {announcedDraft &&
        createPortal(
          <div className="fixed inset-0 z-[160] grid place-items-center overflow-y-auto bg-black/80 p-4 text-white">
            <Card className="w-full max-w-3xl p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Editar venta anunciada</h2>
                <button type="button" onClick={() => setAnnouncedDraft(null)}><X size={18} /></button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Vendedor" wide>
                  <select value={announcedDraft.sellerId} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, sellerId: event.target.value })} className={inputClass}>
                    {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Fecha anunciada"><input type="date" value={announcedDraft.date} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, date: event.target.value })} className={inputClass} /></Field>
                <Field label="Fecha esperada de posteo"><input type="date" value={announcedDraft.expectedDate} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, expectedDate: event.target.value })} className={inputClass} /></Field>
                <Field label="Cantidad"><input type="number" min={1} value={announcedDraft.units} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, units: Number(event.target.value) })} className={inputClass} /></Field>
                <Field label="Monto"><input type="number" min={0} step="0.01" value={announcedDraft.amount} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, amount: event.target.value })} className={inputClass} /></Field>
                <Field label="Ciudad"><input value={announcedDraft.city} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, city: event.target.value })} className={inputClass} /></Field>
                <Field label="Servicio"><input value={announcedDraft.service} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, service: event.target.value })} className={inputClass} /></Field>
                <Field label="Paquete"><input value={announcedDraft.packageName} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, packageName: event.target.value })} className={inputClass} /></Field>
                <Field label="Estado"><select value={announcedDraft.status} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, status: event.target.value as AnnouncedSale["status"] })} className={inputClass}><option value="anunciada">Anunciada</option><option value="posteada">Posteada</option><option value="cancelada">Cancelada</option></select></Field>
                <Field label="Observación" wide><textarea value={announcedDraft.notes} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, notes: event.target.value })} className={`${inputClass} min-h-20`} /></Field>
                <Field label="Motivo de corrección" wide><textarea value={announcedDraft.reason} onChange={(event) => setAnnouncedDraft({ ...announcedDraft, reason: event.target.value })} className={`${inputClass} min-h-24`} /></Field>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setAnnouncedDraft(null)} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-400">Cancelar</button>
                <button type="button" onClick={() => void saveAnnounced()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-xs font-black disabled:opacity-50"><Save size={15} /> Guardar venta</button>
              </div>
            </Card>
          </div>,
          document.body,
        )}
    </>
  );
}
