import type { ReportFilter, SemanticDataset, VisualEncoding } from "./types";

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function safeIdentifier(value: string) {
  if (!identifier.test(value)) throw new Error(`Identificador no permitido: ${value}`);
  return value;
}

function fieldColumn(dataset: SemanticDataset, fieldId: string) {
  const field = dataset.fields.find((item) => item.id === fieldId);
  if (!field) throw new Error(`Campo desconocido: ${fieldId}`);
  return safeIdentifier(field.column);
}

function measureExpression(dataset: SemanticDataset, measureId: string) {
  const measure = dataset.measures.find((item) => item.id === measureId);
  if (!measure) throw new Error(`Medida desconocida: ${measureId}`);
  if (/;|--|\/\*/.test(measure.expression)) throw new Error("Expresión de medida no permitida.");
  return measure.expression;
}

function literal(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function filterSql(dataset: SemanticDataset, filter: ReportFilter) {
  const column = fieldColumn(dataset, filter.field);
  const value = literal(filter.value);
  switch (filter.operator) {
    case "eq": return `${column} = ${value}`;
    case "neq": return `${column} <> ${value}`;
    case "contains": return `lower(${column}) LIKE lower('%' || ${value} || '%')`;
    case "not_contains": return `lower(${column}) NOT LIKE lower('%' || ${value} || '%')`;
    case "gt": return `${column} > ${value}`;
    case "gte": return `${column} >= ${value}`;
    case "lt": return `${column} < ${value}`;
    case "lte": return `${column} <= ${value}`;
    case "between": return `${column} BETWEEN ${value} AND ${literal(filter.valueTo)}`;
    case "in": return `${column} IN (${(Array.isArray(filter.value) ? filter.value : [filter.value]).map(literal).join(", ")})`;
    case "not_in": return `${column} NOT IN (${(Array.isArray(filter.value) ? filter.value : [filter.value]).map(literal).join(", ")})`;
    case "is_null": return `${column} IS NULL`;
    case "not_null": return `${column} IS NOT NULL`;
  }
}

function bindingExpression(dataset: SemanticDataset, binding: VisualEncoding[keyof VisualEncoding]) {
  if (!binding || Array.isArray(binding)) return null;
  if (binding.measure) return measureExpression(dataset, binding.measure);
  if (!binding.field) return null;
  const column = fieldColumn(dataset, binding.field);
  switch (binding.aggregation) {
    case "count": return `count(${column})`;
    case "count_distinct": return `count(DISTINCT ${column})`;
    case "sum": return `sum(${column})`;
    case "average": return `avg(${column})`;
    case "min": return `min(${column})`;
    case "max": return `max(${column})`;
    default: return column;
  }
}

export function compileVisualQuery(input: {
  dataset: SemanticDataset;
  encoding: VisualEncoding;
  filters?: ReportFilter[];
  limit?: number;
  order?: "asc" | "desc";
}) {
  const { dataset, encoding } = input;
  const category = bindingExpression(dataset, encoding.category);
  const series = bindingExpression(dataset, encoding.series);
  const value = bindingExpression(dataset, encoding.value) || "count(*)";
  const dimensions = [category, series].filter(Boolean) as string[];
  const select = [
    ...dimensions.map((item, index) => `${item} AS dimension_${index + 1}`),
    `${value} AS metric_value`,
  ];
  const where = (input.filters || []).map((item) => filterSql(dataset, item)).filter(Boolean);
  const groupBy = dimensions.length ? ` GROUP BY ${dimensions.join(", ")}` : "";
  const orderBy = ` ORDER BY metric_value ${input.order === "asc" ? "ASC" : "DESC"}`;
  const limit = Math.min(Math.max(input.limit || 500, 1), 10_000);
  return `SELECT ${select.join(", ")} FROM ${safeIdentifier(dataset.source)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}${groupBy}${orderBy} LIMIT ${limit}`;
}

export function compilePostgresQuery(input: Parameters<typeof compileVisualQuery>[0]) {
  return compileVisualQuery(input);
}

export function compileClickHouseQuery(input: Parameters<typeof compileVisualQuery>[0]) {
  return compileVisualQuery(input).replaceAll("count(DISTINCT ", "uniqExact(").replaceAll("lower('%' ||", "lower(concat('%',").replaceAll("|| '%')", ", '%'))");
}
