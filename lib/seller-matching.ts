import {
  normalizeImportLabel,
  parseFlexibleNumber,
  type CanonicalSale,
} from "@/lib/sales-import-detection";

export type SellerLike = {
  id: string;
  full_name: string;
  seller_code?: string | null;
};

export type SellerMatch<T extends SellerLike> = {
  seller: T | null;
  score: number;
  method: "code" | "exact" | "partial" | "fuzzy" | "manual" | "none";
  ambiguous: boolean;
};

const IGNORED_NAME_WORDS = new Set([
  "sr",
  "sra",
  "srta",
  "lic",
  "ing",
  "dr",
  "dra",
  "de",
  "del",
  "la",
  "las",
  "los",
]);

function nameTokens(value: unknown) {
  return normalizeImportLabel(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !IGNORED_NAME_WORDS.has(token));
}

function compactName(value: unknown) {
  return nameTokens(value).join("");
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }

  return previous[right.length];
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length >= 4 && right.length >= 4) {
    const distance = levenshtein(left, right);
    const similarity = 1 - distance / Math.max(left.length, right.length);
    if (similarity >= 0.78) return similarity;
  }
  return 0;
}

export function personNameSimilarity(leftValue: unknown, rightValue: unknown) {
  const left = compactName(leftValue);
  const right = compactName(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = nameTokens(leftValue);
  const rightTokens = nameTokens(rightValue);
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;

  let inclusion = 0;
  if (shorter.length >= 6 && longer.includes(shorter)) {
    inclusion = shorter.length / longer.length >= 0.55 ? 0.91 : 0.82;
  }

  const used = new Set<number>();
  let matchedWeight = 0;
  for (const token of leftTokens) {
    let bestIndex = -1;
    let bestScore = 0;
    rightTokens.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = tokenSimilarity(token, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestScore >= 0.78) {
      used.add(bestIndex);
      matchedWeight += bestScore;
    }
  }

  const minTokens = Math.max(1, Math.min(leftTokens.length, rightTokens.length));
  const maxTokens = Math.max(1, Math.max(leftTokens.length, rightTokens.length));
  const coverage = matchedWeight / minTokens;
  const precision = matchedWeight / maxTokens;
  const editSimilarity =
    1 - levenshtein(left, right) / Math.max(left.length, right.length);

  let score = Math.max(
    inclusion,
    coverage * 0.58 + precision * 0.24 + Math.max(0, editSimilarity) * 0.18,
  );

  const leftFirst = leftTokens[0];
  const rightFirst = rightTokens[0];
  const leftLast = leftTokens[leftTokens.length - 1];
  const rightLast = rightTokens[rightTokens.length - 1];

  if (
    leftFirst &&
    rightFirst &&
    tokenSimilarity(leftFirst, rightFirst) >= 0.9
  ) {
    score += 0.04;
  }
  if (
    leftLast &&
    rightLast &&
    tokenSimilarity(leftLast, rightLast) >= 0.9
  ) {
    score += 0.06;
  }

  if (Math.min(leftTokens.length, rightTokens.length) === 1 && inclusion < 0.8) {
    score *= 0.82;
  }

  return Math.max(0, Math.min(1, score));
}

export function findBestSellerMatch<T extends SellerLike>(
  sellerName: unknown,
  sellerCode: unknown,
  sellers: T[],
): SellerMatch<T> {
  const code = String(sellerCode ?? "").trim().toLowerCase();
  if (code) {
    const byCode = sellers.find(
      (seller) =>
        String(seller.seller_code ?? "").trim().toLowerCase() === code,
    );
    if (byCode) {
      return {
        seller: byCode,
        score: 1,
        method: "code",
        ambiguous: false,
      };
    }
  }

  const normalizedInput = compactName(sellerName);
  if (!normalizedInput) {
    return { seller: null, score: 0, method: "none", ambiguous: false };
  }

  const exact = sellers.find(
    (seller) => compactName(seller.full_name) === normalizedInput,
  );
  if (exact) {
    return {
      seller: exact,
      score: 1,
      method: "exact",
      ambiguous: false,
    };
  }

  const ranked = sellers
    .map((seller) => ({
      seller,
      score: personNameSimilarity(sellerName, seller.full_name),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 0.62) {
    return {
      seller: null,
      score: best?.score ?? 0,
      method: "none",
      ambiguous: false,
    };
  }

  const ambiguous =
    Boolean(second) &&
    second.score >= 0.62 &&
    best.score - second.score < 0.055;

  if (ambiguous) {
    return {
      seller: null,
      score: best.score,
      method: "none",
      ambiguous: true,
    };
  }

  return {
    seller: best.seller,
    score: best.score,
    method: best.score >= 0.88 ? "partial" : "fuzzy",
    ambiguous: false,
  };
}

const COUNT_ALIASES = [
  "ventas",
  "cantidad ventas",
  "cantidad de ventas",
  "total ventas",
  "contratos",
  "cantidad contratos",
  "cantidad de contratos",
  "numero ventas",
  "n ventas",
  "sales count",
  "qty",
  "cantidad",
];

export function detectedSaleUnits(sale: CanonicalSale) {
  let bestScore = 0;
  let units = 1;
  for (const [header, rawValue] of Object.entries(sale.sourceRow)) {
    const normalized = normalizeImportLabel(header);
    let score = 0;
    for (const alias of COUNT_ALIASES) {
      const expected = normalizeImportLabel(alias);
      if (normalized === expected) score = Math.max(score, 100);
      else if (normalized.includes(expected)) score = Math.max(score, 75);
    }
    if (score <= bestScore) continue;
    const parsed = parseFlexibleNumber(rawValue);
    if (parsed === null || parsed < 1 || parsed > 100000) continue;
    bestScore = score;
    units = Math.max(1, Math.round(parsed));
  }
  return units;
}

export function normalizedTotalAmount(sale: CanonicalSale, units: number) {
  if (sale.amountBilled === null) return null;
  if (units <= 1) return sale.amountBilled;
  const amountHeader = normalizeImportLabel(
    sale.detectedFields.amountBilled ?? "",
  );
  if (/arpu|promedio|unitario|mensualidad|precio por/.test(amountHeader)) {
    return sale.amountBilled * units;
  }
  return sale.amountBilled;
}
