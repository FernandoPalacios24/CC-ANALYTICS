import type { VisualFamily, VisualKind } from "./types";

export type VisualDefinition = {
  kind: VisualKind;
  family: VisualFamily;
  label: string;
  description: string;
  renderer: "native" | "recharts" | "vega-lite" | "vega" | "grid" | "react-flow";
  requiredChannels: string[];
  optionalChannels: string[];
  supportsAdvancedSpec?: boolean;
};

const definitions: VisualDefinition[] = [
  { kind: "kpi", family: "metric", label: "Indicador", description: "Un valor principal con comparación y estado.", renderer: "native", requiredChannels: ["value"], optionalChannels: ["secondaryValue", "color"] },
  { kind: "table", family: "table", label: "Tabla", description: "Detalle, ordenamiento, filtros y exportación.", renderer: "grid", requiredChannels: ["rows"], optionalChannels: ["value", "color"] },
  { kind: "matrix", family: "table", label: "Matriz", description: "Agrupaciones, pivotes, subtotales y jerarquías.", renderer: "grid", requiredChannels: ["rows", "value"], optionalChannels: ["columns", "color"] },
  { kind: "bar", family: "chart", label: "Barras", description: "Comparación y ranking por categoría.", renderer: "vega-lite", requiredChannels: ["category", "value"], optionalChannels: ["series", "color", "tooltip"] },
  { kind: "line", family: "chart", label: "Línea", description: "Tendencias y evolución temporal.", renderer: "vega-lite", requiredChannels: ["category", "value"], optionalChannels: ["series", "tooltip"] },
  { kind: "area", family: "chart", label: "Área", description: "Tendencia acumulada o comparativa.", renderer: "vega-lite", requiredChannels: ["category", "value"], optionalChannels: ["series", "tooltip"] },
  { kind: "pie", family: "chart", label: "Pastel", description: "Participación de pocas categorías.", renderer: "vega-lite", requiredChannels: ["category", "value"], optionalChannels: ["tooltip"] },
  { kind: "donut", family: "chart", label: "Dona", description: "Participación con total central.", renderer: "vega-lite", requiredChannels: ["category", "value"], optionalChannels: ["tooltip"] },
  { kind: "scatter", family: "chart", label: "Dispersión", description: "Relación entre dos medidas.", renderer: "vega-lite", requiredChannels: ["category", "value", "secondaryValue"], optionalChannels: ["color", "size", "tooltip"] },
  { kind: "heatmap", family: "chart", label: "Mapa de calor", description: "Intensidad entre dos dimensiones.", renderer: "vega-lite", requiredChannels: ["category", "series", "value"], optionalChannels: ["tooltip"] },
  { kind: "treemap", family: "chart", label: "Mapa de árbol", description: "Composición jerárquica por tamaño.", renderer: "vega", requiredChannels: ["category", "value"], optionalChannels: ["series", "color", "tooltip"], supportsAdvancedSpec: true },
  { kind: "funnel", family: "chart", label: "Embudo", description: "Etapas y conversión de proceso.", renderer: "vega", requiredChannels: ["category", "value"], optionalChannels: ["tooltip"], supportsAdvancedSpec: true },
  { kind: "gauge", family: "metric", label: "Medidor", description: "Valor contra meta o rango.", renderer: "vega", requiredChannels: ["value"], optionalChannels: ["secondaryValue", "color"], supportsAdvancedSpec: true },
  { kind: "bullet", family: "metric", label: "Bullet", description: "Resultado, meta y rangos en poco espacio.", renderer: "vega", requiredChannels: ["value"], optionalChannels: ["secondaryValue", "category"], supportsAdvancedSpec: true },
  { kind: "traffic", family: "metric", label: "Semáforo", description: "Estado condicionado por reglas.", renderer: "native", requiredChannels: ["value"], optionalChannels: ["category", "secondaryValue"] },
  { kind: "podium", family: "metric", label: "Podio", description: "Primeros lugares con jerarquía visual.", renderer: "native", requiredChannels: ["category", "value"], optionalChannels: ["tooltip"] },
  { kind: "timeline", family: "diagram", label: "Cronograma", description: "Eventos, hitos y períodos.", renderer: "vega", requiredChannels: ["category", "value"], optionalChannels: ["series", "color", "tooltip"], supportsAdvancedSpec: true },
  { kind: "flow", family: "diagram", label: "Flujo", description: "Procesos, relaciones y recorridos.", renderer: "react-flow", requiredChannels: ["rows"], optionalChannels: ["value", "color"] },
  { kind: "org_chart", family: "diagram", label: "Organigrama", description: "Jerarquías de líderes, supervisores y equipos.", renderer: "react-flow", requiredChannels: ["rows"], optionalChannels: ["value", "color"] },
  { kind: "text", family: "content", label: "Texto", description: "Títulos, explicaciones y conclusiones.", renderer: "native", requiredChannels: [], optionalChannels: [] },
  { kind: "image", family: "content", label: "Imagen", description: "Logotipos, fotografías y recursos visuales.", renderer: "native", requiredChannels: [], optionalChannels: [] },
  { kind: "shape", family: "content", label: "Forma", description: "Fondos, separadores y contenedores.", renderer: "native", requiredChannels: [], optionalChannels: [] },
  { kind: "slicer", family: "filter", label: "Filtro", description: "Control interactivo conectado a una dimensión.", renderer: "native", requiredChannels: ["category"], optionalChannels: [] }
];

export const visualRegistry = new Map(definitions.map((definition) => [definition.kind, definition]));
export const visualDefinitions = definitions;

export function getVisualDefinition(kind: VisualKind) {
  const definition = visualRegistry.get(kind);
  if (!definition) throw new Error(`Visual no registrado: ${kind}`);
  return definition;
}

export function registerVisual(definition: VisualDefinition) {
  visualRegistry.set(definition.kind, definition);
}
