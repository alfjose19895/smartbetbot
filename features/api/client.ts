import { createClient } from "@/lib/supabase/client";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export async function browserApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { data: null, error: "authentication_required" };
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) return { data: null, error: `api_${response.status}` };
    if (response.status === 204) return { data: null, error: null };
    return { data: (await response.json()) as T, error: null };
  } catch {
    return { data: null, error: "api_unavailable" };
  }
}
