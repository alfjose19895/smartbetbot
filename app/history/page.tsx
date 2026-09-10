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
  const [timingFilter, setTimingFilter] = useState<"ALL" | "PREMATCH" | "LIVE" | "MCP" | "BOMBA">("ALL");
  const [filterResult, setFilterResult] = useState<"ALL" | "WON" | "LOST">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedDateFilter, setSelectedDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month" | "custom">("all");
  const [customDate, setCustomDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/history");
        const data = await res.json();
        let items = Array.isArray(data.history) ? [...data.history] : [];
        try {
          const localRaw = typeof window !== "undefined" ? localStorage.getItem("smartbetbot_published_picks") : null;
          if (localRaw) {
            const localPicks = JSON.parse(localRaw);
            if (Array.isArray(localPicks)) {
              for (const lp of localPicks) {
                const found = items.find(i => i.match === `${lp.homeTeam} vs ${lp.awayTeam}` || (i.homeTeam === lp.homeTeam && i.awayTeam === lp.awayTeam));
                if (found) {
                  found.isMcp = true;
                  found.pickBadge = lp.pickBadge || "mcp";
                }
              }
            }
          }
        } catch (e) {}
        setHistoryItems(items);
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
    "Ganador Local",
    "Ganador Visitante",
    "Over 2.5 Goles",
    "Ambos Equipos Anotan",
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
    // 1. Search Query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = `${item.match} ${item.homeTeam} ${item.awayTeam} ${item.league} ${item.market} ${item.country || ""}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    // 2. Timing / Modality Filter (Pre-Match, Live, MCP, Bomba)
    if (timingFilter === "PREMATCH") {
      if (item.isLive || item.matchTiming === "live") return false;
    } else if (timingFilter === "LIVE") {
      if (!item.isLive && item.matchTiming !== "live") return false;
    } else if (timingFilter === "MCP") {
      if (!item.isMcp && !item.isMcpPick && item.source !== "mcp" && item.pickBadge !== "mcp" && !(item.explanation && item.explanation.includes("MCP"))) return false;
    } else if (timingFilter === "BOMBA") {
      if (item.pickBadge !== "bomba" && item.odds < 2.05) return false;
    }

    // 3. Result Filter (WON / LOST)
    if (filterResult === "WON" && item.result !== "WON") return false;
    if (filterResult === "LOST" && item.result !== "LOST") return false;

    // 4. League Multi-Select
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

    // 5. Market Multi-Select
    if (selectedMarkets.length > 0) {
      const match = selectedMarkets.some((m) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = item.market.toLowerCase().replace(/[^a-z0-9]/g, "");
        return normActual.includes(normSelected) || normSelected.includes(normActual);
      });
      if (!match) return false;
    }

    // 6. Date Filter
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

  // Filter Parlays
  const filteredParlays = parlayItems.filter((p) => {
    if (filterResult === "WON" && p.result !== "WON") return false;
    if (filterResult === "LOST" && p.result !== "LOST") return false;
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = `${p.legs.map((l) => `${l.match} ${l.league}`).join(" ")}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    return true;
  });

  // Exact Counts for Badges
  const prematchCount = historyItems.filter((h) => !h.isLive && h.matchTiming !== "live").length;
  const liveCount = historyItems.filter((h) => h.isLive || h.matchTiming === "live").length;
  const mcpCount = historyItems.filter((h) => Boolean(h.isMcp || h.isMcpPick || h.source === "mcp" || h.pickBadge === "mcp" || (h.explanation && h.explanation.includes("MCP")))).length;
  const bombaCount = historyItems.filter((h) => h.pickBadge === "bomba" || h.odds >= 2.05).length;
  const wonCount = historyItems.filter((h) => h.result === "WON").length;
  const lostCount = historyItems.filter((h) => h.result === "LOST").length;

  // Overall Statistics from Filtered Items
  const totalSettled = filteredHistory.length;
  const totalWon = filteredHistory.filter((i) => i.result === "WON").length;
  const winRate = totalSettled > 0 ? (totalWon / totalSettled) * 100 : 0;
  const netProfit = filteredHistory.reduce((acc, i) => acc + (i.profit || 0), 0);
  const avgOdds = totalSettled > 0
    ? (filteredHistory.reduce((acc, i) => acc + (i.odds || 0), 0) / totalSettled).toFixed(2)
    : "—";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header Strip with Title */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                📜
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {t("historyKicker")}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {t("historyTitle")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              {t("historySubtitle")}
            </p>
          </div>

          {/* Type Toggle: Individual Picks vs Parlays */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setHistoryType("picks")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
                historyType === "picks"
                  ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <span>🎯</span>
              <span>Pronósticos ({historyItems.length})</span>
            </button>
            <button
              onClick={() => setHistoryType("parlays")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
                historyType === "parlays"
                  ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <span>🎲</span>
              <span>Parlays ({parlayItems.length})</span>
            </button>
          </div>
        </div>

        {/* Top KPIs Summary Bar */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("historyEvaluated")}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {totalSettled}
              </span>
              <span className="text-xs font-bold text-slate-500">resueltos</span>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-xs dark:from-emerald-950/20 dark:to-slate-900 dark:border-emerald-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t("historyWinRate")}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {winRate.toFixed(1)}%
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {totalWon}W - {totalSettled - totalWon}L
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-xs dark:from-cyan-950/20 dark:to-slate-900 dark:border-cyan-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              {t("historyProfit")}
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
            {/* Timing Modality Filters (Pre-Match vs Live vs All vs MCP) */}
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
              onClick={() => setTimingFilter("PREMATCH")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                timingFilter === "PREMATCH"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
              }`}
            >
              📋 Pre-Match ({prematchCount})
            </button>

            <button
              onClick={() => setTimingFilter("MCP")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                timingFilter === "MCP"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
              }`}
            >
              🤖 Agente MCP ({mcpCount})
            </button>

            <button
              onClick={() => setTimingFilter("BOMBA")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                timingFilter === "BOMBA"
                  ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white font-black shadow-md border border-orange-400"
                  : "bg-orange-50 text-orange-900 border border-orange-200 hover:bg-orange-100 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800"
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
              {t("filterAll")}
            </button>
            <button
              onClick={() => setFilterResult("WON")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "WON"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
              }`}
            >
              {t("filterWon")} ({wonCount})
            </button>
            <button
              onClick={() => setFilterResult("LOST")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                filterResult === "LOST"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300"
              }`}
            >
              {t("filterLost")} ({lostCount})
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
              🗂️ {t("viewCards")}
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-lg px-2.5 py-1 text-xs font-black transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              📊 {t("viewTable")}
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mb-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por equipo o liga..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectDropdown
              label={t("filterLeagueLabel").replace(":", "")}
              options={leagueDropdownOptions}
              selected={selectedLeagues}
              onChange={setSelectedLeagues}
            />

            {marketDropdownOptions.length > 0 && (
              <MultiSelectDropdown
                label={t("filterMarketLabel").replace(":", "")}
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
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Content View: Picks or Parlays */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-4" />
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
              Cargando historial verificado y marcadores oficiales...
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
                Prueba ajustando los filtros de fecha, liga o modalidad de alerta.
              </p>
            </div>
          ) : viewMode === "cards" ? (
            /* Cards Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredHistory.map((item) => {
                const isWon = item.result === "WON";
                const isLive = item.isLive || item.matchTiming === "live";
                const conf = getConfidenceBadge(item.confidence, item.probability);
                const matchTime = item.kickoff ? new Date(item.kickoff).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";

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
                        {/* Live vs Pre-Match Badge */}
                        {isLive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                            <span>⚡ EN VIVO</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <span>🕒 PRE-MATCH</span>
                          </span>
                        )}

                        {/* MCP Agent Badge */}
                        {(item.isMcp || item.pickBadge === "mcp") && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                            <span>🤖 MCP</span>
                          </span>
                        )}

                        {/* Bomba Badge */}
                        {item.pickBadge === "bomba" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-orange-500 to-rose-500 px-2 py-0.5 text-[10px] font-black text-white shadow-xs">
                            <span>💣 BOMBA</span>
                          </span>
                        )}
                      </div>

                      {/* Result Pill */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black shadow-xs ${
                          isWon
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        <span>{isWon ? "✓" : "✗"}</span>
                        <span>{isWon ? t("wonBadge") : t("lostBadge")}</span>
                        <span className="text-[10px] font-bold opacity-90">
                          ({item.profit >= 0 ? `+${item.profit.toFixed(2)}` : item.profit.toFixed(2)}u)
                        </span>
                      </span>
                    </div>

                    {/* Match & Score */}
                    <div className="my-3.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5 flex-wrap gap-1">
                        <span className="truncate max-w-[200px]">{item.league} {item.country ? `• ${item.country}` : ""}</span>
                        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-extrabold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[10px]">
                          <span>📅 {item.date}</span>
                          {matchTime && <span className="text-emerald-700 dark:text-emerald-400 font-black">• ⏰ {matchTime}</span>}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate">
                          <span className="font-black text-slate-900 dark:text-white text-sm truncate">
                            {item.homeTeam}
                          </span>
                        </div>

                        <span className="text-xs font-extrabold text-slate-400 shrink-0">vs</span>

                        <div className="truncate text-right">
                          <span className="font-black text-slate-900 dark:text-white text-sm truncate">
                            {item.awayTeam}
                          </span>
                        </div>
                      </div>

                      {/* Official Score Strip */}
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-200 dark:bg-slate-950/60 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {t("colScore")}:
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-white tracking-wide">
                          {item.score}
                        </span>
                      </div>
                    </div>

                    {/* Market, Selection, Odds & Confidence */}
                    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">{t("marketLabel")}:</span>
                        <span className="font-black text-slate-900 dark:text-white">{item.market}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Selección:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{item.selection}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">{t("oddsLabel")}:</span>
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
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="p-3.5">Modalidad</th>
                    <th className="p-3.5">{t("colDate")}</th>
                    <th className="p-3.5">{t("colMatch")}</th>
                    <th className="p-3.5">{t("colScore")}</th>
                    <th className="p-3.5">{t("colMarket")}</th>
                    <th className="p-3.5">{t("colOdds")}</th>
                    <th className="p-3.5">{t("colProb")}</th>
                    <th className="p-3.5">{t("colResult")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredHistory.map((item) => {
                    const isWon = item.result === "WON";
                    const isLive = item.isLive || item.matchTiming === "live";

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="p-3.5 whitespace-nowrap">
                          {isLive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-black text-rose-600 dark:text-rose-400 border border-rose-500/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                              <span>LIVE</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              <span>PRE</span>
                            </span>
                          )}
                          {item.isMcp && (
                            <span className="ml-1 text-[10px] font-black text-purple-600 dark:text-purple-400">🤖 MCP</span>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap font-medium text-slate-500 dark:text-slate-400">
                          <div className="font-bold">{item.date}</div>
                          {item.kickoff && (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">
                              ⏰ {new Date(item.kickoff).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          <div>{item.match}</div>
                          <div className="text-[10px] font-medium text-slate-400">{item.league}</div>
                        </td>
                        <td className="p-3.5 font-black text-slate-900 dark:text-white whitespace-nowrap">
                          {item.score}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">
                          <div>{item.market}</div>
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">{item.selection}</div>
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
                            <span>{isWon ? t("wonBadge") : t("lostBadge")}</span>
                          </span>
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
                return (
                  <div
                    key={parlay.id}
                    className={`rounded-3xl border bg-white p-5 shadow-xs dark:bg-slate-900 ${
                      isWon
                        ? "border-emerald-500/30 dark:border-emerald-500/20"
                        : "border-rose-500/30 dark:border-rose-500/20"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div>
                        <span className="text-xs font-extrabold text-slate-400 block">{parlay.date}</span>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{parlay.title}</h4>
                      </div>
                      <span
                        className={`rounded-xl px-2.5 py-1 text-xs font-black ${
                          isWon ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                        }`}
                      >
                        {isWon ? "✓ PARLAY GANADO" : "✗ PARLAY PERDIDO"}
                      </span>
                    </div>

                    <div className="my-3 space-y-2">
                      {parlay.legs.map((leg, li) => (
                        <div
                          key={li}
                          className="flex items-center justify-between rounded-xl bg-slate-50 p-2 text-xs dark:bg-slate-950/60"
                        >
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{leg.match}</div>
                            <div className="text-[10px] text-slate-500">{leg.market} • {leg.league}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-slate-900 dark:text-white">@{leg.odds}</span>
                            <span className={`block text-[10px] font-bold ${leg.result === "WON" ? "text-emerald-600" : "text-rose-600"}`}>
                              {leg.result === "WON" ? "✓" : "✗"} ({leg.score})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                      <span className="font-bold text-slate-500">Cuota Total: @{parlay.totalOdds}</span>
                      <span className={`font-black ${isWon ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        Beneficio: {parlay.profit >= 0 ? `+${parlay.profit.toFixed(2)}` : parlay.profit.toFixed(2)} u
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>
    </div>
  );
}
