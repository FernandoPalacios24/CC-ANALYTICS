export type QueryEngine = "postgres" | "clickhouse" | "duckdb";
export type VisualFamily = "metric" | "table" | "chart" | "diagram" | "content" | "filter";
export type VisualKind =
  | "kpi" | "table" | "matrix" | "bar" | "line" | "area" | "pie" | "donut"
  | "scatter" | "heatmap" | "treemap" | "funnel" | "gauge" | "bullet" | "traffic"
  | "podium" | "timeline" | "flow" | "org_chart" | "text" | "image" | "shape" | "slicer";
export type Aggregation = "count" | "count_distinct" | "sum" | "average" | "min" | "max";
export type FieldKind = "text" | "number" | "date" | "boolean" | "geography";
export type FilterOperator = "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "between" | "in" | "not_in" | "is_null" | "not_null";

export type SemanticField = {
  id: string;
  label: string;
  column: string;
  kind: FieldKind;
  hidden?: boolean;
  format?: string;
};

export type SemanticMeasure = {
  id: string;
  label: string;
  expression: string;
  format?: "integer" | "decimal" | "currency" | "percent" | "duration";
  description?: string;
};

export type SemanticDataset = {
  id: string;
  label: string;
  source: string;
  engine: QueryEngine;
  dateField?: string;
  fields: SemanticField[];
  measures: SemanticMeasure[];
};

export type ReportFilter = {
  id: string;
  field: string;
  operator: FilterOperator;
  value?: unknown;
  valueTo?: unknown;
};

export type FieldBinding = {
  field?: string;
  measure?: string;
  aggregation?: Aggregation;
};

export type VisualEncoding = {
  category?: FieldBinding;
  value?: FieldBinding;
  series?: FieldBinding;
  secondaryValue?: FieldBinding;
  color?: FieldBinding;
  size?: FieldBinding;
  tooltip?: FieldBinding[];
  rows?: FieldBinding[];
  columns?: FieldBinding[];
};

export type CanvasPosition = { x: number; y: number; w: number; h: number; z?: number };

export type VisualStyle = {
  title?: string;
  subtitle?: string;
  showTitle?: boolean;
  showLegend?: boolean;
  showLabels?: boolean;
  compactNumbers?: boolean;
  background?: string;
  borderRadius?: number;
  conditionalFormatting?: Array<{ rule: string; className: string }>;
};

export type ReportVisual = {
  id: string;
  family: VisualFamily;
  kind: VisualKind;
  datasetId: string;
  position: CanvasPosition;
  encoding: VisualEncoding;
  filters: ReportFilter[];
  style: VisualStyle;
  interactions?: { crossFilter?: boolean; drillDown?: boolean; drillThroughPage?: string };
  advancedSpec?: Record<string, unknown>;
};

export type ReportPage = {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: string;
  visuals: ReportVisual[];
};

export type UniversalReportSpec = {
  version: 4;
  id: string;
  name: string;
  description?: string;
  ownerDepartment: string;
  ownerZone: string;
  datasets: SemanticDataset[];
  globalFilters: ReportFilter[];
  pages: ReportPage[];
  theme?: Record<string, unknown>;
  permissions?: { viewers?: string[]; editors?: string[] };
  createdAt: string;
  updatedAt: string;
};
