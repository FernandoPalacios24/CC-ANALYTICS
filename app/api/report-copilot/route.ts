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

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError("OpenAI no está configurado.", 503);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonError(
      "La conexión independiente de CC Analytics está incompleta.",
      503,
    );
  }

  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return jsonError("Sesión requerida.", 401);

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);
  if (authError || !user) return jsonError("Sesión inválida.", 401);

  let body: {
    prompt?: string;
    context?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Solicitud inválida.", 400);
  }

  const prompt = body.prompt?.trim() || "";
  if (!prompt) return jsonError("Instrucción requerida.", 400);
  if (prompt.length > 8_000) {
    return jsonError("La instrucción supera el límite permitido.", 400);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REPORT_MODEL || "gpt-5.2",
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
            request: prompt,
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
    return jsonError(
      response.status === 429
        ? "El copiloto alcanzó temporalmente su límite de uso."
        : "No se pudo crear el reporte con OpenAI.",
      response.status === 429 ? 429 : 502,
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
  if (!outputText) {
    return jsonError("OpenAI no devolvió una composición.", 502);
  }

  try {
    return NextResponse.json({ definition: JSON.parse(outputText) });
  } catch {
    return jsonError("OpenAI devolvió una composición inválida.", 502);
  }
}
