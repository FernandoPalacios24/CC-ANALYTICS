"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import type {
  Department,
  NewUserInput,
  Profile,
  Role,
} from "@/components/analytics-app-v2";

export type ProductionCreateUserInput = NewUserInput & {
  password: string;
};

const departments: Department[] = [
  "Ventas Digitales",
  "Ventas Residenciales",
  "Ventas Residenciales Rurales",
  "Ventas Corporativas",
  "Marketing",
  "Call Center",
  "Recursos Humanos",
  "Finanzas",
  "Operaciones",
];

const roles: Role[] = [
  "Administrador",
  "Líder de departamento",
  "Supervisor",
  "Analista",
  "Operador",
];

const zones = ["Nacional", "Zona Norte", "Zona Centro", "Zona Sur"];

const jobProfiles = [
  "Administrador",
  "Líder de departamento",
  "Supervisor",
  "Analista",
  "Operador",
  "Community Manager",
  "Coordinador",
  "Jefe",
  "Especialista",
  "Auditor",
];

function defaultJobProfile(role: Role) {
  if (role === "Administrador") return "Administrador";
  if (role === "Líder de departamento") return "Líder de departamento";
  if (role === "Supervisor") return "Supervisor";
  if (role === "Operador") return "Operador";
  return "Analista";
}

function managerCandidates(
  profiles: Profile[],
  role: Role,
  department: Department,
  zone: string,
  currentId?: string,
) {
  if (role === "Supervisor") {
    return profiles.filter(
      (profile) =>
        profile.id !== currentId &&
        profile.active &&
        profile.role === "Líder de departamento" &&
        profile.department === department &&
        (profile.zone === zone || profile.zone === "Nacional"),
    );
  }
  if (role === "Analista" || role === "Operador") {
    return profiles.filter(
      (profile) =>
        profile.id !== currentId &&
        profile.active &&
        profile.role === "Supervisor" &&
        profile.department === department &&
        (profile.zone === zone || profile.zone === "Nacional"),
    );
  }
  return [];
}

function missingFields(profile: Profile) {
  const fields: string[] = [];
  if (!profile.name.trim()) fields.push("nombre");
  if (!profile.email.trim()) fields.push("correo");
  if (!profile.department) fields.push("departamento");
  if (!profile.jobProfile.trim() || profile.jobProfile === "Pendiente de asignación")
    fields.push("cargo");
  if (!profile.zone.trim()) fields.push("zona");
  if (
    ["Supervisor", "Analista", "Operador"].includes(profile.role) &&
    !profile.managerId
  ) {
    fields.push("superior");
  }
  return fields;
}

const selectClass =
  "max-w-52 rounded-lg border border-white/[.08] bg-[#111116] px-2 py-2 text-xs text-zinc-200 outline-none disabled:opacity-50";
const inputClass =
  "w-full rounded-xl border border-white/[.09] bg-[#111116] p-3 text-xs text-white outline-none focus:border-purple-400/50";

export function ProductionUserAccess({
  profiles,
  onProfilesChange,
  onUpdate,
  onCreate,
}: {
  profiles: Profile[];
  onProfilesChange: (profiles: Profile[]) => void;
  onUpdate: (profile: Profile) => Promise<string | null>;
  onCreate: (
    input: ProductionCreateUserInput,
  ) => Promise<{ profile?: Profile; error?: string }>;
}) {
  const [rows, setRows] = useState(profiles);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const visibleRows = useMemo(
    () =>
      rows.filter((row) =>
        `${row.name} ${row.email} ${row.department} ${row.jobProfile} ${row.role}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [rows, search],
  );

  function patch(id: string, changes: Partial<Profile>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
  }

  async function save(row: Profile) {
    setSavingId(row.id);
    setError("");
    setNotice("");
    const result = await onUpdate(row);
    if (result) {
      setError(result);
    } else {
      const next = rows.map((item) => (item.id === row.id ? row : item));
      setRows(next);
      onProfilesChange(next);
      setNotice(`Acceso de ${row.name} actualizado correctamente.`);
    }
    setSavingId(null);
  }

  return (
    <div className="animate-in space-y-4 text-white">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">
            Administración protegida
          </p>
          <h2 className="mt-1 text-xl font-black">Usuarios y permisos</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Identidad, jerarquía, departamento, zona, cargo y estado en una sola vista.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar usuario..."
            className="rounded-xl border border-white/[.08] bg-[#111116] px-4 py-2.5 text-xs outline-none"
          />
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-black"
          >
            <Plus size={15} /> Crear usuario
          </button>
        </div>
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

      <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left text-xs">
            <thead className="border-b border-white/[.06] bg-white/[.02] text-[10px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-5 py-3">Usuario</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Zona</th>
                <th>Rol</th>
                <th>Reporta a</th>
                <th>Integridad</th>
                <th>Estado</th>
                <th className="pr-5 text-right">Guardar</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const managers = managerCandidates(
                  rows,
                  row.role,
                  row.department,
                  row.zone,
                  row.id,
                );
                const missing = missingFields(row);
                return (
                  <tr key={row.id} className="border-b border-white/[.05] align-middle">
                    <td className="px-5 py-3">
                      <p className="font-black text-zinc-200">{row.name}</p>
                      <p className="mt-1 text-[10px] text-zinc-600">{row.email}</p>
                    </td>
                    <td>
                      <select
                        value={row.jobProfile}
                        disabled={row.role === "Administrador"}
                        onChange={(event) =>
                          patch(row.id, { jobProfile: event.target.value })
                        }
                        className={selectClass}
                      >
                        {[row.jobProfile, ...jobProfiles]
                          .filter((value, index, all) => value && all.indexOf(value) === index)
                          .map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.department}
                        disabled={row.role === "Administrador"}
                        onChange={(event) =>
                          patch(row.id, {
                            department: event.target.value as Department,
                            managerId: null,
                          })
                        }
                        className={selectClass}
                      >
                        {(row.role === "Administrador"
                          ? ["Administración" as Department]
                          : departments
                        ).map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.zone}
                        disabled={row.role === "Administrador"}
                        onChange={(event) =>
                          patch(row.id, { zone: event.target.value, managerId: null })
                        }
                        className={selectClass}
                      >
                        {[row.zone, ...zones]
                          .filter((value, index, all) => value && all.indexOf(value) === index)
                          .map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.role}
                        onChange={(event) => {
                          const role = event.target.value as Role;
                          patch(row.id, {
                            role,
                            managerId: null,
                            department:
                              role === "Administrador"
                                ? "Administración"
                                : row.department === "Administración"
                                  ? "Ventas Digitales"
                                  : row.department,
                            zone:
                              role === "Administrador"
                                ? "Nacional"
                                : row.zone === "Nacional"
                                  ? "Zona Norte"
                                  : row.zone,
                            jobProfile: defaultJobProfile(role),
                          });
                        }}
                        className={selectClass}
                      >
                        {roles.map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </td>
                    <td>
                      {managers.length ? (
                        <select
                          value={row.managerId || ""}
                          onChange={(event) =>
                            patch(row.id, { managerId: event.target.value || null })
                          }
                          className={selectClass}
                        >
                          <option value="">Seleccionar superior</option>
                          {managers.map((manager) => (
                            <option key={manager.id} value={manager.id}>
                              {manager.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-zinc-600">
                          {["Administrador", "Líder de departamento"].includes(row.role)
                            ? "Nivel superior"
                            : "Sin superior compatible"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[9px] font-black ${
                          missing.length
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-emerald-500/10 text-emerald-300"
                        }`}
                        title={missing.length ? `Falta: ${missing.join(", ")}` : "Perfil completo"}
                      >
                        {missing.length ? <AlertTriangle size={11} /> : <ShieldCheck size={11} />}
                        {missing.length ? `${missing.length} PENDIENTE` : "COMPLETO"}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => patch(row.id, { active: !row.active })}
                        className={`rounded-full px-3 py-1 text-[9px] font-black ${
                          row.active
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-rose-500/10 text-rose-300"
                        }`}
                      >
                        {row.active ? "ACTIVO" : "INACTIVO"}
                      </button>
                    </td>
                    <td className="pr-5 text-right">
                      <button
                        onClick={() => void save(row)}
                        disabled={savingId === row.id || missing.length > 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-200 disabled:opacity-40"
                      >
                        {savingId === row.id ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}
                        Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visibleRows.length && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-zinc-600">
                    No se encontraron usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {creating && (
        <CreateUserModal
          profiles={rows}
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            setError("");
            setNotice("");
            const result = await onCreate(input);
            if (result.error) {
              setError(result.error);
              return false;
            }
            if (result.profile) {
              const next = [
                result.profile,
                ...rows.filter((row) => row.id !== result.profile!.id),
              ];
              setRows(next);
              onProfilesChange(next);
              setNotice(`${result.profile.name} fue creado y ya puede ingresar.`);
            }
            setCreating(false);
            return true;
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  profiles,
  onClose,
  onCreate,
}: {
  profiles: Profile[];
  onClose: () => void;
  onCreate: (input: ProductionCreateUserInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ProductionCreateUserInput>({
    name: "",
    email: "",
    password: "",
    department: "Ventas Digitales",
    jobProfile: "Supervisor",
    zone: "Zona Norte",
    role: "Supervisor",
    managerId: null,
  });
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const managers = managerCandidates(
    profiles,
    draft.role,
    draft.department,
    draft.zone,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!draft.name.trim() || !draft.email.trim()) {
      setError("Nombre y correo son obligatorios.");
      return;
    }
    if (
      draft.password.length < 10 ||
      !/[A-Z]/.test(draft.password) ||
      !/[a-z]/.test(draft.password) ||
      !/[0-9]/.test(draft.password)
    ) {
      setError("La contraseña necesita 10 caracteres, mayúscula, minúscula y número.");
      return;
    }
    if (draft.password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!["Administrador", "Líder de departamento"].includes(draft.role) && !draft.managerId) {
      setError("Selecciona el superior responsable.");
      return;
    }
    setSaving(true);
    await onCreate(draft);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[180] grid place-items-center bg-black/80 p-4">
      <form
        onSubmit={submit}
        className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-purple-400/20 bg-[#0d0d12] shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[.07] bg-[#0d0d12]/95 p-5 backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-purple-300">Alta directa</p>
            <h3 className="mt-1 text-lg font-black">Crear nuevo usuario</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/[.08] p-2.5 text-zinc-400"><X size={18} /></button>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Nombre completo<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`mt-2 ${inputClass}`} /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Correo<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={`mt-2 ${inputClass}`} /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Contraseña temporal<div className="relative mt-2"><input type={showPassword ? "text" : "password"} value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className={`${inputClass} pr-11`} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-zinc-500">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Confirmar contraseña<input type={showPassword ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={`mt-2 ${inputClass}`} /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Rol<select value={draft.role} onChange={(event) => { const role = event.target.value as Role; setDraft({ ...draft, role, managerId: null, department: role === "Administrador" ? "Administración" : draft.department === "Administración" ? "Ventas Digitales" : draft.department, zone: role === "Administrador" ? "Nacional" : draft.zone === "Nacional" ? "Zona Norte" : draft.zone, jobProfile: defaultJobProfile(role) }); }} className={`mt-2 ${inputClass}`}>{roles.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Cargo / perfil<input value={draft.jobProfile} disabled={draft.role === "Administrador"} onChange={(event) => setDraft({ ...draft, jobProfile: event.target.value })} className={`mt-2 ${inputClass} disabled:opacity-60`} /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Departamento<select value={draft.department} disabled={draft.role === "Administrador"} onChange={(event) => setDraft({ ...draft, department: event.target.value as Department, managerId: null })} className={`mt-2 ${inputClass} disabled:opacity-60`}>{(draft.role === "Administrador" ? ["Administración" as Department] : departments).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Zona<select value={draft.zone} disabled={draft.role === "Administrador"} onChange={(event) => setDraft({ ...draft, zone: event.target.value, managerId: null })} className={`mt-2 ${inputClass} disabled:opacity-60`}>{zones.map((value) => <option key={value}>{value}</option>)}</select></label>
          {!["Administrador", "Líder de departamento"].includes(draft.role) && (
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-600 sm:col-span-2">Reporta a<select value={draft.managerId || ""} onChange={(event) => setDraft({ ...draft, managerId: event.target.value || null })} className={`mt-2 ${inputClass}`}><option value="">Seleccionar superior</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.role} · {manager.zone}</option>)}</select></label>
          )}
          <div className="rounded-xl border border-purple-400/15 bg-purple-500/[.05] p-4 text-[10px] leading-5 text-zinc-400 sm:col-span-2"><UserCog className="mr-2 inline text-purple-300" size={14} />La cuenta se crea directamente en Supabase con la contraseña indicada. El usuario queda limitado a su departamento, zona y superior.</div>
          {error && <p className="rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300 sm:col-span-2"><AlertTriangle className="mr-2 inline" size={14} />{error}</p>}
          <button disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 p-3 text-xs font-black sm:col-span-2 disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}Crear usuario</button>
        </div>
      </form>
    </div>
  );
}
