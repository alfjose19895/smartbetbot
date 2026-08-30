"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

interface NavbarProps {
  onSync?: () => Promise<void>;
  syncing?: boolean;
}

export function Navbar({ onSync, syncing }: NavbarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/signals", label: "Picks", icon: "🔥" },
    { href: "/history", label: "Historial", icon: "📜" },
    { href: "/admin", label: "Admin", icon: "⚙️" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base font-black text-slate-950 shadow-md shadow-emerald-500/20">
            ⚡
          </span>
          <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
            Smart<span className="text-emerald-500 dark:text-emerald-400">Bet</span>Bot
          </span>
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

        {/* Action Controls & Theme Switcher */}
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
        </div>
      )}
    </header>
  );
}
