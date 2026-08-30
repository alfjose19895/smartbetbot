import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type VerifiedIdentity = {
  id: string;
  email: string | null;
  fullName: string | null;
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

    return {
      id: user.id,
      email: user.email || null,
      fullName: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
    };
  } catch {
    return null;
  }
}
