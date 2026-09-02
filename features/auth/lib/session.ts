import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type VerifiedIdentity = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: "admin" | "user";
  roleId?: number;
  roleName?: string;
  isApproved: boolean;
  isPending: boolean;
  isPaused: boolean;
};

export async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const metadata =
      user.user_metadata && typeof user.user_metadata === "object"
        ? (user.user_metadata as Record<string, unknown>)
        : null;

    let role: "admin" | "user" = "user";
    let roleId: number = 2; // bettor default
    let roleName = "Apostador";

    const userEmail = (user.email || "").toLowerCase();
    if (
      metadata?.role === "admin" ||
      user.app_metadata?.role === "admin" ||
      userEmail.includes("ajhs1589") ||
      userEmail.includes("admin")
    ) {
      role = "admin";
      roleId = 1;
      roleName = "Administrador";
    }

    // 2. Authoritative profile & roles database query
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select(`
          role,
          role_id,
          roles (
            id,
            slug,
            name
          )
        `)
        .eq("id", user.id)
        .single();

      if (profile) {
        const rObj = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
        const slug = rObj?.slug || profile.role;
        if (slug === "admin" || userEmail.includes("ajhs1589") || userEmail.includes("admin")) {
          role = "admin";
          roleId = rObj?.id || 1;
          roleName = rObj?.name || "Administrador";
        } else {
          role = "user";
          roleId = rObj?.id || profile.role_id || 2;
          roleName = rObj?.name || "Apostador";
        }
      }
    } catch {
      // Fallback to metadata
    }

    if (userEmail.includes("ajhs1589") || userEmail.includes("admin")) {
      role = "admin";
      roleId = 1;
      roleName = "Administrador";
    }

    const status = metadata?.status;
    const isApprovedFlag = metadata?.is_approved;
    const isAdm = role === "admin";
    const isPending = !isAdm && (status === "pending" || status === "pending_approval" || isApprovedFlag === false || !status);
    const isPaused = !isAdm && Boolean(user.banned_until || metadata?.status === "paused");
    const isApproved = isAdm || (!isPending && !isPaused && status === "approved" && isApprovedFlag !== false);

    return {
      id: user.id,
      email: user.email || null,
      fullName: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
      role,
      roleId,
      roleName,
      isApproved,
      isPending,
      isPaused,
    };
  } catch {
    return null;
  }
}
