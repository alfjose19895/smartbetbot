import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth/components/forms";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPasswordPage() {
  const identity = await getVerifiedIdentity();

  if (!identity) {
    return (
      <div className="auth-card">
        <div className="auth-heading">
          <span className="auth-kicker">Enlace no válido</span>
          <h1>Solicita un enlace nuevo</h1>
          <p>La sesión de recuperación expiró o este enlace ya fue utilizado.</p>
        </div>
        <Link className="auth-submit" href="/forgot-password">Solicitar otro enlace →</Link>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-heading">
        <span className="auth-kicker">Protege tu cuenta</span>
        <h1>Elige una contraseña nueva</h1>
        <p>Usa al menos ocho caracteres y evita reutilizar una contraseña anterior.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
