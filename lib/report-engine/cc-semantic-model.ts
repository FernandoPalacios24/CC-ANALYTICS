import type { SemanticDataset } from "./types";

export const salesSemanticDataset: SemanticDataset = {
  id: "sales",
  label: "Ventas",
  source: "analytics_sales",
  engine: "postgres",
  dateField: "sale_date",
  fields: [
    { id: "sale_date", label: "Fecha", column: "sale_date", kind: "date" },
    { id: "department", label: "Departamento", column: "department", kind: "text" },
    { id: "zone", label: "Zona", column: "zone", kind: "text" },
    { id: "region", label: "Región", column: "region", kind: "text" },
    { id: "city", label: "Ciudad", column: "city", kind: "text" },
    { id: "supervisor", label: "Supervisor", column: "supervisor_profile_id", kind: "text" },
    { id: "seller", label: "Vendedor", column: "seller_name", kind: "text" },
    { id: "team", label: "Equipo", column: "team", kind: "text" },
    { id: "sale_type", label: "Tipo de venta", column: "sale_type", kind: "text" },
    { id: "service", label: "Servicio", column: "service", kind: "text" },
    { id: "medium", label: "Canal", column: "medium", kind: "text" },
    { id: "is_primary", label: "Es primario", column: "is_primary", kind: "boolean" },
    { id: "contract_service", label: "Paquete", column: "contract_service", kind: "text" },
    { id: "amount_billed", label: "Monto facturado", column: "amount_billed", kind: "number", format: "currency" },
    { id: "commission_income", label: "Ingreso para comisión", column: "commission_income", kind: "number", format: "currency" }
  ],
  measures: [
    { id: "sales_count", label: "Ventas", expression: "count(*)", format: "integer", description: "Cantidad de contratos registrados." },
    { id: "sales_amount", label: "Monto vendido", expression: "coalesce(sum(amount_billed), 0)", format: "currency" },
    { id: "commission_amount", label: "Ingreso para comisión", expression: "coalesce(sum(commission_income), 0)", format: "currency" },
    { id: "arpu", label: "ARPU", expression: "coalesce(avg(amount_billed), 0)", format: "currency" },
    { id: "unique_sellers", label: "Vendedores activos", expression: "count(DISTINCT seller_name)", format: "integer" }
  ]
};

export const ccSemanticModel = [salesSemanticDataset];

export function datasetById(id: string) {
  const dataset = ccSemanticModel.find((item) => item.id === id);
  if (!dataset) throw new Error(`Dataset no registrado: ${id}`);
  return dataset;
}
