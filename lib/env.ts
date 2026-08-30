export const SUPABASE_CONFIGURATION_MESSAGE =
  "Supabase no está configurado. Agrega NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local.";

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export type PublicEnvironment = {
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_VERCEL_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

function runtimePublicEnvironment(): PublicEnvironment {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getOptionalSupabaseConfig(
  environment?: PublicEnvironment,
): SupabasePublicConfig | null {
  const resolved = environment ?? runtimePublicEnvironment();
  const url = resolved.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = resolved.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export function getSupabaseConfig(
  environment?: PublicEnvironment,
): SupabasePublicConfig {
  const config = getOptionalSupabaseConfig(environment);

  if (!config) {
    throw new Error(SUPABASE_CONFIGURATION_MESSAGE);
  }

  return config;
}

export function isSupabaseConfigured(
  environment?: PublicEnvironment,
): boolean {
  return getOptionalSupabaseConfig(environment) !== null;
}

export function getSiteUrl(environment?: PublicEnvironment): string {
  const resolved = environment ?? runtimePublicEnvironment();
  const configuredUrl = resolved.NEXT_PUBLIC_APP_URL?.trim();
  const vercelUrl = resolved.NEXT_PUBLIC_VERCEL_URL?.trim();
  const candidate = configuredUrl || vercelUrl || "http://localhost:3000";
  const withProtocol = candidate.startsWith("http") ? candidate : `https://${candidate}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return "http://localhost:3000";
  }
}
