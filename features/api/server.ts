import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ApiResult<T> = { data: T | null; error: string | null };

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
}

export async function apiFetch<T>(path: string): Promise<ApiResult<T>> {
  try {
    const supabase = await createClient();
    const [{ data: claimsData }, { data: sessionData }] = await Promise.all([
      supabase.auth.getClaims(),
      supabase.auth.getSession(),
    ]);
    if (!claimsData?.claims?.sub || !sessionData.session?.access_token) {
      return { data: null, error: "authentication_required" };
    }
    const response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return { data: null, error: `api_${response.status}` };
    }
    return { data: (await response.json()) as T, error: null };
  } catch {
    return { data: null, error: "api_unavailable" };
  }
}
