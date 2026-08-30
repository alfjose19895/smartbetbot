"use client";

import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useLanguage } from "@/context/LanguageContext";

interface HistoricalItem {
  id: string;
  date: string;
  match: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  league: string;
  leagueLogo?: string;
  market: string;
  selection: string;
  odds: number;
  probability: number;
  result: "WON" | "LOST" | "VOID";
  profit: number; // in units
  explanation?: string;
}

const HISTORY_DATA: HistoricalItem[] = [
  {
    id: "h-1557383",
    date: "29 Ago 2026",
    match: "Liverpool vs Nottingham Forest",
    homeTeam: "Liverpool",
    awayTeam: "Nottingham Forest",
    homeLogo: "https://media.api-sports.io/football/teams/40.png",
    awayLogo: "https://media.api-sports.io/football/teams/65.png",
    score: "2 - 2",
    league: "Premier League",
    leagueLogo: "https://media.api-sports.io/football/leagues/39.png",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    odds: 1.54,
    probability: 72.0,
    result: "WON",
    profit: +0.54,
    explanation: "Duelo de alto ritmo en Anfield con 4 goles totales, superando la línea de 2.5 con amplio margen.",
  },
  {
    id: "h-1570362",
    date: "29 Ago 2026",
    match: "Sevilla vs Atletico Madrid",
    homeTeam: "Sevilla",
    awayTeam: "Atletico Madrid",
    homeLogo: "https://media.api-sports.io/football/teams/536.png",
    awayLogo: "https://media.api-sports.io/football/teams/530.png",
    score: "1 - 3",
    league: "La Liga",
    leagueLogo: "https://media.api-sports.io/football/leagues/140.png",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    odds: 1.68,
    probability: 67.5,
    result: "WON",
    profit: +0.68,
    explanation: "Efectividad ofensiva del Atlético en el Sánchez-Pizjuán con 4 goles anotados en el encuentro.",
  },
  {
    id: "h-1575142",
    date: "29 Ago 2026",
    match: "Borussia Dortmund vs Hamburger SV",
    homeTeam: "Borussia Dortmund",
    awayTeam: "Hamburger SV",
    homeLogo: "https://media.api-sports.io/football/teams/165.png",
    awayLogo: "https://media.api-sports.io/football/teams/179.png",
    score: "2 - 0",
    league: "Bundesliga",
    leagueLogo: "https://media.api-sports.io/football/leagues/78.png",
    market: "Gana Local",
    selection: "1",
    odds: 1.45,
    probability: 74.0,
    result: "WON",
    profit: +0.45,
    explanation: "Dominio absoluto del Dortmund en el Signal Iduna Park con portería a cero y control del partido.",
  },
  {
    id: "h-1550101",
    date: "29 Ago 2026",
    match: "Juventus vs Parma",
    homeTeam: "Juventus",
    awayTeam: "Parma",
    homeLogo: "https://media.api-sports.io/football/teams/496.png",
    awayLogo: "https://media.api-sports.io/football/teams/523.png",
    score: "2 - 0",
    league: "Serie A",
    leagueLogo: "https://media.api-sports.io/football/leagues/135.png",
    market: "Gana Local",
    selection: "1",
    odds: 1.52,
    probability: 71.0,
    result: "WON",
    profit: +0.52,
    explanation: "Solidez táctica y superioridad técnica de la Juventus para sumar los 3 puntos en Turín.",
  },
  {
    id: "h-1557381",
    date: "28 Ago 2026",
    match: "Crystal Palace vs Manchester City",
    homeTeam: "Crystal Palace",
    awayTeam: "Manchester City",
    homeLogo: "https://media.api-sports.io/football/teams/52.png",
    awayLogo: "https://media.api-sports.io/football/teams/50.png",
    score: "1 - 4",
    league: "Premier League",
    leagueLogo: "https://media.api-sports.io/football/leagues/39.png",
    market: "Gana Visitante",
    selection: "2",
    odds: 1.40,
    probability: 78.0,
    result: "WON",
    profit: +0.40,
    explanation: "Goleada contundente del Manchester City en Selhurst Park con alta efectividad de Erling Haaland.",
  },
  {
    id: "h-1570361",
    date: "29 Ago 2026",
    match: "Real Sociedad vs Espanyol",
    homeTeam: "Real Sociedad",
    awayTeam: "Espanyol",
    homeLogo: "https://media.api-sports.io/football/teams/548.png",
    awayLogo: "https://media.api-sports.io/football/teams/540.png",
    score: "2 - 1",
    league: "La Liga",
    leagueLogo: "https://media.api-sports.io/football/leagues/140.png",
    market: "Gana Local",
    selection: "1",
    odds: 1.60,
    probability: 66.0,
    result: "WON",
    profit: +0.60,
    explanation: "Victoria trabajada de la Real Sociedad en el Reale Arena con ventaja en volumen de remates.",
  },
  {
    id: "h-1550097",
    date: "28 Ago 2026",
    match: "AC Milan vs Venezia",
    homeTeam: "AC Milan",
    awayTeam: "Venezia",
    homeLogo: "https://media.api-sports.io/football/teams/489.png",
    awayLogo: "https://media.api-sports.io/football/teams/517.png",
    score: "2 - 0",
    league: "Serie A",
    leagueLogo: "https://media.api-sports.io/football/leagues/135.png",
    market: "Gana Local",
    selection: "1",
    odds: 1.35,
    probability: 80.0,
    result: "WON",
    profit: +0.35,
    explanation: "Triunfo cómodo del Milan en San Siro cumpliendo con la proyección del modelo estadístico.",
  },
  {
    id: "h-1575148",
    date: "29 Ago 2026",
    match: "Union Berlin vs Eintracht Frankfurt",
    homeTeam: "Union Berlin",
    awayTeam: "Eintracht Frankfurt",
    homeLogo: "https://media.api-sports.io/football/teams/182.png",
    awayLogo: "https://media.api-sports.io/football/teams/169.png",
    score: "3 - 3",
    league: "Bundesliga",
    leagueLogo: "https://media.api-sports.io/football/leagues/78.png",
    market: "Ambos Marcan (BTTS)",
    selection: "Yes",
    odds: 1.72,
    probability: 65.0,
    result: "WON",
    profit: +0.72,
    explanation: "Festival de goles en el Stadion An der Alten Försterei con acierto temprano del mercado BTTS.",
  },
  {
    id: "h-1557386",
    date: "29 Ago 2026",
    match: "Tottenham vs Newcastle",
    homeTeam: "Tottenham",
    awayTeam: "Newcastle",
    homeLogo: "https://media.api-sports.io/football/teams/47.png",
    awayLogo: "https://media.api-sports.io/football/teams/34.png",
    score: "0 - 2",
    league: "Premier League",
    leagueLogo: "https://media.api-sports.io/football/leagues/39.png",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    odds: 1.65,
    probability: 68.0,
    result: "LOST",
    profit: -1.00,
    explanation: "Newcastle neutralizó las transiciones de Tottenham; el encuentro culminó con 2 goles en total.",
  },
  {
    id: "h-1575147",
    date: "29 Ago 2026",
    match: "RB Leipzig vs Borussia Mönchengladbach",
    homeTeam: "RB Leipzig",
    awayTeam: "Borussia Mönchengladbach",
    homeLogo: "https://media.api-sports.io/football/teams/173.png",
    awayLogo: "https://media.api-sports.io/football/teams/163.png",
    score: "3 - 0",
    league: "Bundesliga",
    leagueLogo: "https://media.api-sports.io/football/leagues/78.png",
    market: "Gana Local",
    selection: "1",
    odds: 1.55,
    probability: 70.0,
    result: "WON",
    profit: +0.55,
    explanation: "Leipzig impuso intensidad y ritmo vertical en el Red Bull Arena logrando victoria contundente.",
  },
];

export default function HistoryPage() {
  const { language, t } = useLanguage();
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [filterResult, setFilterResult] = useState<"ALL" | "WON" | "LOST">("ALL");
  const [selectedLeague, setSelectedLeague] = useState<string>("all");

  const leagues = ["all", ...Array.from(new Set(HISTORY_DATA.map((h) => h.league)))];

  const filteredHistory = HISTORY_DATA.filter((item) => {
    if (filterResult !== "ALL" && item.result !== filterResult) return false;
    if (selectedLeague !== "all" && item.league !== selectedLeague) return false;
    return true;
  });

  const totalPicks = HISTORY_DATA.length;
  const wonPicks = HISTORY_DATA.filter((p) => p.result === "WON").length;
  const winRate = Math.round((wonPicks / totalPicks) * 100);
  const netProfit = HISTORY_DATA.reduce((acc, p) => acc + p.profit, 0).toFixed(2);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Header & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              <span>📜</span>
              <span>{t("historyKicker")}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {t("historyTitle")}
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
              {t("historySubtitle")}
            </p>
          </div>

          {/* View Mode Toggle Switcher */}
          <div className="inline-flex rounded-2xl border border-slate-300 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 shrink-0 self-start sm:self-center">
            <button
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === "cards"
                  ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <span>🃏</span>
              <span>{t("viewCards")}</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <span>📋</span>
              <span>{t("viewTable")}</span>
            </button>
          </div>
        </div>

        {/* Stats KPI Summary */}
        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 rounded-3xl border border-slate-200 bg-white p-3.5 text-center shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium dark:text-slate-400">{t("historyEvaluated")}</p>
            <p className="mt-1 text-lg sm:text-2xl font-black text-slate-900 dark:text-white">{totalPicks}</p>
          </div>
          <div className="border-x border-slate-200 dark:border-slate-800">
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium dark:text-slate-400">{t("historyWinRate")}</p>
            <p className="mt-1 text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">{winRate}%</p>
          </div>
          <div>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium dark:text-slate-400">{t("historyProfit")}</p>
            <p className="mt-1 text-lg sm:text-2xl font-black text-sky-600 dark:text-sky-400">+{netProfit} U</p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">{t("filterResult")}</span>
            <button
              onClick={() => setFilterResult("ALL")}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                filterResult === "ALL"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t("filterAll")} ({HISTORY_DATA.length})
            </button>
            <button
              onClick={() => setFilterResult("WON")}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                filterResult === "WON"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t("filterWon")} ({wonPicks})
            </button>
            <button
              onClick={() => setFilterResult("LOST")}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                filterResult === "LOST"
                  ? "bg-red-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t("filterLost")} ({totalPicks - wonPicks})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Liga:</span>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l === "all" ? "Todas las Ligas" : l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* VIEW 1: CARDS GRID */}
        {viewMode === "cards" && (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredHistory.map((item) => {
              const isWon = item.result === "WON";
              return (
                <div
                  key={item.id}
                  className={`relative flex flex-col justify-between rounded-3xl border p-5 sm:p-6 shadow-sm transition-all hover:shadow-md ${
                    isWon
                      ? "border-emerald-200 bg-white dark:border-emerald-900/40 dark:bg-slate-900/90"
                      : "border-red-200 bg-white dark:border-red-900/40 dark:bg-slate-900/90"
                  }`}
                >
                  <div>
                    {/* Card Top: League & Result Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {item.league}
                      </span>

                      {isWon ? (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800">
                          ✓ Ganada (+{item.profit.toFixed(2)} U)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-2.5 py-1 text-xs font-black text-red-700 border border-red-300 dark:bg-red-950/80 dark:text-red-400 dark:border-red-800">
                          ✗ Perdida ({item.profit.toFixed(2)} U)
                        </span>
                      )}
                    </div>

                    {/* Date */}
                    <div className="mt-3 text-[11px] font-semibold text-slate-400">
                      📅 {item.date}
                    </div>

                    {/* Match & Final Score */}
                    <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 p-3.5 border border-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80">
                      <div className="flex-1 pr-2">
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                          {item.homeTeam}
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight mt-1">
                          {item.awayTeam}
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center rounded-xl bg-white px-3 py-1.5 border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-700 shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Marcador</span>
                        <span className="text-base font-black text-slate-900 dark:text-white">{item.score}</span>
                      </div>
                    </div>

                    {/* Prediction Market Details */}
                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                      <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Mercado Seleccionado
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {item.market} ({item.selection})
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-sky-50 px-2 py-0.5 text-xs font-black text-sky-700 border border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800">
                            @{item.odds.toFixed(2)}
                          </span>
                          <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                            {item.probability}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Explanation */}
                    {item.explanation && (
                      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                        &quot;{item.explanation}&quot;
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: COMPACT TABLE */}
        {viewMode === "table" && (
          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900/80">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[11px] tracking-wider dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">{t("colDate")}</th>
                    <th className="px-4 py-3.5">{t("colMatch")}</th>
                    <th className="px-4 py-3.5 text-center">{t("colScore")}</th>
                    <th className="px-4 py-3.5">{t("colMarket")}</th>
                    <th className="px-4 py-3.5 text-center">{t("colOdds")}</th>
                    <th className="px-4 py-3.5 text-center">{t("colProb")}</th>
                    <th className="px-4 py-3.5 text-right">{t("colResult")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                  {filteredHistory.map((item) => (
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
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.result === "WON" ? (
                          <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800/50">
                            ✓ Ganada (+{item.profit.toFixed(2)} U)
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 border border-red-200 dark:bg-red-950/80 dark:text-red-400 dark:border-red-800/50">
                            ✗ Perdida ({item.profit.toFixed(2)} U)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
