"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import type { Profile } from "@/components/analytics-app-v2";
import { SalesDataHubV2 as CoreSalesDataHubV2 } from "./sales-data-hub-v2";

type RawRow = Record<string, unknown>;

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoDate(value);
  }
  if (typeof value === "number" && value > 20_000 && value < 100_000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
  }
  const local = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (local) {
    return `${local[3]}-${String(Number(local[2])).padStart(2, "0")}-${String(Number(local[1])).padStart(2, "0")}`;
  }
  return null;
}

function looksLikeDateHeader(header: string) {
  return /(^|\b)(fecha|date|día|dia)(\b|$)/i.test(header);
}

async function normalizeWorkbook(
  file: File,
  start: string,
  end: string,
) {
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array", cellDates: true });
  let changedColumns = 0;
  let changedRows = 0;

  for (const sheetName of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<RawRow>(book.Sheets[sheetName], {
      defval: "",
      raw: true,
    });
    if (!rows.length) continue;
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

    headers.filter(looksLikeDateHeader).forEach((header) => {
      const parsed = rows
        .map((row) => parseDate(row[header]))
        .filter((value): value is string => Boolean(value));
      if (!parsed.length) return;
      const allOutside = parsed.every((value) => value < start || value > end);
      if (!allOutside) return;

      changedColumns += 1;
      rows.forEach((row) => {
        if (String(row[header] ?? "").trim()) {
          row[header] = end;
          changedRows += 1;
        }
      });
    });

    if (changedColumns) {
      book.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows, {
        header: headers,
      });
    }
  }

  if (!changedColumns) {
    return { file, changedColumns: 0, changedRows: 0 };
  }

  const output = XLSX.write(book, { bookType: "xlsx", type: "array" });
  return {
    file: new File(
      [output],
      file.name.replace(/\.(csv|xls|xlsx)$/i, "") + "-normalizado.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ),
    changedColumns,
    changedRows,
  };
}

export function SalesDataHubV2({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const preparedFiles = useRef(new WeakSet<File>());
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function selectedRange() {
    const dates = Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>("input[type='date']") ||
        [],
    );
    return {
      start: dates[0]?.value || "1900-01-01",
      end: dates[1]?.value || dates[0]?.value || "2999-12-31",
    };
  }

  async function prepareAndDispatch(input: HTMLInputElement, file: File) {
    setProcessing(true);
    setNotice("");
    setError("");
    try {
      const range = selectedRange();
      const prepared = await normalizeWorkbook(file, range.start, range.end);
      preparedFiles.current.add(prepared.file);
      const transfer = new DataTransfer();
      transfer.items.add(prepared.file);
      input.files = transfer.files;
      if (prepared.changedColumns) {
        setNotice(
          `${prepared.changedRows} fechas de ${prepared.changedColumns} columna(s) quedaron ajustadas al corte ${range.end} porque todas estaban fuera del rango seleccionado.`,
        );
      }
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (prepareError) {
      preparedFiles.current.add(file);
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      setError(
        prepareError instanceof Error
          ? `No se pudo validar previamente la fecha: ${prepareError.message}. El archivo se procesará sin normalización.`
          : "El archivo se procesará sin normalización de fechas.",
      );
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      setProcessing(false);
    }
  }

  function interceptChange(event: React.ChangeEvent<HTMLDivElement>) {
    const input = event.target as HTMLInputElement;
    if (input.tagName !== "INPUT" || input.type !== "file") return;
    const file = input.files?.[0];
    if (!file || preparedFiles.current.has(file)) return;
    event.preventDefault();
    event.stopPropagation();
    void prepareAndDispatch(input, file);
  }

  function interceptDrop(event: React.DragEvent<HTMLDivElement>) {
    const file = event.dataTransfer.files[0];
    if (!file || preparedFiles.current.has(file)) return;
    const input = rootRef.current?.querySelector<HTMLInputElement>(
      "input[type='file'][accept*='.xlsx']",
    );
    if (!input) return;
    event.preventDefault();
    event.stopPropagation();
    void prepareAndDispatch(input, file);
  }

  return (
    <div
      ref={rootRef}
      onChangeCapture={interceptChange}
      onDropCapture={interceptDrop}
    >
      {processing && (
        <p className="mb-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[.06] p-3 text-xs text-cyan-200">
          <Loader2 className="mr-2 inline animate-spin" size={15} />
          Validando las fechas del archivo antes de cargarlo...
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-3 text-xs text-emerald-200">
          <Check className="mr-2 inline" size={15} /> {notice}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-3 text-xs text-amber-200">
          <AlertTriangle className="mr-2 inline" size={15} /> {error}
        </p>
      )}
      <CoreSalesDataHubV2 profile={profile} profiles={profiles} />
    </div>
  );
}
