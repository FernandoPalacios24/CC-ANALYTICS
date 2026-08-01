import type {
  Department,
  ImportedRow,
  Profile,
  Upload,
} from "@/components/analytics-app-v2";

export type AnalyticsProfileRow = {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  role: string;
  status: string;
  job_title: string | null;
  zone: string | null;
  reports_to: string | null;
};

export const analyticsProfileColumns =
  "id,full_name,email,department,role,status,job_title,zone,reports_to";

export function mapAnalyticsProfile(row: AnalyticsProfileRow): Profile {
  if (/vendedor|ejecutivo de ventas/i.test(row.job_title || "")) {
    throw new Error("Los vendedores no reciben acceso a CC Analytics.");
  }

  const role = displayRole(row.role);
  const name = row.full_name.trim() || row.email;

  return {
    id: row.id,
    name,
    email: row.email,
    department: normalizeDepartment(row.department, role),
    jobProfile:
      role === "Administrador" ? "Administrador" : row.job_title || role,
    zone: role === "Administrador" ? "Nacional" : row.zone || "Sin asignar",
    role,
    managerId: row.reports_to,
    initials: initials(name),
    active: row.status === "activo",
  };
}

export function roleCode(role: Profile["role"]) {
  if (role === "Administrador") return "admin";
  if (role === "Líder de departamento") return "leader";
  if (role === "Supervisor") return "supervisor";
  if (role === "Operador") return "uploader";
  return "analyst";
}

export function normalizeSalesRows(
  rows: ImportedRow[],
  upload: Upload,
  importId: string,
  createdBy: string,
  profiles: Profile[],
) {
  const supervisors = new Map(
    profiles
      .filter(
        (item) =>
          item.role === "Supervisor" &&
          item.active &&
          item.department === upload.department &&
          (item.zone === upload.zone || item.zone === "Nacional"),
      )
      .map((item) => [normalizeName(item.name), item.id]),
  );

  const uploader = profiles.find((item) => item.id === createdBy);
  const uploaderSupervisor =
    uploader?.role === "Supervisor"
      ? uploader.id
      : uploader?.role === "Analista" || uploader?.role === "Operador"
        ? uploader.managerId
        : null;

  return rows.flatMap((payload) => {
    const sellerName = String(payload.Vendedor ?? "").trim();
    const supervisorName = String(
      payload.Supervisor ?? payload.Equipo ?? "",
    ).trim();
    const saleDate = normalizeDate(payload["Fecha Facturación"]);
    if (!sellerName || !saleDate) return [];

    const primary = payload["Es Primario"];
    return [
      {
        source_import_id: importId,
        department: upload.department,
        zone: upload.zone,
        seller_profile_id: null,
        supervisor_profile_id:
          supervisors.get(normalizeName(supervisorName)) || uploaderSupervisor,
        seller_code: nullableString(
          payload["Código Vendedor"] ??
            payload["Codigo Vendedor"] ??
            payload["ID Vendedor"],
        ),
        seller_name: sellerName,
        team: nullableString(payload.Equipo),
        sale_date: saleDate,
        country: nullableString(payload["País"]),
        region: nullableString(payload["Región"]),
        city: nullableString(payload.Ciudad),
        sale_type: nullableString(payload["Tipo De Venta*"]),
        service: nullableString(payload.Servicio),
        medium: nullableString(payload.Medio),
        is_primary:
          typeof primary === "boolean"
            ? primary
            : /^(si|sí|true|1)$/i.test(String(primary ?? "")),
        contract_service: nullableString(payload["Contrato Servicio"]),
        amount_billed: nullableNumber(payload["Ingreso Facturación"]),
        commission_income: nullableNumber(payload["Ingreso Para Comisión"]),
        payload,
        created_by: createdBy,
      },
    ];
  });
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function friendlySupabaseError(message: string) {
  if (message.toLowerCase().includes("admin_update_analytics_profile")) {
    return "La función administrativa de CC Analytics no está instalada.";
  }
  return message;
}

function displayRole(role: string): Profile["role"] {
  if (role === "admin") return "Administrador";
  if (role === "leader" || role === "manager") {
    return "Líder de departamento";
  }
  if (role === "supervisor") return "Supervisor";
  if (role === "uploader") return "Operador";
  return "Analista";
}

function normalizeDepartment(
  value: string | null,
  role: Profile["role"],
): Department {
  if (role === "Administrador") return "Administración";

  const key = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const departments: Record<string, Department> = {
    "ventas digitales": "Ventas Digitales",
    "ventas residencial": "Ventas Residenciales",
    "ventas residenciales": "Ventas Residenciales",
    "ventas residenciales rurales": "Ventas Residenciales Rurales",
    "ventas residencial rural": "Ventas Residenciales Rurales",
    "ventas corporativas": "Ventas Corporativas",
    marketing: "Marketing",
    "marketing digital": "Marketing",
    "call center": "Call Center",
    telemercadeo: "Call Center",
    "recursos humanos": "Recursos Humanos",
    rrhh: "Recursos Humanos",
    finanzas: "Finanzas",
    operaciones: "Operaciones",
    instalaciones: "Operaciones",
    "soporte tecnico": "Operaciones",
    inventario: "Operaciones",
  };

  const department = departments[key];
  if (!department) throw new Error("El departamento no está configurado.");
  return department;
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value: unknown) {
  const text = String(value ?? "").trim();
  const latin = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  const date =
    value instanceof Date
      ? value
      : latin
        ? new Date(Number(latin[3]), Number(latin[2]) - 1, Number(latin[1]))
        : new Date(text);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function nullableString(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

function nullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const result = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(result) ? result : null;
}
