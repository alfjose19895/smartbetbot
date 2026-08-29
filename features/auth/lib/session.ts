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
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return null;

    const metadata =
      claims.user_metadata && typeof claims.user_metadata === "object"
        ? (claims.user_metadata as Record<string, unknown>)
        : null;

    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      fullName: metadata && typeof metadata.full_name === "string" ? metadata.full_name : null,
    };
  } catch {
    return null;
  }
}
