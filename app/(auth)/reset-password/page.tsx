"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { getOptionalSupabaseConfig } from "@/lib/env";

function ResetPasswordContent() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    const config = getOptionalSupabaseConfig();
    if (!config) return;

    const supabase = createBrowserClient(config.url, config.publishableKey);

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        // Session active and ready for password update
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({ type: "error", text: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }

    const config = getOptionalSupabaseConfig();
    if (!config) {
      setMessage({ type: "error", text: "Error de configuración de Supabase." });
      return;
    }

    try {
      setLoading(true);
      const supabase = createBrowserClient(config.url, config.publishableKey);
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage({ type: "error", text: error.message || "No se pudo actualizar la contraseña." });
      } else {
        setMessage({
          type: "success",
          text: "¡Contraseña actualizada con éxito! Redirigiendo al inicio de sesión...",
        });
        setTimeout(() => {
          router.push("/login?message=password-updated");
        }, 2000);
      }
    } catch {
      setMessage({ type: "error", text: "Error de red al actualizar la contraseña." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl bg-slate-900/90 p-8 shadow-2xl border border-slate-800 backdrop-blur-xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/80 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-800/50 mb-3">
          <span>🔒 Seguridad</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Nueva Contraseña
        </h1>
        <p className="mt-1 text-xs text-slate-400 sm:text-sm">
          Ingresa tu nueva contraseña de al menos 8 caracteres para recuperar el acceso.
        </p>
      </div>

      {message && (
        <div
          className={`mb-5 rounded-2xl p-3.5 text-xs font-bold ${
            message.type === "success"
              ? "bg-emerald-950/80 border border-emerald-700 text-emerald-300"
              : "bg-red-950/80 border border-red-700 text-red-300"
          }`}
        >
          {message.type === "success" ? "✓ " : "⚠️ "}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">
            Nueva Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">
            Confirmar Contraseña
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repite tu contraseña"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
        >
          {loading ? "Actualizando..." : "Guardar Nueva Contraseña"}
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
        <Link
          href="/login"
          className="text-xs font-bold text-slate-400 hover:text-emerald-400 transition"
        >
          ← Volver a Iniciar Sesión
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
