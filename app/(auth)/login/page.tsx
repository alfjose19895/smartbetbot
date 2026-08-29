import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/forms";
import { safeRedirectPath } from "@/features/auth/lib/redirects";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Iniciar sesión" };

type LoginPageProps = {
  searchParams: Promise<{ message?: string; next?: string }>;
};

const NOTICES: Record<string, string> = {
  "password-updated": "Tu contraseña se actualizó correctamente.",
  "signed-out": "Sesión cerrada correctamente.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const identity = await getVerifiedIdentity();
  if (identity) redirect("/dashboard");

  const params = await searchParams;
  const notice = params.message ? NOTICES[params.message] : undefined;

  return (
    <div className="auth-card">
      <div className="auth-heading">
        <span className="auth-kicker">Bienvenido de nuevo</span>
        <h1>Inicia sesión</h1>
        <p>Accede a tus señales, análisis y configuración personal.</p>
      </div>
      <LoginForm nextPath={safeRedirectPath(params.next)} notice={notice} />
      <p className="auth-switch">¿Aún no tienes cuenta? <Link href="/register">Crear cuenta</Link></p>
    </div>
  );
}
