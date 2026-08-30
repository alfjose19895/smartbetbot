"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { getOptionalSupabaseConfig } from "@/lib/env";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const config = getOptionalSupabaseConfig();
    if (!config) {
      setMessage({ type: "error", text: "Error de configuración de Supabase." });
      return;
    }

    try {
      setLoading(true);
      const supabase = createBrowserClient(config.url, config.publishableKey);
      
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const redirectTo = `${origin}/auth/callback?next=/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setMessage({
          type: "error",
          text: error.message || "No se pudo enviar el correo de recuperación.",
        });
      } else {
        setMessage({
          type: "success",
          text: "¡Enlace enviado! Revisa tu bandeja de entrada o carpeta de spam para reestablecer tu contraseña.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Error de red al solicitar la recuperación." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl bg-slate-900/90 p-8 shadow-2xl border border-slate-800 backdrop-blur-xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/80 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-800/50 mb-3">
          <span>🔑 Recuperación</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Recuperar Contraseña
        </h1>
        <p className="mt-1 text-xs text-slate-400 sm:text-sm">
          Ingresa el correo electrónico asociado a tu cuenta para recibir las instrucciones.
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
            Correo Electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
        >
          {loading ? "Enviando enlace..." : "Enviar Enlace de Recuperación"}
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
