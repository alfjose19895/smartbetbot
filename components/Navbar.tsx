"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { logoutAction } from "@/features/auth/actions";

interface NavbarProps {
  onSync?: () => Promise<void>;
  syncing?: boolean;
  userRole?: "admin" | "user" | null;
  userEmail?: string | null;
}

export function Navbar({ onSync, syncing, userRole, userEmail }: NavbarProps) {
  const pathname = usePathname();
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
    { href: "/dashboard", label: "Dashboard", icon: "📊", adminOnly: false },
    { href: "/signals", label: "Picks", icon: "🔥", adminOnly: false },
    { href: "/history", label: "Historial", icon: "📜", adminOnly: false },
    ...(currentRole === "admin"
      ? [{ href: "/admin", label: "Admin", icon: "⚙️", adminOnly: true }]
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

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base font-black text-slate-950 shadow-md shadow-emerald-500/20">
            ⚡
          </span>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">
              Smart<span className="text-emerald-500 dark:text-emerald-400">Bet</span>Bot
            </span>
            {currentRole && (
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                {currentRole === "admin" ? "👑 Admin" : "🎯 Apostador"}
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
                    ? "text-emerald-600 dark:text-emerald-400 font-bold border-b-2 border-emerald-500 pb-0.5"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Action Controls, Theme Switcher & Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          {onSync && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-800 border border-slate-300 hover:bg-slate-200 dark:bg-slate-850 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800 transition shrink-0"
              title="Actualizar pronósticos en vivo"
            >
              <span>{syncing ? "🔄" : "⚡"}</span>
              <span className="hidden sm:inline">{syncing ? "Analizando..." : "Actualizar"}</span>
            </button>
          )}

          {/* Desktop Logout Button */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/80 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60 cursor-pointer"
            title="Cerrar sesión de SmartBetBot"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">{loggingOut ? "Saliendo..." : "Cerrar Sesión"}</span>
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Abrir menú de navegación"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-700 md:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 shrink-0"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down Navigation Panel */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-950/95">
          {currentEmail && (
            <div className="mb-3 border-b border-slate-100 pb-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Conectado como: <span className="font-bold text-slate-800 dark:text-slate-200">{currentEmail}</span> ({currentRole === "admin" ? "Administrador" : "Apostador"})
            </div>
          )}
          <nav className="grid grid-cols-2 gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold transition ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850"
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 py-2 text-xs font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-300"
            >
              <span>🚪</span>
              <span>{loggingOut ? "Cerrando Sesión..." : "Cerrar Sesión"}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
