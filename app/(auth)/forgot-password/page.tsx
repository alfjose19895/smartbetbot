import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/features/auth/components/forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

type ForgotPasswordPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { message } = await searchParams;

  return (
    <div className="auth-card">
      <div className="auth-heading">
        <span className="auth-kicker">Recuperar acceso</span>
        <h1>Restablece tu contraseña</h1>
        <p>Te enviaremos un enlace seguro si el correo está asociado a una cuenta.</p>
      </div>
      {message === "invalid-link" ? (
        <div className="form-status" role="alert"><span>!</span><p>El enlace expiró o ya fue utilizado. Solicita uno nuevo.</p></div>
      ) : null}
      <ForgotPasswordForm />
      <p className="auth-switch"><Link href="/login">← Volver al inicio de sesión</Link></p>
    </div>
  );
}
