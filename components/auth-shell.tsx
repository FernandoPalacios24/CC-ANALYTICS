"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "@/components/analytics-app-v2";
import {
  ProductionAnalyticsApp,
} from "@/components/production-analytics-app";
import type { ProductionCreateUserInput } from "@/components/production-user-access";
import {
  analyticsProfileColumns,
  friendlySupabaseError,
  initials,
  mapAnalyticsProfile,
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
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

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

        const { data: directory, error: directoryError } = await supabase
          .from("analytics_profiles")
          .select(analyticsProfileColumns)
          .order("full_name");

        if (!active) return;
        if (directoryError) throw directoryError;

        const mappedDirectory = (directory || []).flatMap((row) => {
          try {
            return [mapAnalyticsProfile(row as AnalyticsProfileRow)];
          } catch {
            return [];
          }
        });

        setProfile(mapped);
        setProfiles(
          mappedDirectory.some((item) => item.id === mapped.id)
            ? mappedDirectory
            : [mapped, ...mappedDirectory],
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
      setProfiles((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (updated.id === currentProfile.id) setProfile(updated);
      return null;
    }
    return friendlySupabaseError(rpcError.message);
  }

  async function createUser(input: ProductionCreateUserInput) {
    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    let result: { profile?: Profile; error?: string };
    try {
      result = (await response.json()) as typeof result;
    } catch {
      return { error: "El servidor devolvió una respuesta inválida." };
    }

    if (!response.ok || result.error) {
      return {
        error: result.error || "No se pudo crear el usuario de CC Analytics.",
      };
    }

    if (result.profile) {
      setProfiles((current) => [
        result.profile!,
        ...current.filter((item) => item.id !== result.profile!.id),
      ]);
    }
    return { profile: result.profile };
  }

  async function updateOwnProfile(name: string) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("El nombre no puede quedar vacío.");

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

  return (
    <ProductionAnalyticsApp
      initialProfile={currentProfile}
      initialProfiles={profiles}
      onSignOut={() => void supabase.auth.signOut()}
      onUpdateAccess={updateAccess}
      onCreateUser={createUser}
      onUpdateProfile={updateOwnProfile}
    />
  );
}
