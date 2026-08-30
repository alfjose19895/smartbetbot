import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type VerifiedIdentity = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: "admin" | "user";
  isApproved: boolean;
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
    const userEmail = (user.email || "").toLowerCase();

    // Specific admin emails or user metadata
    if (
      userEmail.includes("admin") ||
      userEmail.includes("alfredo") ||
      metadata?.role === "admin" ||
      user.app_metadata?.role === "admin"
    ) {
      role = "admin";
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "admin") {
        role = "admin";
      }
    } catch {
      // Fallback
    }

    const isApproved = metadata?.status !== "pending";

    return {
      id: user.id,
      email: user.email || null,
      fullName: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
      role,
      isApproved,
    };
  } catch {
    return null;
  }
}
