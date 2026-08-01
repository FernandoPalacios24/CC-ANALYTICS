"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Check,
  Clock3,
  CloudUpload,
  FileSpreadsheet,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";
import {
  analyzeSalesMatrix,
  normalizePersonName,
  type CanonicalSale,
} from "@/lib/sales-import-detection";

type SellerRecord = {
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

type SalesRecord = {
  id: number;
  seller_id: string | null;
  seller_name: string;
  supervisor_profile_id: string | null;
  sale_date: string;
  amount_billed: number | string | null;
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
  amount_announced: number | string | null;
  city: string | null;
  service: string | null;
  contract_service: string | null;
  notes: string | null;
  status: "anunciada" | "posteada" | "cancelada";
};

type ImportPreview = {
  sale: CanonicalSale;
  seller: SellerRecord | null;
};

type Tab = "team" | "import" | "manual" | "announced" | "report";
type ImportKind = "posted" | "announced";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[.07] bg-white/[.025] ${className}`}>
      {children}
    </section>
  );
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function amount(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-HN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function isSellerAvailable(seller: SellerRecord) {
  return seller.effective_status === "activo" ||
    (seller.effective_status === "salida_pendiente" &&
      (!seller.inactive_effective_date || seller.inactive_effective_date > today()));
}

function sellerProbationAt(seller: SellerRecord, date: string) {
  return date < seller.probation_end_date;
}

function supervisorOptionsFor(profile: Profile, profiles: Profile[]) {
  const active = profiles.filter((candidate) => candidate.active && candidate.role === "Supervisor");
  if (profile.role === "Administrador") return active;
  if (profile.role === "Líder de departamento") {
    return active.filter((candidate) => candidate.managerId === profile.id);
  }
  if (profile.role === "Supervisor") return [profile];
  const manager = profiles.find((candidate) => candidate.id === profile.managerId);
  return manager?.role === "Supervisor" ? [manager] : [];
}

function matchSeller(sale: CanonicalSale, sellers: SellerRecord[]) {
  const code = String(sale.sellerCode || "").trim().toLowerCase();
  if (code) {
    const byCode = sellers.find(
      (seller) => String(seller.seller_code || "").trim().toLowerCase() === code,
    );
    if (byCode) return byCode;
  }
  const name = normalizePersonName(sale.sellerName);
  return sellers.find((seller) => normalizePersonName(seller.full_name) === name) || null;
}

function chunk<T>(items: T[], size = 500) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

export function SalesDataHub({ profile, profiles }: { profile: Profile; profiles: Profile[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const supervisors = useMemo(
    () => supervisorOptionsFor(profile, profiles),
    [profile, profiles],
  );
  const [tab, setTab] = useState<Tab>("team");
  const [supervisorId, setSupervisorId] = useState(
    profile.role === "Supervisor" ? profile.id : supervisors[0]?.id || "",
  );
  const [sellers, setSellers] = useState<SellerRecord[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [announced, setAnnounced] = useState<AnnouncedSale[]>([]);
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const [sellerName, setSellerName] = useState("");
  const [sellerCode, setSellerCode] = useState("");
  const [hireDate, setHireDate] = useState(today());
  const [probationDays, setProbationDays] = useState(90);

  const [importKind, setImportKind] = useState<ImportKind>("posted");
  const [importFile, setImportFile] = useState("");
  const [importRows, setImportRows] = useState<CanonicalSale[]>([]);
  const [importSheet, setImportSheet] = useState("");
  const [importConfidence, setImportConfidence] = useState(0);

  const [manualSellerId, setManualSellerId] = useState("");
  const [manualDate, setManualDate] = useState(today());
  const [manualAmount, setManualAmount] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualService, setManualService] = useState("");
  const [manualPackage, setManualPackage] = useState("");
  const [manualSaleType, setManualSaleType] = useState("");
  const [manualPrimary, setManualPrimary] = useState(true);

  const [announcedSellerId, setAnnouncedSellerId] = useState("");
  const [announcedAmount, setAnnouncedAmount] = useState("");
  const [announcedExpected, setAnnouncedExpected] = useState("");
  const [announcedCity, setAnnouncedCity] = useState("");
  const [announcedService, setAnnouncedService] = useState("");
  const [announcedPackage, setAnnouncedPackage] = useState("");
  const [announcedNotes, setAnnouncedNotes] = useState("");

  useEffect(() => {
    if (!supervisorId && supervisors[0]?.id) setSupervisorId(supervisors[0].id);
  }, [supervisorId, supervisors]);

  const selectedSupervisor = supervisors.find((item) => item.id === supervisorId) || null;
  const selectedSellers = useMemo(
    () => sellers.filter((seller) => !supervisorId || seller.supervisor_profile_id === supervisorId),
    [sellers, supervisorId],
  );
  const activeSellers = useMemo(
    () => selectedSellers.filter(isSellerAvailable),
    [selectedSellers],
  );
  const canManageTeam = ["Administrador", "Líder de departamento", "Supervisor"].includes(profile.role);

  async function refresh() {
    setLoading(true);
    setNotice("");
    const { start, end } = monthBounds(reportMonth);
    const [sellerResult, salesResult, announcedResult] = await Promise.all([
      supabase
        .from("analytics_seller_report")
        .select(
          "id,department,zone,supervisor_profile_id,seller_code,full_name,hire_date,probation_days,probation_end_date,is_on_probation,effective_status,inactive_effective_date",
        )
        .order("full_name"),
      supabase
        .from("analytics_sales")
        .select("id,seller_id,seller_name,supervisor_profile_id,sale_date,amount_billed,source_type")
        .gte("sale_date", start)
        .lt("sale_date", end)
        .order("sale_date", { ascending: false })
        .limit(20_000),
      supabase
        .from("analytics_announced_sales")
        .select(
          "id,seller_id,seller_name,seller_code,supervisor_profile_id,announced_at,expected_post_date,amount_announced,city,service,contract_service,notes,status",
        )
        .gte("announced_at", `${start}T00:00:00`)
        .lt("announced_at", `${end}T00:00:00`)
        .order("announced_at", { ascending: false })
        .limit(10_000),
    ]);

    const firstError = sellerResult.error || salesResult.error || announcedResult.error;
    if (firstError) setNotice(`ERROR: ${firstError.message}`);
    setSellers((sellerResult.data || []) as SellerRecord[]);
    setSales((salesResult.data || []) as SalesRecord[]);
    setAnnounced((announcedResult.data || []) as AnnouncedSale[]);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportMonth]);

  useEffect(() => {
    if (!manualSellerId && activeSellers[0]) setManualSellerId(activeSellers[0].id);
    if (!announcedSellerId && activeSellers[0]) setAnnouncedSellerId(activeSellers[0].id);
  }, [activeSellers, manualSellerId, announcedSellerId]);

  async function saveSeller(event: React.FormEvent) {
    event.preventDefault();
    if (!supervisorId) {
      setNotice("ERROR: Selecciona un supervisor.");
      return;
    }
    setSaving(true);
    setNotice("");
    const { error } = await supabase.rpc("analytics_save_seller", {
      target_id: null,
      target_supervisor_id: supervisorId,
      target_full_name: sellerName,
      target_seller_code: sellerCode || null,
      target_hire_date: hireDate,
      target_probation_days: probationDays,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice(`${sellerName} fue agregado al equipo con historial permanente.`);
      setSellerName("");
      setSellerCode("");
      setHireDate(today());
      setProbationDays(90);
      await refresh();
    }
    setSaving(false);
  }

  async function retireSeller(seller: SellerRecord) {
    if (!window.confirm(`¿Retirar a ${seller.full_name} del equipo? Sus ventas e historial nunca se eliminarán.`)) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("analytics_retire_seller", {
      target_id: seller.id,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      const result = data as { deferred?: boolean; effective_date?: string } | null;
      setNotice(
        result?.deferred
          ? `La salida de ${seller.full_name} quedó programada para ${formatDate(result.effective_date || null)} porque tiene ventas este mes.`
          : `${seller.full_name} fue retirado. Su información histórica permanece guardada.`,
      );
      await refresh();
    }
    setSaving(false);
  }

  async function restoreSeller(seller: SellerRecord) {
    setSaving(true);
    const { error } = await supabase.rpc("analytics_restore_seller", {
      target_id: seller.id,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice(`${seller.full_name} volvió al listado activo.`);
      await refresh();
    }
    setSaving(false);
  }

  async function parseFile(file: File) {
    setSaving(true);
    setNotice("");
    setImportFile(file.name);
    try {
      let best: ReturnType<typeof analyzeSalesMatrix> | null = null;
      let bestSheet = "";
      if (file.name.toLowerCase().endsWith(".csv")) {
        const { default: Papa } = await import("papaparse");
        const matrix = await new Promise<unknown[][]>((resolve, reject) => {
          Papa.parse(file, {
            header: false,
            skipEmptyLines: "greedy",
            complete: (result) => resolve(result.data as unknown[][]),
            error: reject,
          });
        });
        best = analyzeSalesMatrix(matrix);
        bestSheet = "CSV";
      } else {
        const XLSX = await import("xlsx");
        const book = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        for (const sheetName of book.SheetNames) {
          const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], {
            header: 1,
            defval: null,
            raw: true,
          }) as unknown[][];
          const analyzed = analyzeSalesMatrix(matrix);
          const score = analyzed.rows.length + analyzed.confidence * 100;
          const bestScore = best ? best.rows.length + best.confidence * 100 : -1;
          if (score > bestScore) {
            best = analyzed;
            bestSheet = sheetName;
          }
        }
      }
      if (!best?.rows.length) {
        throw new Error("No se detectaron filas con vendedor y fecha de venta.");
      }
      setImportRows(best.rows);
      setImportSheet(bestSheet);
      setImportConfidence(best.confidence);
      setNotice(
        `${best.rows.length.toLocaleString("es-HN")} ventas detectadas automáticamente en ${bestSheet}. Revisa la vista previa y confirma.`,
      );
    } catch (error) {
      setImportRows([]);
      setNotice(`ERROR: ${error instanceof Error ? error.message : "No se pudo leer el archivo."}`);
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const importPreview = useMemo<ImportPreview[]>(
    () =>
      importRows.map((sale) => ({
        sale,
        seller: matchSeller(sale, activeSellers),
      })),
    [importRows, activeSellers],
  );
  const unmatched = importPreview.filter((row) => !row.seller).length;

  async function confirmImport() {
    if (!selectedSupervisor || !importRows.length) return;
    setSaving(true);
    setNotice("");
    const module = importKind === "posted" ? "sales_posted" : "sales_announced";
    const { data: created, error: importError } = await supabase
      .from("analytics_imports")
      .insert({
        file_name: importFile,
        department: selectedSupervisor.department,
        zone: selectedSupervisor.zone,
        module,
        row_count: importRows.length,
        uploaded_by: profile.id,
      })
      .select("id")
      .single();

    if (importError || !created) {
      setNotice(`ERROR: ${importError?.message || "No se pudo registrar la importación."}`);
      setSaving(false);
      return;
    }

    for (const batch of chunk(importPreview)) {
      const { error } = await supabase.from("analytics_records").insert(
        batch.map(({ sale }) => ({
          import_id: created.id,
          department: selectedSupervisor.department,
          zone: selectedSupervisor.zone,
          module,
          period: sale.saleDate.slice(0, 7),
          payload: sale.sourceRow,
          created_by: profile.id,
        })),
      );
      if (error) {
        setNotice(`ERROR: La carga quedó incompleta: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    if (importKind === "posted") {
      for (const batch of chunk(importPreview)) {
        const { error } = await supabase.from("analytics_sales").insert(
          batch.map(({ sale, seller }) => ({
            source_import_id: created.id,
            department: seller?.department || selectedSupervisor.department,
            zone: seller?.zone || selectedSupervisor.zone,
            seller_id: seller?.id || null,
            seller_profile_id: null,
            supervisor_profile_id: seller?.supervisor_profile_id || selectedSupervisor.id,
            seller_code: seller?.seller_code || sale.sellerCode,
            seller_name: seller?.full_name || sale.sellerName,
            team: sale.team || selectedSupervisor.name,
            sale_date: sale.saleDate,
            country: null,
            region: sale.region,
            city: sale.city,
            sale_type: sale.saleType,
            service: sale.service,
            medium: sale.medium,
            is_primary: sale.isPrimary,
            contract_service: sale.contractService,
            amount_billed: sale.amountBilled,
            commission_income: sale.commissionIncome,
            source_type: "imported",
            import_confidence: sale.confidence,
            detected_fields: sale.detectedFields,
            payload: sale.sourceRow,
            created_by: profile.id,
          })),
        );
        if (error) {
          setNotice(`ERROR: No se guardaron las ventas: ${error.message}`);
          setSaving(false);
          return;
        }
      }
    } else {
      for (const batch of chunk(importPreview)) {
        const { error } = await supabase.from("analytics_announced_sales").insert(
          batch.map(({ sale, seller }) => ({
            source_import_id: created.id,
            seller_id: seller?.id || null,
            seller_name: seller?.full_name || sale.sellerName,
            seller_code: seller?.seller_code || sale.sellerCode,
            supervisor_profile_id: seller?.supervisor_profile_id || selectedSupervisor.id,
            department: seller?.department || selectedSupervisor.department,
            zone: seller?.zone || selectedSupervisor.zone,
            announced_at: `${sale.saleDate}T12:00:00`,
            expected_post_date: null,
            amount_announced: sale.amountBilled,
            city: sale.city,
            service: sale.service,
            contract_service: sale.contractService,
            notes: sale.saleType,
            status: "anunciada",
            payload: sale.sourceRow,
            import_confidence: sale.confidence,
            detected_fields: sale.detectedFields,
            created_by: profile.id,
          })),
        );
        if (error) {
          setNotice(`ERROR: No se guardaron las ventas anunciadas: ${error.message}`);
          setSaving(false);
          return;
        }
      }
    }

    setNotice(
      `${importRows.length.toLocaleString("es-HN")} ${importKind === "posted" ? "ventas posteadas" : "ventas anunciadas"} guardadas. ${unmatched ? `${unmatched} quedaron vinculadas por nombre porque aún no existen en el equipo.` : "Todos los vendedores fueron reconocidos."}`,
    );
    setImportRows([]);
    setImportFile("");
    await refresh();
    setSaving(false);
  }

  async function saveManualSale(event: React.FormEvent) {
    event.preventDefault();
    const seller = activeSellers.find((item) => item.id === manualSellerId);
    if (!seller) return;
    setSaving(true);
    const supervisor = profiles.find((item) => item.id === seller.supervisor_profile_id);
    const { error } = await supabase.from("analytics_sales").insert({
      source_import_id: null,
      department: seller.department,
      zone: seller.zone,
      seller_id: seller.id,
      seller_profile_id: null,
      supervisor_profile_id: seller.supervisor_profile_id,
      seller_code: seller.seller_code,
      seller_name: seller.full_name,
      team: supervisor?.name || selectedSupervisor?.name || "Equipo",
      sale_date: manualDate,
      country: null,
      region: null,
      city: manualCity || null,
      sale_type: manualSaleType || "Manual",
      service: manualService || null,
      medium: "Registro manual",
      is_primary: manualPrimary,
      contract_service: manualPackage || null,
      amount_billed: manualAmount ? Number(manualAmount) : null,
      commission_income: null,
      source_type: "manual",
      import_confidence: 1,
      detected_fields: { manual: "true" },
      payload: { manual: true },
      created_by: profile.id,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice(`Venta manual registrada para ${seller.full_name}.`);
      setManualAmount("");
      setManualCity("");
      setManualService("");
      setManualPackage("");
      setManualSaleType("");
      await refresh();
    }
    setSaving(false);
  }

  async function saveAnnouncedSale(event: React.FormEvent) {
    event.preventDefault();
    const seller = activeSellers.find((item) => item.id === announcedSellerId);
    if (!seller) return;
    setSaving(true);
    const { error } = await supabase.from("analytics_announced_sales").insert({
      source_import_id: null,
      seller_id: seller.id,
      seller_name: seller.full_name,
      seller_code: seller.seller_code,
      supervisor_profile_id: seller.supervisor_profile_id,
      department: seller.department,
      zone: seller.zone,
      announced_at: new Date().toISOString(),
      expected_post_date: announcedExpected || null,
      amount_announced: announcedAmount ? Number(announcedAmount) : null,
      city: announcedCity || null,
      service: announcedService || null,
      contract_service: announcedPackage || null,
      notes: announcedNotes || null,
      status: "anunciada",
      payload: { manual: true },
      import_confidence: 1,
      detected_fields: { manual: "true" },
      created_by: profile.id,
    });
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice(`Venta anunciada registrada para ${seller.full_name}.`);
      setAnnouncedAmount("");
      setAnnouncedExpected("");
      setAnnouncedCity("");
      setAnnouncedService("");
      setAnnouncedPackage("");
      setAnnouncedNotes("");
      await refresh();
    }
    setSaving(false);
  }

  async function updateAnnounced(id: number, status: AnnouncedSale["status"]) {
    setSaving(true);
    const { error } = await supabase
      .from("analytics_announced_sales")
      .update({ status })
      .eq("id", id);
    if (error) setNotice(`ERROR: ${error.message}`);
    else {
      setNotice(status === "posteada" ? "Venta anunciada marcada como posteada." : "Venta anunciada cancelada.");
      await refresh();
    }
    setSaving(false);
  }

  const filteredSales = useMemo(
    () => sales.filter((sale) => !supervisorId || sale.supervisor_profile_id === supervisorId),
    [sales, supervisorId],
  );
  const filteredAnnounced = useMemo(
    () => announced.filter((sale) => !supervisorId || sale.supervisor_profile_id === supervisorId),
    [announced, supervisorId],
  );
  const reportRows = useMemo(
    () =>
      selectedSellers
        .map((seller) => {
          const sellerSales = filteredSales.filter(
            (sale) =>
              sale.seller_id === seller.id ||
              (!sale.seller_id && normalizePersonName(sale.seller_name) === normalizePersonName(seller.full_name)),
          );
          const sellerAnnounced = filteredAnnounced.filter(
            (sale) =>
              sale.status !== "cancelada" &&
              (sale.seller_id === seller.id ||
                (!sale.seller_id && normalizePersonName(sale.seller_name) === normalizePersonName(seller.full_name))),
          );
          return {
            seller,
            posted: sellerSales.length,
            announced: sellerAnnounced.filter((sale) => sale.status === "anunciada").length,
            probationSales: sellerSales.filter((sale) => sellerProbationAt(seller, sale.sale_date)).length,
            totalAmount: sellerSales.reduce((sum, sale) => sum + amount(sale.amount_billed), 0),
          };
        })
        .sort((a, b) => b.posted - a.posted || b.totalAmount - a.totalAmount),
    [selectedSellers, filteredSales, filteredAnnounced],
  );

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "team", label: "Mi equipo", icon: Users },
    { id: "import", label: "Subir Excel", icon: FileSpreadsheet },
    { id: "manual", label: "Venta manual", icon: Plus },
    { id: "announced", label: "Venta anunciada", icon: Megaphone },
    { id: "report", label: "Reporte por vendedor", icon: BarChart3 },
  ];

  return (
    <div className="space-y-4 text-white">
      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
              <Sparkles size={14} /> Ingreso inteligente de ventas
            </div>
            <h2 className="mt-2 text-2xl font-black">Equipos, ventas y archivos automáticos</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
              Los vendedores son registros comerciales, no usuarios. Su historial permanece aunque salgan del equipo. El sistema calcula automáticamente el período de prueba y enlaza cada venta con su vendedor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={supervisorId}
              onChange={(event) => setSupervisorId(event.target.value)}
              disabled={profile.role === "Supervisor" || supervisors.length <= 1}
              className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200 disabled:opacity-70"
            >
              {!supervisors.length && <option value="">Sin supervisor disponible</option>}
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.name} · {supervisor.zone}
                </option>
              ))}
            </select>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-3 text-xs font-bold text-zinc-300 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Vendedores activos</p>
          <p className="mt-2 text-2xl font-black">{activeSellers.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">En período de prueba</p>
          <p className="mt-2 text-2xl font-black text-cyan-300">
            {activeSellers.filter((seller) => seller.is_on_probation).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Ventas posteadas · mes</p>
          <p className="mt-2 text-2xl font-black text-emerald-300">{filteredSales.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Ventas anunciadas pendientes</p>
          <p className="mt-2 text-2xl font-black text-amber-300">
            {filteredAnnounced.filter((sale) => sale.status === "anunciada").length}
          </p>
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/[.07] bg-white/[.02] p-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition ${tab === item.id ? "bg-purple-600 text-white" : "text-zinc-500 hover:bg-white/[.04] hover:text-zinc-200"}`}
            >
              <Icon size={15} /> {item.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <p className={`rounded-xl border p-3 text-xs ${notice.startsWith("ERROR") ? "border-rose-500/20 bg-rose-500/[.07] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300"}`}>
          {notice}
        </p>
      )}

      {loading ? (
        <Card className="grid min-h-64 place-items-center p-8 text-zinc-500">
          <div className="flex items-center gap-3 text-xs"><Loader2 className="animate-spin" /> Cargando información comercial...</div>
        </Card>
      ) : (
        <>
          {tab === "team" && (
            <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-purple-500/10 text-purple-300"><UserPlus /></span>
                  <div>
                    <h3 className="font-black">Agregar vendedor</h3>
                    <p className="mt-1 text-[10px] text-zinc-600">Nombre y fecha de ingreso son obligatorios.</p>
                  </div>
                </div>
                {canManageTeam ? (
                  <form onSubmit={saveSeller} className="mt-5 space-y-4">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">
                      Nombre completo
                      <input required value={sellerName} onChange={(event) => setSellerName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs outline-none focus:border-purple-400/50" />
                    </label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">
                      Código de vendedor · opcional
                      <input value={sellerCode} onChange={(event) => setSellerCode(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs outline-none focus:border-purple-400/50" />
                    </label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">
                      Fecha de ingreso
                      <input required type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" />
                    </label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">
                      Días de período de prueba
                      <input required min={0} max={365} type="number" value={probationDays} onChange={(event) => setProbationDays(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" />
                    </label>
                    <button disabled={saving || !supervisorId} className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-black disabled:opacity-50">
                      <Save size={15} /> Guardar vendedor
                    </button>
                  </form>
                ) : (
                  <p className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/[.05] p-4 text-xs leading-5 text-amber-200">
                    Solo administradores, líderes y supervisores pueden modificar el equipo.
                  </p>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[.06] p-5">
                  <div>
                    <h3 className="font-black">Listado histórico del equipo</h3>
                    <p className="mt-1 text-[10px] text-zinc-600">Retirar no elimina ventas ni reportes anteriores.</p>
                  </div>
                  <span className="rounded-full bg-purple-500/10 px-3 py-1 text-[9px] font-black text-purple-300">{selectedSellers.length} REGISTROS</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
                      <tr><th className="px-5 py-3">Vendedor</th><th>Ingreso</th><th>Fin de prueba</th><th>Condición</th><th>Estado</th><th className="pr-5 text-right">Acción</th></tr>
                    </thead>
                    <tbody>
                      {selectedSellers.map((seller) => (
                        <tr key={seller.id} className="border-t border-white/[.05]">
                          <td className="px-5 py-3"><p className="font-bold text-zinc-200">{seller.full_name}</p><p className="mt-1 text-[10px] text-zinc-600">{seller.seller_code || "Sin código"}</p></td>
                          <td>{formatDate(seller.hire_date)}</td>
                          <td>{formatDate(seller.probation_end_date)}</td>
                          <td><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${seller.is_on_probation ? "bg-cyan-500/10 text-cyan-300" : "bg-emerald-500/10 text-emerald-300"}`}>{seller.is_on_probation ? "EN PRUEBA" : "PERMANENTE"}</span></td>
                          <td><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${seller.effective_status === "activo" ? "bg-emerald-500/10 text-emerald-300" : seller.effective_status === "salida_pendiente" ? "bg-amber-500/10 text-amber-300" : "bg-zinc-500/10 text-zinc-400"}`}>{seller.effective_status.replace("_", " ").toUpperCase()}</span>{seller.inactive_effective_date && <p className="mt-1 text-[9px] text-zinc-600">Efectiva: {formatDate(seller.inactive_effective_date)}</p>}</td>
                          <td className="pr-5 text-right">
                            {canManageTeam && seller.effective_status === "activo" && <button disabled={saving} onClick={() => void retireSeller(seller)} className="inline-flex items-center gap-2 rounded-lg border border-rose-400/15 bg-rose-500/[.05] px-3 py-2 text-[10px] font-black text-rose-300"><UserMinus size={13} /> Retirar</button>}
                            {canManageTeam && seller.effective_status !== "activo" && <button disabled={saving} onClick={() => void restoreSeller(seller)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-500/[.05] px-3 py-2 text-[10px] font-black text-emerald-300"><RotateCcw size={13} /> Reactivar</button>}
                          </td>
                        </tr>
                      ))}
                      {!selectedSellers.length && <tr><td colSpan={6} className="px-5 py-8 text-center text-zinc-600">Aún no hay vendedores registrados para este supervisor.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === "import" && (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="font-black">Detector automático de Excel y CSV</h3>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">Analiza hojas, encabezados y nombres de columnas distintos. Detecta vendedor, fecha, monto, supervisor, ciudad, servicio, canal y paquete sin exigir una plantilla fija.</p>
                  </div>
                  <select value={importKind} onChange={(event) => setImportKind(event.target.value as ImportKind)} className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-black text-purple-200">
                    <option value="posted">Ventas posteadas</option>
                    <option value="announced">Ventas anunciadas</option>
                  </select>
                </div>
                <div onClick={() => !saving && fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void parseFile(file); }} className="mt-5 grid min-h-56 cursor-pointer place-items-center rounded-2xl border border-dashed border-purple-400/30 bg-purple-500/[.035] p-8 text-center hover:border-purple-400/60">
                  <div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-purple-500/10 text-purple-300"><CloudUpload /></span><h4 className="mt-4 font-black">{saving ? "Procesando..." : "Arrastra cualquier archivo de ventas"}</h4><p className="mt-2 text-xs text-zinc-500">.xlsx, .xls o .csv · no necesita una estructura idéntica</p><button type="button" className="mt-5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-black">Seleccionar archivo</button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseFile(file); }} /></div>
                </div>
              </Card>

              {importRows.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="flex flex-col gap-4 border-b border-white/[.06] p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div><h3 className="font-black">Vista previa detectada</h3><p className="mt-1 text-[10px] text-zinc-600">{importFile} · hoja {importSheet} · confianza {Math.round(importConfidence * 100)}%</p></div>
                    <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-[9px] font-black ${unmatched ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>{unmatched ? `${unmatched} SIN COINCIDENCIA EXACTA` : "TODOS RECONOCIDOS"}</span><button disabled={saving || !selectedSupervisor} onClick={() => void confirmImport()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black disabled:opacity-50"><Check size={15} /> Confirmar importación</button></div>
                  </div>
                  {unmatched > 0 && <p className="m-4 rounded-xl border border-amber-500/15 bg-amber-500/[.05] p-3 text-[10px] leading-5 text-amber-200"><AlertTriangle size={14} className="mr-2 inline" />Las ventas sin coincidencia se guardarán por nombre y conservarán el dato original. Agrega esos vendedores al equipo para que futuras cargas se vinculen automáticamente.</p>}
                  <div className="max-h-[430px] overflow-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="sticky top-0 bg-[#17171e] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Vendedor detectado</th><th>Coincidencia oficial</th><th>Fecha</th><th>Monto</th><th>Ciudad</th><th>Servicio / paquete</th><th>Campos detectados</th></tr></thead><tbody>{importPreview.slice(0, 100).map(({ sale, seller }, index) => <tr key={`${sale.sellerName}-${sale.saleDate}-${index}`} className="border-t border-white/[.05]"><td className="px-5 py-3 font-bold text-zinc-200">{sale.sellerName}</td><td>{seller ? <span className="text-emerald-300">{seller.full_name}</span> : <span className="text-amber-300">Sin registrar</span>}</td><td>{formatDate(sale.saleDate)}</td><td>{sale.amountBilled === null ? "—" : money(sale.amountBilled)}</td><td>{sale.city || "—"}</td><td>{sale.service || sale.contractService || "—"}</td><td className="max-w-72 truncate text-[10px] text-zinc-600">{Object.values(sale.detectedFields).join(" · ")}</td></tr>)}</tbody></table></div>
                </Card>
              )}
            </div>
          )}

          {tab === "manual" && (
            <Card className="mx-auto max-w-3xl p-6">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300"><Plus /></span><div><h3 className="font-black">Registrar venta por vendedor</h3><p className="mt-1 text-[10px] text-zinc-600">La venta aparecerá en reportes y en la pantalla del TV.</p></div></div>
              <form onSubmit={saveManualSale} className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600 sm:col-span-2">Vendedor<select required value={manualSellerId} onChange={(event) => setManualSellerId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs">{activeSellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name}{seller.is_on_probation ? " · EN PRUEBA" : ""}</option>)}</select></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Fecha<input required type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Monto<input type="number" step="0.01" min="0" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Ciudad<input value={manualCity} onChange={(event) => setManualCity(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Servicio<input value={manualService} onChange={(event) => setManualService(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Paquete<input value={manualPackage} onChange={(event) => setManualPackage(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Tipo de venta<input value={manualSaleType} onChange={(event) => setManualSaleType(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                <label className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.02] p-3 text-xs text-zinc-400 sm:col-span-2"><input type="checkbox" checked={manualPrimary} onChange={(event) => setManualPrimary(event.target.checked)} /> Venta principal</label>
                <button disabled={saving || !activeSellers.length} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3 text-xs font-black sm:col-span-2 disabled:opacity-50"><Save size={15} /> Guardar venta</button>
              </form>
            </Card>
          )}

          {tab === "announced" && (
            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <Card className="p-5">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/10 text-amber-300"><Megaphone /></span><div><h3 className="font-black">Nueva venta anunciada</h3><p className="mt-1 text-[10px] text-zinc-600">Aún no cuenta como venta posteada.</p></div></div>
                <form onSubmit={saveAnnouncedSale} className="mt-5 space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Vendedor<select required value={announcedSellerId} onChange={(event) => setAnnouncedSellerId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs">{activeSellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name}</option>)}</select></label>
                  <div className="grid gap-4 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Monto<input type="number" step="0.01" min="0" value={announcedAmount} onChange={(event) => setAnnouncedAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label><label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Posteo esperado<input type="date" value={announcedExpected} onChange={(event) => setAnnouncedExpected(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label></div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Ciudad<input value={announcedCity} onChange={(event) => setAnnouncedCity(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Servicio<input value={announcedService} onChange={(event) => setAnnouncedService(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Paquete<input value={announcedPackage} onChange={(event) => setAnnouncedPackage(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Observación<textarea value={announcedNotes} onChange={(event) => setAnnouncedNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
                  <button disabled={saving || !activeSellers.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 p-3 text-xs font-black disabled:opacity-50"><Megaphone size={15} /> Anunciar venta</button>
                </form>
              </Card>
              <Card className="overflow-hidden">
                <div className="border-b border-white/[.06] p-5"><h3 className="font-black">Ventas anunciadas del mes</h3><p className="mt-1 text-[10px] text-zinc-600">Se mantienen separadas de las ventas posteadas para evitar duplicados.</p></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Vendedor</th><th>Anunciada</th><th>Monto</th><th>Posteo esperado</th><th>Estado</th><th className="pr-5 text-right">Acción</th></tr></thead><tbody>{filteredAnnounced.map((sale) => <tr key={sale.id} className="border-t border-white/[.05]"><td className="px-5 py-3 font-bold text-zinc-200">{sale.seller_name}</td><td>{new Date(sale.announced_at).toLocaleString("es-HN")}</td><td>{money(amount(sale.amount_announced))}</td><td>{formatDate(sale.expected_post_date)}</td><td><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${sale.status === "anunciada" ? "bg-amber-500/10 text-amber-300" : sale.status === "posteada" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{sale.status.toUpperCase()}</span></td><td className="pr-5 text-right">{sale.status === "anunciada" && <div className="flex justify-end gap-2"><button disabled={saving} onClick={() => void updateAnnounced(sale.id, "posteada")} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300"><Check size={13} className="mr-1 inline" /> Posteada</button><button disabled={saving} onClick={() => void updateAnnounced(sale.id, "cancelada")} className="rounded-lg bg-rose-500/10 px-3 py-2 text-[10px] font-black text-rose-300"><X size={13} className="mr-1 inline" /> Cancelar</button></div>}</td></tr>)}{!filteredAnnounced.length && <tr><td colSpan={6} className="px-5 py-8 text-center text-zinc-600">No hay ventas anunciadas este mes.</td></tr>}</tbody></table></div>
              </Card>
            </div>
          )}

          {tab === "report" && (
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">Reporte histórico por vendedor</h3><p className="mt-1 text-[10px] text-zinc-600">Incluye activos, retirados, período de prueba, ventas posteadas y anunciadas.</p></div><input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200" /></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3"># / Vendedor</th><th>Ingreso</th><th>Fin de prueba</th><th>Estado</th><th>Posteadas</th><th>Anunciadas</th><th>Ventas en prueba</th><th>Monto posteado</th></tr></thead><tbody>{reportRows.map((row, index) => <tr key={row.seller.id} className="border-t border-white/[.05]"><td className="px-5 py-3"><p className="font-bold text-zinc-200">{index + 1}. {row.seller.full_name}</p><p className="mt-1 text-[10px] text-zinc-600">{row.seller.seller_code || "Sin código"}</p></td><td>{formatDate(row.seller.hire_date)}</td><td>{formatDate(row.seller.probation_end_date)}</td><td><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${row.seller.is_on_probation ? "bg-cyan-500/10 text-cyan-300" : "bg-zinc-500/10 text-zinc-300"}`}>{row.seller.is_on_probation ? "EN PRUEBA" : row.seller.effective_status.replace("_", " ").toUpperCase()}</span></td><td className="text-base font-black text-emerald-300">{row.posted}</td><td className="text-base font-black text-amber-300">{row.announced}</td><td>{row.probationSales}</td><td className="font-bold text-zinc-200">{money(row.totalAmount)}</td></tr>)}{!reportRows.length && <tr><td colSpan={8} className="px-5 py-8 text-center text-zinc-600">No hay vendedores registrados para generar el reporte.</td></tr>}</tbody></table></div>
            </Card>
          )}
        </>
      )}

      <Card className="flex flex-col gap-3 p-4 text-[10px] leading-5 text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <span><ShieldCheck size={14} className="mr-2 inline text-purple-300" />El historial comercial nunca se elimina al retirar a un vendedor.</span>
        <span><Clock3 size={14} className="mr-2 inline text-amber-300" />Con ventas del mes, la salida se hace efectiva el primer día del mes siguiente.</span>
      </Card>
    </div>
  );
}
