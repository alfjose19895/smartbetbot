"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { logoutAction } from "@/features/auth/actions";
import { useLanguage } from "@/context/LanguageContext";
import { openPushModal } from "@/components/PushNotificationManager";

interface NavbarProps {
  onSync?: () => Promise<void>;
  syncing?: boolean;
  userRole?: "admin" | "user" | null;
  userEmail?: string | null;
}

interface NavLinkItem {
  href: string;
  label: string;
  icon: string;
  subtitle: string;
  adminOnly?: boolean;
  isLive?: boolean;
  isAction?: boolean;
}

export function Navbar({ onSync, syncing = false, userRole, userEmail }: NavbarProps = {}) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  const [currentRole, setCurrentRole] = useState<"admin" | "user" | null>(userRole || null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(userEmail || null);
  const [syncingInternal, setSyncingInternal] = useState(false);

  const isSyncInProgress = syncing || syncingInternal;

  const handleAdminSync = async () => {
    if (onSync) {
      await onSync();
    } else {
      try {
        setSyncingInternal(true);
        const res = await fetch("/api/admin/sync/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (data.success) {
          window.dispatchEvent(
            new CustomEvent("new-alerts-discovered", {
              detail: { newAlerts: data.newAlerts || [], totalCount: data.count },
            })
          );
          window.dispatchEvent(
            new CustomEvent("predictions-updated", { detail: data.predictions })
          );
        }
      } catch (err) {
        console.error("Admin sync error:", err);
      } finally {
        setSyncingInternal(false);
      }
    }
  };

  useEffect(() => {
    async function loadUser() {
      if (userRole && userEmail) return;
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCurrentRole(data.user.role || "user");
            setCurrentEmail(data.user.email || null);
          }
        }
      } catch {
        // ignore
      }
    }
    loadUser();
  }, [userRole, userEmail]);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setDesktopMenuOpen(false);
  }, [pathname]);

  // Close desktop dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        desktopMenuRef.current &&
        !desktopMenuRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement)?.closest('[data-desktop-menu-toggle="true"]')
      ) {
        setDesktopMenuOpen(false);
      }
    }
    if (desktopMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [desktopMenuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
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

  const navLinks: NavLinkItem[] = [
    { href: "/dashboard", label: t("navDashboard"), icon: "📊", subtitle: language === "es" ? "Resumen y pronósticos cuantitativos" : "Overview & quantitative predictions" },
    { href: "/signals", label: language === "es" ? "Alertas Pre-Match" : "Pre-Match Alerts", icon: "📋", subtitle: language === "es" ? "Pronósticos antes del inicio" : "Upcoming pre-match predictions" },
    { href: "/featured", label: language === "es" ? "Destacados" : "Featured", icon: "⭐", subtitle: language === "es" ? "SmartPick y Bomba del Día" : "SmartPick & Bomb of the Day" },
    { href: "/parlay", label: t("navParlay"), icon: "🎲", subtitle: language === "es" ? "Combinadas inteligentes" : "Smart accumulator parlays" },
    { href: "/history", label: t("navHistory"), icon: "📜", subtitle: language === "es" ? "Resultados y balance" : "Past results & track record" },
    { href: "/reports", label: t("navReports"), icon: "📈", subtitle: language === "es" ? "Métricas y rendimiento" : "Analytics & win rate stats" },
    { href: "/settings", label: t("navSettings"), icon: "⚙️", subtitle: language === "es" ? "Ajustes y notificaciones" : "Preferences & alerts" },
    {
      href: "#push-alerts",
      label: language === "es" ? "Alertas Móvil (Push)" : "Mobile Alerts (Push)",
      icon: "🔔",
      subtitle: language === "es" ? "Vincular teléfono para alertas diarias" : "Link phone for daily push alerts",
      isAction: true,
    },
  ];

  if (currentRole === "admin") {
    navLinks.push({
      href: "/admin",
      label: t("navAdmin"),
      icon: "👑",
      subtitle: language === "es" ? "Gestión de usuarios y sincronización" : "User management & sync",
      adminOnly: true,
    });
    navLinks.push({
      href: "/admin?tab=mcp",
      label: language === "es" ? "Agente MCP" : "MCP Agent",
      icon: "🤖",
      subtitle: language === "es" ? "Buscador de pronósticos con IA interna" : "AI Sports Intelligence search agent",
      adminOnly: true,
    });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/95 transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 gap-2 sm:gap-4">
        {/* Left: Brand Logo & Role */}
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0 select-none">
          <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base sm:text-lg font-black text-slate-950 shadow-md shadow-emerald-500/20">
            🎯
          </span>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">
              Smart<span className="text-emerald-600 dark:text-emerald-400">Bet</span>Bot
            </span>
            {currentRole && (
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5 leading-none">
                {currentRole === "admin" ? `👑 ${t("navAdminRole")}` : `🎯 ${t("navBettor")}`}
              </span>
            )}
          </div>
        </Link>

        {/* Center: Desktop Fast Direct Navigation (Pill Menu with strict whitespace-nowrap) */}
        <nav className="hidden md:flex items-center gap-0.5 lg:gap-1 bg-slate-100/90 dark:bg-slate-900/90 p-1 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 shrink-0">
          <Link
            href="/dashboard"
            className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
              pathname === "/dashboard"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <span>📊</span>
            <span>Dashboard</span>
          </Link>

          <Link
            href="/signals"
            className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
              pathname === "/signals"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <span>📋</span>
            <span>Pre-Match</span>
          </Link>

          <Link
            href="/featured"
            className={`hidden lg:flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
              pathname === "/featured"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <span>⭐</span>
            <span>{language === "es" ? "Destacados" : "Featured"}</span>
          </Link>

          <Link
            href="/parlay"
            className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
              pathname === "/parlay"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <span>🎲</span>
            <span>Parlay</span>
          </Link>

          <Link
            href="/history"
            className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
              pathname === "/history"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <span>📜</span>
            <span>{language === "es" ? "Historial" : "History"}</span>
          </Link>

          {currentRole === "admin" && (
            <Link
              href="/admin?tab=mcp"
              className={`hidden xl:flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
                pathname === "/admin" && typeof window !== "undefined" && window.location.search.includes("mcp")
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
              }`}
            >
              <span>🤖</span>
              <span>Agente MCP</span>
            </Link>
          )}
        </nav>

        {/* Right: Actions (Desktop) */}
        <div className="hidden md:flex items-center gap-1.5 lg:gap-2 shrink-0">
          {/* Search New Alerts Button */}
          <button
            onClick={handleAdminSync}
            disabled={isSyncInProgress}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 lg:px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400 cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-xs"
            title="Buscar nuevas alertas de mercado"
          >
            <span className={isSyncInProgress ? "animate-spin" : ""}>⚡</span>
            <span>{isSyncInProgress ? t("navSyncing") : "Buscar nuevas alertas"}</span>
          </button>

          {/* Direct Push Alerts Trigger Button */}
          <button
            onClick={openPushModal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 lg:px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400 cursor-pointer whitespace-nowrap shadow-xs"
            title={language === "es" ? "Vincular alertas push al teléfono" : "Link push alerts to phone"}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>🔔 {language === "es" ? "Alertas" : "Alerts"}</span>
          </button>

          {/* Language Selector */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-100 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850 cursor-pointer shadow-xs"
            title={language === "es" ? "Switch to English" : "Cambiar a Español"}
          >
            <span className="text-xs">{language === "es" ? "🇪🇸" : "🇺🇸"}</span>
            <span className="text-[11px] font-bold">{language.toUpperCase()}</span>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Desktop Mega-Menu Trigger Button ("Módulos") */}
          <button
            data-desktop-menu-toggle="true"
            onClick={() => setDesktopMenuOpen(!desktopMenuOpen)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition cursor-pointer shadow-xs ${
              desktopMenuOpen
                ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-850"
            }`}
            aria-expanded={desktopMenuOpen}
          >
            <span>🧩</span>
            <span>{t("navModules")}</span>
            <span className="text-[10px] opacity-70">{desktopMenuOpen ? "▲" : "▼"}</span>
          </button>
        </div>

        {/* Right: Mobile Menu Buttons */}
        <div className="flex items-center gap-1.5 md:hidden">
          {/* Mobile Direct Alert Button */}
          <button
            onClick={openPushModal}
            className="flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400 cursor-pointer"
            title="Alertas Push"
          >
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold">🔔</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
            aria-label="Abrir menú"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* 1. Desktop Mega-Menu Dropdown Panel (When clicking "Módulos") */}
      {desktopMenuOpen && (
        <div
          ref={desktopMenuRef}
          className="hidden md:block border-t border-slate-200/90 bg-white/98 shadow-2xl backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-950/98 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
            {/* Header with User Info & Role */}
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-base shadow-xs">
                  {currentRole === "admin" ? "👑" : "👤"}
                </span>
                <div>
                  <span className="text-slate-400 text-[11px] block leading-none">Sesión iniciada:</span>
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {currentEmail || "Usuario Activo"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>{currentRole === "admin" ? `👑 ${t("navAdminRole")}` : `🎯 ${t("navBettor")}`}</span>
                </span>

                {/* Desktop Logout Button */}
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

            {/* Navigation Grid (Organized in 4 columns on Web) */}
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Módulos del Sistema
            </div>
            <nav className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {navLinks.map((link) => {
                if (link.isAction) {
                  return (
                    <button
                      key={link.label}
                      onClick={() => {
                        setDesktopMenuOpen(false);
                        openPushModal();
                      }}
                      className="group relative flex items-start gap-3 rounded-2xl p-3.5 transition-all cursor-pointer text-left bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 hover:border-emerald-500 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:hover:border-emerald-500"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-xs border border-emerald-200 dark:bg-slate-800 dark:border-emerald-800/80 shrink-0 group-hover:scale-110 transition-transform">
                        {link.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black truncate text-emerald-700 dark:text-emerald-400">
                            {link.label}
                          </span>
                          <span className="rounded-full bg-emerald-500 text-slate-950 px-1.5 py-0.2 text-[9px] font-black">
                            Push
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {link.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                }

                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setDesktopMenuOpen(false)}
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
                        {link.isLive && (
                          <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-black text-white animate-pulse">
                            LIVE
                          </span>
                        )}
                        {isActive && !link.isLive && (
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

      {/* 2. Mobile Slide-down Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white/98 px-4 py-4 shadow-2xl backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-950/98 animate-in fade-in slide-in-from-top-2 duration-150">
          {currentEmail && (
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <div className="truncate mr-2">
                Usuario: <span className="font-bold text-slate-900 dark:text-white">{currentEmail}</span>
              </div>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 shrink-0">
                {currentRole === "admin" ? t("navAdminRole") : t("navBettor")}
              </span>
            </div>
          )}

          {/* Navigation Links Grid (2 columns on mobile) */}
          <nav className="grid grid-cols-2 gap-2">
            {navLinks.map((link) => {
              if (link.isAction) {
                return (
                  <button
                    key={link.label}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openPushModal();
                    }}
                    className="flex items-center gap-2 rounded-xl p-3 text-xs font-bold transition bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-500/30 cursor-pointer text-left col-span-2 sm:col-span-1"
                  >
                    <span className="text-base">{link.icon}</span>
                    <span className="truncate">{link.label}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse ml-auto shrink-0" />
                  </button>
                );
              }

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
                  <span className="truncate">{link.label}</span>
                  {link.isLive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping ml-auto" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Theme & Language Controls */}
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
              <span>{loggingOut ? "..." : t("navLogout")}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
