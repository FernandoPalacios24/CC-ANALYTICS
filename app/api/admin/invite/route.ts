import { NextResponse } from "next/server";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

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

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const found = data.users.find(
      (user) => normalize(user.email) === normalize(email),
    );

    if (found) return found;
    if (data.users.length < perPage) return null;
  }

  throw new Error("No se pudo completar la búsqueda de usuarios.");
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return jsonError(
      "La conexión independiente de CC Analytics está incompleta.",
      503,
    );
  }

  if (!serviceRoleKey) {
    return jsonError(
      "Falta configurar la clave administrativa segura de CC Analytics.",
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
    return jsonError(
      "Solo un administrador activo de CC Analytics puede crear usuarios.",
      403,
    );
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

  if (!name || name.length > 120) {
    return jsonError("Ingresa un nombre completo válido.", 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Ingresa un correo válido.", 400);
  }

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

  if (!department || !zone || !jobProfile) {
    return jsonError(
      "Departamento, zona y cargo son obligatorios.",
      400,
    );
  }

  if (!allowedDepartments.has(department)) {
    return jsonError("El departamento solicitado no es válido.", 400);
  }

  if (!allowedRoles.has(role)) {
    return jsonError(
      "El rol solicitado no tiene acceso a CC Analytics.",
      400,
    );
  }

  if (zone.length > 80 || jobProfile.length > 100) {
    return jsonError(
      "La zona o el cargo superan la longitud permitida.",
      400,
    );
  }

  if (
    normalize(jobProfile).includes("vendedor") ||
    normalize(jobProfile).includes("ejecutivo de ventas")
  ) {
    return jsonError(
      "Los vendedores se cargan como registros comerciales y no reciben acceso.",
      400,
    );
  }

  if (
    managerId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      managerId,
    )
  ) {
    return jsonError("El superior seleccionado no es válido.", 400);
  }

  if (role === "Administrador") {
    department = "Administración";
    zone = "Nacional";
  } else if (department === "Administración") {
    return jsonError(
      "Solo el administrador puede tener alcance de Administración.",
      400,
    );
  }

  if (
    role !== "Administrador" &&
    role !== "Líder de departamento" &&
    !managerId
  ) {
    return jsonError(
      "Asigna el superior responsable de este usuario.",
      400,
    );
  }

  const targetRole = roleCode(role);

  if (managerId) {
    const { data: manager, error: managerError } = await admin
      .from("analytics_profiles")
      .select("id,department,zone,status,role")
      .eq("id", managerId)
      .maybeSingle();

    const managerRoleAllowed =
      targetRole === "supervisor"
        ? manager?.role === "leader"
        : manager?.role === "supervisor";

    if (
      managerError ||
      !manager ||
      manager.status !== "activo" ||
      manager.department !== department ||
      !(manager.zone === zone || manager.zone === "Nacional") ||
      !managerRoleAllowed
    ) {
      return jsonError(
        "El superior seleccionado no corresponde al departamento, zona o nivel requerido.",
        400,
      );
    }
  }

  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count, error: limitError } = await admin
    .from("analytics_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", actor.id)
    .eq("action", "user_create_requested")
    .gte("created_at", since);

  if (limitError) {
    return jsonError(
      "La base independiente de CC Analytics todavía no está instalada.",
      503,
    );
  }

  if ((count || 0) >= 10) {
    return jsonError(
      "Se alcanzó el límite de creación de usuarios. Intenta nuevamente más tarde.",
      429,
    );
  }

  await writeAudit(admin, {
    actor_id: actor.id,
    action: "user_create_requested",
    entity_type: "analytics_profile",
    department,
    zone,
    metadata: { email, role, job_profile: jobProfile },
  });

  let targetUser: User | null = null;
  let identityCreated = false;

  try {
    targetUser = await findAuthUserByEmail(admin, email);
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "No se pudo buscar la cuenta en CC Analytics.",
      502,
    );
  }

  const userMetadata = {
    full_name: name,
    department,
    job_title: jobProfile,
    zone,
    reports_to: managerId,
    role: targetRole,
  };

  if (!targetUser) {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });

    if (createError || !created.user) {
      await writeAudit(admin, {
        actor_id: actor.id,
        action: "user_create_failed",
        entity_type: "analytics_profile",
        department,
        zone,
        metadata: {
          email,
          reason: createError?.message || "Supabase no devolvió el usuario.",
        },
      });

      return jsonError(
        createError?.message || "Supabase no pudo crear el usuario.",
        502,
      );
    }

    targetUser = created.user;
    identityCreated = true;
  } else {
    const { data: updated, error: updateError } =
      await admin.auth.admin.updateUserById(targetUser.id, {
        password,
        user_metadata: userMetadata,
      });

    if (updateError || !updated.user) {
      await writeAudit(admin, {
        actor_id: actor.id,
        action: "user_create_failed",
        entity_type: "analytics_profile",
        entity_id: targetUser.id,
        department,
        zone,
        metadata: {
          email,
          reason: updateError?.message || "No se pudo actualizar la cuenta.",
        },
      });

      return jsonError(
        updateError?.message || "No se pudieron actualizar las credenciales.",
        502,
      );
    }

    targetUser = updated.user;
  }

  const profilePayload = {
    id: targetUser.id,
    full_name: name,
    email,
    department,
    job_title: jobProfile,
    zone,
    reports_to:
      targetRole === "admin" || targetRole === "leader"
        ? null
        : managerId,
    role: targetRole,
    status: "activo",
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await admin
    .from("analytics_profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileError) {
    if (identityCreated) {
      await admin.auth.admin.deleteUser(targetUser.id);
    }

    await writeAudit(admin, {
      actor_id: actor.id,
      action: "user_profile_failed",
      entity_type: "analytics_profile",
      entity_id: targetUser.id,
      department,
      zone,
      metadata: {
        email,
        reason: profileError.message,
        identity_created: identityCreated,
      },
    });

    return jsonError(
      identityCreated
        ? "No se pudo crear el perfil de CC Analytics. La cuenta fue revertida."
        : "La cuenta existe en CC Analytics, pero no se pudo actualizar su perfil.",
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
    metadata: {
      email,
      role,
      job_profile: jobProfile,
      identity_created: identityCreated,
    },
  });

  return NextResponse.json({
    accountReused: !identityCreated,
    message: identityCreated
      ? "Usuario creado. Ya puede ingresar con el correo y la contraseña asignados."
      : "La cuenta existente, su contraseña y sus permisos fueron actualizados.",
    profile: {
      id: targetUser.id,
      name,
      email,
      department,
      jobProfile,
      zone,
      role,
      managerId:
        targetRole === "admin" || targetRole === "leader"
          ? null
          : managerId,
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
