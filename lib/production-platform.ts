import type { Department, Profile, Role } from "@/components/analytics-app-v2";

export type ProductionModule = {
  heading: string;
  moduleKey: string;
  title: string;
  ownerDepartment?: Department;
  kind: "executive" | "sales" | "metrics" | "alerts" | "import" | "native";
  shared?: boolean;
};

export const salesDepartments: Department[] = [
  "Ventas Digitales",
  "Ventas Residenciales",
  "Ventas Residenciales Rurales",
  "Ventas Corporativas",
];

export const departmentDefaultModule: Record<Department, string> = {
  Administración: "executive",
  "Ventas Digitales": "sales",
  "Ventas Residenciales": "sales",
  "Ventas Residenciales Rurales": "sales",
  "Ventas Corporativas": "sales",
  Marketing: "marketing_digital",
  "Call Center": "call_center",
  "Recursos Humanos": "recursos_humanos",
  Finanzas: "finanzas",
  Operaciones: "operaciones",
};

export const productionModules: ProductionModule[] = [
  { heading: "Dashboard ejecutivo", moduleKey: "executive", title: "Dashboard ejecutivo", kind: "executive" },
  { heading: "Dashboard de mi área", moduleKey: "area", title: "Dashboard de mi área", kind: "metrics" },
  { heading: "Ventas digitales", moduleKey: "sales", title: "Ventas digitales", ownerDepartment: "Ventas Digitales", kind: "native" },
  { heading: "Ventas residenciales", moduleKey: "sales", title: "Ventas residenciales", ownerDepartment: "Ventas Residenciales", kind: "native" },
  { heading: "Ventas residenciales rurales", moduleKey: "sales", title: "Ventas residenciales rurales", ownerDepartment: "Ventas Residenciales Rurales", kind: "native" },
  { heading: "Ventas corporativas", moduleKey: "sales", title: "Ventas corporativas", ownerDepartment: "Ventas Corporativas", kind: "native" },
  { heading: "Marketing digital", moduleKey: "marketing_digital", title: "Marketing digital", ownerDepartment: "Marketing", kind: "metrics" },
  { heading: "ROA y ROAS", moduleKey: "roa_roas", title: "ROA y ROAS", ownerDepartment: "Marketing", kind: "metrics", shared: true },
  { heading: "Call center", moduleKey: "call_center", title: "Call center", ownerDepartment: "Call Center", kind: "metrics" },
  { heading: "Recursos humanos", moduleKey: "recursos_humanos", title: "Recursos humanos", ownerDepartment: "Recursos Humanos", kind: "metrics" },
  { heading: "Finanzas", moduleKey: "finanzas", title: "Finanzas", ownerDepartment: "Finanzas", kind: "metrics" },
  { heading: "Operaciones", moduleKey: "operaciones", title: "Operaciones", ownerDepartment: "Operaciones", kind: "metrics" },
  { heading: "Instalaciones", moduleKey: "instalaciones", title: "Instalaciones", ownerDepartment: "Operaciones", kind: "metrics", shared: true },
  { heading: "Soporte técnico", moduleKey: "soporte_tecnico", title: "Soporte técnico", ownerDepartment: "Operaciones", kind: "metrics", shared: true },
  { heading: "Inventario", moduleKey: "inventario", title: "Inventario", ownerDepartment: "Operaciones", kind: "metrics" },
  { heading: "Cobertura", moduleKey: "cobertura", title: "Cobertura", ownerDepartment: "Operaciones", kind: "metrics", shared: true },
  { heading: "Clientes", moduleKey: "clientes", title: "Clientes", ownerDepartment: "Call Center", kind: "metrics", shared: true },
  { heading: "Reportes", moduleKey: "reports", title: "Reportes", kind: "native" },
  { heading: "Importar datos", moduleKey: "import", title: "Importar datos", kind: "import" },
  { heading: "Usuarios y permisos", moduleKey: "users", title: "Usuarios y permisos", kind: "native" },
  { heading: "Auditoría y seguridad", moduleKey: "audit", title: "Auditoría y seguridad", kind: "native" },
  { heading: "Centro de alertas", moduleKey: "alerts", title: "Centro de alertas", kind: "alerts" },
  { heading: "Proyecciones", moduleKey: "projection", title: "Proyecciones", kind: "metrics" },
];

export function moduleForHeading(heading: string) {
  return productionModules.find((module) => module.heading === heading) || null;
}

export function moduleOwner(module: ProductionModule, profile: Profile): Department {
  if (module.heading === "Dashboard de mi área") return profile.department;
  if (module.heading === "ROA y ROAS" && profile.department === "Finanzas") return "Finanzas";
  if (module.heading === "Soporte técnico" && profile.department === "Call Center") return "Call Center";
  return module.ownerDepartment || profile.department;
}

const readOnlyRoles: Role[] = ["Analista"];

export function canEditMetrics(profile: Profile) {
  return ["Administrador", "Líder de departamento", "Supervisor"].includes(profile.role);
}

export function canImportMetrics(profile: Profile) {
  return ["Administrador", "Líder de departamento", "Supervisor", "Operador"].includes(profile.role);
}

export function canSeeNav(profile: Profile, heading: string) {
  if (profile.role === "Administrador") return true;
  if (heading === "Dashboard ejecutivo" || heading === "Usuarios y permisos" || heading === "Auditoría y seguridad") return false;
  if (heading === "Dashboard de mi área" || heading === "Centro de alertas") return true;
  if (heading === "Reportes") return profile.role !== "Operador";
  if (heading === "Importar datos") {
    if (salesDepartments.includes(profile.department)) return false;
    return canImportMetrics(profile) && !readOnlyRoles.includes(profile.role);
  }
  if (heading === "Proyecciones") return profile.role !== "Operador";

  const module = moduleForHeading(heading);
  if (!module) return true;
  if (module.kind === "native" && module.moduleKey === "sales") {
    return module.ownerDepartment === profile.department;
  }

  if (module.ownerDepartment === profile.department) return true;
  if (heading === "ROA y ROAS") return ["Marketing", "Finanzas"].includes(profile.department);
  if (heading === "Cobertura") return [
    "Operaciones",
    "Ventas Digitales",
    "Ventas Residenciales",
    "Ventas Residenciales Rurales",
    "Ventas Corporativas",
  ].includes(profile.department);
  if (heading === "Clientes") return [
    "Call Center",
    "Ventas Digitales",
    "Ventas Residenciales",
    "Ventas Residenciales Rurales",
    "Ventas Corporativas",
  ].includes(profile.department);
  if (heading === "Soporte técnico") return ["Operaciones", "Call Center"].includes(profile.department);
  return false;
}

export function moduleOptionsForDepartment(department: Department) {
  const options = productionModules.filter((module) => {
    if (module.kind !== "metrics") return false;
    if (module.heading === "Dashboard de mi área" || module.heading === "Proyecciones") return false;
    return module.ownerDepartment === department;
  });
  const fallback = departmentDefaultModule[department];
  if (!options.some((option) => option.moduleKey === fallback) && fallback !== "sales" && fallback !== "executive") {
    options.unshift({ heading: "Dashboard de mi área", moduleKey: fallback, title: "Indicadores del área", ownerDepartment: department, kind: "metrics" });
  }
  return options;
}
