import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { safeRedirectPath } from "@/features/auth/lib/redirects";
import { getOptionalSupabaseConfig } from "@/lib/env";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/live",
  "/prematch",
  "/signals",
  "/history",
  "/track-record",
  "/backtesting",
  "/settings",
  "/admin",
] as const;

const AUTH_ENTRY_ROUTES = ["/login", "/register"] as const;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isProtectedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PROTECTED_PREFIXES);
}

function copySessionState(source: NextResponse, target: NextResponse): void {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = isProtectedPath(pathname);
  const isAuthEntryRoute = matchesPrefix(pathname, AUTH_ENTRY_ROUTES);
  const config = getOptionalSupabaseConfig();

  if (!config) {
    if (!isProtectedRoute) return NextResponse.next({ request });
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          supabaseResponse.headers.set(name, value);
        });
      },
    },
  });

  // Keep this call immediately after client creation: it verifies and refreshes the user token.
  const { data: { user }, error } = await supabase.auth.getUser();
  const hasVerifiedIdentity = Boolean(user?.id) && !error;

  const isPaused = Boolean(
    user?.banned_until ||
    (user?.user_metadata && typeof user.user_metadata === "object" && (user.user_metadata as Record<string, unknown>).status === "paused")
  );

  const isPending = Boolean(
    user?.user_metadata && typeof user.user_metadata === "object" && (user.user_metadata as Record<string, unknown>).status === "pending"
  );

  if ((!hasVerifiedIdentity || isPaused || isPending) && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (isPending) {
      loginUrl.searchParams.set("error", "account_pending");
    } else if (isPaused) {
      loginUrl.searchParams.set("error", "account_paused");
    } else {
      loginUrl.searchParams.set("next", safeRedirectPath(`${pathname}${request.nextUrl.search}`));
    }
    const response = NextResponse.redirect(loginUrl);
    copySessionState(supabaseResponse, response);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (hasVerifiedIdentity && !isPaused && !isPending && isAuthEntryRoute) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    const response = NextResponse.redirect(dashboardUrl);
    copySessionState(supabaseResponse, response);
    return response;
  }

  return supabaseResponse;
}
