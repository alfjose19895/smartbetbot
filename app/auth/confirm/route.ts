import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { safeRedirectPath } from "@/features/auth/lib/redirects";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return Boolean(value) && EMAIL_OTP_TYPES.has(value as EmailOtpType);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = safeRedirectPath(requestUrl.searchParams.get("next"));
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?message=configuration-required", requestUrl));
  }

  let error: Error | null = null;

  try {
    const supabase = await createClient();
    if (code) {
      const result = await supabase.auth.exchangeCodeForSession(code);
      error = result.error;
    } else if (tokenHash && isEmailOtpType(type)) {
      const result = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      error = result.error;
    } else {
      error = new Error("Missing confirmation parameters");
    }
  } catch {
    error = new Error("Confirmation request failed");
  }

  if (error) {
    const errorPath = nextPath === "/reset-password" ? "/forgot-password" : "/verify-email";
    return NextResponse.redirect(new URL(`${errorPath}?message=invalid-link`, requestUrl));
  }

  const response = NextResponse.redirect(new URL(nextPath, requestUrl));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
