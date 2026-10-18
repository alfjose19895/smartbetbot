"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { WeekendExclusiveModule } from "@/components/WeekendExclusiveModule";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import Link from "next/link";

export default function WeekendExclusivePage() {
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === "admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-8">
          {/* Admin Verification State */}
          {isAdmin === null && (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Verificando credenciales de acceso VIP...
              </p>
            </div>
          )}

          {isAdmin === false && (
            <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-b from-amber-950/20 via-slate-900 to-slate-950 p-8 sm:p-12 text-center max-w-2xl mx-auto my-12 shadow-2xl space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-3xl">
                🔒
              </div>
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-black text-amber-400 uppercase tracking-wider">
                  💎 Módulo Finde VIP — Acceso Restringido
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Exclusivo para Administradores
                </h1>
                <p className="text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
                  La cartelera de Fin de Semana VIP contiene proyecciones cuantitativas de alta convicción reservadas exclusivamente para administradores de SmartBetBot.
                </p>
              </div>
              <div className="pt-2 flex flex-wrap justify-center gap-3">
                <Link
                  href="/signals"
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-2.5 text-xs font-black text-slate-950 shadow-md hover:brightness-110 transition cursor-pointer"
                >
                  ← Volver a Pronósticos Pre-Match
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-750 transition cursor-pointer"
                >
                  Ir al Dashboard
                </Link>
              </div>
            </div>
          )}

          {isAdmin === true && (
            <>
              {/* Main Weekend Exclusive Module */}
              <WeekendExclusiveModule
                onOpenDetail={(pick) => setActiveModalPick(pick)}
                showBackLink={true}
              />

              {/* Quick Navigation Footer Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
                <div className="text-xs text-slate-400 font-medium">
                  Explora también nuestras otras carteleras especializadas y análisis cuantitativo:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/corners-vip"
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
                  >
                    🚩 Corners VIP
                  </Link>
                  <Link
                    href="/cards-vip"
                    className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-2 text-xs font-bold text-yellow-300 hover:bg-yellow-500/20 transition"
                  >
                    🟨 Tarjetas VIP
                  </Link>
                  <Link
                    href="/shots-vip"
                    className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
                  >
                    🎯 Disparos VIP
                  </Link>
                  <Link
                    href="/featured"
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
                  >
                    ⭐ Destacados 5 Estrellas
                  </Link>
                  <Link
                    href="/signals"
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
                  >
                    📋 Cartelera Completa Pre-Match
                  </Link>
                  <Link
                    href="/parlay"
                    className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 text-xs font-black text-slate-950 shadow-md hover:brightness-110 transition"
                  >
                    🔥 Parley del Día
                  </Link>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Match Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}
    </div>
  );
}
