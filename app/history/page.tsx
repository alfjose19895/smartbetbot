"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";
import { HistoricalSettledPick, HistoricalSettledParlay } from "@/lib/sports/db";

function getConfidenceBadge(confidence?: string, probability: number = 70) {
  if (confidence === "Muy Alta" || probability >= 75) {
    return {
      label: "⭐⭐⭐ Muy Alta",
      cls: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700",
    };
  }
  if (confidence === "Alta" || probability >= 68) {
    return {
      label: "⭐⭐ Alta",
      cls: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700",
    };
  }
  return {
    label: "⭐ Media",
    cls: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700",
  };
}

export default function HistoryPage() {
  const { language, t } = useLanguage();
  const [historyType, setHistoryType] = useState<"picks" | "parlays">("picks");
  const [historyItems, setHistoryItems] = useState<HistoricalSettledPick[]>([]);
  const [parlayItems, setParlayItems] = useState<HistoricalSettledParlay[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
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
        if (data.parlays) {
          setParlayItems(data.parlays);
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
        group: h.country || "Competiciones Oficiales",
      });
    }
  });

  const coreMarkets = [
    "Gana Local",
    "Gana Visitante",
    "Over 2.5 Goles",
    "Under 2.5 Goles",
    "Ambos Marcan (BTTS)",
    "Over 8.5 Córners",
    "Over 3.5 Tarjetas",
  ];

  const availableMarkets = Array.from(
    new Set([...coreMarkets, ...historyItems.map((h) => h.market).filter(Boolean)])
  );

  const marketDropdownOptions: DropdownOption[] = availableMarkets.map((m) => ({
    value: m,
    label: m,
  }));

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

  // Filter Individual Picks
  const filteredHistory = historyItems.filter((item) => {
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = (item.match || "").toLowerCase();
      const homeText = (item.homeTeam || "").toLowerCase();
      const awayText = (item.awayTeam || "").toLowerCase();
      const leagueText = (item.league || "").toLowerCase();
      const countryText = (item.country || "").toLowerCase();
      const marketText = (item.market || "").toLowerCase();

      const matched =
        matchText.includes(q) ||
        homeText.includes(q) ||
        awayText.includes(q) ||
        leagueText.includes(q) ||
        countryText.includes(q) ||
        marketText.includes(q);

      if (!matched) return false;
    }

    if (filterResult !== "ALL" && item.result !== filterResult) return false;

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

  // Filter Parlays
  const filteredParlays = parlayItems.filter((p) => {
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchInLegs = p.legs.some(
        (l) =>
          l.match.toLowerCase().includes(q) ||
          l.league.toLowerCase().includes(q) ||
          (l.country || "").toLowerCase().includes(q)
      );
      if (!matchInLegs && !p.title.toLowerCase().includes(q)) return false;
    }

    if (filterResult !== "ALL" && p.result !== filterResult) return false;

    if (selectedDateFilter === "today") {
      if (p.date !== todayStr) return false;
    } else if (selectedDateFilter === "yesterday") {
      if (p.date !== yesterdayStr) return false;
    } else if (selectedDateFilter === "week") {
      const pTime = new Date(p.date).getTime();
      if (pTime < sevenDaysAgoMs) return false;
    } else if (selectedDateFilter === "month") {
      const pTime = new Date(p.date).getTime();
      if (pTime < thirtyDaysAgoMs) return false;
    } else if (selectedDateFilter === "custom" && customDate) {
      if (p.date !== customDate) return false;
    }

    return true;
  });

  const [expandedPicks, setExpandedPicks] = useState<Record<string, boolean>>({});
  const [expandedParlays, setExpandedParlays] = useState<Record<string, boolean>>({});

  // Statistics for Current Tab
  const isPicksTab = historyType === "picks";
  const totalCount = isPicksTab ? filteredHistory.length : filteredParlays.length;
  const wonCount = isPicksTab
    ? filteredHistory.filter((i) => i.result === "WON").length
    : filteredParlays.filter((p) => p.result === "WON").length;
  const lostCount = isPicksTab
    ? filteredHistory.filter((i) => i.result === "LOST").length
    : filteredParlays.filter((p) => p.result === "LOST").length;
  const winRate = totalCount > 0 ? ((wonCount / totalCount) * 100).toFixed(1) : "0.0";
  const netProfit = isPicksTab
    ? filteredHistory.reduce((acc, i) => acc + (i.profit || 0), 0).toFixed(2)
    : filteredParlays.reduce((acc, p) => acc + (p.profit || 0), 0).toFixed(2);
  const avgOdds = isPicksTab
    ? totalCount > 0
      ? (filteredHistory.reduce((acc, i) => acc + (i.odds || 0), 0) / totalCount).toFixed(2)
      : "0.00"
    : totalCount > 0
    ? (filteredParlays.reduce((acc, p) => acc + (p.totalOdds || 0), 0) / totalCount).toFixed(2)
    : "0.00";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        {/* Title & History Type Switcher */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
              <span>📜</span>
              <span>{t("historyKicker")}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Historial de Pronósticos & Trazabilidad Oficial
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Auditoría oficial de picks individuales y parleys recomendados evaluados con marcadores reales
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (isPicksTab) {
                  const allExp = filteredHistory.every((p) => expandedPicks[p.id]);
                  const nextState: Record<string, boolean> = {};
                  filteredHistory.forEach((p) => {
                    nextState[p.id] = !allExp;
                  });
                  setExpandedPicks(nextState);
                } else {
                  const allExp = filteredParlays.every((p) => expandedParlays[p.id]);
                  const nextState: Record<string, boolean> = {};
                  filteredParlays.forEach((p) => {
                    nextState[p.id] = !allExp;
                  });
                  setExpandedParlays(nextState);
                }
              }}
              className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 hover:text-slate-900 border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white transition cursor-pointer"
            >
              {isPicksTab
                ? filteredHistory.every((p) => expandedPicks[p.id])
                  ? "▲ Minimizar Todo"
                  : "▼ Expandir Todo"
                : filteredParlays.every((p) => expandedParlays[p.id])
                ? "▲ Minimizar Todo"
                : "▼ Expandir Todo"}
            </button>
          </div>

          {/* Module Switcher */}
          <div className="flex items-center gap-2 self-start sm:self-auto rounded-2xl bg-white p-1.5 border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
            <button
              onClick={() => setHistoryType("picks")}
              className={`rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
                historyType === "picks"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25 dark:bg-emerald-500 dark:text-slate-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              🎯 Picks Individuales ({historyItems.length})
            </button>
            <button
              onClick={() => setHistoryType("parlays")}
              className={`rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
                historyType === "parlays"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25 dark:bg-emerald-500 dark:text-slate-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              🔥 Historial Parleys ({parlayItems.length})
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Buscar por equipo o liga en el historial (ej. Real Madrid, Chelsea, Arsenal, Serie A)..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs sm:text-sm font-semibold text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900/80 dark:text-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-3 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              ✕ Limpiar
            </button>
          )}
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
              🌟 Todo
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
              🗓️ 7 Días
            </button>
            <button
              onClick={() => { setSelectedDateFilter("month"); setCustomDate(""); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDateFilter === "month"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              📊 30 Días
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Fecha Exacta:</span>
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
              Total {isPicksTab ? "Picks" : "Parleys"}
            </span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
              {totalCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Ganadas (WON)
            </span>
            <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {wonCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm text-center dark:bg-slate-900/80 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Perdidas (LOST)
            </span>
            <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">
              {lostCount}
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

        {/* Secondary Filter Controls */}
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
              Todos ({totalCount})
            </button>
            <button
              onClick={() => setFilterResult("WON")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "WON"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              ✓ Ganadas ({wonCount})
            </button>
            <button
              onClick={() => setFilterResult("LOST")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "LOST"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              ✗ Perdidas ({lostCount})
            </button>
          </div>

          {isPicksTab && (
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
          )}
        </div>

        {/* TAB 1: INDIVIDUAL PICKS WITH ENHANCED CARDS */}
        {isPicksTab && (
          <>
            {loading ? (
              <div className="py-20 text-center text-slate-500">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="mt-3 text-sm font-semibold">Cargando historial de apuestas liquidadas...</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
                <span className="text-4xl">🔍</span>
                <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin registros para esta búsqueda</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No hay apuestas liquidadas que coincidan con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map((item) => {
                  const isWon = item.result === "WON";
                  const conf = getConfidenceBadge(item.confidence, item.probability);
                  const isExpanded = Boolean(expandedPicks[item.id]);

                  return (
                    <div
                      key={item.id}
                      className={`overflow-hidden rounded-3xl border transition shadow-sm ${
                        isWon
                          ? "border-emerald-200 bg-white dark:border-emerald-900/40 dark:bg-slate-900/90"
                          : "border-red-200 bg-white dark:border-red-900/40 dark:bg-slate-900/90"
                      }`}
                    >
                      {/* Compact Header / Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                        <div className="flex items-start sm:items-center gap-3">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                              isWon
                                ? "bg-emerald-500 text-slate-950"
                                : "bg-red-500 text-white"
                            }`}
                          >
                            {isWon ? "✓" : "✗"}
                          </span>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <span>🏆</span>
                                <span>{item.league}</span>
                                {item.country && (
                                  <>
                                    <span className="text-slate-400 font-normal">•</span>
                                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">{item.country}</span>
                                  </>
                                )}
                              </span>

                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                📅 {item.date}
                              </span>

                              {isWon ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700">
                                  ✓ Ganada (+{item.profit.toFixed(2)} U)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-800 border border-red-300 dark:bg-red-950/80 dark:text-red-300 dark:border-red-700">
                                  ✗ Perdida ({item.profit.toFixed(2)} U)
                                </span>
                              )}
                            </div>

                            <h3 className="mt-1 text-sm sm:text-base font-black text-slate-900 dark:text-white">
                              {item.homeTeam} vs {item.awayTeam}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2.5 border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0 dark:border-slate-800">
                          <div className="text-right">
                            <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 block">
                              🎯 {item.market}
                            </span>
                          </div>

                          <span className="rounded-xl bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-800 border border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800">
                            @{item.odds.toFixed(2)}
                          </span>

                          <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-white dark:border-slate-700">
                            {item.score}
                          </span>

                          <button
                            onClick={() =>
                              setExpandedPicks((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                            }
                            className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                          >
                            {isExpanded ? "▲ Menos" : "▼ Análisis"}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-950/50 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border ${conf.cls}`}>
                              <span>{conf.label}</span>
                            </span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              Probabilidad Estimada: <strong className="text-emerald-600 dark:text-emerald-400">{item.probability}%</strong>
                            </span>
                          </div>

                          {item.explanation && (
                            <div className="rounded-2xl bg-white p-3.5 border border-slate-200 shadow-sm dark:bg-slate-900/90 dark:border-slate-800">
                              <div className="flex items-center gap-1.5 text-xs font-black text-emerald-700 dark:text-emerald-400">
                                <span>🧠</span>
                                <span>Análisis Cuantitativo del Encuentro:</span>
                              </div>
                              <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                {item.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB 2: PARLAYS DEL DÍA HISTÓRICOS */}
        {!isPicksTab && (
          <>
            {loading ? (
              <div className="py-20 text-center text-slate-500">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="mt-3 text-sm font-semibold">Cargando historial de combinadas liquidadas...</p>
              </div>
            ) : filteredParlays.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
                <span className="text-4xl">🔍</span>
                <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin parleys liquidados</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No se encontraron parleys históricos que coincidan con la búsqueda.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredParlays.map((parlay) => {
                  const isWon = parlay.result === "WON";
                  const isExpanded = Boolean(expandedParlays[parlay.id]);

                  return (
                    <div
                      key={parlay.id}
                      className={`overflow-hidden rounded-3xl border transition shadow-sm ${
                        isWon
                          ? "border-emerald-300 bg-white dark:border-emerald-900/50 dark:bg-slate-900/90"
                          : "border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/90"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-xl bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                              🔥 {parlay.title}
                            </span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              📅 {parlay.date}
                            </span>
                          </div>
                          <h3 className="mt-1.5 text-base font-black text-slate-900 dark:text-white">
                            Combinada de {parlay.parlaySize} Jugadas • Cuota Acumulada: @{parlay.totalOdds.toFixed(2)}
                          </h3>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Cuota Total</span>
                            <span className="text-lg sm:text-xl font-black text-sky-600 dark:text-sky-400">
                              @{parlay.totalOdds.toFixed(2)}
                            </span>
                          </div>

                          {isWon ? (
                            <span className="rounded-2xl bg-emerald-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-emerald-500/20">
                              ✓ GANADA (+{parlay.profit.toFixed(2)} U)
                            </span>
                          ) : (
                            <span className="rounded-2xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 dark:bg-slate-800 dark:text-red-400 dark:border-red-900/50">
                              ✗ PERDIDA (-1.00 U)
                            </span>
                          )}

                          <button
                            onClick={() =>
                              setExpandedParlays((prev) => ({ ...prev, [parlay.id]: !prev[parlay.id] }))
                            }
                            className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                          >
                            {isExpanded ? "▲ Menos" : "▼ Ver Jugadas"}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Legs Grid */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5 dark:border-slate-800/80 dark:bg-slate-950/40">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {parlay.legs.map((leg, idx) => {
                              const legWon = leg.result === "WON";
                              return (
                                <div
                                  key={idx}
                                  className={`rounded-2xl p-3.5 border text-xs ${
                                    legWon
                                      ? "bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40"
                                      : "bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900/40"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1.5">
                                    <span className="font-extrabold text-slate-600 dark:text-slate-400 text-[10px]">
                                      #{idx + 1} • {leg.league} {leg.country ? `(${leg.country})` : ""}
                                    </span>
                                    {legWon ? (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-black text-[11px]">
                                        ✓ Acierto
                                      </span>
                                    ) : (
                                      <span className="text-red-600 dark:text-red-400 font-bold text-[11px]">
                                        ✗ Fallo
                                      </span>
                                    )}
                                  </div>

                                  <div className="font-black text-slate-900 dark:text-white text-sm">
                                    {leg.match}
                                  </div>

                                  <div className="mt-2 flex items-center justify-between border-t border-slate-200/60 pt-2 dark:border-slate-800">
                                    <span className="font-bold text-emerald-800 dark:text-emerald-300">
                                      🎯 {leg.market} (@{leg.odds.toFixed(2)})
                                    </span>
                                    <span className="rounded-lg bg-white px-2 py-0.5 font-black text-slate-900 border border-slate-200 dark:bg-slate-950 dark:text-white dark:border-slate-800">
                                      {leg.score}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
