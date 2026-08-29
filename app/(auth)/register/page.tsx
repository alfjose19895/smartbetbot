import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/features/auth/components/forms";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage() {
  const identity = await getVerifiedIdentity();
  if (identity) redirect("/dashboard");

  return (
    <div className="auth-card wide-card">
      <div className="auth-heading">
        <span className="auth-kicker">Empieza con datos</span>
        <h1>Crea tu cuenta</h1>
        <p>Configura un espacio personal para seguir señales deportivas explicables.</p>
      </div>
      <RegisterForm />
      <p className="auth-switch">¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link></p>
    </div>
  );
}
