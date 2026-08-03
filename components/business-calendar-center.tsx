"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Loader2, RefreshCw, Save } from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

type CalendarRow = {
  calendar_date: string;
  day_number: number;
  day_name: string;
  default_working: boolean;
  is_working_day: boolean;
  event_type: string | null;
  label: string | null;
  reason: string | null;
  is_override: boolean;
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function BusinessCalendarCenter({ profile }: { profile: Profile }) {
  const [month, setMonth] = useState(currentMonth());
  const [department, setDepartment] = useState(profile.role === "Administrador" ? "Ventas Digitales" : profile.department);
  const [zone, setZone] = useState(profile.role === "Administrador" ? "Zona Norte" : profile.zone);
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [selected, setSelected] = useState<CalendarRow | null>(null);
  const [working, setWorking] = useState(false);
  const [eventType, setEventType] = useState("asueto");
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const monthDate = `${month}-01`;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("analytics_month_calendar", {
      target_month: monthDate,
      target_department: department,
      target_zone: zone,
    });
    if (loadError) setError(loadError.message);
    else setRows((data || []) as CalendarRow[]);
    setLoading(false);
  }, [department, monthDate, zone]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => ({
    working: rows.filter((row) => row.is_working_day).length,
    nonWorking: rows.filter((row) => !row.is_working_day).length,
    overrides: rows.filter((row) => row.is_override).length,
  }), [rows]);

  function choose(row: CalendarRow) {
    setSelected(row);
    setWorking(row.is_working_day);
    setEventType(row.event_type || (row.default_working ? "asueto" : "domingo_habilitado"));
    setLabel(row.label || (row.default_working ? "Día no hábil" : "Domingo habilitado"));
    setReason(row.reason || "Ajuste manual del calendario operativo");
    setError("");
    setNotice("");
  }

  async function save() {
    if (!selected) return;
    if (label.trim().length < 3 || reason.trim().length < 5) {
      setError("Escribe un nombre y un motivo de al menos 5 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: saveError } = await supabase.rpc("analytics_set_business_day", {
      target_date: selected.calendar_date,
      target_department: department,
      target_zone: zone,
      target_is_working_day: working,
      target_event_type: eventType,
      target_label: label.trim(),
      target_reason: reason.trim(),
    });
    if (saveError) setError(saveError.message);
    else {
      setNotice("Calendario actualizado. Las proyecciones usarán este ajuste.");
      setSelected(null);
      await load();
      window.dispatchEvent(new CustomEvent("cc-business-calendar-changed"));
    }
    setSaving(false);
  }

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Planeación operativa</p>
          <h2 className="mt-1 text-xl font-black">Calendario laboral y asuetos</h2>
          <p className="mt-1 text-xs text-zinc-500">Los domingos quedan fuera de la proyección por defecto. Las ventas registradas esos días sí cuentan.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Actualizar
        </button>
      </section>

      {error && <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300"><AlertTriangle className="mr-2 inline" size={15} />{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-3 text-xs text-emerald-300"><Check className="mr-2 inline" size={15} />{notice}</p>}

      <section className="grid gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 md:grid-cols-3">
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white" /></label>
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Departamento<select value={department} disabled={profile.role !== "Administrador"} onChange={(event) => setDepartment(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white disabled:opacity-60">{["Ventas Digitales","Ventas Residenciales","Ventas Residenciales Rurales","Ventas Corporativas"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Zona<select value={zone} disabled={profile.role !== "Administrador"} onChange={(event) => setZone(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white disabled:opacity-60">{["Nacional","Zona Norte","Zona Centro","Zona Sur"].map((value) => <option key={value}>{value}</option>)}</select></label>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[.04] p-5"><p className="text-[10px] font-black uppercase text-emerald-300">Días hábiles</p><p className="mt-2 text-3xl font-black">{totals.working}</p></div>
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[.04] p-5"><p className="text-[10px] font-black uppercase text-amber-300">No hábiles</p><p className="mt-2 text-3xl font-black">{totals.nonWorking}</p></div>
        <div className="rounded-2xl border border-purple-500/15 bg-purple-500/[.04] p-5"><p className="text-[10px] font-black uppercase text-purple-300">Ajustes manuales</p><p className="mt-2 text-3xl font-black">{totals.overrides}</p></div>
      </div>

      <section className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
        <div className="mb-4 flex items-center gap-2"><CalendarDays className="text-purple-300" size={18} /><h3 className="font-black">Selecciona un día para editarlo</h3></div>
        <div className="grid grid-cols-7 gap-2 text-center text-[10px] text-zinc-600">{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((day) => <span key={day} className="py-2 font-black">{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-2">
          {rows.length > 0 && Array.from({ length: (new Date(`${rows[0].calendar_date}T12:00:00`).getDay() + 6) % 7 }).map((_, index) => <span key={`blank-${index}`} />)}
          {rows.map((row) => <button key={row.calendar_date} onClick={() => choose(row)} className={`min-h-20 rounded-xl border p-2 text-left transition ${row.is_working_day ? "border-emerald-500/15 bg-emerald-500/[.04]" : "border-amber-500/20 bg-amber-500/[.05]"} ${row.is_override ? "ring-1 ring-purple-400/50" : ""}`}><b className="text-sm">{row.day_number}</b><span className={`mt-3 block text-[9px] font-black ${row.is_working_day ? "text-emerald-300" : "text-amber-300"}`}>{row.is_working_day ? "HÁBIL" : "NO HÁBIL"}</span>{row.label && <small className="mt-1 block truncate text-zinc-500">{row.label}</small>}</button>)}
        </div>
      </section>

      {selected && <section className="grid gap-4 rounded-2xl border border-purple-400/20 bg-purple-500/[.04] p-5 md:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-xs font-black">{selected.calendar_date}</p><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={working} onChange={(event) => setWorking(event.target.checked)} /> Considerar día hábil</label></div>
        <label className="text-[10px] font-black uppercase text-zinc-600">Tipo<select value={eventType} onChange={(event) => setEventType(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white"><option value="asueto">Asueto</option><option value="feriado">Feriado</option><option value="ajuste">Ajuste operativo</option><option value="domingo_habilitado">Domingo habilitado</option></select></label>
        <label className="text-[10px] font-black uppercase text-zinc-600">Nombre<input value={label} onChange={(event) => setLabel(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white" /></label>
        <label className="text-[10px] font-black uppercase text-zinc-600">Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white" /></label>
        <button onClick={() => void save()} disabled={saving} className="md:col-span-2 xl:col-span-4 flex items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-black disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Guardar ajuste de calendario</button>
      </section>}
    </div>
  );
}
