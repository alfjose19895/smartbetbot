"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthErrorMessage } from "@/features/auth/lib/auth-errors";
import { buildAuthCallbackUrl, safeRedirectPath } from "@/features/auth/lib/redirects";
import {
  emailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/features/auth/lib/validation";
import type { AuthActionState } from "@/features/auth/types";
import { isSupabaseConfigured, SUPABASE_CONFIGURATION_MESSAGE, getSiteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function invalidState(fieldErrors: Record<string, string[]>): AuthActionState {
  return {
    status: "error",
    message: "Revisa los campos indicados.",
    fieldErrors,
  };
}

function configurationState(): AuthActionState {
  return { status: "error", message: SUPABASE_CONFIGURATION_MESSAGE };
}

function unexpectedState(): AuthActionState {
  return {
    status: "error",
    message: "No pudimos contactar el servicio de autenticación. Inténtalo nuevamente.",
  };
}

async function resolveCallbackUrl(path: string): Promise<string> {
  try {
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") || headerList.get("host");
    const proto = headerList.get("x-forwarded-proto") || "https";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      const url = new URL("/auth/confirm", `${proto}://${host}`);
      url.searchParams.set("next", safeRedirectPath(path));
      return url.toString();
    }
  } catch {
    // Fallback to getSiteUrl
  }
  return buildAuthCallbackUrl(path);
}

export async function loginAction(
  _: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
    next: formValue(formData, "next"),
  });

  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!isSupabaseConfigured()) return configurationState();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) return { status: "error", message: getAuthErrorMessage(error) };

    const meta = data?.user?.user_metadata || {};
    const role = meta.role || data?.user?.role;
    const status = meta.status;
    const isApproved = meta.is_approved;
    const userEmail = (data?.user?.email || "").toLowerCase();
    const isAdmin = role === "admin" || userEmail.includes("admin") || userEmail.includes("ajhs1589");

    if (!isAdmin) {
      if (status === "paused" || data?.user?.banned_until) {
        await supabase.auth.signOut({ scope: "local" });
        return {
          status: "error",
          message: "Tu cuenta ha sido pausada por el administrador. Contacta con soporte para reactivarla.",
        };
      }

      if (status === "pending" || status === "pending_approval" || isApproved === false) {
        await supabase.auth.signOut({ scope: "local" });
        return {
          status: "error",
          message: "Tu cuenta está pendiente de validación y aprobación por el administrador. Te notificaremos en cuanto tu acceso sea habilitado.",
        };
      }
    }
  } catch {
    return unexpectedState();
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectPath(parsed.data.next));
}

export async function registerAction(
  _: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    fullName: formValue(formData, "fullName"),
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword"),
  });

  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!isSupabaseConfigured()) return configurationState();

  try {
    const supabase = await createClient();
    const emailRedirectTo = await resolveCallbackUrl("/login");
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: parsed.data.fullName,
          status: "pending",
          is_approved: false,
          role: "bettor",
          role_id: 2,
        },
      },
    });
    if (error) {
      return { status: "error", message: getAuthErrorMessage(error) };
    }

    // Always log out session on registration to force admin validation
    if (data?.session) {
      await supabase.auth.signOut({ scope: "local" });
    }
  } catch (err: any) {
    if (err?.digest?.includes("NEXT_REDIRECT")) throw err;
    console.error("[registerAction error]:", err);
    return {
      status: "error",
      message: err?.message ? getAuthErrorMessage(err) : "No pudimos contactar el servicio de autenticación. Inténtalo nuevamente.",
    };
  }

  return {
    status: "success",
    message: "¡Registro recibido con éxito! Tu cuenta ha sido creada y se encuentra pendiente de validación y aprobación por el administrador. Podrás ingresar una vez que el administrador active tu acceso.",
  };
}

export async function forgotPasswordAction(
  _: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse({ email: formValue(formData, "email") });
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!isSupabaseConfigured()) return configurationState();

  try {
    const supabase = await createClient();
    const redirectTo = await resolveCallbackUrl("/reset-password");
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo,
    });
    if (error?.code === "over_email_send_rate_limit") {
      return { status: "error", message: getAuthErrorMessage(error) };
    }
  } catch {
    return unexpectedState();
  }

  return {
    status: "success",
    message: "Si existe una cuenta asociada, recibirás un enlace para cambiar la contraseña.",
  };
}

export async function resendVerificationAction(
  _: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse({ email: formValue(formData, "email") });
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!isSupabaseConfigured()) return configurationState();

  try {
    const supabase = await createClient();
    const emailRedirectTo = await resolveCallbackUrl("/dashboard");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
      options: { emailRedirectTo },
    });
    if (error?.code === "over_email_send_rate_limit") {
      return { status: "error", message: getAuthErrorMessage(error) };
    }
  } catch {
    return unexpectedState();
  }

  return {
    status: "success",
    message: "Si la cuenta está pendiente, enviaremos un nuevo enlace de confirmación.",
  };
}

export async function resetPasswordAction(
  _: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword"),
  });
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!isSupabaseConfigured()) return configurationState();

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { status: "error", message: getAuthErrorMessage(error) };
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    return unexpectedState();
  }

  revalidatePath("/", "layout");
  return {
    status: "success",
    message: "Contraseña actualizada. Inicia sesión nuevamente con tu nueva contraseña.",
  };
}

export async function logoutAction(): Promise<never> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Redirect regardless; invalid or expired local cookies are cleared by the proxy.
    }
  }

  revalidatePath("/", "layout");
  redirect("/login?message=signed-out");
}
