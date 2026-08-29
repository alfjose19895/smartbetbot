import { getSiteUrl, type PublicEnvironment } from "@/lib/env";

export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const base = "https://smartbetbot.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildAuthCallbackUrl(
  nextPath: string,
  environment: PublicEnvironment = process.env as PublicEnvironment,
): string {
  const callbackUrl = new URL("/auth/confirm", getSiteUrl(environment));
  callbackUrl.searchParams.set("next", safeRedirectPath(nextPath));
  return callbackUrl.toString();
}
