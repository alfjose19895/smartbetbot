import type { Metadata } from "next";
import Link from "next/link";

import { ResendVerificationForm } from "@/features/auth/components/forms";

export const metadata: Metadata = { title: "Verifica tu correo" };

type VerifyEmailPageProps = {
  searchParams: Promise<{ email?: string; message?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { email, message } = await searchParams;

  return (
    <div className="auth-card">
      <div className="mail-symbol" aria-hidden="true">✦</div>
      <div className="auth-heading centered">
        <span className="auth-kicker">Un paso más</span>
        <h1>Verifica tu correo</h1>
        <p>Abre el enlace que enviamos para activar tu cuenta. Revisa también la carpeta de spam.</p>
      </div>
      {message === "invalid-link" ? (
        <div className="form-status" role="alert"><span>!</span><p>El enlace expiró o ya fue utilizado. Solicita una confirmación nueva.</p></div>
      ) : null}
      <ResendVerificationForm defaultEmail={email} />
      <p className="auth-switch"><Link href="/login">Volver al inicio de sesión</Link></p>
    </div>
  );
}
