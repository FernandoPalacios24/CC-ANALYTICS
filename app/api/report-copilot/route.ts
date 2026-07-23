import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const dimensions = [
  "month",
  "date",
  "department",
  "zone",
  "region",
  "city",
  "supervisor",
  "seller",
  "team",
  "sale_type",
  "service",
  "medium",
  "package",
  "primary",
] as const;
const metrics = [
  "sales",
  "amount_billed",
  "commission_income",
  "average_ticket",
  "active_sellers",
] as const;
const blockTypes = [
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

const reportSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    analysis: { type: "string" },
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: blockTypes },
          dimension: { type: "string", enum: dimensions },
          secondaryDimension: {
            type: "string",
            enum: ["none", ...dimensions],
          },
          metric: { type: "string", enum: metrics },
          sort: { type: "string", enum: ["desc", "asc"] },
          limit: { type: "integer", minimum: 1, maximum: 200 },
          filter: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: { type: "string", enum: dimensions },
              operator: { type: "string", enum: ["equals", "contains"] },
              value: { type: "string" },
            },
            required: ["field", "operator", "value"],
          },
        },
        required: [
          "id",
          "title",
          "type",
          "dimension",
          "secondaryDimension",
          "metric",
          "sort",
          "limit",
          "filter",
        ],
      },
    },
  },
  required: ["title", "description", "analysis", "blocks"],
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
            "Eres el copiloto de Business Intelligence de Cable Color Honduras. Convierte la solicitud en una composición útil, ejecutiva y editable de reportes. No inventes datos ni nombres. Usa entre 2 y 6 bloques, prioriza comparativos mensuales, jerarquía Líder > Supervisor > Vendedor, territorio y presentación clara. Responde únicamente con la estructura solicitada.",
        },
        {
          role: "user",
          content: JSON.stringify({
            request: body.prompt,
            availableContext: body.context || {},
            metricMeaning: {
              sales: "cantidad de registros de venta",
              amount_billed: "suma de monto facturado",
              commission_income: "suma de ingreso por comisión",
              average_ticket: "promedio de monto facturado",
              active_sellers: "vendedores distintos con registros",
            },
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
