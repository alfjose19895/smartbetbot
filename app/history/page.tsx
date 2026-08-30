"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";

interface HistoricalItem {
  id: string;
  date: string;
  kickoff: string;
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
  profit: number;
  explanation?: string;
}

export default function HistoryPage() {
  const { language, t } = useLanguage();
  const [historyItems, setHistoryItems] = useState<HistoricalItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [filterResult, setFilterResult] = useState<"ALL" | "WON" | "LOST">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "yesterday" | "week" | "month">("all");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/history");
        const data = await res.json();
        if (data.history) {
          setHistoryItems(data.history);
        }
      } catch (err) {
        console.error("Error fetching history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  // Build classified league options grouped by Country
  const leagueDropdownOptions: DropdownOption[] = SUPPORTED_LEAGUES.map((l) => ({
    value: l.name,
    label: `${l.name} (${l.country})`,
    group: l.country,
    badge: l.tier ? `Div ${l.tier}` : undefined,
  }));

  // Append any additional leagues from history items
  historyItems.forEach((h) => {
    if (h.league && !leagueDropdownOptions.some((opt) => opt.value === h.league)) {
      leagueDropdownOptions.push({
        value: h.league,
        label: h.league,
        group: "Otras Ligas",
      });
    }
  });

  // Core 5 markets options
  const coreMarkets = [
    "Gana Local",
    "Gana Visitante",
    "Ambos Marcan (BTTS)",
    "Over 2.5 Goles",
    "Under 2.5 Goles",
  ];

  const availableMarkets = Array.from(
    new Set([...coreMarkets, ...historyItems.map((h) => h.market).filter(Boolean)])
  );

  const marketDropdownOptions: DropdownOption[] = availableMarkets.map((m) => ({
    value: m,
    label: m,
  }));

  // Date filtering helpers
  const getLocalDateStr = (d: Date | string) => {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const todayStr = getLocalDateStr(now);

  const yesterdayObj = new Date(now);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = getLocalDateStr(yesterdayObj);

  const sevenDaysAgoMs = now.getTime() - 7 * 86400000;
  const thirtyDaysAgoMs = now.getTime() - 30 * 86400000;

  const filteredHistory = historyItems.filter((item) => {
    // Result filter
    if (filterResult !== "ALL" && item.result !== filterResult) return false;

    // League multi-select filter
    if (selectedLeagues.length > 0 && !selectedLeagues.includes(item.league)) return false;

    // Market multi-select filter
    if (selectedMarkets.length > 0 && !selectedMarkets.includes(item.market)) return false;

    // Date filter
    const itemDateStr = item.kickoff ? getLocalDateStr(item.kickoff) : "";
    const itemTimeMs = item.kickoff ? new Date(item.kickoff).getTime() : 0;

    if (selectedDate === "today") {
      if (itemDateStr !== todayStr) return false;
    } else if (selectedDate === "yesterday") {
      if (itemDateStr !== yesterdayStr) return false;
    } else if (selectedDate === "week") {
      if (itemTimeMs < sevenDaysAgoMs) return false;
    } else if (selectedDate === "month") {
      if (itemTimeMs < thirtyDaysAgoMs) return false;
    }

    return true;
  });

  const totalPicks = filteredHistory.length;
  const wonPicks = filteredHistory.filter((p) => p.result === "WON").length;
  const winRate = totalPicks > 0 ? Math.round((wonPicks / totalPicks) * 100) : 0;
  const netProfit = filteredHistory.reduce((acc, p) => acc + p.profit, 0).toFixed(2);

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
              {t("historySubtitle")} • Partidos finalizados y en progreso de todas las ligas.
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
          <div>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium dark:text-slate-400">{t("historyWinRate")}</p>
            <p className="mt-1 text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">{winRate}%</p>
          </div>
          <div>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium dark:text-slate-400">{t("historyYield")}</p>
            <p
              className={`mt-1 text-lg sm:text-2xl font-black ${
                Number(netProfit) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
              }`}
            >
              {Number(netProfit) >= 0 ? `+${netProfit}` : netProfit} U
            </p>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mt-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          {/* Result Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">
              Resultado:
            </span>
            <button
              onClick={() => setFilterResult("ALL")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "ALL"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Todos ({historyItems.length})
            </button>
            <button
              onClick={() => setFilterResult("WON")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "WON"
                  ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-black"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              }`}
            >
              ✓ Ganadas ({historyItems.filter((h) => h.result === "WON").length})
            </button>
            <button
              onClick={() => setFilterResult("LOST")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "LOST"
                  ? "bg-red-600 text-white dark:bg-red-500 dark:text-white font-black"
                  : "bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800"
              }`}
            >
              ✗ Perdidas ({historyItems.filter((h) => h.result === "LOST").length})
            </button>
          </div>

          {/* Date Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">
              Fecha:
            </span>
            <button
              onClick={() => setSelectedDate("all")}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "all"
                  ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Histórico Total
            </button>
            <button
              onClick={() => setSelectedDate("yesterday")}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "yesterday"
                  ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Ayer
            </button>
            <button
              onClick={() => setSelectedDate("week")}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "week"
                  ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Últimos 7 Días
            </button>
          </div>

          {/* Multi-Select Dropdowns for All Leagues and Markets */}
          <div className="flex flex-wrap items-center gap-2.5">
            <MultiSelectDropdown
              label="Ligas por País"
              icon="🏆"
              options={leagueDropdownOptions}
              selected={selectedLeagues}
              onChange={setSelectedLeagues}
              placeholderAll="Todas las Ligas"
            />

            <MultiSelectDropdown
              label="Mercados"
              icon="🎯"
              options={marketDropdownOptions}
              selected={selectedMarkets}
              onChange={setSelectedMarkets}
              placeholderAll="Todos los Mercados"
            />
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-20 text-center text-slate-600">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent dark:border-emerald-500" />
            <p className="mt-3 text-sm font-semibold">Cargando pronósticos finalizados...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredHistory.length === 0 && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              No se encontraron pronósticos con los filtros seleccionados
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Prueba seleccionando &apos;Todos&apos; en los filtros de liga, mercado o resultado.
            </p>
          </div>
        )}

        {/* VIEW 1: CARDS */}
        {!loading && viewMode === "cards" && filteredHistory.length > 0 && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {filteredHistory.map((item) => {
              const isWon = item.result === "WON";
              return (
                <div
                  key={item.id}
                  className={`flex flex-col justify-between rounded-3xl border p-5 shadow-sm transition hover:shadow-md ${
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
        {!loading && viewMode === "table" && filteredHistory.length > 0 && (
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
