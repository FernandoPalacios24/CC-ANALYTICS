#!/usr/bin/env python3
"""Convierte el alta por invitación en creación directa con correo y contraseña.

Uso desde la raíz del repositorio:
    python3 scripts/convert-user-invite-to-direct-create.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI_PATH = ROOT / "components" / "analytics-app-v2.tsx"
ROUTE_PATH = ROOT / "app" / "api" / "admin" / "invite" / "route.ts"
TESTS_DIR = ROOT / "tests"


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"No se encontró el bloque esperado: {label}")
    return text.replace(old, new, 1)


def patch_ui() -> None:
    text = UI_PATH.read_text(encoding="utf-8")

    text = replace_required(
        text,
        'export type NewUserInput = {\n  name: string;\n  email: string;\n',
        'export type NewUserInput = {\n  name: string;\n  email: string;\n  password: string;\n',
        "tipo NewUserInput",
    )

    text = replace_required(
        text,
        '  const [draft, setDraft] = useState<NewUserInput>({\n    name: "",\n    email: "",\n',
        '  const [draft, setDraft] = useState<NewUserInput>({\n    name: "",\n    email: "",\n    password: "",\n',
        "estado del formulario",
    )

    text = replace_required(
        text,
        '    setSending(true);\n    setError("");\n    const result = await onSubmit(draft);',
        '''    if (
      draft.password.length < 12 ||
      !/[a-z]/.test(draft.password) ||
      !/[A-Z]/.test(draft.password) ||
      !/[0-9]/.test(draft.password) ||
      !/[^A-Za-z0-9]/.test(draft.password)
    ) {
      setError(
        "La contraseña debe tener 12 o más caracteres, mayúscula, minúscula, número y símbolo.",
      );
      return;
    }
    setSending(true);
    setError("");
    const result = await onSubmit(draft);''',
        "validación de contraseña",
    )

    email_block = '''            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Correo
              <input
                required
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white outline-none focus:border-purple-400/50"
                placeholder="usuario@cablecolor.hn"
              />
            </label>'''
    password_block = email_block + '''
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 sm:col-span-2">
              Contraseña temporal
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={draft.password}
                onChange={(e) =>
                  setDraft({ ...draft, password: e.target.value })
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white outline-none focus:border-purple-400/50"
                placeholder="12 o más caracteres"
              />
              <span className="mt-2 block normal-case tracking-normal text-[10px] font-normal text-zinc-600">
                Usa mayúscula, minúscula, número y símbolo. Comparte esta contraseña por un canal interno seguro.
              </span>
            </label>'''
    text = replace_required(text, email_block, password_block, "campo de contraseña")

    replacements = {
        '`Acceso de ${row.name} actualizado en CC HUB.`':
            '`Acceso de ${row.name} actualizado en CC Analytics.`',
        '`No se pudo invitar: ${result.error}`':
            '`No se pudo crear: ${result.error}`',
        '`Invitación enviada a ${input.email}. La cuenta tendrá acceso a CC HUB y CC ANALYTICS.`':
            '`Usuario ${input.email} creado. Ya puede ingresar a CC Analytics con el correo y la contraseña asignados.`',
        'subtitle="Una sola cuenta de Supabase para CC HUB y CC ANALYTICS"':
            'subtitle="Cuentas exclusivas e independientes de CC Analytics"',
        'IDENTIDAD COMPARTIDA': 'ACCESO INDEPENDIENTE',
        '<Plus size={15} /> Invitar usuario': '<Plus size={15} /> Crear usuario',
        'Alta compartida': 'Alta independiente',
        'Invitar nuevo usuario': 'Crear nuevo usuario',
        'Se creará una sola identidad para CC HUB y CC ANALYTICS.\n                Supabase enviará un enlace seguro para que la persona establezca\n                su propia contraseña.':
            'Se creará una cuenta exclusiva de CC Analytics. La persona podrá\n                ingresar inmediatamente con el correo y la contraseña que\n                asignes; no se enviará correo de invitación.',
        'Selecciona el superior responsable antes de enviar.':
            'Selecciona el superior responsable antes de crear el usuario.',
        '{sending ? "Enviando invitación..." : "Enviar invitación segura"}':
            '{sending ? "Creando usuario..." : "Crear usuario"}',
        'user_invite_requested: "Invitación solicitada"':
            'user_create_requested: "Creación solicitada"',
        'user_invite_failed: "Invitación fallida"':
            'user_create_failed: "Creación fallida"',
        'user_invited: "Usuario invitado"':
            'user_created: "Usuario creado"',
        'subtitle="Excel y CSV se almacenan en el Supabase compartido"':
            'subtitle="Excel y CSV se almacenan en el Supabase independiente de CC Analytics"',
    }
    for old, new in replacements.items():
        if old in text:
            text = text.replace(old, new)

    # Agrega la etiqueta de actualización de credenciales al mapa de auditoría.
    marker = '  user_created: "Usuario creado",\n'
    if 'user_credentials_updated: "Credenciales actualizadas"' not in text:
        if marker not in text:
            raise RuntimeError("No se encontró el mapa de auditoría")
        text = text.replace(
            marker,
            marker + '  user_credentials_updated: "Credenciales actualizadas",\n',
            1,
        )

    UI_PATH.write_text(text, encoding="utf-8")


def patch_route() -> None:
    text = ROUTE_PATH.read_text(encoding="utf-8")

    text = replace_required(
        text,
        '  email?: string;\n  department?: string;',
        '  email?: string;\n  password?: string;\n  department?: string;',
        "tipo de entrada del servidor",
    )

    text = replace_required(
        text,
        '  const email = String(input.email ?? "").trim().toLowerCase();\n  let department',
        '  const email = String(input.email ?? "").trim().toLowerCase();\n  const password = String(input.password ?? "");\n  let department',
        "lectura de contraseña",
    )

    email_validation = '''  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    return jsonError("Ingresa un correo válido.", 400);
  }
'''
    password_validation = email_validation + '''
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return jsonError(
      "La contraseña debe tener 12 o más caracteres, mayúscula, minúscula, número y símbolo.",
      400,
    );
  }
'''
    text = replace_required(
        text,
        email_validation,
        password_validation,
        "validación de contraseña del servidor",
    )

    text = text.replace("user_invite_requested", "user_create_requested")
    text = text.replace("user_invite_failed", "user_create_failed")
    text = text.replace("user_invited", "user_created")
    text = text.replace(
        '"Se alcanzó el límite de invitaciones. Intenta nuevamente más tarde."',
        '"Se alcanzó el límite de creación de usuarios. Intenta nuevamente más tarde."',
    )

    pattern = re.compile(
        r'''  if \(!targetUser\) \{\n    const origin = new URL\(request\.url\)\.origin;[\s\S]*?    identityCreated = true;\n  \}\n\n  const profilePayload ='''
    )
    replacement = '''  const userMetadata = {
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
        email_confirm: true,
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

  const profilePayload ='''
    if "admin.auth.admin.createUser" not in text:
        text, count = pattern.subn(replacement, text, count=1)
        if count != 1:
            raise RuntimeError("No se encontró el bloque de invitación del servidor")

    text = text.replace(
        'action: identityCreated ? "user_created" : "user_access_updated",',
        'action: identityCreated ? "user_created" : "user_credentials_updated",',
    )
    text = text.replace(
        'identityCreated\n      ? "Se creó una cuenta independiente de CC Analytics y se envió la invitación."\n      : "Se actualizó la cuenta existente de CC Analytics."',
        'identityCreated\n      ? "Usuario creado. Ya puede ingresar con el correo y la contraseña asignados."\n      : "La cuenta existente, su contraseña y sus permisos fueron actualizados."',
    )
    text = text.replace(
        '? "No se pudo crear el perfil de CC Analytics. La invitación fue revertida."',
        '? "No se pudo crear el perfil de CC Analytics. La cuenta fue revertida."',
    )

    ROUTE_PATH.write_text(text, encoding="utf-8")


def patch_tests() -> None:
    if not TESTS_DIR.exists():
        return
    for path in TESTS_DIR.glob("*.test.mjs"):
        text = path.read_text(encoding="utf-8")
        updated = text
        updated = updated.replace("inviteUserByEmail", "createUser")
        updated = updated.replace("user_invite_requested", "user_create_requested")
        updated = updated.replace(
            "administrative invitations stay on the server and are audited",
            "administrative user creation stays on the server and is audited",
        )
        if updated != text:
            path.write_text(updated, encoding="utf-8")


def main() -> None:
    patch_ui()
    patch_route()
    patch_tests()
    print("Creación directa de usuarios aplicada correctamente.")
    print("Siguiente paso: npm run build")


if __name__ == "__main__":
    main()
