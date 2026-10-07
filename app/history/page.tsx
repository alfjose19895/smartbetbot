"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { SportSelector } from "@/components/SportSelector";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { HistoricalSettledPick, HistoricalSettledParlay } from "@/lib/sports/db";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { matchesMarketFilter } from "@/lib/sports/registry";
import { SupportedSport } from "@/lib/sports/types";

function getConfidenceBadge(confidence?: string, prob?: number) {
  if (confidence === "Muy Alta" || (prob && prob >= 75)) {
    return {
      label: "⭐⭐⭐ Muy Alta",
      cls: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700",
    };
  }
  return {
    label: "⭐⭐ Alta",
    cls: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700",
  };
}

export default function HistoryPage() {
  const { language, t } = useLanguage();

  // Sport Filter
  const [selectedSport, setSelectedSport] = useState<SupportedSport | "all">("all");

  // Data state
  const [historyItems, setHistoryItems] = useState<HistoricalSettledPick[]>([]);
  const [parlayItems, setParlayItems] = useState<HistoricalSettledParlay[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // View state
  const [historyType, setHistoryType] = useState<"picks" | "parlays">("picks");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Modal state
  const [selectedPickForModal, setSelectedPickForModal] = useState<HistoricalSettledPick | null>(null);

  // Filters
  const [timingFilter, setTimingFilter] = useState<"ALL" | "PREMATCH" | "MCP" | "BOMBA">("ALL");
  const [filterResult, setFilterResult] = useState<"ALL" | "WON" | "LOST">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedDateFilter, setSelectedDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [customDate, setCustomDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchHistory = async (sport: SupportedSport | "all" = selectedSport, showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const url = sport === "all" ? "/api/history" : `/api/history?sport=${encodeURIComponent(sport)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data && Array.isArray(data.history)) {
        setHistoryItems(data.history);
      } else {
        setHistoryItems([]);
      }
      if (data && Array.isArray(data.parlays)) {
        setParlayItems(data.parlays);
      } else {
        setParlayItems([]);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(selectedSport, true);
  }, [selectedSport]);

  useEffect(() => {
    const handleUpdated = () => {
      fetchHistory(selectedSport, false);
    };
    window.addEventListener("predictions-updated", handleUpdated);
    return () => {
      window.removeEventListener("predictions-updated", handleUpdated);
    };
  }, [selectedSport]);

﻿  // Build classified league options grouped by Country
  const leagueDropdownOptions: DropdownOption[] = useMemo(() => {
    const options: DropdownOption[] = SUPPORTED_LEAGUES.map((l) => ({
      value: l.name,
      label: `${l.name} (${l.country})`,
      group: l.country,
      badge: l.tier ? `Div ${l.tier}` : undefined,
    }));

    historyItems.forEach((h) => {
      if (h.league && !options.some((opt) => opt.value === h.league)) {
        options.push({
          value: h.league,
          label: h.league,
          group: h.country || "Competiciones Oficiales",
        });
      }
    });
    return options;
  }, [historyItems]);

  const availableMarkets = [
    "Over Córners",
    "Ambos Equipos Anotan",
    "Over 2.5 Goles",
    "Over 1.5 Goles",
    "Ganador Local",
    "Ganador Visitante",
    "Doble Oportunidad",
  ];

  const marketDropdownOptions: DropdownOption[] = useMemo(() => {
    return availableMarkets.map((m) => {
      const count = historyItems.filter((h) => matchesMarketFilter(m, h.market, h.selection)).length;
      return {
        value: m,
        label: `${m} (${count})`,
      };
    });
  }, [historyItems]);

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

  const isMcpItem = (item: HistoricalSettledPick) =>
    Boolean(
      item.isMcp ||
      item.isMcpPick ||
      item.source === "mcp" ||
      item.pickBadge === "mcp" ||
      (item.explanation && item.explanation.includes("MCP")) ||
      (item.market && item.market.includes("MCP"))
    );

  const isWonItem = (item: HistoricalSettledPick) => item.result === "WON" || (item as any).status === "won";
  const isLostItem = (item: HistoricalSettledPick) => item.result === "LOST" || (item as any).status === "lost";

  // Filter Individual Picks
  const filteredHistory = useMemo(() => {
    return historyItems.filter((item) => {
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchText = `${item.match} ${item.homeTeam} ${item.awayTeam} ${item.league} ${item.market} ${item.selection} ${item.country || ""}`.toLowerCase();
        if (!matchText.includes(q)) return false;
      }

      if (timingFilter === "PREMATCH") {
        if (item.isLive || item.matchTiming === "live") return false;
      } else if (timingFilter === "MCP") {
        if (!isMcpItem(item)) return false;
      } else if (timingFilter === "BOMBA") {
        if (item.pickBadge !== "bomba" && item.odds < 2.05) return false;
      }

      if (filterResult === "WON" && !isWonItem(item)) return false;
      if (filterResult === "LOST" && !isLostItem(item)) return false;

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
        const match = selectedMarkets.some((m) => matchesMarketFilter(m, item.market, item.selection));
        if (!match) return false;
      }

      if (selectedDateFilter === "today") {
        const itemDate = item.date || (item.kickoff ? getLocalDateStr(item.kickoff) : "");
        if (itemDate !== todayStr) return false;
      } else if (selectedDateFilter === "yesterday") {
        const itemDate = item.date || (item.kickoff ? getLocalDateStr(item.kickoff) : "");
        if (itemDate !== yesterdayStr) return false;
      } else if (selectedDateFilter === "week") {
        const itemTime = new Date(item.kickoff || item.date).getTime();
        if (isNaN(itemTime) || itemTime < sevenDaysAgoMs) return false;
      } else if (selectedDateFilter === "month") {
        const itemTime = new Date(item.kickoff || item.date).getTime();
        if (isNaN(itemTime) || itemTime < thirtyDaysAgoMs) return false;
      } else if (selectedDateFilter === "custom" && customDate) {
        const itemDate = item.date || (item.kickoff ? getLocalDateStr(item.kickoff) : "");
        if (itemDate !== customDate) return false;
      }

      return true;
    });
  }, [historyItems, searchQuery, timingFilter, filterResult, selectedLeagues, selectedMarkets, selectedDateFilter, customDate, todayStr, yesterdayStr, sevenDaysAgoMs, thirtyDaysAgoMs]);

  const filteredParlays = useMemo(() => {
    return parlayItems.filter((p) => {
      if (filterResult === "WON" && p.result !== "WON") return false;
      if (filterResult === "LOST" && p.result !== "LOST") return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchText = `${p.legs.map((l) => `${l.match} ${l.league}`).join(" ")}`.toLowerCase();
        if (!matchText.includes(q)) return false;
      }
      return true;
    });
  }, [parlayItems, filterResult, searchQuery]);

  const prematchCount = historyItems.filter((h) => !h.isLive && h.matchTiming !== "live").length;
  const mcpCount = historyItems.filter((h) => isMcpItem(h)).length;
  const bombaCount = historyItems.filter((h) => h.pickBadge === "bomba" || h.odds >= 2.05).length;
  const wonCount = historyItems.filter(isWonItem).length;
  const lostCount = historyItems.filter(isLostItem).length;

  const totalSettled = filteredHistory.length;
  const totalWon = filteredHistory.filter(isWonItem).length;
  const winRate = totalSettled > 0 ? (totalWon / totalSettled) * 100 : 0;
  const netProfit = filteredHistory.reduce(
    (acc, i) => acc + (typeof i.profit === "number" ? i.profit : (isWonItem(i) ? (i.odds - 1) : -1)),
    0
  );
  const avgOdds =
    totalSettled > 0
      ? (filteredHistory.reduce((acc, i) => acc + (i.odds || 0), 0) / totalSettled).toFixed(2)
      : "—";

  const modalPrediction: MarketOpportunity | null = useMemo(() => {
    if (!selectedPickForModal) return null;
    const p = selectedPickForModal as any;
    return {
      id: p.id || String(p.fixtureId || Math.random()),
      fixtureId: Number(p.fixtureId) || 0,
      match: p.match || `${p.homeTeam} vs ${p.awayTeam}`,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      homeLogo: p.homeLogo,
      awayLogo: p.awayLogo,
      league: p.league,
      leagueLogo: p.leagueLogo,
      country: p.country,
      kickoff: p.kickoff || p.date,
      market: p.market,
      selection: p.selection || p.market,
      odds: p.odds || 1.85,
      fairOdds: p.fairOdds || p.odds || 1.85,
      probability: p.probability || 60,
      confidence: p.confidence || "Alta",
      expectedValue: p.expectedValue || (p.odds * ((p.probability || 60) / 100) - 1),
      smartScore: p.smartScore || p.probability || 75,
      status: p.result === "WON" ? "won" : p.result === "LOST" ? "lost" : "pending",
      edge: p.edge || 0,
      pickBadge: p.pickBadge || "estandar",
      explanation: p.explanation,
      h2h: p.h2h || [],
      homeForm: p.homeForm || [],
      awayForm: p.awayForm || [],
      cornersSummary: p.cornersSummary,
    } as MarketOpportunity;
  }, [selectedPickForModal]);

﻿  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        {/* Header Strip with Title */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                📜
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {t("historyKicker") || "Auditoría y Transparencia"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {t("historyTitle") || "Historial Auditado de Pronósticos"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              {t("historySubtitle") || "Registro oficial con resultados de partidos reales y liquidación exacta de todas las oportunidades."}
            </p>
          </div>

          {/* Type Toggle: Individual Picks vs Parlays */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 self-start md:self-auto">
            <button
              onClick={() => setHistoryType("picks")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
                historyType === "picks"
                  ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>🎯</span>
              <span>Pronósticos Individuales</span>
            </button>
            <button
              onClick={() => setHistoryType("parlays")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
                historyType === "parlays"
                  ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>🎲</span>
              <span>Combinadas Parlay ({parlayItems.length})</span>
            </button>
          </div>
        </div>

        {/* Sport Selector Carousel */}
        <div className="mb-2">
          <SportSelector
            selectedSport={selectedSport}
            onSelectSport={(s) => setSelectedSport(s)}
            showAll={true}
          />
        </div>

        {/* Global Performance Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("historyTotalPicks") || "Pronósticos Evaluados"}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {totalSettled}
              </span>
              <span className="text-xs font-bold text-slate-400">cerrados</span>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-xs dark:from-emerald-950/20 dark:to-slate-900 dark:border-emerald-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t("historyWinRate") || "Tasa de Acierto"}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400">
                {winRate.toFixed(1)}%
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {totalWon}W - {totalSettled - totalWon}L
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-xs dark:from-cyan-950/20 dark:to-slate-900 dark:border-cyan-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              {t("historyProfit") || "Beneficio Neto (Yield)"}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-2xl sm:text-3xl font-black ${netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {netProfit >= 0 ? `+${netProfit.toFixed(2)}` : netProfit.toFixed(2)} u
              </span>
              <span className="text-xs font-bold text-slate-500">unidades</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cuota Promedio
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                @{avgOdds}
              </span>
              <span className="text-xs font-bold text-slate-500">global</span>
            </div>
          </div>
        </div>

        {/* Modality & Result Filter Pills */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setTimingFilter("ALL")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                timingFilter === "ALL"
                  ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              🌐 Todas ({historyItems.length})
            </button>

            <button
              onClick={() => setTimingFilter(timingFilter === "PREMATCH" ? "ALL" : "PREMATCH")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                timingFilter === "PREMATCH"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
              }`}
            >
              📋 Pre-Match ({prematchCount})
            </button>

            <button
              onClick={() => setTimingFilter(timingFilter === "MCP" ? "ALL" : "MCP")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                timingFilter === "MCP"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
              }`}
            >
              🤖 Agente MCP ({mcpCount})
            </button>

            <button
              onClick={() => setTimingFilter(timingFilter === "BOMBA" ? "ALL" : "BOMBA")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                timingFilter === "BOMBA"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
              }`}
            >
              💣 Bomba ({bombaCount})
            </button>

            <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:inline-block" />

            {/* Result Filters */}
            <button
              onClick={() => setFilterResult("ALL")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "ALL"
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              {t("filterAll") || "Todos"}
            </button>
            <button
              onClick={() => setFilterResult(filterResult === "WON" ? "ALL" : "WON")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "WON"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
              }`}
            >
              {t("filterWon") || "Ganadas"} ({wonCount})
            </button>
            <button
              onClick={() => setFilterResult(filterResult === "LOST" ? "ALL" : "LOST")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "LOST"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300"
              }`}
            >
              {t("filterLost") || "Perdidas"} ({lostCount})
            </button>
          </div>

          {/* View Mode Toggle: Cards vs Table */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 shrink-0">
            <button
              onClick={() => setViewMode("cards")}
              className={`rounded-lg px-2.5 py-1 text-xs font-black transition cursor-pointer ${
                viewMode === "cards"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              🗂️ {t("viewCards") || "Cards"}
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-lg px-2.5 py-1 text-xs font-black transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              📊 {t("viewTable") || "Tabla"}
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mb-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por equipo, liga, mercado o país..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectDropdown
              label={t("filterLeagueLabel") ? t("filterLeagueLabel").replace(":", "") : "Competición"}
              options={leagueDropdownOptions}
              selected={selectedLeagues}
              onChange={setSelectedLeagues}
            />

            {marketDropdownOptions.length > 0 && (
              <MultiSelectDropdown
                label={t("filterMarketLabel") ? t("filterMarketLabel").replace(":", "") : "Mercado"}
                options={marketDropdownOptions}
                selected={selectedMarkets}
                onChange={setSelectedMarkets}
              />
            )}

            {/* Date Preset Selector */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <span>📅</span>
              <select
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value as any)}
                aria-label="Filtrar por período de fecha"
                className="bg-transparent font-black text-slate-800 dark:text-white outline-none cursor-pointer"
              >
                <option value="all" className="dark:bg-slate-900">Histórico Completo</option>
                <option value="today" className="dark:bg-slate-900">Solo Hoy</option>
                <option value="yesterday" className="dark:bg-slate-900">Ayer</option>
                <option value="week" className="dark:bg-slate-900">Últimos 7 días</option>
                <option value="month" className="dark:bg-slate-900">Últimos 30 días</option>
              </select>
            </div>

            {(selectedLeagues.length > 0 || selectedMarkets.length > 0 || timingFilter !== "ALL" || filterResult !== "ALL" || selectedDateFilter !== "all" || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedLeagues([]);
                  setSelectedMarkets([]);
                  setTimingFilter("ALL");
                  setFilterResult("ALL");
                  setSelectedDateFilter("all");
                  setSearchQuery("");
                }}
                className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
              >
                🗑️ Limpiar
              </button>
            )}
          </div>
        </div>

﻿        {/* Content View: Picks or Parlays */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-4" />
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
              Cargando historial auditado y marcadores oficiales...
            </span>
          </div>
        ) : historyType === "picks" ? (
          filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/30">
              <span className="text-4xl mb-3">🔍</span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                No se encontraron registros para estos filtros
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Prueba ajustando los filtros de fecha, liga, deporte o modalidad.
              </p>
            </div>
          ) : viewMode === "cards" ? (
            /* Cards Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredHistory.map((item) => {
                const isWon = item.result === "WON";
                const conf = getConfidenceBadge(item.confidence, item.probability);
                const matchTime = item.kickoff ? new Date(item.kickoff).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
                const itemProfit = typeof item.profit === "number" ? item.profit : (isWon ? (item.odds ? item.odds - 1 : 0.85) : -1);

                return (
                  <div
                    key={item.id}
                    className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-white p-5 shadow-xs transition hover:shadow-md dark:bg-slate-900 ${
                      isWon
                        ? "border-emerald-500/30 dark:border-emerald-500/20"
                        : "border-rose-500/30 dark:border-rose-500/20"
                    }`}
                  >
                    {/* Top Badges Strip */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          PRE
                        </span>
                        {isMcpItem(item) && (
                          <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            🤖 MCP
                          </span>
                        )}
                        {(item.pickBadge === "bomba" || item.odds >= 2.05) && (
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            💣 Bomba
                          </span>
                        )}
                      </div>

                      {/* Result Badge with Profit Units */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${
                          isWon
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        <span>{isWon ? "✓" : "✗"}</span>
                        <span>{isWon ? (t("wonBadge") || "GANADA") : (t("lostBadge") || "PERDIDA")}</span>
                        <span className="text-[10px] font-bold opacity-90">
                          ({itemProfit >= 0 ? `+${itemProfit.toFixed(2)}` : itemProfit.toFixed(2)}u)
                        </span>
                      </span>
                    </div>

                    {/* League & Kickoff Date */}
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <span>🏆</span>
                        <span className="truncate max-w-[200px] font-bold">{item.league} {item.country ? `• ${item.country}` : ""}</span>
                      </div>
                      <div className="shrink-0 font-extrabold text-slate-700 dark:text-slate-300">
                        📅 {item.date} {matchTime ? `• ⏰ ${matchTime}` : ""}
                      </div>
                    </div>

                    {/* Match Teams & Official Score */}
                    <div className="my-3.5 rounded-2xl bg-slate-50/80 p-3.5 border border-slate-100 dark:bg-slate-950/40 dark:border-slate-800/80">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-left flex-1">
                          <span className="font-black text-slate-900 dark:text-white text-sm truncate block">
                            {item.homeTeam}
                          </span>
                        </div>
                        <span className="text-xs font-black text-slate-400 shrink-0 px-1">vs</span>
                        <div className="truncate text-right flex-1">
                          <span className="font-black text-slate-900 dark:text-white text-sm truncate block">
                            {item.awayTeam}
                          </span>
                        </div>
                      </div>

                      {/* Official Score Strip */}
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-2 border border-slate-200 shadow-2xs dark:bg-slate-900 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {t("colScore") || "Marcador Final"}:
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-white tracking-wide">
                          {item.score || "Finalizado"}
                        </span>
                      </div>
                    </div>

                    {/* Market, Selection, Odds & Confidence */}
                    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">{t("marketLabel") || "Mercado"}:</span>
                        <span className="font-black text-slate-900 dark:text-white">{item.market}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Selección:</span>
                        <span className="font-black text-emerald-700 dark:text-emerald-400">{item.selection}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">{t("oddsLabel") || "Cuota"}:</span>
                        <span className="text-base font-black text-slate-900 dark:text-white">@{item.odds.toFixed(2)}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${conf.cls}`}>
                          {conf.label}
                        </span>
                        <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
                          Prob: {item.probability}%
                        </span>
                      </div>
                    </div>

                    {/* Action Button: Ver H2H / Estadísticas */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => setSelectedPickForModal(item)}
                        className="w-full rounded-xl bg-slate-100 py-2 text-xs font-black text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>📊</span>
                        <span>Ver H2H y Estadísticas</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="p-3.5">Modalidad</th>
                    <th className="p-3.5">{t("colDate") || "Fecha"} & Hora</th>
                    <th className="p-3.5">{t("colMatch") || "Partido & Liga"}</th>
                    <th className="p-3.5">{t("colScore") || "Marcador"}</th>
                    <th className="p-3.5">{t("colMarket") || "Mercado & Selección"}</th>
                    <th className="p-3.5">{t("colOdds") || "Cuota"}</th>
                    <th className="p-3.5">{t("colProb") || "Prob."}</th>
                    <th className="p-3.5">{t("colResult") || "Liquidación"}</th>
                    <th className="p-3.5 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredHistory.map((item) => {
                    const isWon = item.result === "WON";
                    const itemProfit = typeof item.profit === "number" ? item.profit : (isWon ? (item.odds ? item.odds - 1 : 0.85) : -1);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <span>PRE</span>
                          </span>
                          {isMcpItem(item) && (
                            <span className="ml-1 text-[10px] font-black text-purple-600 dark:text-purple-400">🤖 MCP</span>
                          )}
                          {(item.pickBadge === "bomba" || item.odds >= 2.05) && (
                            <span className="ml-1 text-[10px] font-black text-rose-600 dark:text-rose-400">💣</span>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap font-medium text-slate-500 dark:text-slate-400">
                          <div className="font-bold text-slate-900 dark:text-slate-200">{item.date}</div>
                          {item.kickoff && (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">
                              ⏰ {new Date(item.kickoff).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          <div className="font-black">{item.match}</div>
                          <div className="text-[10px] font-medium text-slate-400">{item.league} {item.country ? `• ${item.country}` : ""}</div>
                        </td>
                        <td className="p-3.5 font-black text-slate-900 dark:text-white whitespace-nowrap">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
                            {item.score || "—"}
                          </span>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">
                          <div className="font-black text-slate-900 dark:text-slate-100">{item.market}</div>
                          <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{item.selection}</div>
                        </td>
                        <td className="p-3.5 font-black text-slate-900 dark:text-white whitespace-nowrap">
                          @{item.odds.toFixed(2)}
                        </td>
                        <td className="p-3.5 font-bold text-slate-500 whitespace-nowrap">
                          {item.probability}%
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black ${
                              isWon
                                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            <span>{isWon ? "✓" : "✗"}</span>
                            <span>{isWon ? (t("wonBadge") || "GANADA") : (t("lostBadge") || "PERDIDA")}</span>
                            <span className="text-[10px] opacity-80">
                              ({itemProfit >= 0 ? `+${itemProfit.toFixed(2)}` : itemProfit.toFixed(2)}u)
                            </span>
                          </span>
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedPickForModal(item)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Ver H2H y Estadísticas"
                          >
                            📊 H2H
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Parlays View */
          filteredParlays.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/30">
              <span className="text-4xl mb-3">🎲</span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                No hay parlays registrados para este filtro
              </h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredParlays.map((parlay) => {
                const isWon = parlay.result === "WON";
                const isLost = parlay.result === "LOST";
                const isPending = !isWon && !isLost;

                return (
                  <div
                    key={parlay.id}
                    className={`rounded-3xl border bg-white p-5 shadow-xs dark:bg-slate-900 ${
                      isWon
                        ? "border-emerald-500/30 dark:border-emerald-500/20"
                        : isLost
                        ? "border-rose-500/30 dark:border-rose-500/20"
                        : "border-amber-500/30 dark:border-amber-500/20"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🎲</span>
                        <div>
                          <h4 className="font-black text-sm text-slate-900 dark:text-white">
                            Parlay {parlay.legs.length} Selecciones
                          </h4>
                          <span className="text-[10px] text-slate-400 font-bold">{parlay.date}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white bg-slate-100 px-2.5 py-1 rounded-xl dark:bg-slate-800">
                          Cuota @{parlay.totalOdds.toFixed(2)}
                        </span>
                        <span
                          className={`rounded-xl px-2.5 py-1 text-xs font-black ${
                            isWon
                              ? "bg-emerald-600 text-white"
                              : isLost
                              ? "bg-rose-600 text-white"
                              : "bg-amber-500 text-slate-950"
                          }`}
                        >
                          {isWon ? "✓ GANADA (+u)" : isLost ? "✗ PERDIDA (-1.0u)" : "⏳ PENDIENTE"}
                        </span>
                      </div>
                    </div>

                    {/* Legs List */}
                    <div className="my-3 space-y-2.5">
                      {parlay.legs.map((leg, idx) => {
                        const legWon = leg.result === "WON" || (leg as any).status === "won";
                        const legLost = leg.result === "LOST" || (leg as any).status === "lost";
                        const legSelection = (leg as any).selection || leg.market;

                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800"
                          >
                            <div className="space-y-0.5">
                              <div className="font-black text-slate-900 dark:text-white">
                                {leg.match}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                {leg.league} • <span className="font-bold text-emerald-600 dark:text-emerald-400">{leg.market}: {legSelection}</span>
                              </div>
                            </div>

                            <div className="text-right flex items-center gap-2">
                              {leg.score && (
                                <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300 bg-white px-2 py-0.5 rounded-md dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                  {leg.score}
                                </span>
                              )}
                              <span
                                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-black ${
                                  legWon
                                    ? "bg-emerald-500 text-white"
                                    : legLost
                                    ? "bg-rose-500 text-white"
                                    : "bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {legWon ? "✓" : legLost ? "✗" : "•"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>

      {/* Match Detail Modal for H2H and Deep Stats */}
      {selectedPickForModal && modalPrediction && (
        <MatchDetailModal
          prediction={modalPrediction}
          onClose={() => setSelectedPickForModal(null)}
          sport={selectedSport !== "all" ? selectedSport : undefined}
        />
      )}
    </div>
  );
}
