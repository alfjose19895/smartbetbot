type SecurityEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(environment: SecurityEnvironment = process.env): string {
  const connections = new Set([
    "'self'",
    origin(environment.NEXT_PUBLIC_API_URL),
    origin(environment.NEXT_PUBLIC_SUPABASE_URL),
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "wss://*.firebaseio.com",
  ].filter((value): value is string => Boolean(value)));
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
    `connect-src ${[...connections].join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  const appOrigin = origin(environment.NEXT_PUBLIC_APP_URL);
  if (environment.NODE_ENV === "production" && appOrigin?.startsWith("https://")) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function applicationSecurityHeaders(
  environment: SecurityEnvironment = process.env,
): Array<{ key: string; value: string }> {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(environment) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
  const appOrigin = origin(environment.NEXT_PUBLIC_APP_URL);
  if (environment.NODE_ENV === "production" && appOrigin?.startsWith("https://")) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}
