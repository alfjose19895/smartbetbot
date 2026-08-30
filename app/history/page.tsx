"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import React from "react";
import Link from "next/link";

interface HistoricalItem {
  id: string;
  date: string;
  match: string;
  score: string;
  league: string;
  market: string;
  odds: number;
  probability: number;
  result: "WON" | "LOST" | "VOID";
  profit: number; // in units
}

const HISTORY_DATA: HistoricalItem[] = [
  {
    id: "h-1557383",
    date: "29 Ago 2026",
    match: "Liverpool vs Nottingham Forest",
    score: "2 - 2",
    league: "Premier League",
    market: "Over 2.5 Goles",
    odds: 1.54,
    probability: 72.0,
    result: "WON",
    profit: +0.54,
  },
  {
    id: "h-1570362",
    date: "29 Ago 2026",
    match: "Sevilla vs Atletico Madrid",
    score: "1 - 3",
    league: "La Liga",
    market: "Over 2.5 Goles",
    odds: 1.68,
    probability: 67.5,
    result: "WON",
    profit: +0.68,
  },
  {
    id: "h-1575142",
    date: "29 Ago 2026",
    match: "Borussia Dortmund vs Hamburger SV",
    score: "2 - 0",
    league: "Bundesliga",
    market: "Gana Local",
    odds: 1.45,
    probability: 74.0,
    result: "WON",
    profit: +0.45,
  },
  {
    id: "h-1550101",
    date: "29 Ago 2026",
    match: "Juventus vs Parma",
    score: "2 - 0",
    league: "Serie A",
    market: "Gana Local",
    odds: 1.52,
    probability: 71.0,
    result: "WON",
    profit: +0.52,
  },
  {
    id: "h-1557381",
    date: "28 Ago 2026",
    match: "Crystal Palace vs Manchester City",
    score: "1 - 4",
    league: "Premier League",
    market: "Gana Visitante",
    odds: 1.40,
    probability: 78.0,
    result: "WON",
    profit: +0.40,
  },
  {
    id: "h-1570361",
    date: "29 Ago 2026",
    match: "Real Sociedad vs Espanyol",
    score: "2 - 1",
    league: "La Liga",
    market: "Gana Local",
    odds: 1.60,
    probability: 66.0,
    result: "WON",
    profit: +0.60,
  },
  {
    id: "h-1550097",
    date: "28 Ago 2026",
    match: "AC Milan vs Venezia",
    score: "2 - 0",
    league: "Serie A",
    market: "Gana Local",
    odds: 1.35,
    probability: 80.0,
    result: "WON",
    profit: +0.35,
  },
  {
    id: "h-1575148",
    date: "29 Ago 2026",
    match: "Union Berlin vs Eintracht Frankfurt",
    score: "3 - 3",
    league: "Bundesliga",
    market: "Ambos Marcan (BTTS)",
    odds: 1.72,
    probability: 65.0,
    result: "WON",
    profit: +0.72,
  },
  {
    id: "h-1557386",
    date: "29 Ago 2026",
    match: "Tottenham vs Newcastle",
    score: "0 - 2",
    league: "Premier League",
    market: "Over 2.5 Goles",
    odds: 1.65,
    probability: 68.0,
    result: "LOST",
    profit: -1.00,
  },
  {
    id: "h-1575147",
    date: "29 Ago 2026",
    match: "RB Leipzig vs Borussia Mönchengladbach",
    score: "3 - 0",
    league: "Bundesliga",
    market: "Gana Local",
    odds: 1.55,
    probability: 70.0,
    result: "WON",
    profit: +0.55,
  },
];

export default function HistoryPage() {
  const totalPicks = HISTORY_DATA.length;
  const wonPicks = HISTORY_DATA.filter((p) => p.result === "WON").length;
  const winRate = Math.round((wonPicks / totalPicks) * 100);
  const netProfit = HISTORY_DATA.reduce((acc, p) => acc + p.profit, 0).toFixed(2);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base font-black text-slate-950">
              ⚡
            </span>
            <span className="text-lg font-black tracking-tight text-white">
              Smart<span className="text-emerald-400">Bet</span>Bot
            </span>
          </Link>

          <nav className="flex items-center gap-4 text-xs font-semibold sm:gap-6 sm:text-sm">
            <ThemeToggle />
            <Link href="/dashboard" className="text-slate-300 transition hover:text-white">
              Dashboard
            </Link>
            <Link href="/signals" className="text-slate-300 transition hover:text-white">
              Picks
            </Link>
            <Link href="/history" className="text-emerald-400 font-bold">
              Historial
            </Link>
            <Link href="/admin" className="text-slate-300 transition hover:text-white">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Historial de Pronósticos Resueltos
          </h1>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            Registro oficial de partidos acontecidos con marcadores finales y verificación de mercado
          </p>
        </div>

        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center sm:p-6">
          <div>
            <p className="text-xs text-slate-400 sm:text-sm font-medium">Partidos Evaluados</p>
            <p className="mt-1 text-2xl font-black text-white sm:text-3xl">{totalPicks}</p>
          </div>
          <div className="border-x border-slate-800">
            <p className="text-xs text-slate-400 sm:text-sm font-medium">Tasa de Acierto</p>
            <p className="mt-1 text-2xl font-black text-emerald-400 sm:text-3xl">{winRate}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 sm:text-sm font-medium">Balance Neto</p>
            <p className="mt-1 text-2xl font-black text-sky-400 sm:text-3xl">+{netProfit} U</p>
          </div>
        </div>

        {/* Table / List */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Fecha</th>
                  <th className="px-4 py-3.5">Partido</th>
                  <th className="px-4 py-3.5 text-center">Marcador</th>
                  <th className="px-4 py-3.5">Mercado</th>
                  <th className="px-4 py-3.5 text-center">Cuota</th>
                  <th className="px-4 py-3.5 text-center">Prob.</th>
                  <th className="px-4 py-3.5 text-right">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {HISTORY_DATA.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-850/60 transition">
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{item.date}</td>
                    <td className="px-4 py-3 font-semibold text-white">
                      <div>{item.match}</div>
                      <div className="text-[11px] text-slate-400 font-normal">{item.league}</div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-white whitespace-nowrap">
                      <span className="rounded-lg bg-slate-950 px-2.5 py-1 border border-slate-800">
                        {item.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-200">{item.market}</td>
                    <td className="px-4 py-3 text-center font-bold text-sky-400">{item.odds.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-400">{item.probability}%</td>
                    <td className="px-4 py-3 text-right">
                      {item.result === "WON" ? (
                        <span className="inline-flex items-center rounded-lg bg-emerald-950/80 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-800/50">
                          ✓ Ganada
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-red-950/80 px-2.5 py-1 text-xs font-bold text-red-400 border border-red-800/50">
                          ✗ Perdida
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
