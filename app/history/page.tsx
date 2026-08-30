"use client";

import { Navbar } from "@/components/Navbar";
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
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      {/* Header */}
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Historial de Pronósticos Resueltos
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Registro oficial de partidos acontecidos con marcadores finales y verificación de mercado
          </p>
        </div>

        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <p className="text-xs text-slate-500 sm:text-sm font-medium dark:text-slate-400">Partidos Evaluados</p>
            <p className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl dark:text-white">{totalPicks}</p>
          </div>
          <div className="border-x border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 sm:text-sm font-medium dark:text-slate-400">Tasa de Acierto</p>
            <p className="mt-1 text-2xl font-black text-emerald-600 sm:text-3xl dark:text-emerald-400">{winRate}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 sm:text-sm font-medium dark:text-slate-400">Balance Neto</p>
            <p className="mt-1 text-2xl font-black text-sky-600 sm:text-3xl dark:text-sky-400">+{netProfit} U</p>
          </div>
        </div>

        {/* Table / List */}
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900/80">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[11px] tracking-wider dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
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
              <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                {HISTORY_DATA.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition dark:hover:bg-slate-850/60">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap dark:text-slate-400">{item.date}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      <div>{item.match}</div>
                      <div className="text-[11px] text-slate-500 font-normal dark:text-slate-400">{item.league}</div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-900 whitespace-nowrap dark:text-white">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
                        {item.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.market}</td>
                    <td className="px-4 py-3 text-center font-bold text-sky-600 dark:text-sky-400">{item.odds.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">{item.probability}%</td>
                    <td className="px-4 py-3 text-right">
                      {item.result === "WON" ? (
                        <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800/50">
                          ✓ Ganada
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 border border-red-200 dark:bg-red-950/80 dark:text-red-400 dark:border-red-800/50">
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
