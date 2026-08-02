import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { env as workerEnv } from "cloudflare:workers";

const allowedRoles = new Set([
  "Administrador",
  "Líder de departamento",
  "Supervisor",
  "Analista",
  "Operador",
]);

const allowedDepartments = new Set([
  "Administración",
  "Ventas Digitales",
  "Ventas Residenciales",
  "Ventas Residenciales Rurales",
  "Ventas Corporativas",
  "Marketing",
  "Call Center",
  "Recursos Humanos",
  "Finanzas",
  "Operaciones",
]);

type InviteInput = {
  name?: string;
  email?: string;
  password?: string;
  department?: string;
  jobProfile?: string;
  zone?: string;
  role?: string;
  managerId?: string | null;
};

function runtimeString(name: string) {
  const binding = workerEnv[name];
  if (typeof binding === "string" && binding.trim()) return binding.trim();
  const fallback = process.env[name];
  return typeof fallback === "string" && fallback.trim() ? fallback.trim() : "";
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function roleCode(role: string) {
  if (role === "Administrador") return "admin";
  if (role === "Líder de departamento") return "leader";
  if (role === "Supervisor") return "supervisor";
  if (role === "Operador") return "uploader";
  return "analyst";
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => normalize(user.email) === normalize(email));
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function writeAudit(
  admin: SupabaseClient,
  entry: {
    actor_id: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    department?: string | null;
    zone?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await admin.from("analytics_audit_log").insert(entry);
}

export async function POST(request: Request) {
  const supabaseUrl = runtimeString("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    runtimeString("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    runtimeString("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = runtimeString("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey) {
    return jsonError("La conexión independiente de CC Analytics está incompleta.", 503);
  }

  if (!serviceRoleKey) {
    return jsonError(
      "Cloudflare no entregó el binding SUPABASE_SERVICE_ROLE_KEY al Worker cc-analytics.",
      503,
    );
  }

  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return jsonError("Sesión administrativa requerida.", 401);

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user: actor },
    error: authError,
  } = await authClient.auth.getUser(token);
  if (authError || !actor) return jsonError("La sesión no es válida.", 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: actorProfile, error: actorError } = await admin
    .from("analytics_profiles")
    .select("id,role,status")
    .eq("id", actor.id)
    .maybeSingle();

  if (
    actorError ||
    !actorProfile ||
    actorProfile.status !== "activo" ||
    actorProfile.role !== "admin"
  ) {
    return jsonError("Solo un administrador activo puede crear usuarios.", 403);
  }

  let input: InviteInput;
  try {
    input = (await request.json()) as InviteInput;
  } catch {
    return jsonError("Solicitud inválida.", 400);
  }

  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  let department = String(input.department ?? "").trim();
  const jobProfile = String(input.jobProfile ?? "").trim();
  let zone = String(input.zone ?? "").trim();
  const role = String(input.role ?? "").trim();
  const managerId = input.managerId || null;

  if (!name || name.length > 120) return jsonError("Ingresa un nombre completo válido.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("Ingresa un correo válido.", 400);
  if (
    password.length < 10 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return jsonError(
      "La contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula y un número.",
      400,
    );
  }
  if (!allowedRoles.has(role)) return jsonError("El rol solicitado no es válido.", 400);
  if (!allowedDepartments.has(department)) return jsonError("El departamento solicitado no es válido.", 400);
  if (!zone || !jobProfile) return jsonError("Zona y cargo son obligatorios.", 400);
  if (/vendedor|ejecutivo de ventas/i.test(jobProfile)) {
    return jsonError("Los vendedores no reciben usuario de acceso.", 400);
  }

  const targetRole = roleCode(role);
  if (role === "Administrador") {
    department = "Administración";
    zone = "Nacional";
  } else if (department === "Administración") {
    return jsonError("Solo el administrador puede pertenecer a Administración.", 400);
  }

  if (!["admin", "leader"].includes(targetRole) && !managerId) {
    return jsonError("Asigna el superior responsable de este usuario.", 400);
  }

  if (managerId) {
    const { data: manager, error: managerError } = await admin
      .from("analytics_profiles")
      .select("id,department,zone,status,role")
      .eq("id", managerId)
      .maybeSingle();
    const validLevel =
      targetRole === "supervisor"
        ? manager?.role === "leader"
        : manager?.role === "supervisor";
    if (
      managerError ||
      !manager ||
      manager.status !== "activo" ||
      manager.department !== department ||
      !(manager.zone === zone || manager.zone === "Nacional") ||
      !validLevel
    ) {
      return jsonError("El superior seleccionado no corresponde al alcance requerido.", 400);
    }
  }

  const userMetadata = {
    full_name: name,
    department,
    job_title: jobProfile,
    zone,
    reports_to: ["admin", "leader"].includes(targetRole) ? null : managerId,
    role: targetRole,
  };

  let targetUser: User | null = null;
  let identityCreated = false;

  try {
    targetUser = await findAuthUserByEmail(admin, email);
    if (!targetUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (error || !data.user) throw error || new Error("Supabase no devolvió el usuario.");
      targetUser = data.user;
      identityCreated = true;
    } else {
      const { data, error } = await admin.auth.admin.updateUserById(targetUser.id, {
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (error || !data.user) throw error || new Error("No se pudo actualizar la cuenta.");
      targetUser = data.user;
    }
  } catch (error) {
    await writeAudit(admin, {
      actor_id: actor.id,
      action: "user_create_failed",
      entity_type: "analytics_profile",
      department,
      zone,
      metadata: { email, reason: error instanceof Error ? error.message : "Error desconocido" },
    });
    return jsonError(error instanceof Error ? error.message : "No se pudo crear el usuario.", 502);
  }

  const { error: profileError } = await admin.from("analytics_profiles").upsert(
    {
      id: targetUser.id,
      full_name: name,
      email,
      department,
      job_title: jobProfile,
      zone,
      reports_to: ["admin", "leader"].includes(targetRole) ? null : managerId,
      role: targetRole,
      status: "activo",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    if (identityCreated) await admin.auth.admin.deleteUser(targetUser.id);
    return jsonError(
      identityCreated
        ? "No se pudo crear el perfil. La cuenta fue revertida."
        : "La cuenta existe, pero no se pudo actualizar su perfil.",
      502,
    );
  }

  await writeAudit(admin, {
    actor_id: actor.id,
    action: identityCreated ? "user_created" : "user_credentials_updated",
    entity_type: "analytics_profile",
    entity_id: targetUser.id,
    department,
    zone,
    metadata: { email, role, job_profile: jobProfile },
  });

  return NextResponse.json({
    message: identityCreated
      ? "Usuario creado. Ya puede ingresar con la contraseña asignada."
      : "La cuenta, contraseña y permisos fueron actualizados.",
    profile: {
      id: targetUser.id,
      name,
      email,
      department,
      jobProfile,
      zone,
      role,
      managerId: ["admin", "leader"].includes(targetRole) ? null : managerId,
      initials: name
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      active: true,
    },
  });
}
