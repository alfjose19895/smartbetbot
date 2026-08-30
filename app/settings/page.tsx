"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userMsg, setUserMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [roleName, setRoleName] = useState("Apostador");
  const [role, setRole] = useState("user");
  const [roleId, setRoleId] = useState<number>(2);

  // Preferences
  const [minProbability, setMinProbability] = useState<number>(65);
  const [minOdds, setMinOdds] = useState<string>("1.40");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/auth/profile");
      const data = await res.json();
      if (data.user) {
        setFullName(data.user.fullName || "");
        setEmail(data.user.email || "");
        setRole(data.user.role || "user");
        setRoleName(data.user.roleName || (data.user.role === "admin" ? "Administrador" : "Apostador"));
        setRoleId(data.user.roleId || (data.user.role === "admin" ? 1 : 2));
      }
    } catch {
      setUserMsg({ text: "Error al cargar la información del perfil.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password && password.length < 6) {
      setUserMsg({ text: "La nueva contraseña debe tener al menos 6 caracteres.", type: "error" });
      return;
    }

    if (password && password !== confirmPassword) {
      setUserMsg({ text: "Las contraseñas no coinciden. Verifícalas.", type: "error" });
      return;
    }

    try {
      setSaving(true);
      setUserMsg(null);
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password: password.trim() ? password.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setUserMsg({ text: "✓ ¡Tu perfil ha sido actualizado con éxito!", type: "success" });
        setPassword("");
        setConfirmPassword("");
        await fetchProfile();
      } else {
        setUserMsg({ text: `✗ ${data.error || "No se pudo actualizar el perfil"}`, type: "error" });
      }
    } catch (err) {
      setUserMsg({ text: `✗ Fallo de conexión: ${String(err)}`, type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setUserMsg(null), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-4xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Title */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
            <span>👤</span>
            <span>Gestión Personal</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Mi Perfil & Ajustes de Apostador
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Modifica tus nombres, correo de acceso, contraseña personal y preferencias de análisis
          </p>
        </div>

        {userMsg && (
          <div
            className={`mt-6 rounded-2xl p-4 text-center text-xs font-bold shadow-sm ${
              userMsg.type === "success"
                ? "bg-emerald-50 border border-emerald-300 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-300"
                : "bg-red-50 border border-red-300 text-red-800 dark:bg-red-950/80 dark:border-red-700 dark:text-red-300"
            }`}
          >
            {userMsg.text}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando tu información...</p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Account Summary Card */}
            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-2xl font-black text-slate-950 shadow-md shadow-emerald-500/20 shrink-0">
                {(fullName || email || "A")[0]?.toUpperCase()}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {fullName || "Apostador SmartBetBot"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{email}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800">
                    🎯 {roleName} (ID: {roleId})
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800">
                    ✓ Cuenta Activa
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Edit Form */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800">
                ✏️ Modificar Información de la Cuenta
              </h3>

              <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Nombres y Apellidos
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ej: Carlos Mendoza"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Correo Electrónico de Acceso
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Nueva Contraseña <span className="text-slate-400 lowercase font-normal">(opcional)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="Dejar en blanco para conservar la actual"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Confirmar Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      placeholder="Repite la nueva contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-xs sm:text-sm font-extrabold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    <span>{saving ? "⏳ Guardando..." : "💾 Guardar Cambios en Mi Perfil"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Betting Preferences Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800">
                ⚙️ Preferencias de Análisis & Filtros
              </h3>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Probabilidad Mínima Preferida:
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="50"
                      max="85"
                      step="5"
                      value={minProbability}
                      onChange={(e) => setMinProbability(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer accent-emerald-500"
                    />
                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800 shrink-0">
                      {minProbability}%
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Cuota Mínima en Picks:
                  </label>
                  <select
                    value={minOdds}
                    onChange={(e) => setMinOdds(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="1.20">1.20 (Favoritos Muy Claros)</option>
                    <option value="1.40">1.40 (Equilibrado / Recomendado)</option>
                    <option value="1.60">1.60 (Mayor Rentabilidad)</option>
                    <option value="1.80">1.80 (Cuotas Altas)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
