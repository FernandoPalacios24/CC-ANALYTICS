"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Profile } from "@/components/analytics-app-v2";
import { SalesDataHubV2 as SafeSalesDataHubV2 } from "./sales-data-hub-safe";

export function SalesDataHubV2({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  function enforceSellerLinks(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const button = target.closest("button");
    if (!button) return;
    const label = button.textContent?.trim() || "";
    if (!label.includes("Confirmar actualización")) return;

    const unresolved = Array.from(
      rootRef.current?.querySelectorAll<HTMLSelectElement>("select") || [],
    ).filter((select) => {
      const firstOption = select.options[0]?.textContent?.trim() || "";
      return (
        firstOption.includes("Conservar nombre original") &&
        !select.value
      );
    });

    if (!unresolved.length) {
      setError("");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    unresolved[0].focus();
    setError(
      `${unresolved.length} nombre(s) todavía no están vinculados a un vendedor oficial. Selecciona el vendedor correcto o agrégalo primero en Mi equipo; la plataforma no guardará ventas huérfanas.`,
    );
  }

  return (
    <div ref={rootRef} onClickCapture={enforceSellerLinks}>
      {error && (
        <p className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-300">
          <AlertTriangle className="mr-2 inline" size={15} /> {error}
        </p>
      )}
      <SafeSalesDataHubV2 profile={profile} profiles={profiles} />
    </div>
  );
}
