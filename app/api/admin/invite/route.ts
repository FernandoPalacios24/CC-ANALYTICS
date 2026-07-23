import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey)
    return jsonError("La conexión corporativa de Supabase está incompleta.", 503);
  if (!serviceRoleKey)
    return jsonError(
      "Falta activar la clave administrativa segura de Supabase en el servidor.",
      503,
    );

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
    .from("profiles")
    .select("id,role,status,analytics_enabled,analytics_role")
    .eq("id", actor.id)
    .single();
  if (
    actorError ||
    !actorProfile ||
    actorProfile.status !== "activo" ||
    actorProfile.analytics_enabled !== true ||
    !(
      actorProfile.role === "administrador" ||
      actorProfile.analytics_role === "admin"
    )
  )
    return jsonError("Solo un administrador activo puede invitar usuarios.", 403);

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
  if (!name || name.length > 120)
    return jsonError("Ingresa un nombre completo válido.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonError("Ingresa un correo válido.", 400);
  if (!department || !zone || !jobProfile)
    return jsonError("Departamento, zona y cargo son obligatorios.", 400);
  if (!allowedDepartments.has(department))
    return jsonError("El departamento solicitado no es válido.", 400);
  if (zone.length > 80 || jobProfile.length > 100)
    return jsonError("La zona o el cargo superan la longitud permitida.", 400);
  if (!allowedRoles.has(role))
    return jsonError("El rol solicitado no tiene acceso a CC Analytics.", 400);
  if (
    normalize(jobProfile).includes("vendedor") ||
    normalize(jobProfile).includes("ejecutivo de ventas")
  )
    return jsonError(
      "Los vendedores se cargan como registros comerciales y no reciben acceso.",
      400,
    );
  if (
    managerId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      managerId,
    )
  )
    return jsonError("El superior seleccionado no es válido.", 400);
  if (role === "Administrador") {
    department = "Administración";
    zone = "Nacional";
  } else if (department === "Administración") {
    return jsonError(
      "Solo el administrador puede tener alcance de Administración.",
      400,
    );
  }

  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count, error: limitError } = await admin
    .from("analytics_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", actor.id)
    .eq("action", "user_invite_requested")
    .gte("created_at", since);
  if (limitError)
    return jsonError(
      "La migración corporativa de auditoría todavía no está instalada.",
      503,
    );
  if ((count || 0) >= 10)
    return jsonError(
      "Se alcanzó el límite de invitaciones. Intenta nuevamente más tarde.",
      429,
    );

  let analyticsRole = "analyst";
  let hubRole = "colaborador";
  if (role === "Administrador") {
    analyticsRole = "admin";
    hubRole = "administrador";
  } else if (role === "Líder de departamento") {
    analyticsRole = "leader";
    hubRole = "supervisor";
  } else if (role === "Supervisor") {
    analyticsRole = "supervisor";
    hubRole = "supervisor";
  } else if (role === "Operador") {
    analyticsRole = "uploader";
  }

  if (
    role !== "Administrador" &&
    role !== "Líder de departamento" &&
    !managerId
  )
    return jsonError("Asigna el superior responsable de este usuario.", 400);

  if (managerId) {
    const { data: manager, error: managerError } = await admin
      .from("profiles")
      .select("id,department,zone,status,analytics_enabled,analytics_role")
      .eq("id", managerId)
      .single();
    const managerRoleAllowed =
      role === "Supervisor"
        ? ["leader", "manager"].includes(manager?.analytics_role)
        : manager?.analytics_role === "supervisor";
    if (
      managerError ||
      !manager ||
      manager.status !== "activo" ||
      manager.analytics_enabled !== true ||
      manager.department !== department ||
      !(manager.zone === zone || manager.zone === "Nacional") ||
      !managerRoleAllowed
    )
      return jsonError(
        "El superior seleccionado no corresponde al departamento, zona o nivel requerido.",
        400,
      );
  }

  await admin.from("analytics_audit_log").insert({
    actor_id: actor.id,
    action: "user_invite_requested",
    entity_type: "profile",
    department,
    zone,
    metadata: { email, role, job_profile: jobProfile },
  });

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
    await admin.from("analytics_audit_log").insert({
      actor_id: actor.id,
      action: "user_invite_failed",
      entity_type: "profile",
      department,
      zone,
      metadata: {
        email,
        reason: invitationError?.message || "Supabase no devolvió el usuario",
      },
    });
    const registered = normalize(invitationError?.message).includes("registered");
    return jsonError(
      registered
        ? "Ese correo ya tiene una cuenta en Supabase."
        : invitationError?.message || "Supabase no pudo enviar la invitación.",
      registered ? 409 : 502,
    );
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: invitation.user.id,
    full_name: name,
    email,
    department,
    job_title: jobProfile,
    zone,
    reports_to:
      role === "Administrador" || role === "Líder de departamento"
        ? null
        : managerId,
    role: hubRole,
    status: "activo",
    analytics_enabled: true,
    analytics_role: analyticsRole,
    updated_at: new Date().toISOString(),
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(invitation.user.id);
    return jsonError(
      "No se pudo crear el perfil corporativo. La invitación fue revertida.",
      502,
    );
  }

  await admin.from("analytics_audit_log").insert({
    actor_id: actor.id,
    action: "user_invited",
    entity_type: "profile",
    entity_id: invitation.user.id,
    department,
    zone,
    metadata: { email, role, job_profile: jobProfile },
  });

  return NextResponse.json({
    profile: {
      id: invitation.user.id,
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
