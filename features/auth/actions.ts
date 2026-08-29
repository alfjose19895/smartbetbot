"use server";

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
import { isSupabaseConfigured, SUPABASE_CONFIGURATION_MESSAGE } from "@/lib/env";
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
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) return { status: "error", message: getAuthErrorMessage(error) };
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
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: buildAuthCallbackUrl("/dashboard"),
        data: { full_name: parsed.data.fullName },
      },
    });
    if (error) return { status: "error", message: getAuthErrorMessage(error) };
  } catch {
    return unexpectedState();
  }

  return {
    status: "success",
    message: "Revisa tu correo para confirmar la cuenta. El enlace puede tardar unos minutos.",
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
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: buildAuthCallbackUrl("/reset-password"),
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
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
      options: { emailRedirectTo: buildAuthCallbackUrl("/dashboard") },
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
