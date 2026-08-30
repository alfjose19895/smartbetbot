type SupabaseErrorLike = {
  code?: string;
  message?: string;
} | null;

const ERROR_MESSAGES: Record<string, string> = {
  email_address_invalid: "Ingresa un correo electrónico válido.",
  email_not_confirmed: "Confirma tu correo antes de iniciar sesión.",
  invalid_credentials: "El correo o la contraseña no son correctos.",
  over_email_send_rate_limit: "Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.",
  otp_expired: "El enlace expiró o ya fue utilizado. Solicita uno nuevo.",
  same_password: "La nueva contraseña debe ser diferente de la actual.",
  session_not_found: "La sesión expiró. Solicita un enlace nuevo.",
  signup_disabled: "El registro no está disponible temporalmente.",
  user_already_exists: "No se pudo crear la cuenta con esos datos.",
  user_banned: "Esta cuenta no está disponible. Contacta a soporte.",
  weak_password: "La contraseña no cumple los requisitos de seguridad.",
};

export function getAuthErrorMessage(error: SupabaseErrorLike): string {
  if (error?.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code];
  }

  const raw = (error?.message || "").toLowerCase();
  if (raw.includes("already registered") || raw.includes("already exists")) {
    return "Ya existe una cuenta con este correo. Por favor inicia sesión o recupera tu contraseña.";
  }
  if (raw.includes("weak password") || raw.includes("password should be at least")) {
    return "La contraseña no cumple los requisitos de seguridad.";
  }

  return "No pudimos completar la solicitud. Inténtalo nuevamente.";
}
