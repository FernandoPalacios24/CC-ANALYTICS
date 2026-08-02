import {
  analyzeSalesMatrix as analyzeBaseSalesMatrix,
  canonicalizeSalesRows,
  detectSalesColumns,
  normalizeImportLabel,
  normalizePersonName,
  parseFlexibleDate,
  parseFlexibleNumber,
} from "./sales-import-detection";

export type { CanonicalSale } from "./sales-import-detection";
export {
  canonicalizeSalesRows,
  detectSalesColumns,
  normalizeImportLabel,
  normalizePersonName,
  parseFlexibleDate,
  parseFlexibleNumber,
};

function selectedImportRange() {
  if (typeof document === "undefined") return null;
  const values = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="date"]'),
  )
    .map((input) => input.value)
    .filter(Boolean);

  if (values.length < 2) return null;
  const [start, end] = values;
  if (!start || !end || start > end) return null;
  return { start, end };
}

export function analyzeSalesMatrix(
  matrix: Parameters<typeof analyzeBaseSalesMatrix>[0],
) {
  const result = analyzeBaseSalesMatrix(matrix);
  const range = selectedImportRange();

  if (!range || !result.rows.length || !result.map.saleDate) return result;

  const hasAnyDateInsideRange = result.rows.some(
    (sale) => sale.saleDate >= range.start && sale.saleDate <= range.end,
  );

  if (hasAnyDateInsideRange) return result;

  const { saleDate: _ignoredDateColumn, ...mapWithoutSaleDate } = result.map;
  void _ignoredDateColumn;

  return {
    ...result,
    map: mapWithoutSaleDate,
    rows: result.rows.map((sale) => ({
      ...sale,
      saleDate: range.end,
      detectedFields: {
        ...sale.detectedFields,
        saleDateFallback: "Fecha de corte seleccionada",
      },
    })),
  };
}
