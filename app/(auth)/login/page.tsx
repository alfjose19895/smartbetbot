import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/forms";
import { safeRedirectPath } from "@/features/auth/lib/redirects";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Iniciar Sesión | SmartBetBot" };

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
    <div className="w-full max-w-md rounded-3xl bg-slate-900/90 p-8 shadow-2xl border border-slate-800 backdrop-blur-xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/80 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-800/50 mb-3">
          <span>🔐 Acceso Seguro</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Inicia Sesión
        </h1>
        <p className="mt-1 text-xs text-slate-400 sm:text-sm">
          Ingresa tus credenciales para acceder a tus pronósticos y panel.
        </p>
      </div>

      <LoginForm nextPath={safeRedirectPath(params.next)} notice={notice} />

      <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
        <p className="text-xs text-slate-400">
          ¿Aún no tienes cuenta?{" "}
          <Link href="/register" className="font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4">
            Crear cuenta gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
