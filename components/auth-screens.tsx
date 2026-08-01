"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (loginError) {
      setError(
        loginError.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : loginError.message,
      );
    }
    setLoading(false);
  }

  async function resetPassword() {
    if (!email.trim()) {
      setError("Escribe primero tu correo.");
      return;
    }

    setLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: window.location.origin },
    );

    if (resetError) setError(resetError.message);
    else setMessage("Te enviamos un enlace para crear una nueva contraseña.");
    setLoading(false);
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#070709] p-5 text-white">
      <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-purple-700/20 blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-fuchsia-700/15 blur-[120px]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/[.08] bg-[#0d0d12]/95 shadow-2xl lg:grid-cols-2">
        <section className="hidden min-h-[610px] flex-col justify-between border-r border-white/[.06] bg-gradient-to-br from-purple-950/40 via-[#101016] to-[#0b0b0f] p-12 lg:flex">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-purple-400/30 bg-purple-500/10 font-black text-purple-300">
              CC
            </div>
            <div>
              <p className="font-black tracking-[.18em]">CC ANALYTICS</p>
              <p className="text-[10px] uppercase tracking-[.28em] text-purple-300/60">
                Cable Color Honduras
              </p>
            </div>
          </div>
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1.5 text-[10px] font-bold text-purple-300">
              <ShieldCheck size={13} /> ACCESO INDEPENDIENTE
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight">
              Toda la inteligencia de Cable Color en un solo lugar.
            </h1>
            <p className="mt-5 text-sm leading-7 text-zinc-400">
              CC Analytics administra sus propias cuentas, contraseñas y permisos
              sin depender de CC HUB.
            </p>
            <div className="mt-8 grid gap-3 text-xs text-zinc-300">
              {[
                "Cuentas exclusivas de Analytics",
                "Información protegida por área y zona",
                "Administrador con visibilidad global",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-zinc-600">
            Plataforma corporativa · Acceso autorizado exclusivamente
          </p>
        </section>

        <section className="flex min-h-[610px] flex-col justify-center p-8 sm:p-12">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-purple-400">
            Bienvenido
          </p>
          <h2 className="mt-2 text-2xl font-black">Iniciar sesión</h2>
          <p className="mt-2 text-xs text-zinc-500">
            Ingresa con tus credenciales exclusivas de CC Analytics.
          </p>

          <form onSubmit={login} className="mt-8 space-y-4">
            <Field label="Correo">
              <Mail size={16} />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                autoComplete="email"
                className="w-full bg-transparent py-3.5 text-sm outline-none"
              />
            </Field>

            <Field label="Contraseña">
              <LockKeyhole size={16} />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                className="w-full bg-transparent py-3.5 text-sm outline-none"
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </Field>

            {error && <Notice tone="error">{error}</Notice>}
            {message && <Notice tone="success">{message}</Notice>}

            <button
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 p-3.5 text-xs font-black disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Ingresar a CC Analytics"}
              <ArrowRight size={16} />
            </button>
          </form>

          <button
            onClick={resetPassword}
            disabled={loading}
            className="mt-5 text-xs font-semibold text-purple-300"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </section>
      </div>
    </main>
  );
}

export function RecoveryScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? error.message : "Contraseña actualizada correctamente.");
    if (!error) setTimeout(onDone, 1200);
  }

  return (
    <Shell>
      <form onSubmit={save} className="glass w-full max-w-md rounded-3xl p-8">
        <h1 className="text-xl font-black">Crear nueva contraseña</h1>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={8}
          required
          className="mt-6 w-full rounded-xl border border-white/10 bg-white/[.03] p-3"
        />
        <button className="mt-4 w-full rounded-xl bg-purple-600 p-3 text-xs font-bold">
          Actualizar contraseña
        </button>
        {message && <p className="mt-4 text-xs text-emerald-400">{message}</p>}
      </form>
    </Shell>
  );
}

export function ConfigurationScreen() {
  return (
    <Shell>
      <div className="glass w-full max-w-lg rounded-3xl p-8 text-center">
        <LockKeyhole className="mx-auto text-amber-300" />
        <h1 className="mt-5 text-xl font-black">Configura CC Analytics</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Define NEXT_PUBLIC_SUPABASE_URL y
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY con el proyecto Supabase
          exclusivo de CC Analytics.
        </p>
      </div>
    </Shell>
  );
}

export function LoadingScreen() {
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-500">
        Cargando CC Analytics...
      </p>
    </Shell>
  );
}

export function AccessError({
  message,
  onRetry,
  onExit,
}: {
  message: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <Shell>
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        <LockKeyhole className="mx-auto text-rose-400" />
        <h1 className="mt-5 text-xl font-black">Acceso pendiente</h1>
        <p className="mt-3 text-sm text-zinc-400">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={onRetry}
            className="rounded-xl bg-purple-600 px-5 py-3 text-xs font-black"
          >
            Reintentar
          </button>
          <button
            onClick={onExit}
            className="rounded-xl border border-white/10 px-5 py-3 text-xs font-bold"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#070709] p-5 text-white">
      {children}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
      {label}
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.025] px-3 focus-within:border-purple-400/50">
        {children}
      </div>
    </label>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const style =
    tone === "error"
      ? "border-rose-500/15 bg-rose-500/[.06] text-rose-300"
      : "border-emerald-500/15 bg-emerald-500/[.06] text-emerald-300";
  return <p className={`rounded-xl border p-3 text-xs ${style}`}>{children}</p>;
}
