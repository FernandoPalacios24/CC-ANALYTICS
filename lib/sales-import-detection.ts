export type CanonicalSale = {
  sourceRow: Record<string, unknown>;
  sellerName: string;
  sellerCode: string | null;
  supervisorName: string | null;
  team: string | null;
  saleDate: string;
  amountBilled: number | null;
  commissionIncome: number | null;
  city: string | null;
  region: string | null;
  zone: string | null;
  service: string | null;
  medium: string | null;
  saleType: string | null;
  contractService: string | null;
  isPrimary: boolean | null;
  confidence: number;
  detectedFields: Record<string, string>;
};

type CanonicalField =
  | "sellerName"
  | "sellerCode"
  | "supervisorName"
  | "team"
  | "saleDate"
  | "amountBilled"
  | "commissionIncome"
  | "city"
  | "region"
  | "zone"
  | "service"
  | "medium"
  | "saleType"
  | "contractService"
  | "isPrimary";

type ColumnMap = Partial<Record<CanonicalField, string>>;

const ALIASES: Record<CanonicalField, string[]> = {
  sellerName: [
    "vendedor",
    "nombre vendedor",
    "nombre del vendedor",
    "asesor",
    "nombre asesor",
    "gestor",
    "nombre gestor",
    "ejecutivo",
    "ejecutivo ventas",
    "agente",
    "representante",
    "evr",
    "colaborador ventas",
    "sales rep",
    "seller",
  ],
  sellerCode: [
    "codigo vendedor",
    "código vendedor",
    "codigo gestor",
    "código gestor",
    "id vendedor",
    "id gestor",
    "codigo asesor",
    "usuario vendedor",
    "seller id",
    "seller code",
  ],
  supervisorName: [
    "supervisor",
    "nombre supervisor",
    "supervisor asignado",
    "jefe",
    "lider",
    "líder",
    "team leader",
    "manager",
  ],
  team: ["equipo", "team", "grupo", "escuadra", "team name"],
  saleDate: [
    "fecha facturacion",
    "fecha facturación",
    "fecha venta",
    "fecha de venta",
    "fecha posteada",
    "fecha posteo",
    "fecha contrato",
    "fecha ingreso venta",
    "fecha anunciada",
    "sale date",
    "created date",
    "fecha",
  ],
  amountBilled: [
    "ingreso facturacion",
    "ingreso facturación",
    "monto facturado",
    "monto vendido",
    "monto venta",
    "valor venta",
    "valor contrato",
    "facturacion",
    "facturación",
    "importe",
    "total venta",
    "total",
    "precio",
    "arpu in",
    "amount",
    "revenue",
  ],
  commissionIncome: [
    "ingreso para comision",
    "ingreso para comisión",
    "monto comision",
    "monto comisión",
    "comision",
    "comisión",
    "commission",
  ],
  city: ["ciudad", "municipio", "localidad", "city"],
  region: ["region", "región", "regional", "territorio", "region comercial"],
  zone: ["zona", "zona comercial", "area", "área", "zone"],
  service: ["servicio", "tipo servicio", "producto", "product", "service"],
  medium: ["medio", "canal", "origen", "fuente", "channel", "source"],
  saleType: [
    "tipo de venta",
    "tipo venta",
    "clase venta",
    "modalidad",
    "sale type",
  ],
  contractService: [
    "contrato servicio",
    "paquete",
    "plan",
    "producto contratado",
    "oferta",
    "package",
  ],
  isPrimary: [
    "es primario",
    "primario",
    "principal",
    "venta principal",
    "is primary",
  ],
};

const REQUIRED_FIELDS: CanonicalField[] = ["sellerName", "saleDate"];

export function normalizeImportLabel(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizePersonName(value: unknown) {
  return normalizeImportLabel(value).replace(/\s+/g, "");
}

function aliasScore(header: string, alias: string) {
  const key = normalizeImportLabel(header);
  const expected = normalizeImportLabel(alias);
  if (!key || !expected) return 0;
  if (key === expected) return 120;
  if (key.startsWith(`${expected} `) || key.endsWith(` ${expected}`)) return 92;
  if (key.includes(expected)) return 72 + Math.min(15, expected.length / 2);
  if (expected.includes(key) && key.length >= 5) return 42;
  return 0;
}

function isLikelyDate(value: unknown) {
  return Boolean(parseFlexibleDate(value));
}

function isLikelyNumber(value: unknown) {
  return parseFlexibleNumber(value) !== null;
}

function sampleScore(
  rows: Record<string, unknown>[],
  key: string,
  predicate: (value: unknown) => boolean,
) {
  const samples = rows
    .slice(0, 80)
    .map((row) => row[key])
    .filter((value) => value !== null && value !== undefined && value !== "");
  if (!samples.length) return 0;
  return samples.filter(predicate).length / samples.length;
}

export function detectSalesColumns(rows: Record<string, unknown>[]) {
  const keys = Array.from(
    new Set(rows.slice(0, 100).flatMap((row) => Object.keys(row))),
  ).filter(Boolean);
  const map: ColumnMap = {};
  const scores: Partial<Record<CanonicalField, number>> = {};

  (Object.keys(ALIASES) as CanonicalField[]).forEach((field) => {
    let bestKey = "";
    let bestScore = 0;
    keys.forEach((key) => {
      let score = Math.max(...ALIASES[field].map((alias) => aliasScore(key, alias)));
      const normalized = normalizeImportLabel(key);
      if (field === "saleDate") score += sampleScore(rows, key, isLikelyDate) * 45;
      if (field === "amountBilled" || field === "commissionIncome") {
        score += sampleScore(rows, key, isLikelyNumber) * 28;
        if (/codigo|id|telefono|cuenta|contrato/.test(normalized)) score -= 80;
      }
      if (field === "sellerName" && /cliente|abonado|suscriptor/.test(normalized)) {
        score -= 110;
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    });
    if (bestKey && bestScore >= 52) {
      map[field] = bestKey;
      scores[field] = bestScore;
    }
  });

  if (!map.saleDate) {
    const dateCandidate = keys
      .map((key) => ({ key, score: sampleScore(rows, key, isLikelyDate) }))
      .sort((a, b) => b.score - a.score)[0];
    if (dateCandidate?.score >= 0.72) map.saleDate = dateCandidate.key;
  }

  if (!map.amountBilled) {
    const numericCandidate = keys
      .filter((key) => !/codigo|id|telefono|cuenta/i.test(normalizeImportLabel(key)))
      .map((key) => ({ key, score: sampleScore(rows, key, isLikelyNumber) }))
      .sort((a, b) => b.score - a.score)[0];
    if (numericCandidate?.score >= 0.8) map.amountBilled = numericCandidate.key;
  }

  const detectedRequired = REQUIRED_FIELDS.filter((field) => map[field]).length;
  const optionalDetected = Object.keys(map).length - detectedRequired;
  const confidence = Math.max(
    0,
    Math.min(1, detectedRequired / REQUIRED_FIELDS.length * 0.68 + optionalDetected * 0.035),
  );

  return { map, confidence, scores };
}

export function parseFlexibleNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let cleaned = raw.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma > dot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFlexibleDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return localIsoDate(value);
  }
  if (typeof value === "number" && value > 20_000 && value < 90_000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value));
    return epoch.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return safeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const latin = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (latin) {
    const year = Number(latin[3]) < 100 ? 2000 + Number(latin[3]) : Number(latin[3]);
    return safeDate(year, Number(latin[2]), Number(latin[1]));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : localIsoDate(parsed);
}

function safeDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return localIsoDate(date);
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const normalized = normalizeImportLabel(value);
  if (["si", "s", "true", "1", "primario", "principal"].includes(normalized)) return true;
  if (["no", "n", "false", "0", "secundario"].includes(normalized)) return false;
  return null;
}

export function canonicalizeSalesRows(
  rows: Record<string, unknown>[],
  fallbackDate = localIsoDate(new Date()),
) {
  const detection = detectSalesColumns(rows);
  const detectedFields = Object.fromEntries(
    Object.entries(detection.map).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const value = (row: Record<string, unknown>, field: CanonicalField) => {
    const key = detection.map[field];
    return key ? row[key] : null;
  };

  const canonical: CanonicalSale[] = rows.flatMap((row) => {
    const sellerName = nullableText(value(row, "sellerName"));
    const saleDate = parseFlexibleDate(value(row, "saleDate")) || fallbackDate;
    if (!sellerName) return [];
    return [
      {
        sourceRow: row,
        sellerName,
        sellerCode: nullableText(value(row, "sellerCode")),
        supervisorName: nullableText(value(row, "supervisorName")),
        team: nullableText(value(row, "team")),
        saleDate,
        amountBilled: parseFlexibleNumber(value(row, "amountBilled")),
        commissionIncome: parseFlexibleNumber(value(row, "commissionIncome")),
        city: nullableText(value(row, "city")),
        region: nullableText(value(row, "region")),
        zone: nullableText(value(row, "zone")),
        service: nullableText(value(row, "service")),
        medium: nullableText(value(row, "medium")),
        saleType: nullableText(value(row, "saleType")),
        contractService: nullableText(value(row, "contractService")),
        isPrimary: booleanValue(value(row, "isPrimary")),
        confidence: detection.confidence,
        detectedFields,
      },
    ];
  });

  return { rows: canonical, ...detection };
}

function uniqueHeaders(values: unknown[]) {
  const used = new Map<string, number>();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `Columna ${index + 1}`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
}

function matrixToRows(matrix: unknown[][], headerIndex: number) {
  const headers = uniqueHeaders(matrix[headerIndex] || []);
  return matrix.slice(headerIndex + 1).flatMap((values) => {
    if (!values.some((value) => value !== null && value !== undefined && String(value).trim())) {
      return [];
    }
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? null;
    });
    return [row];
  });
}

export function analyzeSalesMatrix(matrix: unknown[][]) {
  const cleaned = matrix.filter((row) =>
    row.some((value) => value !== null && value !== undefined && String(value).trim()),
  );
  if (!cleaned.length) {
    return { rows: [] as CanonicalSale[], headerIndex: 0, map: {} as ColumnMap, confidence: 0, scores: {} };
  }

  let best = {
    rows: [] as CanonicalSale[],
    headerIndex: 0,
    map: {} as ColumnMap,
    confidence: 0,
    scores: {} as Partial<Record<CanonicalField, number>>,
  };
  cleaned.slice(0, 20).forEach((_, headerIndex) => {
    const objectRows = matrixToRows(cleaned, headerIndex);
    const analyzed = canonicalizeSalesRows(objectRows);
    const required = REQUIRED_FIELDS.filter((field) => analyzed.map[field]).length;
    const score = analyzed.confidence * 100 + required * 35 + Math.min(25, analyzed.rows.length);
    const bestScore = best.confidence * 100 + Object.keys(best.map).length * 4 + Math.min(25, best.rows.length);
    if (score > bestScore) {
      best = {
        rows: analyzed.rows,
        headerIndex,
        map: analyzed.map,
        confidence: analyzed.confidence,
        scores: analyzed.scores,
      };
    }
  });
  return best;
}
