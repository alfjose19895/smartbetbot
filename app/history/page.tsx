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
  country?: string;
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
  const [selectedDateFilter, setSelectedDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [customDate, setCustomDate] = useState<string>("");

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

  historyItems.forEach((h) => {
    if (h.league && !leagueDropdownOptions.some((opt) => opt.value === h.league)) {
      leagueDropdownOptions.push({
        value: h.league,
        label: h.league,
        group: "Otras Ligas",
      });
    }
  });

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
    // 1. Result filter
    if (filterResult !== "ALL" && item.result !== filterResult) return false;

    // 2. League filter
    if (selectedLeagues.length > 0) {
      const normLeague = (item.league || "").toLowerCase().trim();
      const normCountry = (item.country || "").toLowerCase().trim();
      const matched = selectedLeagues.some((sel) => {
        const selLower = sel.toLowerCase().trim();
        return (
          normLeague.includes(selLower) ||
          selLower.includes(normLeague) ||
          normCountry === selLower ||
          normCountry.includes(selLower)
        );
      });
      if (!matched) return false;
    }

    // 3. Market filter
    if (selectedMarkets.length > 0) {
      const match = selectedMarkets.some((m) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = item.market.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normActual.includes(normSelected) ||
          normSelected.includes(normActual) ||
          (m.includes("BTTS") && (item.market.includes("Ambos") || item.market.includes("BTTS")))
        );
      });
      if (!match) return false;
    }

    // 4. Date filter
    const itemDateStr = item.date || getLocalDateStr(item.kickoff);
    const itemTimeMs = new Date(item.kickoff || item.date).getTime();

    if (selectedDateFilter === "today") {
      if (itemDateStr !== todayStr) return false;
    } else if (selectedDateFilter === "yesterday") {
      if (itemDateStr !== yesterdayStr) return false;
    } else if (selectedDateFilter === "week") {
      if (itemTimeMs < sevenDaysAgoMs) return false;
    } else if (selectedDateFilter === "month") {
      if (itemTimeMs < thirtyDaysAgoMs) return false;
    } else if (selectedDateFilter === "custom" && customDate) {
      if (itemDateStr !== customDate) return false;
    }

    return true;
  });

  // Calculate accurate KPI stats for the filtered date / selection
  const totalPicks = filteredHistory.length;
  const wonPicks = filteredHistory.filter((i) => i.result === "WON").length;
  const lostPicks = filteredHistory.filter((i) => i.result === "LOST").length;
  const winRate = totalPicks > 0 ? ((wonPicks / totalPicks) * 100).toFixed(1) : "0.0";
  const netProfit = filteredHistory.reduce((acc, i) => acc + (i.profit || 0), 0).toFixed(2);
  const avgOdds = totalPicks > 0 ? (filteredHistory.reduce((acc, i) => acc + (i.odds || 0), 0) / totalPicks).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        {/* Title & View Switcher */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
              <span>📜</span>
              <span>{t("historyKicker")}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {t("historyTitle")}
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Consulta por fecha exacta y analiza el porcentaje de acierto oficial y rendimiento de cada jornada
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto rounded-2xl bg-white p-1 border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
            <button
              onClick={() => setViewMode("cards")}
              className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                viewMode === "cards"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Tarjetas
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Tabla Detallada
            </button>
          </div>
        </div>

        {/* Date Filter Bar & Specific Date Picker */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">Período / Fecha:</span>
            <button
              onClick={() => { setSelectedDateFilter("all"); setCustomDate(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDateFilter === "all"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              🌟 Todo el Historial
            </button>
            <button
              onClick={() => { setSelectedDateFilter("today"); setCustomDate(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDateFilter === "today"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              📅 Hoy
            </button>
            <button
              onClick={() => { setSelectedDateFilter("yesterday"); setCustomDate(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDateFilter === "yesterday"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              ⏪ Ayer
            </button>
            <button
              onClick={() => { setSelectedDateFilter("week"); setCustomDate(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDateFilter === "week"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              🗓️ Últimos 7 Días
            </button>
            <button
              onClick={() => { setSelectedDateFilter("month"); setCustomDate(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDateFilter === "month"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              📊 Últimos 30 Días
            </button>
          </div>

          {/* Specific Date Picker Input */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Fecha Específica:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                if (e.target.value) {
                  setSelectedDateFilter("custom");
                } else {
                  setSelectedDateFilter("all");
                }
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Dynamic Accuracy & Performance KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              % Acierto (Win Rate)
            </span>
            <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {winRate}%
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Total Apuestas
            </span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
              {totalPicks}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Ganadas (WON)
            </span>
            <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {wonPicks}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Perdidas (LOST)
            </span>
            <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">
              {lostPicks}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Cuota Promedio
            </span>
            <p className="mt-1 text-2xl font-black text-sky-700 dark:text-sky-400">
              {avgOdds}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Beneficio Neto
            </span>
            <p className={`mt-1 text-2xl font-black ${Number(netProfit) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {Number(netProfit) >= 0 ? `+${netProfit}` : netProfit} U
            </p>
          </div>
        </div>

        {/* Secondary Filter Controls: Result, Leagues & Markets */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">Resultado:</span>
            <button
              onClick={() => setFilterResult("ALL")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "ALL"
                  ? "bg-slate-900 text-white dark:bg-slate-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Todos ({historyItems.length})
            </button>
            <button
              onClick={() => setFilterResult("WON")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "WON"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              ✓ Ganadas
            </button>
            <button
              onClick={() => setFilterResult("LOST")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "LOST"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              ✗ Perdidas
            </button>
          </div>

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

        {/* Content Views */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando historial de apuestas liquidadas...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin registros para esta fecha</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No hay apuestas liquidadas que coincidan con la fecha o filtros seleccionados.
            </p>
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {filteredHistory.map((item) => {
              const isWon = item.result === "WON";
              return (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-3xl border p-5 shadow-sm transition hover:shadow-md ${
                    isWon
                      ? "border-emerald-200 bg-white dark:border-emerald-900/40 dark:bg-slate-900/90"
                      : "border-red-200 bg-white dark:border-red-900/40 dark:bg-slate-900/90"
                  }`}
                >
                  <div>
                    {/* Card Top: League, Country & Result Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <span>🏆</span>
                        <span>{item.league}</span>
                        {item.country && (
                          <>
                            <span className="text-slate-400 font-normal">•</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">{item.country}</span>
                          </>
                        )}
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
                    <div className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
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
                      <div className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400">
                        Mercado Seleccionado
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                          🎯 {item.market} ({item.selection})
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
        ) : (
          /* Table View */
          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900/80">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[11px] tracking-wider dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Fecha</th>
                    <th className="px-4 py-3.5">Partido / Liga</th>
                    <th className="px-4 py-3.5 text-center">Marcador</th>
                    <th className="px-4 py-3.5">Mercado</th>
                    <th className="px-4 py-3.5 text-center">Cuota</th>
                    <th className="px-4 py-3.5 text-center">Prob.</th>
                    <th className="px-4 py-3.5 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition dark:hover:bg-slate-850/60">
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap dark:text-slate-400">{item.date}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        <div>{item.match}</div>
                        <div className="text-[11px] text-slate-500 font-normal dark:text-slate-400">
                          {item.league} {item.country ? `• ${item.country}` : ""}
                        </div>
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
