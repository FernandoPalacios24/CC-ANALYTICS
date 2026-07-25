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
  department?: string;
  jobProfile?: string;
  zone?: string;
  role?: string;
  managerId?: string | null;
};

type RoleConfiguration = {
  membershipRole: string;
  legacyAnalyticsRole: string;
  hubRole: string;
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

function roleConfiguration(role: string): RoleConfiguration {
  switch (role) {
    case "Administrador":
      return {
        membershipRole: "admin",
        legacyAnalyticsRole: "admin",
        hubRole: "administrador",
      };

    case "Líder de departamento":
      return {
        membershipRole: "department_leader",
        legacyAnalyticsRole: "leader",
        hubRole: "supervisor",
      };

    case "Supervisor":
      return {
        membershipRole: "supervisor",
        legacyAnalyticsRole: "supervisor",
        hubRole: "supervisor",
      };

    case "Operador":
      return {
        membershipRole: "uploader",
        legacyAnalyticsRole: "uploader",
        hubRole: "colaborador",
      };

    default:
      return {
        membershipRole: "analyst",
        legacyAnalyticsRole: "analyst",
        hubRole: "colaborador",
      };
  }
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

  throw new Error(
    "No se pudo completar la búsqueda de la cuenta en Supabase.",
  );
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
      "La conexión corporativa de Supabase está incompleta.",
      503,
    );
  }

  if (!serviceRoleKey) {
    return jsonError(
      "Falta activar la clave administrativa segura de Supabase en el servidor.",
      503,
    );
  }

  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return jsonError("Sesión administrativa requerida.", 401);
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user: actor },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !actor) {
    return jsonError("La sesión no es válida.", 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  /*
   * Durante la transición aceptamos dos formas de reconocer al administrador:
   * 1. La nueva tabla app_memberships.
   * 2. Los campos antiguos analytics_enabled / analytics_role en profiles.
   */
  const [actorProfileResult, actorMembershipResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id,role,status,analytics_enabled,analytics_role")
      .eq("id", actor.id)
      .maybeSingle(),

    admin
      .from("app_memberships")
      .select("user_id,role_code,active")
      .eq("user_id", actor.id)
      .eq("app_code", "cc_analytics")
      .maybeSingle(),
  ]);

  const actorProfile = actorProfileResult.data;
  const actorMembership = actorMembershipResult.data;

  const actorIsMembershipAdmin =
    actorMembership?.active === true &&
    ["admin", "administrator"].includes(actorMembership.role_code);

  const actorIsLegacyAdmin =
    actorProfile?.status === "activo" &&
    actorProfile.analytics_enabled === true &&
    (actorProfile.role === "administrador" ||
      actorProfile.analytics_role === "admin");

  if (!actorIsMembershipAdmin && !actorIsLegacyAdmin) {
    return jsonError(
      "Solo un administrador activo puede gestionar accesos.",
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

  if (!department || !zone || !jobProfile) {
    return jsonError(
      "Departamento, zona y cargo son obligatorios.",
      400,
    );
  }

  if (!allowedDepartments.has(department)) {
    return jsonError("El departamento solicitado no es válido.", 400);
  }

  if (zone.length > 80 || jobProfile.length > 100) {
    return jsonError(
      "La zona o el cargo superan la longitud permitida.",
      400,
    );
  }

  if (!allowedRoles.has(role)) {
    return jsonError(
      "El rol solicitado no tiene acceso a CC Analytics.",
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

  const roles = roleConfiguration(role);

  /*
   * El superior también se valida con app_memberships.
   * Se conserva compatibilidad con analytics_role mientras termina la migración.
   */
  if (managerId) {
    const [managerProfileResult, managerMembershipResult] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id,department,zone,status,analytics_enabled,analytics_role",
        )
        .eq("id", managerId)
        .maybeSingle(),

      admin
        .from("app_memberships")
        .select("user_id,role_code,department,zone,active")
        .eq("user_id", managerId)
        .eq("app_code", "cc_analytics")
        .maybeSingle(),
    ]);

    const manager = managerProfileResult.data;
    const managerMembership = managerMembershipResult.data;

    const managerRole =
      managerMembership?.role_code || manager?.analytics_role || "";

    const managerActive =
      managerMembership?.active === true ||
      (manager?.status === "activo" &&
        manager?.analytics_enabled === true);

    const managerDepartment =
      managerMembership?.department || manager?.department || "";

    const managerZone =
      managerMembership?.zone || manager?.zone || "";

    const managerRoleAllowed =
      role === "Supervisor"
        ? ["department_leader", "leader", "manager"].includes(
            managerRole,
          )
        : managerRole === "supervisor";

    if (
      !manager ||
      !managerActive ||
      managerDepartment !== department ||
      !(managerZone === zone || managerZone === "Nacional") ||
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
    .in("action", [
      "user_invite_requested",
      "analytics_access_requested",
    ])
    .gte("created_at", since);

  if (limitError) {
    return jsonError(
      "La migración corporativa de auditoría todavía no está instalada.",
      503,
    );
  }

  if ((count || 0) >= 10) {
    return jsonError(
      "Se alcanzó el límite de solicitudes. Intenta nuevamente más tarde.",
      429,
    );
  }

  await writeAudit(admin, {
    actor_id: actor.id,
    action: "analytics_access_requested",
    entity_type: "profile",
    department,
    zone,
    metadata: {
      email,
      role,
      job_profile: jobProfile,
    },
  });

  let targetUser: User | null = null;
  let identityCreated = false;

  try {
    targetUser = await findAuthUserByEmail(admin, email);
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "No se pudo buscar la cuenta en Supabase.",
      502,
    );
  }

  /*
   * Si la identidad ya existe, se reutiliza.
   * Si no existe, se invita como antes.
   */
  if (!targetUser) {
    const origin = new URL(request.url).origin;

    const { data: invitation, error: invitationError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: origin,
        data: {
          full_name: name,
          department,
          job_title: jobProfile,
          zone,
          reports_to: managerId,
        },
      });

    if (invitationError || !invitation.user) {
      await writeAudit(admin, {
        actor_id: actor.id,
        action: "user_invite_failed",
        entity_type: "profile",
        department,
        zone,
        metadata: {
          email,
          reason:
            invitationError?.message ||
            "Supabase no devolvió el usuario.",
        },
      });

      return jsonError(
        invitationError?.message ||
          "Supabase no pudo enviar la invitación.",
        502,
      );
    }

    targetUser = invitation.user;
    identityCreated = true;
  }

  const { data: existingProfile, error: existingProfileError } =
    await admin
      .from("profiles")
      .select(
        "id,status,full_name,email,department,job_title,zone,reports_to,role",
      )
      .eq("id", targetUser.id)
      .maybeSingle();

  if (existingProfileError) {
    if (identityCreated) {
      await admin.auth.admin.deleteUser(targetUser.id);
    }

    return jsonError(
      "No se pudo revisar el perfil corporativo existente.",
      502,
    );
  }

  if (existingProfile && existingProfile.status !== "activo") {
    if (identityCreated) {
      await admin.auth.admin.deleteUser(targetUser.id);
    }

    return jsonError(
      "La cuenta existe, pero su perfil de CC HUB está inactivo. Reactívalo antes de conceder acceso.",
      409,
    );
  }

  const profilePayload = {
    full_name: name,
    email,
    department,
    job_title: jobProfile,
    zone,
    reports_to:
      role === "Administrador" || role === "Líder de departamento"
        ? null
        : managerId,
    role: roles.hubRole,
    analytics_enabled: true,
    analytics_role: roles.legacyAnalyticsRole,
    updated_at: new Date().toISOString(),
  };

  const profileResult = existingProfile
    ? await admin
        .from("profiles")
        .update(profilePayload)
        .eq("id", targetUser.id)
    : await admin.from("profiles").insert({
        id: targetUser.id,
        ...profilePayload,
        status: "activo",
      });

  if (profileResult.error) {
    if (identityCreated) {
      await admin.auth.admin.deleteUser(targetUser.id);
    }

    await writeAudit(admin, {
      actor_id: actor.id,
      action: "analytics_profile_failed",
      entity_type: "profile",
      entity_id: targetUser.id,
      department,
      zone,
      metadata: {
        email,
        reason: profileResult.error.message,
        identity_created: identityCreated,
      },
    });

    return jsonError(
      identityCreated
        ? "No se pudo crear el perfil corporativo. La invitación fue revertida."
        : "La cuenta existe, pero no se pudo actualizar su perfil corporativo.",
      502,
    );
  }

  const { error: membershipError } = await admin
    .from("app_memberships")
    .upsert(
      {
        user_id: targetUser.id,
        app_code: "cc_analytics",
        role_code: roles.membershipRole,
        profile_name: role,
        department,
        zone,
        active: true,
        granted_by: actor.id,
        granted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,app_code",
      },
    );

  if (membershipError) {
    if (identityCreated) {
      await admin.auth.admin.deleteUser(targetUser.id);
    }

    await writeAudit(admin, {
      actor_id: actor.id,
      action: "analytics_access_failed",
      entity_type: "profile",
      entity_id: targetUser.id,
      department,
      zone,
      metadata: {
        email,
        reason: membershipError.message,
        identity_created: identityCreated,
      },
    });

    return jsonError(
      "No se pudo guardar el acceso a CC Analytics.",
      502,
    );
  }

  await writeAudit(admin, {
    actor_id: actor.id,
    action: identityCreated
      ? "user_invited"
      : "analytics_access_granted",
    entity_type: "profile",
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
      ? "La cuenta fue creada y recibió acceso a CC Analytics."
      : "La cuenta existente de CC HUB recibió acceso a CC Analytics.",
    profile: {
      id: targetUser.id,
      name,
      email,
      department,
      jobProfile,
      zone,
      role,
      managerId:
        role === "Administrador" || role === "Líder de departamento"
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
