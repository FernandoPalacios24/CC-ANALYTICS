"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CC Analytics UI error", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#07070a] p-6 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-rose-500/20 bg-[#101016] p-8 text-center shadow-2xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-300">
          <AlertTriangle />
        </div>
        <h1 className="mt-5 text-xl font-black">No pudimos abrir esta vista</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Tu sesión y tus datos no se modificaron. Intenta cargar nuevamente; si
          el problema continúa, comparte la hora del incidente con soporte.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold"
        >
          <RotateCcw size={16} /> Reintentar
        </button>
        {error.digest && (
          <p className="mt-4 text-[10px] text-zinc-600">
            Referencia: {error.digest}
          </p>
        )}
      </section>
    </main>
  );
}
