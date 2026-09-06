"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { PredictionCard } from "@/components/PredictionCard";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { useLanguage } from "@/context/LanguageContext";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";

function getMatchLiveStatus(kickoff: string): "SCHEDULED" | "IN_PLAY" | "FINISHED" {
  if (!kickoff) return "SCHEDULED";
  const nowMs = Date.now();
  const kickoffMs = new Date(kickoff).getTime();
  const diffMinutes = Math.floor((nowMs - kickoffMs) / 60000);

  if (diffMinutes < 0) return "SCHEDULED";
  if (diffMinutes >= 0 && diffMinutes <= 120) return "IN_PLAY";
  return "FINISHED";
}

export default function LiveAlertsPage() {
  const { language, t } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [secondsUntilNextPoll, setSecondsUntilNextPoll] = useState(15);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);

  const loadLiveSignals = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const res = await fetch("/api/live");
      const json = await res.json();
      if (json.signals && Array.isArray(json.signals)) {
        setPredictions(json.signals);
        setLastRefreshed(new Date());
        setSecondsUntilNextPoll(15);
      }
    } catch (err) {
      console.error("Error fetching live signals:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveSignals(true);
  }, [loadLiveSignals]);

  // 15-second polling timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsUntilNextPoll((prev) => {
        if (prev <= 1) {
          loadLiveSignals(false);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loadLiveSignals]);

  // Extract all currently live matches
  const liveMatches = predictions.filter(
    (p) => p.matchTiming === "live" || Boolean(p.currentScore) || getMatchLiveStatus(p.kickoff) === "IN_PLAY"
  );

  // Filtered live matches
  const filteredLiveMatches = liveMatches.filter((p) => {
    // 1. Text Search
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = `${p.match} ${p.homeTeam} ${p.awayTeam} ${p.league} ${p.market} ${p.country || ""}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    // 2. League Filter
    if (selectedLeagues.length > 0) {
      const normLeague = (p.league || "").toLowerCase().trim();
      const normCountry = (p.country || "").toLowerCase().trim();
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

    // 3. Market Filter
    if (selectedMarkets.length > 0) {
      const match = selectedMarkets.some((m) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = p.market.toLowerCase().replace(/[^a-z0-9]/g, "");
        return normActual.includes(normSelected) || normSelected.includes(normActual);
      });
      if (!match) return false;
    }

    // 4. Confidence Filter
    if (selectedConfidence.length > 0) {
      const isMatch = selectedConfidence.some((c) => {
        if (c === "muy_alta") return p.confidence === "Muy Alta" || p.probability >= 70;
        if (c === "alta") return p.confidence === "Alta" || (p.probability >= 55 && p.probability < 70);
        return false;
      });
      if (!isMatch) return false;
    }

    return true;
  });

  // Calculate live statistics
  const avgOdds = liveMatches.length > 0
    ? (liveMatches.reduce((acc, p) => acc + p.odds, 0) / liveMatches.length).toFixed(2)
    : "—";

  const avgProb = liveMatches.length > 0
    ? (liveMatches.reduce((acc, p) => acc + p.probability, 0) / liveMatches.length).toFixed(1)
    : "—";

  const mcpLiveCount = liveMatches.filter((p) => p.pickBadge === "mcp" || p.explanation?.includes("MCP")).length;

  // Build classified dropdown options
  const leagueDropdownOptions: DropdownOption[] = SUPPORTED_LEAGUES.map((l) => ({
    value: l.name,
    label: `${l.name} (${l.country})`,
    group: l.country,
  }));

  liveMatches.forEach((p) => {
    if (p.league && !leagueDropdownOptions.some((opt) => opt.value === p.league)) {
      leagueDropdownOptions.push({
        value: p.league,
        label: p.league,
        group: p.country || "En Juego",
      });
    }
  });

  const availableMarkets = Array.from(new Set(liveMatches.map((p) => p.market).filter(Boolean)));
  const marketDropdownOptions: DropdownOption[] = availableMarkets.map((m) => ({
    value: m,
    label: m,
  }));

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: language === "en" ? "⭐⭐⭐ Very High (≥70%)" : "⭐⭐⭐ Muy Alta (≥70%)" },
    { value: "alta", label: language === "en" ? "⭐⭐ High (55% - 69%)" : "⭐⭐ Alta (55% - 69%)" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header Strip with Live Ping & Auto-refresh status */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-500/20 text-rose-500">
                ⚡
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">
                {t("liveKicker")}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-600 dark:text-rose-400 border border-rose-500/30">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                <span>RADAR EN VIVO</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {t("liveTitle")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              {t("liveSubtitle")}
            </p>
          </div>

          {/* Polling & Refresh Actions */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Auto-Sync en:</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400">{secondsUntilNextPoll}s</span>
            </div>

            <button
              onClick={() => loadLiveSignals(false)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-black text-rose-600 hover:bg-rose-500/20 transition dark:text-rose-400 cursor-pointer"
            >
              <span>🔄</span>
              <span>Refrescar Ahora</span>
            </button>
          </div>
        </div>

        {/* Live Top Metrics Cards */}
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-50 to-white p-4 shadow-xs dark:from-rose-950/20 dark:to-slate-900/60 dark:border-rose-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
              Partidos En Juego
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {liveMatches.length}
              </span>
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">activos</span>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-xs dark:from-emerald-950/20 dark:to-slate-900/60 dark:border-emerald-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span>🎯</span> Cuota Promedio Live
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                @{avgOdds}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">valor in-play</span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-xs dark:from-cyan-950/20 dark:to-slate-900/60 dark:border-cyan-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
              <span>⚡</span> Probabilidad Media
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {avgProb}%
              </span>
              <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">algoritmo</span>
            </div>
          </div>

          <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-50 to-white p-4 shadow-xs dark:from-purple-950/20 dark:to-slate-900/60 dark:border-purple-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <span>🤖</span> Alertas Agente MCP
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {mcpLiveCount}
              </span>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">en vivo</span>
            </div>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mb-6 flex flex-col md:flex-row flex-wrap items-stretch md:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar equipo o torneo en vivo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-rose-500 focus:bg-white focus:ring-1 focus:ring-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectDropdown
              label="Ligas en Juego"
              options={leagueDropdownOptions}
              selected={selectedLeagues}
              onChange={setSelectedLeagues}
              
              
              
            />

            {marketDropdownOptions.length > 0 && (
              <MultiSelectDropdown
                label="Mercados"
                options={marketDropdownOptions}
                selected={selectedMarkets}
                onChange={setSelectedMarkets}
                
                
              />
            )}

            <MultiSelectDropdown
              label="Confianza"
              options={confidenceDropdownOptions}
              selected={selectedConfidence}
              onChange={setSelectedConfidence}
              
              
            />

            {(selectedLeagues.length > 0 || selectedMarkets.length > 0 || selectedConfidence.length > 0 || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedLeagues([]);
                  setSelectedMarkets([]);
                  setSelectedConfidence([]);
                  setSearchQuery("");
                }}
                className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750 cursor-pointer"
              >
                Limpiar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Live Grid or Empty State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-500 border-t-transparent mb-4" />
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
              Conectando con el radar de partidos en vivo...
            </span>
          </div>
        ) : filteredLiveMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900/30">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 text-4xl dark:bg-rose-950/40 mb-4">
              <span className="relative z-10">📡</span>
              <span className="absolute h-full w-full rounded-3xl bg-rose-400/20 animate-ping pointer-events-none" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {t("noLiveMatches")}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mt-1 mb-5">
              {t("noLiveMatchesHint")}
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/signals"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-md hover:bg-emerald-500 transition cursor-pointer"
              >
                <span>📋</span>
                <span>Explorar Alertas Pre-Match</span>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <span>📊</span>
                <span>Ir al Dashboard</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredLiveMatches.map((pred) => (
              <PredictionCard
                key={pred.id || `${pred.fixtureId}-${pred.market}`}
                prediction={pred}
                onOpenDetail={setActiveModalPick}
              />
            ))}
          </div>
        )}
      </main>

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
