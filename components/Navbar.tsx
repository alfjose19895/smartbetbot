"use client";

import React, { useState, useEffect, useRef } from "react";
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

export function Navbar({ onSync, syncing = false, userRole, userEmail }: NavbarProps = {}) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [currentRole, setCurrentRole] = useState<"admin" | "user" | null>(userRole || null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(userEmail || null);
  const [syncingInternal, setSyncingInternal] = useState(false);

  const handleAdminSync = async () => {
    if (onSync) {
      await onSync();
    } else {
      try {
        setSyncingInternal(true);
        await fetch("/api/admin/sync/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        window.location.reload();
      } catch (err) {
        console.error("Admin sync error:", err);
      } finally {
        setSyncingInternal(false);
      }
    }
  };

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

  // Close menu when pressing Escape or clicking outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Only close if click wasn't on the toggle button
        const target = e.target as HTMLElement;
        if (!target.closest("[data-menu-toggle]")) {
          setMenuOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    {
      href: "/dashboard",
      label: t("navDashboard") || "Dashboard",
      subtitle: "Métricas y resumen del día",
      icon: "📊",
      adminOnly: false,
    },
    {
      href: "/signals",
      label: t("navPicks") || "Alertas del Día",
      subtitle: "Pronósticos cuantitativos ≥70%",
      icon: "🎯",
      adminOnly: false,
    },
    {
      href: "/parlay",
      label: t("navParlay") || "Parley del Día",
      subtitle: "Tickets combinados calculados",
      icon: "🔥",
      adminOnly: false,
    },
    {
      href: "/history",
      label: t("navHistory") || "Historial Oficial",
      subtitle: "Registro permanente y auditoría",
      icon: "📜",
      adminOnly: false,
    },
    {
      href: "/featured",
      label: t("navFeatured") || "Picks del Día",
      subtitle: "Selección destacada",
      icon: "👑",
      adminOnly: false,
    },
    {
      href: "/reports",
      label: t("navReports") || "Reportes & ROI",
      subtitle: "Estadísticas de rendimiento",
      icon: "📈",
      adminOnly: false,
    },
    {
      href: "/settings",
      label: t("navProfile") || "Mi Cuenta",
      subtitle: "Preferencias y perfil",
      icon: "👤",
      adminOnly: false,
    },
    ...(currentRole === "admin"
      ? [
          {
            href: "/admin",
            label: t("navAdmin") || "Panel Admin",
            subtitle: "Gestión de usuarios y sistema",
            icon: "⚙️",
            adminOnly: true,
          },
          {
            href: "/admin?tab=audit",
            label: "Bitácora de Auditoría",
            subtitle: "Logs y cambios del sistema",
            icon: "📑",
            adminOnly: true,
          },
        ]
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

  // Find active link label for breadcrumb / current page indicator
  const activeLink = navLinks.find((l) => pathname === l.href || pathname.startsWith(l.href + "/"));

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/90 backdrop-blur-md transition-colors dark:border-slate-800/80 dark:bg-slate-950/90 shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8 gap-3">
        {/* Brand Logo & Active Page */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-lg font-black text-slate-950 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
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

          {/* Current Page Pill (Web & Mobile) */}
          {activeLink && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800">
              <span className="text-sm">{activeLink.icon}</span>
              <span className="text-slate-900 dark:text-white font-extrabold">{activeLink.label}</span>
            </div>
          )}
        </div>

        {/* Right Controls Bar */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title={language === "es" ? "Switch to English" : "Cambiar a Español"}
          >
            <span>{language === "es" ? "🇪🇸" : "🇺🇸"}</span>
            <span className="text-[11px] font-extrabold uppercase">{language}</span>
          </button>

          {/* Theme Switcher */}
          <ThemeToggle />

          {/* Admin Sync Button */}
          {currentRole === "admin" && (
            <button
              onClick={handleAdminSync}
              disabled={syncing || syncingInternal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800 hover:bg-emerald-500 hover:text-slate-950 transition-all shadow-xs active:scale-95 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400 dark:hover:bg-emerald-500 dark:hover:text-slate-950 cursor-pointer shrink-0"
              title="Actualizar pronósticos en vivo (Exclusivo Administradores)"
            >
              <span className={(syncing || syncingInternal) ? "animate-spin" : ""}>🔄</span>
              <span className="hidden sm:inline">{(syncing || syncingInternal) ? t("navSyncing") : t("navSync")}</span>
            </button>
          )}

          {/* Prominent Collapsed Menu Toggle Button (For BOTH Web & Mobile) */}
          <button
            data-menu-toggle="true"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Abrir menú de navegación"
            className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer shadow-sm ${
              menuOpen
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-md ring-2 ring-emerald-500/50"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20"
            }`}
          >
            <span className="text-sm font-black">{menuOpen ? "✕" : "☰"}</span>
            <span className="text-xs font-black uppercase tracking-wide">
              {menuOpen ? (language === "es" ? "Cerrar" : "Close") : (language === "es" ? "Menú" : "Menu")}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsed Dropdown / Popover Navigation Panel (Available on Web and Mobile) */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="border-t border-slate-200 bg-white/98 px-4 py-5 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/98 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="mx-auto max-w-7xl">
            {/* User Profile Info Banner */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {currentRole === "admin" ? "👑" : "👤"}
                </span>
                <div>
                  <span className="text-slate-400 text-[11px] block">Sesión iniciada:</span>
                  <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">
                    {currentEmail || "Usuario Activo"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>{currentRole === "admin" ? `👑 ${t("navAdminRole")}` : `🎯 ${t("navBettor")}`}</span>
                </span>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60 cursor-pointer"
                  title="Cerrar sesión"
                >
                  <span className="text-sm font-bold">⎋</span>
                  <span>{loggingOut ? "..." : t("navLogout")}</span>
                </button>
              </div>
            </div>

            {/* Navigation Grid (Organized in 3 to 4 columns on Web, 2 on Mobile) */}
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Módulos del Sistema
            </div>
            <nav className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`group relative flex items-start gap-3 rounded-2xl p-3.5 transition-all cursor-pointer ${
                      isActive
                        ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-2 border-emerald-500 shadow-sm dark:bg-emerald-950/40"
                        : "bg-slate-50 text-slate-800 hover:bg-slate-100 hover:border-slate-300 border border-slate-200 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-800 dark:hover:bg-slate-850 dark:hover:border-slate-700"
                    }`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-xs border border-slate-200 dark:bg-slate-800 dark:border-slate-700 shrink-0 group-hover:scale-110 transition-transform">
                      {link.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-black truncate ${isActive ? "text-emerald-700 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
                          {link.label}
                        </span>
                        {isActive && (
                          <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[9px] font-black text-slate-950">
                            Activo
                          </span>
                        )}
                        {link.adminOnly && !isActive && (
                          <span className="rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.5 text-[9px] font-black">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {link.subtitle}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
