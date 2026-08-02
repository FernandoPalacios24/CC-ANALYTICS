import { readFile, writeFile } from "node:fs/promises";

const path = "components/sales-data-hub-v2.tsx";
const source = await readFile(path, "utf8");
const before = `      const withinRange = normalizedRows.filter(
        (sale) => sale.saleDate >= importStart && sale.saleDate <= importEnd,
      );
      const excluded = normalizedRows.length - withinRange.length;
      if (!withinRange.length) {
        throw new Error(
          "Las fechas detectadas no pertenecen al rango seleccionado.",
        );
      }

      setImportRows(withinRange);
      setImportSheet(bestSheet);
      setImportConfidence(best.confidence);
      setExcludedRows(excluded);
      setNotice(
        \`${withinRange.length.toLocaleString(
          "es-HN",
        )} filas detectadas en ${bestSheet}. ${excluded ? \`${excluded} quedaron fuera del rango.\` : ""}\`,
      );`;

const after = `      let rowsForImport = normalizedRows.filter(
        (sale) => sale.saleDate >= importStart && sale.saleDate <= importEnd,
      );
      let excluded = normalizedRows.length - rowsForImport.length;
      let dateFallbackApplied = false;

      if (!rowsForImport.length) {
        dateFallbackApplied = true;
        rowsForImport = normalizedRows.map((sale) => ({
          ...sale,
          saleDate: importEnd,
          detectedFields: {
            ...sale.detectedFields,
            saleDateFallback: "Fecha de corte seleccionada",
          },
        }));
        excluded = 0;
      }

      setImportRows(rowsForImport);
      setImportSheet(bestSheet);
      setImportConfidence(best.confidence);
      setExcludedRows(excluded);
      setNotice(
        \`${rowsForImport.length.toLocaleString(
          "es-HN",
        )} filas detectadas en ${bestSheet}. ${
          dateFallbackApplied
            ? \`Las fechas del archivo no correspondían al rango; se asignó ${formatDate(
                importEnd,
              )} como fecha de corte para todas las filas.\`
            : excluded
              ? \`${excluded} quedaron fuera del rango.\`
              : ""
        }\`,
      );`;

if (!source.includes(before)) {
  console.error("No se encontró el bloque esperado; no se aplicó ningún cambio.");
  process.exit(1);
}

await writeFile(path, source.replace(before, after));
console.log("Parche de fechas aplicado correctamente.");
