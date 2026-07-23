import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const visualTypes = [
  "kpi",
  "table",
  "pivot",
  "bar",
  "line",
  "area",
  "pie",
  "traffic",
  "funnel",
] as const;
const aggregations = [
  "count",
  "sum",
  "average",
  "min",
  "max",
  "distinct",
] as const;
const calculations = [
  "none",
  "share",
  "projection",
  "month_change",
  "goal_progress",
] as const;
const filterOperators = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "greater",
  "less",
  "between",
] as const;

const filterSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    field: { type: "string" },
    operator: { type: "string", enum: filterOperators },
    value: { type: "string" },
    valueTo: { type: "string" },
  },
  required: ["id", "field", "operator", "value", "valueTo"],
};

const reportSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [3] },
    title: { type: "string" },
    description: { type: "string" },
    analysis: { type: "string" },
    source: { type: "string", enum: ["sales", "imports"] },
    goal: { type: "number" },
    globalFilters: {
      type: "array",
      maxItems: 8,
      items: filterSchema,
    },
    widgets: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: visualTypes },
          rowField: { type: "string" },
          columnField: { type: "string" },
          valueField: { type: "string" },
          aggregation: { type: "string", enum: aggregations },
          calculation: { type: "string", enum: calculations },
          formula: { type: "string" },
          sort: { type: "string", enum: ["desc", "asc"] },
          limit: { type: "integer", minimum: 1, maximum: 500 },
          filters: {
            type: "array",
            maxItems: 8,
            items: filterSchema,
          },
        },
        required: [
          "id",
          "title",
          "type",
          "rowField",
          "columnField",
          "valueField",
          "aggregation",
          "calculation",
          "formula",
          "sort",
          "limit",
          "filters",
        ],
      },
    },
  },
  required: [
    "version",
    "title",
    "description",
    "analysis",
    "source",
    "goal",
    "globalFilters",
    "widgets",
  ],
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: "OpenAI no configurado" },
      { status: 503 },
    );

  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token)
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://vvuxlzxbgnilzdtomyod.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_BdePRThQK0YafjmpN3vbow_EGEySxf4";
  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);
  if (authError || !user)
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const body = (await request.json()) as {
    prompt?: string;
    context?: Record<string, unknown>;
  };
  if (!body.prompt?.trim())
    return NextResponse.json({ error: "Instrucción requerida" }, { status: 400 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REPORT_MODEL || "gpt-5.6-sol",
      store: false,
      input: [
        {
          role: "system",
          content:
            "Eres el copiloto de Business Intelligence de Cable Color Honduras. Convierte la solicitud en una composición útil, ejecutiva y totalmente editable de reportes. Debes usar exclusivamente los nombres de campos recibidos en availableContext.fields; no traduzcas, inventes ni cambies esos nombres. Usa __rows como valueField para contar registros. Elige aggregation sum o average solo para campos numéricos. Usa entre 2 y 8 widgets. Para una presentación incluye indicadores, al menos una visualización y una tabla. Para comparar meses usa calculation month_change o una línea agrupada por el campo de mes disponible. Para proyección usa projection. Para cumplimiento usa goal_progress. Puedes crear todos los filtros solicitados. Responde únicamente con la estructura JSON solicitada y version 3.",
        },
        {
          role: "user",
          content: JSON.stringify({
            request: body.prompt,
            availableContext: body.context || {},
            formulaSyntax:
              "Opcional: SUMA([Campo]), PROMEDIO([Campo]), UNICOS([Campo]), CONTEO(), META y operadores + - * /.",
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "cc_analytics_report_definition",
          strict: true,
          schema: reportSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("OpenAI report copilot failed", response.status, detail);
    return NextResponse.json(
      { error: "No se pudo crear el reporte con OpenAI" },
      { status: 502 },
    );
  }

  const result = (await response.json()) as {
    output?: {
      type?: string;
      content?: { type?: string; text?: string }[];
    }[];
  };
  const outputText = result.output
    ?.flatMap((item) => item.content || [])
    .find((item) => item.type === "output_text")?.text;
  if (!outputText)
    return NextResponse.json(
      { error: "OpenAI no devolvió una composición" },
      { status: 502 },
    );

  return NextResponse.json({ definition: JSON.parse(outputText) });
}
