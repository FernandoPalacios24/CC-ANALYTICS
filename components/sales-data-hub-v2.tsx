"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock3,
  CloudUpload,
  FileSpreadsheet,
  History,
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
  normalizeImportLabel,
  type CanonicalSale,
} from "@/lib/sales-import-detection";
import {
  detectedSaleUnits,
  findBestSellerMatch,
  normalizedTotalAmount,
  type SellerMatch,
} from "@/lib/seller-matching";
import {
  filterSellersForDate,
  filterSellersForMonth,
  monthBounds,
} from "@/lib/seller-validity";

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
  seller_code: string | null;
  supervisor_profile_id: string | null;
  sale_date: string;
  amount_billed: number | string | null;
  sale_units: number | null;
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
  sale_units: number | null;
  city: string | null;
  service: string | null;
  contract_service: string | null;
  notes: string | null;
  status: "anunciada" | "posteada" | "cancelada";
};

type ImportHistory = {
  id: string;
  file_name: string;
  module: string;
  row_count: number;
  supervisor_profile_id: string | null;
  period_start: string | null;
  period_end: string | null;
  snapshot_as_of: string | null;
  import_mode: "append" | "replace";
  replaced_rows: number;
  superseded_by: string | null;
  created_at: string;
};

type PreviewRow = {
  sale: CanonicalSale;
  match: SellerMatch<SellerRecord>;
  units: number;
  totalAmount: number | null;
  key: string;
};

type Tab = "team" | "import" | "manual" | "announced" | "report";
type ImportKind = "posted" | "announced";
type ImportMode = "replace" | "append";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/[.07] bg-white/[.025] ${className}`}>{children}</section>;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function today() { return isoDate(new Date()); }
function currentMonth() { return today().slice(0, 7); }
function amount(value: number | string | null) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function saleUnits(value: number | null | undefined) { const parsed = Number(value ?? 1); return Number.isFinite(parsed) && parsed > 0 ? parsed : 1; }
function money(value: number) { return new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL", maximumFractionDigits: 2 }).format(value); }
function formatDate(value: string | null) {
  if (!value) return "—";
  const clean = value.slice(0, 10);
  const date = new Date(`${clean}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-HN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function sellerProbationAt(seller: SellerRecord, date: string) { return date < seller.probation_end_date; }
function supervisorOptionsFor(profile: Profile, profiles: Profile[]) {
  const active = profiles.filter((candidate) => candidate.active && candidate.role === "Supervisor");
  if (profile.role === "Administrador") return active;
  if (profile.role === "Líder de departamento") return active.filter((candidate) => candidate.managerId === profile.id);
  if (profile.role === "Supervisor") return [profile];
  const manager = profiles.find((candidate) => candidate.id === profile.managerId);
  return manager?.role === "Supervisor" ? [manager] : [];
}
function chunk<T>(items: T[], size = 400) { const result: T[][] = []; for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size)); return result; }
function previewKey(sale: CanonicalSale) { return normalizeImportLabel(sale.sellerName); }
function matchLabel(match: SellerMatch<SellerRecord>) {
  if (match.method === "manual") return "ASIGNACIÓN MANUAL";
  if (match.method === "code") return "CÓDIGO";
  if (match.method === "exact") return "EXACTA";
  if (match.method === "partial") return "NOMBRE PARCIAL";
  if (match.method === "fuzzy") return "NOMBRE SIMILAR";
  return match.ambiguous ? "AMBIGUA" : "SIN COINCIDENCIA";
}

export function SalesDataHubV2({ profile, profiles }: { profile: Profile; profiles: Profile[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const supervisors = useMemo(() => supervisorOptionsFor(profile, profiles), [profile, profiles]);
  const [tab, setTab] = useState<Tab>("team");
  const [supervisorId, setSupervisorId] = useState(profile.role === "Supervisor" ? profile.id : supervisors[0]?.id || "");
  const [sellers, setSellers] = useState<SellerRecord[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [announced, setAnnounced] = useState<AnnouncedSale[]>([]);
  const [imports, setImports] = useState<ImportHistory[]>([]);
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerCode, setSellerCode] = useState("");
  const [hireDate, setHireDate] = useState(today());
  const [probationDays, setProbationDays] = useState(90);
  const [importKind, setImportKind] = useState<ImportKind>("posted");
  const [importMode, setImportMode] = useState<ImportMode>("replace");
  const [importMonth, setImportMonth] = useState(currentMonth());
  const initialImportBounds = monthBounds(currentMonth());
  const [importStart, setImportStart] = useState(initialImportBounds.start);
  const [importEnd, setImportEnd] = useState(() => {
    const endExclusive = new Date(`${initialImportBounds.end}T12:00:00`);
    endExclusive.setDate(endExclusive.getDate() - 1);
    const inclusiveEnd = isoDate(endExclusive);
    return inclusiveEnd > today() ? today() : inclusiveEnd;
  });
  const [importFile, setImportFile] = useState("");
  const [importRows, setImportRows] = useState<CanonicalSale[]>([]);
  const [importSheet, setImportSheet] = useState("");
  const [importConfidence, setImportConfidence] = useState(0);
  const [excludedRows, setExcludedRows] = useState(0);
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({});
  const [manualSellerId, setManualSellerId] = useState("");
  const [manualDate, setManualDate] = useState(today());
  const [manualAmount, setManualAmount] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualService, setManualService] = useState("");
  const [manualPackage, setManualPackage] = useState("");
  const [announcedSellerId, setAnnouncedSellerId] = useState("");
  const [announcedDate, setAnnouncedDate] = useState(today());
  const [announcedAmount, setAnnouncedAmount] = useState("");
  const [announcedExpected, setAnnouncedExpected] = useState("");
  const [announcedNotes, setAnnouncedNotes] = useState("");

  useEffect(() => { if (!supervisorId && supervisors[0]?.id) setSupervisorId(supervisors[0].id); }, [supervisorId, supervisors]);
  const selectedSupervisor = supervisors.find((item) => item.id === supervisorId) || null;
  const selectedSellers = useMemo(() => sellers.filter((seller) => !supervisorId || seller.supervisor_profile_id === supervisorId), [sellers, supervisorId]);
  const currentSellers = useMemo(() => filterSellersForDate(selectedSellers, today()), [selectedSellers]);
  const importSellers = useMemo(() => filterSellersForMonth(selectedSellers, importMonth), [selectedSellers, importMonth]);
  const reportSellers = useMemo(() => filterSellersForMonth(selectedSellers, reportMonth), [selectedSellers, reportMonth]);
  const manualSellers = useMemo(() => filterSellersForDate(selectedSellers, manualDate), [selectedSellers, manualDate]);
  const announcedSellers = useMemo(() => filterSellersForDate(selectedSellers, announcedDate), [selectedSellers, announcedDate]);
  const canManageTeam = ["Administrador", "Líder de departamento", "Supervisor"].includes(profile.role);

  async function refresh() {
    setLoading(true);
    const { start, end } = monthBounds(reportMonth);
    const [sellerResult, salesResult, announcedResult, importResult] = await Promise.all([
      supabase.from("analytics_seller_report").select("id,department,zone,supervisor_profile_id,seller_code,full_name,hire_date,probation_days,probation_end_date,is_on_probation,effective_status,inactive_effective_date").order("full_name"),
      supabase.from("analytics_sales").select("id,seller_id,seller_name,seller_code,supervisor_profile_id,sale_date,amount_billed,sale_units,source_type").gte("sale_date", start).lt("sale_date", end).order("sale_date", { ascending: false }).limit(50000),
      supabase.from("analytics_announced_sales").select("id,seller_id,seller_name,seller_code,supervisor_profile_id,announced_at,expected_post_date,amount_announced,sale_units,city,service,contract_service,notes,status").gte("announced_at", `${start}T00:00:00`).lt("announced_at", `${end}T00:00:00`).order("announced_at", { ascending: false }).limit(30000),
      supabase.from("analytics_imports").select("id,file_name,module,row_count,supervisor_profile_id,period_start,period_end,snapshot_as_of,import_mode,replaced_rows,superseded_by,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = sellerResult.error || salesResult.error || announcedResult.error || importResult.error;
    if (firstError) setNotice(`ERROR: ${firstError.message}`);
    setSellers((sellerResult.data || []) as SellerRecord[]);
    setSales((salesResult.data || []) as SalesRecord[]);
    setAnnounced((announcedResult.data || []) as AnnouncedSale[]);
    setImports((importResult.data || []) as ImportHistory[]);
    setLoading(false);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reportMonth]);
  useEffect(() => { if (!manualSellers.some((seller) => seller.id === manualSellerId)) setManualSellerId(manualSellers[0]?.id || ""); }, [manualSellers, manualSellerId]);
  useEffect(() => { if (!announcedSellers.some((seller) => seller.id === announcedSellerId)) setAnnouncedSellerId(announcedSellers[0]?.id || ""); }, [announcedSellers, announcedSellerId]);

  function changeImportMonth(month: string) {
    setImportMonth(month);
    const { start, end } = monthBounds(month);
    const endDate = new Date(`${end}T12:00:00`);
    endDate.setDate(endDate.getDate() - 1);
    const inclusiveEnd = isoDate(endDate);
    setImportStart(start);
    setImportEnd(inclusiveEnd > today() ? today() : inclusiveEnd);
    setImportRows([]);
    setImportFile("");
    setManualMatches({});
  }

  async function saveSeller(event: React.FormEvent) {
    event.preventDefault();
    if (!supervisorId) return setNotice("ERROR: Selecciona un supervisor.");
    setSaving(true); setNotice("");
    const { error } = await supabase.rpc("analytics_save_seller", { target_id: null, target_supervisor_id: supervisorId, target_full_name: sellerName, target_seller_code: sellerCode || null, target_hire_date: hireDate, target_probation_days: probationDays });
    if (error) setNotice(`ERROR: ${error.message}`); else { setNotice(`${sellerName} fue agregado al equipo.`); setSellerName(""); setSellerCode(""); setHireDate(today()); setProbationDays(90); await refresh(); }
    setSaving(false);
  }
  async function retireSeller(seller: SellerRecord) {
    if (!window.confirm(`¿Retirar a ${seller.full_name}? Sus ventas e historial permanecerán guardados.`)) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("analytics_retire_seller", { target_id: seller.id });
    if (error) setNotice(`ERROR: ${error.message}`); else {
      const result = data as { deferred?: boolean; effective_date?: string } | null;
      setNotice(result?.deferred ? `La salida quedó programada para ${formatDate(result.effective_date || null)} porque tiene ventas en el mes.` : `${seller.full_name} fue retirado sin eliminar su historial.`);
      await refresh();
    }
    setSaving(false);
  }
  async function restoreSeller(seller: SellerRecord) {
    setSaving(true);
    const { error } = await supabase.rpc("analytics_restore_seller", { target_id: seller.id });
    if (error) setNotice(`ERROR: ${error.message}`); else { setNotice(`${seller.full_name} fue reactivado.`); await refresh(); }
    setSaving(false);
  }

  async function parseFile(file: File) {
    if (!importMonth || !importStart || !importEnd || importStart > importEnd) { setNotice("ERROR: Selecciona un mes y un rango de fechas válido antes de subir el archivo."); return; }
    setSaving(true); setNotice(""); setImportFile(file.name); setManualMatches({});
    try {
      let best: ReturnType<typeof analyzeSalesMatrix> | null = null; let bestSheet = "";
      if (file.name.toLowerCase().endsWith(".csv")) {
        const { default: Papa } = await import("papaparse");
        const matrix = await new Promise<unknown[][]>((resolve, reject) => { Papa.parse(file, { header: false, skipEmptyLines: "greedy", complete: (result) => resolve(result.data as unknown[][]), error: reject }); });
        best = analyzeSalesMatrix(matrix); bestSheet = "CSV";
      } else {
        const XLSX = await import("xlsx"); const book = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        for (const sheetName of book.SheetNames) {
          const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, defval: null, raw: true }) as unknown[][];
          const analyzed = analyzeSalesMatrix(matrix); const score = analyzed.rows.length + analyzed.confidence * 100; const bestScore = best ? best.rows.length + best.confidence * 100 : -1;
          if (score > bestScore) { best = analyzed; bestSheet = sheetName; }
        }
      }
      if (!best?.rows.length) throw new Error("No se detectaron filas con vendedores.");
      const normalizedRows = best.rows.map((sale) => best?.map.saleDate ? sale : { ...sale, saleDate: importEnd });
      const withinRange = normalizedRows.filter((sale) => sale.saleDate >= importStart && sale.saleDate <= importEnd && sale.saleDate.slice(0, 7) === importMonth);
      const excluded = normalizedRows.length - withinRange.length;
      if (!withinRange.length) throw new Error("Las fechas detectadas no pertenecen al mes seleccionado.");
      setImportRows(withinRange); setImportSheet(bestSheet); setImportConfidence(best.confidence); setExcludedRows(excluded);
      setNotice(`${withinRange.length.toLocaleString("es-HN")} filas detectadas en ${bestSheet} para ${importMonth}. ${excluded ? `${excluded} quedaron fuera del mes/rango.` : ""}`);
    } catch (error) {
      setImportRows([]); setNotice(`ERROR: ${error instanceof Error ? error.message : "No se pudo leer el archivo."}`);
    } finally { setSaving(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const importPreview = useMemo<PreviewRow[]>(() => importRows.map((sale) => {
    const key = previewKey(sale);
    const sellersForSaleDate = filterSellersForDate(importSellers, sale.saleDate);
    const manuallySelected = sellersForSaleDate.find((seller) => seller.id === manualMatches[key]);
    const automatic = findBestSellerMatch(sale.sellerName, sale.sellerCode, sellersForSaleDate);
    const match: SellerMatch<SellerRecord> = manuallySelected ? { seller: manuallySelected, score: 1, method: "manual", ambiguous: false } : automatic;
    const units = detectedSaleUnits(sale);
    return { sale, match, units, totalAmount: normalizedTotalAmount(sale, units), key };
  }), [importRows, manualMatches, importSellers]);

  const unresolved = importPreview.filter((row) => !row.match.seller);
  const unresolvedNames = Array.from(new Map(unresolved.map((row) => [row.key, row])).values());
  const totalImportUnits = importPreview.reduce((sum, row) => sum + row.units, 0);

  async function confirmImport() {
    if (!selectedSupervisor || !importPreview.length) return;
    if (importStart > importEnd) return setNotice("ERROR: El rango de actualización no es válido.");
    setSaving(true); setNotice("");
    const module = importKind === "posted" ? "sales_posted" : "sales_announced";
    const { data: created, error: importError } = await supabase.from("analytics_imports").insert({ file_name: importFile, department: selectedSupervisor.department, zone: selectedSupervisor.zone, module, row_count: totalImportUnits, supervisor_profile_id: selectedSupervisor.id, period_start: importStart, period_end: importEnd, snapshot_as_of: importEnd, import_mode: importMode, uploaded_by: profile.id }).select("id").single();
    if (importError || !created) { setNotice(`ERROR: ${importError?.message || "No se pudo registrar la importación."}`); setSaving(false); return; }
    for (const batch of chunk(importPreview)) {
      const { error } = await supabase.from("analytics_records").insert(batch.map(({ sale, units }) => ({ import_id: created.id, department: selectedSupervisor.department, zone: selectedSupervisor.zone, module, period: sale.saleDate.slice(0, 7), payload: { ...sale.sourceRow, __sale_units: units, __snapshot_as_of: importEnd }, created_by: profile.id })));
      if (error) { setNotice(`ERROR: La carga de respaldo quedó incompleta: ${error.message}`); setSaving(false); return; }
    }
    if (importKind === "posted") {
      for (const batch of chunk(importPreview)) {
        const { error } = await supabase.from("analytics_sales").insert(batch.map(({ sale, match, units, totalAmount }) => ({ source_import_id: created.id, department: match.seller?.department || selectedSupervisor.department, zone: match.seller?.zone || selectedSupervisor.zone, seller_id: match.seller?.id || null, seller_profile_id: null, supervisor_profile_id: match.seller?.supervisor_profile_id || selectedSupervisor.id, seller_code: match.seller?.seller_code || sale.sellerCode, seller_name: match.seller?.full_name || sale.sellerName, team: sale.team || selectedSupervisor.name, sale_date: sale.saleDate, country: null, region: sale.region, city: sale.city, sale_type: sale.saleType, service: sale.service, medium: sale.medium, is_primary: sale.isPrimary, contract_service: sale.contractService, amount_billed: totalAmount, commission_income: sale.commissionIncome, sale_units: units, snapshot_as_of: importEnd, source_type: "imported", import_confidence: sale.confidence, detected_fields: { ...sale.detectedFields, seller_match_method: match.method, seller_match_score: match.score.toFixed(4) }, payload: { ...sale.sourceRow, __sale_units: units, __original_seller_name: sale.sellerName }, created_by: profile.id })));
        if (error) { setNotice(`ERROR: No se guardaron las ventas: ${error.message}`); setSaving(false); return; }
      }
    } else {
      for (const batch of chunk(importPreview)) {
        const { error } = await supabase.from("analytics_announced_sales").insert(batch.map(({ sale, match, units, totalAmount }) => ({ source_import_id: created.id, seller_id: match.seller?.id || null, seller_name: match.seller?.full_name || sale.sellerName, seller_code: match.seller?.seller_code || sale.sellerCode, supervisor_profile_id: match.seller?.supervisor_profile_id || selectedSupervisor.id, department: match.seller?.department || selectedSupervisor.department, zone: match.seller?.zone || selectedSupervisor.zone, announced_at: `${sale.saleDate}T12:00:00`, expected_post_date: null, amount_announced: totalAmount, sale_units: units, snapshot_as_of: importEnd, city: sale.city, service: sale.service, contract_service: sale.contractService, notes: sale.saleType, status: "anunciada", payload: { ...sale.sourceRow, __sale_units: units, __original_seller_name: sale.sellerName }, import_confidence: sale.confidence, detected_fields: { ...sale.detectedFields, seller_match_method: match.method, seller_match_score: match.score.toFixed(4) }, created_by: profile.id })));
        if (error) { setNotice(`ERROR: No se guardaron las ventas anunciadas: ${error.message}`); setSaving(false); return; }
      }
    }
    const { data: finalized, error: finalizeError } = await supabase.rpc("analytics_finalize_sales_import", { current_import_id: created.id, target_supervisor_id: selectedSupervisor.id, target_start: importStart, target_end: importEnd, target_module: module, target_mode: importMode });
    if (finalizeError) { setNotice(`ERROR: Los datos nuevos se guardaron, pero no se completó la sustitución: ${finalizeError.message}`); setSaving(false); return; }
    const result = finalized as { removed_sales_rows?: number; removed_announced_rows?: number } | null;
    const removed = Number(result?.removed_sales_rows || 0) + Number(result?.removed_announced_rows || 0);
    setNotice(`${totalImportUnits.toLocaleString("es-HN")} ventas actualizadas de ${importMonth}. ${importMode === "replace" ? `Se sustituyeron ${removed} filas importadas anteriores; las ventas manuales se conservaron.` : "La carga se agregó sin sustituir datos anteriores."} ${unresolved.length ? `${unresolved.length} filas quedaron por nombre original.` : "Todos los vendedores quedaron vinculados."}`);
    setImportRows([]); setImportFile(""); setManualMatches({}); await refresh(); setSaving(false);
  }

  async function saveManualSale(event: React.FormEvent) {
    event.preventDefault();
    const seller = manualSellers.find((item) => item.id === manualSellerId);
    if (!seller) return setNotice("ERROR: Ese vendedor no pertenecía al equipo en la fecha seleccionada.");
    setSaving(true);
    const supervisor = profiles.find((item) => item.id === seller.supervisor_profile_id);
    const { error } = await supabase.from("analytics_sales").insert({ source_import_id: null, department: seller.department, zone: seller.zone, seller_id: seller.id, seller_profile_id: null, supervisor_profile_id: seller.supervisor_profile_id, seller_code: seller.seller_code, seller_name: seller.full_name, team: supervisor?.name || selectedSupervisor?.name || "Equipo", sale_date: manualDate, city: manualCity || null, sale_type: "Manual", service: manualService || null, medium: "Registro manual", is_primary: true, contract_service: manualPackage || null, amount_billed: manualAmount ? Number(manualAmount) : null, sale_units: 1, snapshot_as_of: manualDate, source_type: "manual", import_confidence: 1, detected_fields: { manual: "true" }, payload: { manual: true }, created_by: profile.id });
    if (error) setNotice(`ERROR: ${error.message}`); else { setNotice(`Venta manual registrada para ${seller.full_name}.`); setManualAmount(""); setManualCity(""); setManualService(""); setManualPackage(""); await refresh(); }
    setSaving(false);
  }
  async function saveAnnouncedSale(event: React.FormEvent) {
    event.preventDefault();
    const seller = announcedSellers.find((item) => item.id === announcedSellerId);
    if (!seller) return setNotice("ERROR: Ese vendedor no pertenecía al equipo en la fecha anunciada.");
    setSaving(true);
    const { error } = await supabase.from("analytics_announced_sales").insert({ source_import_id: null, seller_id: seller.id, seller_name: seller.full_name, seller_code: seller.seller_code, supervisor_profile_id: seller.supervisor_profile_id, department: seller.department, zone: seller.zone, announced_at: `${announcedDate}T12:00:00`, expected_post_date: announcedExpected || null, amount_announced: announcedAmount ? Number(announcedAmount) : null, sale_units: 1, snapshot_as_of: announcedDate, notes: announcedNotes || null, status: "anunciada", payload: { manual: true }, import_confidence: 1, detected_fields: { manual: "true" }, created_by: profile.id });
    if (error) setNotice(`ERROR: ${error.message}`); else { setNotice(`Venta anunciada registrada para ${seller.full_name}.`); setAnnouncedAmount(""); setAnnouncedExpected(""); setAnnouncedNotes(""); await refresh(); }
    setSaving(false);
  }
  async function updateAnnounced(id: number, status: AnnouncedSale["status"]) {
    setSaving(true); const { error } = await supabase.from("analytics_announced_sales").update({ status }).eq("id", id);
    if (error) setNotice(`ERROR: ${error.message}`); else { setNotice(status === "posteada" ? "Venta anunciada marcada como posteada." : "Venta anunciada cancelada."); await refresh(); }
    setSaving(false);
  }

  const filteredSales = useMemo(() => sales.filter((sale) => !supervisorId || sale.supervisor_profile_id === supervisorId), [sales, supervisorId]);
  const filteredAnnounced = useMemo(() => announced.filter((sale) => !supervisorId || sale.supervisor_profile_id === supervisorId), [announced, supervisorId]);
  const filteredImports = useMemo(() => imports.filter((item) => !supervisorId || item.supervisor_profile_id === supervisorId), [imports, supervisorId]);
  const saleAssignments = useMemo(() => { const result = new Map<number, string | null>(); filteredSales.forEach((sale) => result.set(sale.id, sale.seller_id || findBestSellerMatch(sale.seller_name, sale.seller_code, filterSellersForDate(selectedSellers, sale.sale_date)).seller?.id || null)); return result; }, [filteredSales, selectedSellers]);
  const announcedAssignments = useMemo(() => { const result = new Map<number, string | null>(); filteredAnnounced.forEach((sale) => { const date = sale.announced_at.slice(0, 10); result.set(sale.id, sale.seller_id || findBestSellerMatch(sale.seller_name, sale.seller_code, filterSellersForDate(selectedSellers, date)).seller?.id || null); }); return result; }, [filteredAnnounced, selectedSellers]);
  const reportRows = useMemo(() => reportSellers.map((seller) => {
    const sellerSales = filteredSales.filter((sale) => saleAssignments.get(sale.id) === seller.id);
    const sellerAnnounced = filteredAnnounced.filter((sale) => sale.status !== "cancelada" && announcedAssignments.get(sale.id) === seller.id);
    return { seller, posted: sellerSales.reduce((sum, sale) => sum + saleUnits(sale.sale_units), 0), announced: sellerAnnounced.filter((sale) => sale.status === "anunciada").reduce((sum, sale) => sum + saleUnits(sale.sale_units), 0), probationSales: sellerSales.filter((sale) => sellerProbationAt(seller, sale.sale_date)).reduce((sum, sale) => sum + saleUnits(sale.sale_units), 0), totalAmount: sellerSales.reduce((sum, sale) => sum + amount(sale.amount_billed), 0) };
  }).sort((left, right) => right.posted - left.posted || right.totalAmount - left.totalAmount), [announcedAssignments, filteredAnnounced, filteredSales, saleAssignments, reportSellers]);
  const monthPosted = filteredSales.reduce((sum, sale) => sum + saleUnits(sale.sale_units), 0);
  const monthAnnounced = filteredAnnounced.filter((sale) => sale.status === "anunciada").reduce((sum, sale) => sum + saleUnits(sale.sale_units), 0);
  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "team", label: "Mi equipo", icon: Users }, { id: "import", label: "Subir Excel", icon: FileSpreadsheet }, { id: "manual", label: "Venta manual", icon: Plus }, { id: "announced", label: "Venta anunciada", icon: Megaphone }, { id: "report", label: "Reporte por vendedor", icon: BarChart3 },
  ];

  return (
    <div className="space-y-4 text-white">
      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-purple-300"><Sparkles size={14} /> Ingreso inteligente de ventas</div>
            <h2 className="mt-2 text-2xl font-black">Equipos históricos y ventas por vigencia</h2>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-zinc-500">La fecha de ingreso y la fecha efectiva de salida definen automáticamente en qué meses puede aparecer cada vendedor. Esta misma regla se reutiliza en reportes, ventas manuales, anunciadas e importaciones.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} disabled={profile.role === "Supervisor" || supervisors.length <= 1} className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200 disabled:opacity-70">
              {!supervisors.length && <option value="">Sin supervisor disponible</option>}
              {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name} · {supervisor.zone}</option>)}
            </select>
            <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-3 text-xs font-bold text-zinc-300 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Actualizar</button>
          </div>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Vendedores activos hoy</p><p className="mt-2 text-2xl font-black">{currentSellers.length}</p></Card>
        <Card className="p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">En período de prueba</p><p className="mt-2 text-2xl font-black text-cyan-300">{currentSellers.filter((seller) => seller.is_on_probation).length}</p></Card>
        <Card className="p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Ventas posteadas · mes</p><p className="mt-2 text-2xl font-black text-emerald-300">{monthPosted}</p></Card>
        <Card className="p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Anunciadas pendientes</p><p className="mt-2 text-2xl font-black text-amber-300">{monthAnnounced}</p></Card>
      </div>
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/[.07] bg-white/[.02] p-2">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition ${tab === item.id ? "bg-purple-600 text-white" : "text-zinc-500 hover:bg-white/[.04] hover:text-zinc-200"}`}><Icon size={15} /> {item.label}</button>; })}</div>
      {notice && <p className={`rounded-xl border p-3 text-xs ${notice.startsWith("ERROR") ? "border-rose-500/20 bg-rose-500/[.07] text-rose-300" : "border-emerald-500/20 bg-emerald-500/[.06] text-emerald-300"}`}>{notice}</p>}

      {loading ? <Card className="grid min-h-64 place-items-center p-8 text-zinc-500"><div className="flex items-center gap-3 text-xs"><Loader2 className="animate-spin" /> Cargando información comercial...</div></Card> : <>
        {tab === "team" && <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <Card className="p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-purple-500/10 text-purple-300"><UserPlus /></span><div><h3 className="font-black">Agregar vendedor</h3><p className="mt-1 text-[10px] text-zinc-600">La fecha de ingreso define desde qué mes existe en reportes.</p></div></div>
            {canManageTeam ? <form onSubmit={saveSeller} className="mt-5 space-y-4">
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Nombre completo<input required value={sellerName} onChange={(event) => setSellerName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs outline-none" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Código · opcional<input value={sellerCode} onChange={(event) => setSellerCode(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs outline-none" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Fecha de ingreso<input required type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Días de prueba<input required min={0} max={365} type="number" value={probationDays} onChange={(event) => setProbationDays(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
              <button disabled={saving || !supervisorId} className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-black disabled:opacity-50"><Save size={15} /> Guardar vendedor</button>
            </form> : <p className="mt-5 text-xs text-amber-300">Tu perfil no puede modificar equipos.</p>}
          </Card>
          <Card className="overflow-hidden"><div className="border-b border-white/[.06] p-5"><h3 className="font-black">Listado histórico del equipo</h3><p className="mt-1 text-[10px] text-zinc-600">El historial completo se conserva; los reportes filtran por vigencia mensual.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Vendedor</th><th>Ingreso</th><th>Salida efectiva</th><th>Fin de prueba</th><th>Condición</th><th>Estado</th><th className="pr-5 text-right">Acción</th></tr></thead><tbody>
            {selectedSellers.map((seller) => <tr key={seller.id} className="border-t border-white/[.05]"><td className="px-5 py-3"><p className="font-bold text-zinc-200">{seller.full_name}</p><p className="mt-1 text-[10px] text-zinc-600">{seller.seller_code || "Sin código"}</p></td><td>{formatDate(seller.hire_date)}</td><td>{formatDate(seller.inactive_effective_date)}</td><td>{formatDate(seller.probation_end_date)}</td><td>{seller.is_on_probation ? <span className="text-cyan-300">EN PRUEBA</span> : <span className="text-emerald-300">PERMANENTE</span>}</td><td>{seller.effective_status.replace("_", " ").toUpperCase()}</td><td className="pr-5 text-right">{canManageTeam && seller.effective_status === "activo" && <button disabled={saving} onClick={() => void retireSeller(seller)} className="inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[10px] font-black text-rose-300"><UserMinus size={13} /> Retirar</button>}{canManageTeam && seller.effective_status !== "activo" && <button disabled={saving} onClick={() => void restoreSeller(seller)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300"><RotateCcw size={13} /> Reactivar</button>}</td></tr>)}
            {!selectedSellers.length && <tr><td colSpan={7} className="px-5 py-8 text-center text-zinc-600">No hay vendedores registrados.</td></tr>}
          </tbody></table></div></Card>
        </div>}

        {tab === "import" && <div className="space-y-4">
          <Card className="p-5"><div className="flex flex-col gap-5"><div><h3 className="font-black">Subir ventas por mes</h3><p className="mt-2 max-w-4xl text-xs leading-5 text-zinc-500">Selecciona primero el mes. Solo los vendedores que estuvieron vigentes durante ese mes podrán vincularse a la carga.</p></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Mes de ventas<input type="month" value={importMonth} onChange={(event) => changeImportMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-purple-400/20 bg-[#111116] p-3 text-xs font-bold text-purple-200" /></label>
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Tipo<select value={importKind} onChange={(event) => setImportKind(event.target.value as ImportKind)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white"><option value="posted">Ventas posteadas</option><option value="announced">Ventas anunciadas</option></select></label>
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Desde<input type="date" value={importStart} onChange={(event) => setImportStart(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Hasta / corte<input type="date" value={importEnd} onChange={(event) => setImportEnd(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Actualización<select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white"><option value="replace">Sustituir rango anterior</option><option value="append">Agregar sin sustituir</option></select></label>
            </div>
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/[.04] p-3 text-xs text-cyan-200"><b>{importSellers.length}</b> vendedores pertenecieron al equipo en {importMonth}. El emparejamiento del archivo se limita a ellos y además valida la fecha exacta de cada venta.</div>
            <div onClick={() => !saving && fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void parseFile(file); }} className="grid min-h-52 cursor-pointer place-items-center rounded-2xl border border-dashed border-purple-400/30 bg-purple-500/[.035] p-8 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-purple-500/10 text-purple-300"><CloudUpload /></span><h4 className="mt-4 font-black">{saving ? "Procesando..." : "Arrastra cualquier Excel o CSV"}</h4><p className="mt-2 text-xs text-zinc-500">El mes seleccionado controla qué vendedores son válidos.</p><button type="button" className="mt-5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-black">Seleccionar archivo</button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseFile(file); }} /></div></div>
          </div></Card>
          {importRows.length > 0 && <Card className="overflow-hidden"><div className="flex flex-col gap-4 border-b border-white/[.06] p-5 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="font-black">Vista previa inteligente</h3><p className="mt-1 text-[10px] text-zinc-600">{importFile} · {importMonth} · hoja {importSheet} · {totalImportUnits.toLocaleString("es-HN")} ventas · confianza {Math.round(importConfidence * 100)}%</p></div><button disabled={saving || !selectedSupervisor} onClick={() => void confirmImport()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black disabled:opacity-50"><Check size={15} /> Confirmar actualización</button></div>
            {(unresolvedNames.length > 0 || excludedRows > 0) && <div className="m-4 space-y-3 rounded-xl border border-amber-500/15 bg-amber-500/[.05] p-4"><p className="text-[10px] leading-5 text-amber-200"><AlertTriangle size={14} className="mr-2 inline" />{unresolvedNames.length} nombres requieren revisión y {excludedRows} filas quedaron fuera del mes/rango.</p>{unresolvedNames.map((row) => { const validForRow = filterSellersForDate(importSellers, row.sale.saleDate); return <label key={row.key} className="grid gap-2 text-[10px] font-bold text-zinc-400 sm:grid-cols-[1fr_1.3fr] sm:items-center"><span>{row.sale.sellerName}{row.match.ambiguous ? " · coincidencia ambigua" : ""}</span><select value={manualMatches[row.key] || ""} onChange={(event) => setManualMatches((current) => ({ ...current, [row.key]: event.target.value }))} className="rounded-lg border border-white/[.08] bg-[#111116] p-2 text-xs text-white"><option value="">Conservar nombre original</option>{validForRow.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name}</option>)}</select></label>; })}</div>}
            <div className="max-h-[460px] overflow-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="sticky top-0 bg-[#17171e] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Nombre en archivo</th><th>Vendedor oficial</th><th>Coincidencia</th><th>Ventas</th><th>Fecha</th><th>Monto total</th><th>Ciudad</th></tr></thead><tbody>{importPreview.slice(0,150).map((row,index) => <tr key={`${row.sale.sellerName}-${row.sale.saleDate}-${index}`} className="border-t border-white/[.05]"><td className="px-5 py-3 font-bold text-zinc-200">{row.sale.sellerName}</td><td>{row.match.seller ? <span className="text-emerald-300">{row.match.seller.full_name}</span> : <span className="text-amber-300">Nombre original</span>}</td><td><span className={row.match.seller ? "text-cyan-300" : "text-amber-300"}>{matchLabel(row.match)} · {Math.round(row.match.score*100)}%</span></td><td className="text-base font-black text-purple-300">{row.units}</td><td>{formatDate(row.sale.saleDate)}</td><td>{row.totalAmount === null ? "—" : money(row.totalAmount)}</td><td>{row.sale.city || "—"}</td></tr>)}</tbody></table></div>
          </Card>}
          <Card className="overflow-hidden"><div className="flex items-center gap-3 border-b border-white/[.06] p-5"><History className="text-purple-300" size={18}/><div><h3 className="font-black">Historial de cortes cargados</h3><p className="mt-1 text-[10px] text-zinc-600">Cada carga conserva su mes y rango.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Archivo</th><th>Rango</th><th>Corte</th><th>Ventas</th><th>Modo</th><th>Sustituyó</th><th>Estado</th></tr></thead><tbody>{filteredImports.map((item)=><tr key={item.id} className="border-t border-white/[.05]"><td className="px-5 py-3"><p className="max-w-64 truncate font-bold text-zinc-200">{item.file_name}</p><p className="mt-1 text-[9px] text-zinc-600">{new Date(item.created_at).toLocaleString("es-HN")}</p></td><td>{formatDate(item.period_start)} — {formatDate(item.period_end)}</td><td>{formatDate(item.snapshot_as_of)}</td><td className="text-base font-black text-purple-300">{item.row_count}</td><td>{item.import_mode === "replace" ? "SUSTITUCIÓN" : "ACUMULAR"}</td><td>{item.replaced_rows}</td><td>{item.superseded_by ? <span className="text-zinc-600">REEMPLAZADO</span> : <span className="text-emerald-300">VIGENTE</span>}</td></tr>)}{!filteredImports.length && <tr><td colSpan={7} className="px-5 py-8 text-center text-zinc-600">Aún no hay cortes registrados.</td></tr>}</tbody></table></div></Card>
        </div>}

        {tab === "manual" && <Card className="mx-auto max-w-3xl p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300"><Plus /></span><div><h3 className="font-black">Registrar venta por vendedor</h3><p className="mt-1 text-[10px] text-zinc-600">El selector cambia automáticamente según la fecha de la venta.</p></div></div><form onSubmit={saveManualSale} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Fecha<input required type="date" value={manualDate} onChange={(event)=>setManualDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Vendedor<select required value={manualSellerId} onChange={(event)=>setManualSellerId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs">{manualSellers.map((seller)=><option key={seller.id} value={seller.id}>{seller.full_name}{sellerProbationAt(seller, manualDate) ? " · EN PRUEBA" : ""}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Monto<input type="number" step="0.01" min="0" value={manualAmount} onChange={(event)=>setManualAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label><label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Ciudad<input value={manualCity} onChange={(event)=>setManualCity(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label><label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Servicio<input value={manualService} onChange={(event)=>setManualService(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label><label className="text-[10px] font-black uppercase tracking-wider text-zinc-600 sm:col-span-2">Paquete<input value={manualPackage} onChange={(event)=>setManualPackage(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label><button disabled={saving || !manualSellers.length} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3 text-xs font-black sm:col-span-2 disabled:opacity-50"><Save size={15}/> Guardar venta</button>
        </form></Card>}

        {tab === "announced" && <div className="grid gap-4 xl:grid-cols-[420px_1fr]"><Card className="p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/10 text-amber-300"><Megaphone/></span><div><h3 className="font-black">Nueva venta anunciada</h3><p className="mt-1 text-[10px] text-zinc-600">El vendedor debe estar vigente en la fecha anunciada.</p></div></div><form onSubmit={saveAnnouncedSale} className="mt-5 space-y-4">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Fecha anunciada<input type="date" value={announcedDate} onChange={(event)=>setAnnouncedDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Vendedor<select required value={announcedSellerId} onChange={(event)=>setAnnouncedSellerId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs">{announcedSellers.map((seller)=><option key={seller.id} value={seller.id}>{seller.full_name}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Monto<input type="number" step="0.01" min="0" value={announcedAmount} onChange={(event)=>setAnnouncedAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label><label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Posteo esperado<input type="date" value={announcedExpected} onChange={(event)=>setAnnouncedExpected(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label></div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-600">Observación<textarea value={announcedNotes} onChange={(event)=>setAnnouncedNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs" /></label><button disabled={saving || !announcedSellers.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 p-3 text-xs font-black disabled:opacity-50"><Megaphone size={15}/> Anunciar venta</button>
        </form></Card>
          <Card className="overflow-hidden"><div className="border-b border-white/[.06] p-5"><h3 className="font-black">Ventas anunciadas del mes</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Vendedor</th><th>Anunciada</th><th>Cantidad</th><th>Monto</th><th>Estado</th><th className="pr-5 text-right">Acción</th></tr></thead><tbody>{filteredAnnounced.map((sale)=><tr key={sale.id} className="border-t border-white/[.05]"><td className="px-5 py-3 font-bold text-zinc-200">{sale.seller_name}</td><td>{new Date(sale.announced_at).toLocaleString("es-HN")}</td><td>{saleUnits(sale.sale_units)}</td><td>{money(amount(sale.amount_announced))}</td><td>{sale.status.toUpperCase()}</td><td className="pr-5 text-right">{sale.status === "anunciada" && <div className="flex justify-end gap-2"><button disabled={saving} onClick={()=>void updateAnnounced(sale.id,"posteada")} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300"><Check size={13} className="mr-1 inline"/> Posteada</button><button disabled={saving} onClick={()=>void updateAnnounced(sale.id,"cancelada")} className="rounded-lg bg-rose-500/10 px-3 py-2 text-[10px] font-black text-rose-300"><X size={13} className="mr-1 inline"/> Cancelar</button></div>}</td></tr>)}{!filteredAnnounced.length && <tr><td colSpan={6} className="px-5 py-8 text-center text-zinc-600">No hay ventas anunciadas este mes.</td></tr>}</tbody></table></div></Card>
        </div>}

        {tab === "report" && <Card className="overflow-hidden"><div className="flex flex-col gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">Reporte histórico por vendedor</h3><p className="mt-1 text-[10px] text-zinc-600">Solo aparecen vendedores cuya vigencia se cruza con el mes seleccionado.</p></div><input type="month" value={reportMonth} onChange={(event)=>setReportMonth(event.target.value)} className="rounded-xl border border-purple-400/20 bg-[#111116] px-4 py-3 text-xs font-bold text-purple-200" /></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3"># / Vendedor</th><th>Ingreso</th><th>Salida efectiva</th><th>Fin de prueba</th><th>Posteadas</th><th>Anunciadas</th><th>Ventas en prueba</th><th>Monto posteado</th></tr></thead><tbody>{reportRows.map((row,index)=><tr key={row.seller.id} className="border-t border-white/[.05]"><td className="px-5 py-3"><p className="font-bold text-zinc-200">{index+1}. {row.seller.full_name}</p><p className="mt-1 text-[10px] text-zinc-600">{row.seller.seller_code || "Sin código"}</p></td><td>{formatDate(row.seller.hire_date)}</td><td>{formatDate(row.seller.inactive_effective_date)}</td><td>{formatDate(row.seller.probation_end_date)}</td><td className="text-base font-black text-emerald-300">{row.posted}</td><td className="text-base font-black text-amber-300">{row.announced}</td><td>{row.probationSales}</td><td className="font-bold text-zinc-200">{money(row.totalAmount)}</td></tr>)}{!reportRows.length && <tr><td colSpan={8} className="px-5 py-8 text-center text-zinc-600">No hubo vendedores vigentes en este mes.</td></tr>}</tbody></table></div></Card>}
      </>}

      <Card className="flex flex-col gap-3 p-4 text-[10px] leading-5 text-zinc-500 sm:flex-row sm:items-center sm:justify-between"><span><ShieldCheck size={14} className="mr-2 inline text-purple-300"/>Retirar un vendedor nunca elimina su historial.</span><span><Clock3 size={14} className="mr-2 inline text-amber-300"/>La vigencia histórica depende de ingreso y salida efectiva.</span></Card>
    </div>
  );
}
