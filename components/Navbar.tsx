"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { logoutAction } from "@/features/auth/actions";
import { useLanguage } from "@/context/LanguageContext";

interface NavbarProps {
  onSync?: () => Promise<void>;
  syncing?: boolean;
  userRole?: "admin" | "user" | null;
  userEmail?: string | null;
}

export function Navbar({ onSync, syncing, userRole, userEmail }: NavbarProps) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [currentRole, setCurrentRole] = useState<"admin" | "user" | null>(userRole || "admin");
  const [currentEmail, setCurrentEmail] = useState<string | null>(userEmail || null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentRole(data.user.role || "user");
          setCurrentEmail(data.user.email || null);
        }
      })
      .catch(() => {});
  }, []);

  const navLinks = [
    { href: "/dashboard", label: t("navDashboard"), icon: "📊", adminOnly: false },
    { href: "/signals", label: t("navPicks"), icon: "🔥", adminOnly: false },
    { href: "/history", label: t("navHistory"), icon: "📜", adminOnly: false },
    { href: "/settings", label: t("navProfile"), icon: "👤", adminOnly: false },
    ...(currentRole === "admin"
      ? [{ href: "/admin", label: t("navAdmin"), icon: "⚙️", adminOnly: true }]
      : []),
  ];

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logoutAction();
    } catch {
      window.location.href = "/login";
    } finally {
      setLoggingOut(false);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "es" ? "en" : "es");
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base sm:text-lg font-black text-slate-950 shadow-md shadow-emerald-500/20">
            🎯
          </span>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">
              Smart<span className="text-emerald-600 dark:text-emerald-400">Bet</span>Bot
            </span>
            {currentRole && (
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">
                {currentRole === "admin" ? `👑 ${t("navAdminRole")}` : `🎯 ${t("navBettor")}`}
              </span>
            )}
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors ${
                  isActive
                    ? "text-emerald-700 dark:text-emerald-400 font-bold border-b-2 border-emerald-500 pb-0.5"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Desktop Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="hidden md:flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title={language === "es" ? "Switch to English" : "Cambiar a Español"}
          >
            <span>{language === "es" ? "🇪🇸" : "🇺🇸"}</span>
            <span className="text-[11px] font-extrabold uppercase">{language}</span>
          </button>

          {/* Desktop Theme Switcher */}
          <div className="hidden md:flex">
            <ThemeToggle />
          </div>

          {/* Update / Sync Button (visible on mobile and desktop) */}
          {onSync && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800 hover:bg-emerald-500 hover:text-slate-950 transition-all shadow-sm active:scale-95 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400 dark:hover:bg-emerald-500 dark:hover:text-slate-950 cursor-pointer shrink-0"
              title="Actualizar pronósticos en vivo"
            >
              <span className={syncing ? "animate-spin" : ""}>🔄</span>
              <span className="hidden sm:inline">{syncing ? t("navSyncing") : t("navSync")}</span>
            </button>
          )}

          {/* Desktop Logout Button */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60 cursor-pointer"
            title="Cerrar sesión"
          >
            <span className="text-sm font-bold">⎋</span>
            <span>{loggingOut ? "..." : t("navLogout")}</span>
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Abrir menú de navegación"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-800 md:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 shrink-0 cursor-pointer"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down Navigation Panel (Contains links, ThemeToggle, Language, and Logout) */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white/98 px-4 py-4 shadow-2xl backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-950/98">
          {currentEmail && (
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <div>
                Usuario: <span className="font-bold text-slate-900 dark:text-white">{currentEmail}</span>
              </div>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                {currentRole === "admin" ? t("navAdminRole") : t("navBettor")}
              </span>
            </div>
          )}

          {/* Navigation Links Grid */}
          <nav className="grid grid-cols-2 gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold transition ${
                    isActive
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-500/30"
                      : "bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-850"
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile Theme, Language & Logout Controls */}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            {/* Theme Toggle Button */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2 border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Tema:</span>
              <ThemeToggle />
            </div>

            {/* Language Toggle Button */}
            <button
              onClick={toggleLanguage}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <span>{language === "es" ? "🇪🇸 Español" : "🇺🇸 English"}</span>
            </button>
          </div>

          {/* Full-width Mobile Logout Button */}
          <div className="mt-2.5">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300 cursor-pointer"
            >
              <span className="text-sm font-bold">⎋</span>
              <span>{t("navLogout")}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
