"use client";

function EyeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { useLanguage, Language } from "@/context/LanguageContext";
import { openPushModal, PushNotificationManager } from "@/components/PushNotificationManager";

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userMsg, setUserMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [roleName, setRoleName] = useState("Apostador");
  const [role, setRole] = useState("user");
  const [roleId, setRoleId] = useState<number>(2);

  // Theme state
  const [currentTheme, setCurrentTheme] = useState<"dark" | "light">("dark");

  // Preferences
  const [minProbability, setMinProbability] = useState<number>(65);
  const [minOdds, setMinOdds] = useState<string>("1.40");

  useEffect(() => {
    fetchProfile();
    if (typeof window !== "undefined") {
      const savedTheme = (localStorage.getItem("smartbetbot_theme") || "dark") as "dark" | "light";
      setCurrentTheme(savedTheme);
    }
  }, []);

  const handleThemeChange = (newTheme: "dark" | "light") => {
    setCurrentTheme(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("smartbetbot_theme", newTheme);
      const root = document.documentElement;
      if (newTheme === "dark") {
        root.classList.remove("light");
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
        root.style.colorScheme = "dark";
      } else {
        root.classList.remove("dark");
        root.classList.add("light");
        root.setAttribute("data-theme", "light");
        root.style.colorScheme = "light";
      }
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/auth/profile");
      const data = await res.json();
      if (data.user) {
        setFullName(data.user.fullName || "");
        setEmail(data.user.email || "");
        setPhone(data.user.phone || "");
        setRole(data.user.role || "user");
        setRoleName(data.user.roleName || (data.user.role === "admin" ? t("navAdminRole") : t("navBettor")));
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
      setUserMsg({
        text: language === "es" ? "La nueva contraseña debe tener al menos 6 caracteres." : "New password must be at least 6 characters long.",
        type: "error",
      });
      return;
    }

    if (password && password !== confirmPassword) {
      setUserMsg({
        text: language === "es" ? "Las contraseñas no coinciden. Verifícalas." : "Passwords do not match. Please verify.",
        type: "error",
      });
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
          phone: phone.trim(),
          password: password.trim() ? password.trim() : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al actualizar perfil");
      }

      setUserMsg({
        text: language === "es" ? "✓ Perfil y configuración guardados correctamente." : "✓ Profile and settings updated successfully.",
        type: "success",
      });
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setUserMsg({
        text: err.message || (language === "es" ? "No se pudo actualizar el perfil." : "Could not update profile."),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    setUserMsg({
      text: newLang === "es" ? "Idioma cambiado a Español." : "Language changed to English.",
      type: "success",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navbar />
      <PushNotificationManager />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
            <span>⚙️</span>
            <span>{t("navSettings")}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {language === "es" ? "Ajustes y Configuración" : "Settings & Preferences"}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {language === "es" 
              ? "Gestiona tu cuenta, tema visual, notificaciones push, idioma y filtros de pronósticos."
              : "Manage your account, visual theme, push notifications, language, and prediction filters."}
          </p>
        </div>

        {/* Status Messages */}
        {userMsg && (
          <div
            className={`mb-6 rounded-2xl p-4 text-sm font-bold flex items-center justify-between shadow-sm animate-in fade-in duration-200 ${
              userMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-red-50 text-red-800 border border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800"
            }`}
          >
            <span>{userMsg.text}</span>
            <button
              onClick={() => setUserMsg(null)}
              className="text-xs font-black uppercase tracking-wider underline cursor-pointer ml-4"
            >
              {language === "es" ? "Cerrar" : "Dismiss"}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Permanent Dark Theme Card */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-8 shadow-sm">
              <h3 className="text-base sm:text-lg font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
                <span>🎨</span>
                <span>{language === "es" ? "Apariencia y Tema" : "Appearance & Theme"}</span>
              </h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                {language === "es" 
                  ? "SmartBetBot utiliza de forma predeterminada el modo oscuro para optimizar la visualización de datos estadísticos y proteger la fatiga visual."
                  : "SmartBetBot permanently uses dark mode to optimize the display of statistical data and reduce eye strain."}
              </p>

              <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-slate-950 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🌙</span>
                  <div>
                    <div className="text-sm font-black text-white">{language === "es" ? "Modo Oscuro Permanente" : "Permanent Dark Mode"}</div>
                    <div className="text-xs text-emerald-400 font-bold">{language === "es" ? "✓ Activado por defecto (Alto Contraste)" : "✓ Enabled by default"}</div>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs text-slate-950 font-black">
                  ✓ {language === "es" ? "Activo" : "Active"}
                </span>
              </div>
            </div>

            {/* 2. Mobile Push Alerts Card */}
            <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-white to-teal-500/5 p-5 sm:p-8 shadow-sm dark:border-emerald-500/30 dark:from-emerald-950/20 dark:via-slate-900/80 dark:to-teal-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>🔔</span>
                    <span>{language === "es" ? "Alertas Push para Teléfono Móvil" : "Mobile Push Notifications"}</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-xl">
                    {language === "es"
                      ? "Vincula tu smartphone o navegador para recibir las mejores señales del día y alertas de alto valor en tiempo real."
                      : "Link your smartphone or browser to receive high-value daily signals and alerts in real time."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openPushModal}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-xs sm:text-sm font-black text-white shadow-md shadow-emerald-900/30 transition hover:from-emerald-500 hover:to-teal-500 cursor-pointer shrink-0"
                >
                  <span>📲</span>
                  <span>{language === "es" ? "Configurar / Vincular Teléfono" : "Configure / Link Phone"}</span>
                </button>
              </div>
            </div>

            {/* 3. Language Selection Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800 flex items-center gap-2">
                <span>🌐</span>
                <span>{t("prefLangTitle")}</span>
              </h3>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleLanguageChange("es")}
                  className={`flex items-center justify-between rounded-2xl p-4 border transition cursor-pointer ${
                    language === "es"
                      ? "border-emerald-500 bg-emerald-50/70 text-slate-900 font-extrabold dark:bg-emerald-950/50 dark:border-emerald-500 dark:text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🇪🇸</span>
                    <div className="text-left">
                      <div className="text-sm font-bold">Español</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Predeterminado</div>
                    </div>
                  </div>
                  {language === "es" && (
                    <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs text-slate-950 font-black">
                      ✓ Activo
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleLanguageChange("en")}
                  className={`flex items-center justify-between rounded-2xl p-4 border transition cursor-pointer ${
                    language === "en"
                      ? "border-emerald-500 bg-emerald-50/70 text-slate-900 font-extrabold dark:bg-emerald-950/50 dark:border-emerald-500 dark:text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🇺🇸</span>
                    <div className="text-left">
                      <div className="text-sm font-bold">English</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">International</div>
                    </div>
                  </div>
                  {language === "en" && (
                    <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs text-slate-950 font-black">
                      ✓ Active
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* 4. Profile Information Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800 flex items-center gap-2">
                <span>👤</span>
                <span>{t("profileTitle")}</span>
              </h3>

              <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      {t("profileFullName")}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      {t("profileEmail")}
                    </label>
                    <input
                      type="email"
                      disabled
                      value={email}
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      {t("profileNewPass")}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer text-base select-none"
                      >
                        {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      {t("profileConfirmPass")}
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer text-base select-none"
                      >
                        {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-xs sm:text-sm font-extrabold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    <span>{saving ? t("profileSavingBtn") : `💾 ${t("profileSaveBtn")}`}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* 5. Betting Preferences Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800 flex items-center gap-2">
                <span>⚙️</span>
                <span>{t("prefSection")}</span>
              </h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t("prefMinProb")}
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
                    {t("prefMinOdds")}
                  </label>
                  <select
                    value={minOdds}
                    onChange={(e) => setMinOdds(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="1.20">1.20 (Favoritos Muy Claros / Clear Favorites)</option>
                    <option value="1.40">1.40 (Equilibrado / Balanced)</option>
                    <option value="1.60">1.60 (Mayor Rentabilidad / High Edge)</option>
                    <option value="1.80">1.80 (Cuotas Altas / High Odds)</option>
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
