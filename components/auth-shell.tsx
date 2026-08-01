"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";
import {
  AnalyticsApp,
  type ImportedRow,
  type NewUserInput,
  type Profile,
  type Upload,
} from "@/components/analytics-app-v2";
import {
  analyticsProfileColumns,
  friendlySupabaseError,
  initials,
  mapAnalyticsProfile,
  normalizeSalesRows,
  roleCode,
  type AnalyticsProfileRow,
} from "@/lib/analytics-profile";
import {
  AccessError,
  ConfigurationScreen,
  LoadingScreen,
  LoginScreen,
  RecoveryScreen,
} from "@/components/auth-screens";

// Las cargas comerciales mantienen seller_profile_id: null y resuelven
// supervisor_profile_id: únicamente contra perfiles activos de CC Analytics.

export function AuthShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(supabaseConfigured);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!supabaseConfigured) return;

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(nextSession);
      setChecking(false);
      if (!nextSession) {
        setProfile(null);
        setProfiles([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const replacements: Array<[string, string]> = [
      ["Invitar nuevo usuario", "Crear nuevo usuario"],
      ["Invitar usuario", "Crear usuario"],
      ["Enviar invitación segura", "Crear usuario"],
      ["Enviando invitación...", "Creando usuario..."],
      ["Invitación enviada", "Usuario creado"],
      ["No se pudo invitar", "No se pudo crear"],
      ["Alta compartida", "Alta directa"],
    ];

    const replaceUiText = () => {
      const root = document.body;
      if (!root) return;

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
      );
      let node = walker.nextNode();

      while (node) {
        const current = node.nodeValue || "";
        let updated = current;
        for (const [from, to] of replacements) {
          updated = updated.replaceAll(from, to);
        }
        if (updated !== current) node.nodeValue = updated;
        node = walker.nextNode();
      }
    };

    replaceUiText();
    const observer = new MutationObserver(replaceUiText);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !session) return;
    let active = true;

    async function loadProfiles() {
      setChecking(true);
      setError("");

      const { data: current, error: currentError } = await supabase
        .from("analytics_profiles")
        .select(analyticsProfileColumns)
        .eq("id", session!.user.id)
        .maybeSingle();

      if (!active) return;
      if (currentError || !current) {
        setProfile(null);
        setError(
          currentError?.message ||
            "Tu cuenta no está registrada en CC Analytics.",
        );
        setChecking(false);
        return;
      }

      try {
        const mapped = mapAnalyticsProfile(current as AnalyticsProfileRow);
        if (!mapped.active) {
          throw new Error(
            "Tu acceso a CC Analytics está inactivo o pendiente de aprobación.",
          );
        }

        setProfile(mapped);
        setProfiles([mapped]);

        const { data: directory } = await supabase
          .from("analytics_profiles")
          .select(analyticsProfileColumns)
          .order("full_name");

        if (!active) return;
        setProfiles(
          (directory || []).flatMap((row) => {
            try {
              return [mapAnalyticsProfile(row as AnalyticsProfileRow)];
            } catch {
              return [];
            }
          }),
        );
      } catch (loadError) {
        setProfile(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar tu perfil.",
        );
      } finally {
        if (active) setChecking(false);
      }
    }

    void loadProfiles();
    return () => {
      active = false;
    };
  }, [session, reload]);

  if (checking) return <LoadingScreen />;
  if (!supabaseConfigured) return <ConfigurationScreen />;
  if (recovery && session) {
    return <RecoveryScreen onDone={() => setRecovery(false)} />;
  }
  if (!session) return <LoginScreen />;
  if (error) {
    return (
      <AccessError
        message={error}
        onRetry={() => setReload((value) => value + 1)}
        onExit={() => void supabase.auth.signOut()}
      />
    );
  }
  if (!profile) return <LoadingScreen />;

  const currentProfile = profile;

  async function updateAccess(updated: Profile) {
    const { error: rpcError } = await supabase.rpc(
      "admin_update_analytics_profile",
      {
        target_user_id: updated.id,
        target_department: updated.department,
        target_job_title: updated.jobProfile,
        target_zone: updated.zone,
        target_reports_to: updated.managerId,
        target_status: updated.active ? "activo" : "inactivo",
        target_role: roleCode(updated.role),
      },
    );

    if (!rpcError) {
      setReload((value) => value + 1);
      return null;
    }
    return friendlySupabaseError(rpcError.message);
  }

  async function inviteUser(input: NewUserInput) {
    const password = window.prompt(
      `Define la contraseña temporal para ${input.email}.\n\nDebe tener al menos 10 caracteres, una mayúscula, una minúscula y un número.`,
    );

    if (password === null) {
      return { error: "Creación cancelada." };
    }

    if (
      password.length < 10 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return {
        error:
          "La contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula y un número.",
      };
    }

    const confirmation = window.prompt(
      `Confirma la contraseña para ${input.email}.`,
    );

    if (confirmation !== password) {
      return { error: "Las contraseñas no coinciden." };
    }

    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...input, password }),
    });

    const result = (await response.json()) as {
      profile?: Profile;
      error?: string;
    };

    if (!response.ok || result.error) {
      return {
        error: result.error || "No se pudo crear el usuario de CC Analytics.",
      };
    }

    setReload((value) => value + 1);
    return { profile: result.profile };
  }

  async function updateOwnProfile(name: string) {
    const cleanName = name.trim();
    const { error: updateError } = await supabase
      .from("analytics_profiles")
      .update({ full_name: cleanName })
      .eq("id", currentProfile.id);

    if (updateError) throw updateError;

    const updated = {
      ...currentProfile,
      name: cleanName,
      initials: initials(cleanName),
    };
    setProfile(updated);
    setProfiles((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    return updated;
  }

  async function importData(upload: Upload, rows: ImportedRow[]) {
    const preview = normalizeSalesRows(
      rows,
      upload,
      "00000000-0000-0000-0000-000000000000",
      currentProfile.id,
      profiles,
    );
    const unassigned = preview.filter((sale) => !sale.supervisor_profile_id);

    if (unassigned.length) {
      return `${unassigned.length.toLocaleString("es-HN")} ventas no tienen un supervisor reconocido. Verifica la columna Supervisor o Equipo.`;
    }

    const { data: created, error: importError } = await supabase
      .from("analytics_imports")
      .insert({
        file_name: upload.file,
        department: upload.department,
        zone: upload.zone,
        module: "general",
        row_count: rows.length,
        uploaded_by: currentProfile.id,
      })
      .select("id")
      .single();

    if (importError || !created) {
      return importError?.message || "No se pudo crear la importación.";
    }

    for (let start = 0; start < rows.length; start += 500) {
      const batch = rows.slice(start, start + 500).map((payload) => ({
        import_id: created.id,
        department: upload.department,
        zone: upload.zone,
        module: "general",
        payload,
        created_by: currentProfile.id,
      }));
      const { error: recordError } = await supabase
        .from("analytics_records")
        .insert(batch);
      if (recordError) {
        return `La carga quedó incompleta: ${recordError.message}`;
      }
    }

    const sales = normalizeSalesRows(
      rows,
      upload,
      created.id,
      currentProfile.id,
      profiles,
    );

    for (let start = 0; start < sales.length; start += 500) {
      const { error: salesError } = await supabase
        .from("analytics_sales")
        .insert(sales.slice(start, start + 500));
      if (salesError) {
        return `No se guardaron los comparativos: ${salesError.message}`;
      }
    }

    return null;
  }

  return (
    <AnalyticsApp
      initialProfile={currentProfile}
      initialProfiles={profiles}
      onSignOut={() => void supabase.auth.signOut()}
      onUpdateAccess={updateAccess}
      onInviteUser={inviteUser}
      onUpdateProfile={updateOwnProfile}
      onImportData={importData}
    />
  );
}
