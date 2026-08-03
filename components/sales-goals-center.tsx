"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Loader2,
  RefreshCw,
  Save,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { supabase } from "@/lib/supabase-client";

type Seller = {
  id: string;
  supervisor_profile_id: string;
  seller_code: string | null;
  full_name: string;
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

type Sale = {
  seller_id: string | null;
  seller_name: string;
  sale_units: number | null;
  amount_billed: number | string | null;
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

function units(value: number | null | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function amount(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    maximumFractionDigits: 0,
  }).format(value);
}

function supervisorOptions(profile: Profile, profiles: Profile[]) {
  const active = profiles.filter(
    (candidate) => candidate.active && candidate.role === "Supervisor",
  );
  if (profile.role === "Administrador") return active;
  if (profile.role === "Líder de departamento") {
    return active.filter(
      (candidate) =>
        candidate.managerId === profile.id &&
        candidate.department === profile.department,
    );
  }
  if (profile.role === "Supervisor") return [profile];
  return [];
}

export function SalesGoalsCenter({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const supervisors = useMemo(
    () => supervisorOptions(profile, profiles),
    [profile, profiles],
  );
  const [supervisorId, setSupervisorId] = useState(
    profile.role === "Supervisor" ? profile.id : supervisors[0]?.id || "",
  );
  const [month, setMonth] = useState(currentMonth());
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supervisorId && supervisors[0]) setSupervisorId(supervisors[0].id);
  }, [supervisorId, supervisors]);

  const load = useCallback(async () => {
    if (!supervisorId) {
      setSellers([]);
      setGoals([]);
      setSales([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { start, end } = monthBounds(month);
    const [sellerResult, goalResult, saleResult] = await Promise.all([
      supabase
        .from("analytics_seller_report")
        .select("id,supervisor_profile_id,seller_code,full_name,effective_status")
        .eq("supervisor_profile_id", supervisorId)
        .neq("effective_status", "inactivo")
        .order("full_name"),
      supabase
        .from("analytics_seller_goals")
        .select("id,seller_id,supervisor_profile_id,goal_month,goal_units,correction_reason")
        .eq("supervisor_profile_id", supervisorId)
        .eq("goal_month", start),
      supabase
        .from("analytics_sales")
        .select("seller_id,seller_name,sale_units,amount_billed")
        .eq("supervisor_profile_id", supervisorId)
        .gte("sale_date", start)
        .lt("sale_date", end)
        .limit(50000),
    ]);

    const firstError = sellerResult.error || goalResult.error || saleResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextSellers = (sellerResult.data || []) as Seller[];
    const nextGoals = (goalResult.data || []) as Goal[];
    setSellers(nextSellers);
    setGoals(nextGoals);
    setSales((saleResult.data || []) as Sale[]);
    setDrafts(
      Object.fromEntries(
        nextSellers.map((seller) => [
          seller.id,
          Number(
            nextGoals.find((goal) => goal.seller_id === seller.id)?.goal_units || 0,
          ),
        ]),
      ),
    );
    setLoading(false);
  }, [month, supervisorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const saleMap = new Map<string, { units: number; amount: number }>();
    sales.forEach((sale) => {
      if (!sale.seller_id) return;
      const current = saleMap.get(sale.seller_id) || { units: 0, amount: 0 };
      current.units += units(sale.sale_units);
      current.amount += amount(sale.amount_billed);
      saleMap.set(sale.seller_id, current);
    });
    return sellers.map((seller) => {
      const actual = saleMap.get(seller.id) || { units: 0, amount: 0 };
      const goal = Number(drafts[seller.id] || 0);
      return {
        seller,
        goal,
        actualUnits: actual.units,
        actualAmount: actual.amount,
        compliance: goal ? (actual.units / goal) * 100 : 0,
      };
    });
  }, [drafts, sales, sellers]);

  const totals = useMemo(
    () => ({
      goal: rows.reduce((sum, row) => sum + row.goal, 0),
      actual: rows.reduce((sum, row) => sum + row.actualUnits, 0),
      amount: rows.reduce((sum, row) => sum + row.actualAmount, 0),
    }),
    [rows],
  );
  const supervisorCompliance = totals.goal
    ? (totals.actual / totals.goal) * 100
    : 0;

  async function saveAll() {
    if (reason.trim().length < 5) {
      setError("Escribe un motivo de al menos 5 caracteres para registrar la asignación.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const { start } = monthBounds(month);
    for (const seller of sellers) {
      const target = Number(drafts[seller.id] || 0);
      const current = goals.find((goal) => goal.seller_id === seller.id);
      if (current && Number(current.goal_units) === target) continue;
      const { error: saveError } = await supabase.rpc(
        "analytics_set_seller_goal",
        {
          target_seller_id: seller.id,
          target_month: start,
          target_goal_units: target,
          target_reason: reason.trim(),
        },
      );
      if (saveError) {
        setError(`No se pudo guardar la meta de ${seller.full_name}: ${saveError.message}`);
        setSaving(false);
        return;
      }
    }
    setNotice("Metas guardadas. La meta del supervisor fue recalculada automáticamente.");
    setReason("");
    setSaving(false);
    await load();
    window.dispatchEvent(new CustomEvent("cc-analytics-data-changed"));
  }

  const selectedSupervisor = supervisors.find((item) => item.id === supervisorId);

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
            Planeación comercial
          </p>
          <h2 className="mt-1 text-xl font-black">Metas de ventas</h2>
          <p className="mt-1 text-xs text-zinc-500">
            La meta del supervisor es siempre la suma de las metas mensuales de sus vendedores.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-2.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
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
      {notice && (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-3 text-xs text-emerald-300">
          <Check className="mr-2 inline" size={15} /> {notice}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 md:grid-cols-2 xl:grid-cols-[1fr_.7fr_1.3fr]">
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
          Supervisor
          <select
            value={supervisorId}
            disabled={profile.role === "Supervisor"}
            onChange={(event) => setSupervisorId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white disabled:opacity-60"
          >
            {!supervisors.length && <option value="">Sin supervisores disponibles</option>}
            {supervisors.map((supervisor) => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.name} · {supervisor.zone}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
          Mes
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white"
          />
        </label>
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
          Motivo de asignación o ajuste
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej.: Distribución de la meta mensual del equipo"
            className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#111116] p-3 text-xs text-white"
          />
        </label>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-2xl border border-purple-500/15 bg-purple-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-300">Meta del supervisor</p>
          <p className="mt-2 text-3xl font-black">{totals.goal}</p>
          <p className="mt-1 text-[10px] text-zinc-600">{selectedSupervisor?.name || "Sin supervisor"}</p>
        </section>
        <section className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Ventas posteadas</p>
          <p className="mt-2 text-3xl font-black">{totals.actual}</p>
        </section>
        <section className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Monto posteado</p>
          <p className="mt-2 text-2xl font-black">{money(totals.amount)}</p>
        </section>
        <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[.04] p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">Cumplimiento</p>
          <p className="mt-2 text-3xl font-black">{supervisorCompliance.toFixed(1)}%</p>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
        <div className="border-b border-white/[.06] p-5">
          <h3 className="font-black">Distribución por vendedor</h3>
          <p className="mt-1 text-[10px] text-zinc-600">
            Meta editable, resultado real y cumplimiento calculado automáticamente.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-xs">
            <thead className="bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-5 py-3">Vendedor</th>
                <th>Meta</th>
                <th>Posteadas</th>
                <th>Cumplimiento</th>
                <th>Monto</th>
                <th className="pr-5">Progreso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.seller.id} className="border-t border-white/[.05]">
                  <td className="px-5 py-3">
                    <p className="font-black text-zinc-200">{row.seller.full_name}</p>
                    <p className="mt-1 text-[9px] text-zinc-600">{row.seller.seller_code || "Sin código"}</p>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={drafts[row.seller.id] ?? 0}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.seller.id]: Math.max(0, Number(event.target.value || 0)),
                        }))
                      }
                      className="w-28 rounded-lg border border-purple-400/20 bg-[#111116] px-3 py-2 text-sm font-black text-purple-200 outline-none"
                    />
                  </td>
                  <td className="text-lg font-black text-emerald-300">{row.actualUnits}</td>
                  <td className="font-black text-cyan-200">{row.goal ? `${row.compliance.toFixed(1)}%` : "SIN META"}</td>
                  <td className="font-bold text-zinc-300">{money(row.actualAmount)}</td>
                  <td className="pr-5">
                    <div className="h-2 w-full max-w-52 overflow-hidden rounded-full bg-white/[.05]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500"
                        style={{ width: `${Math.min(100, Math.max(0, row.compliance))}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-600">
                    <Users className="mx-auto mb-3" size={28} />
                    Este supervisor no tiene vendedores activos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <button
        onClick={() => void saveAll()}
        disabled={saving || !rows.length}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-black disabled:opacity-40"
      >
        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
        Guardar metas y recalcular supervisor
      </button>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-xs text-zinc-400"><Target className="mr-2 inline text-purple-300" size={15} />Cada mes conserva su propia distribución.</div>
        <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-xs text-zinc-400"><TrendingUp className="mr-2 inline text-emerald-300" size={15} />El cumplimiento usa ventas posteadas reales.</div>
        <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-xs text-zinc-400"><CircleDollarSign className="mr-2 inline text-cyan-300" size={15} />El monto nunca se edita desde la meta.</div>
      </section>
    </div>
  );
}
