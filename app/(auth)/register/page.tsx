import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/features/auth/components/forms";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Crear Cuenta | SmartBetBot" };

export default async function RegisterPage() {
  const identity = await getVerifiedIdentity();
  if (identity) redirect("/dashboard");

  return (
    <div className="w-full max-w-md rounded-3xl bg-slate-900/90 p-8 shadow-2xl border border-slate-800 backdrop-blur-xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/80 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-800/50 mb-3">
          <span>✨ Nueva Cuenta</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Crear Cuenta
        </h1>
        <p className="mt-1 text-xs text-slate-400 sm:text-sm">
          Únete para recibir señales, calcular valor esperado y descargar historias.
        </p>
      </div>

      <RegisterForm />

      <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
        <p className="text-xs text-slate-400">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4">
            Inicia sesión aquí
          </Link>
        </p>
      </div>
    </div>
  );
}
