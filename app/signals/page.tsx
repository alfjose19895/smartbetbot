"use client";

import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";
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

export default function SignalsPage() {
  const { language } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<"ALL" | "SCHEDULED" | "IN_PLAY" | "FINISHED">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [minProbability, setMinProbability] = useState<number>(50);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/signals");
        const json = await res.json();
        if (json.signals) {
          setSignals(json.signals);
        }
      } catch (err) {
        console.error("Error fetching signals:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, []);

  // Build classified league options grouped by Country
  const leagueDropdownOptions: DropdownOption[] = SUPPORTED_LEAGUES.map((l) => ({
    value: l.name,
    label: `${l.name} (${l.country})`,
    group: l.country,
    badge: l.tier ? `Div ${l.tier}` : undefined,
  }));

  signals.forEach((s) => {
    if (s.league && !leagueDropdownOptions.some((opt) => opt.value === s.league)) {
      leagueDropdownOptions.push({
        value: s.league,
        label: s.league,
        group: s.country || "Competiciones Oficiales",
      });
    }
  });

  const coreMarkets = [
    "Doble Oportunidad (1X)",
    "Doble Oportunidad (X2)",
    "Over 1.5 Goles",
    "Over 2.5 Goles",
    "Over 3.5 Goles",
    "Under 2.5 Goles",
    "Under 3.5 Goles",
    "Over 8.5 Córners",
    "Over 3.5 Tarjetas",
    "Gana Local",
    "Gana Visitante",
    "Ambos Marcan (BTTS)",
  ];

  const availableMarketNames = Array.from(
    new Set([...coreMarkets, ...signals.map((s) => s.market).filter(Boolean)])
  );

  const marketDropdownOptions: DropdownOption[] = availableMarketNames.map((m) => ({
    value: m,
    label: m,
  }));

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: language === "en" ? "⭐⭐⭐ Very High (≥75%)" : "⭐⭐⭐ Muy Alta (≥75%)" },
    { value: "alta", label: language === "en" ? "⭐⭐ High (68% - 74%)" : "⭐⭐ Alta (68% - 74%)" },
    { value: "media", label: language === "en" ? "⭐ Medium (60% - 67%)" : "⭐ Media (60% - 67%)" },
  ];

  const now = new Date();
  const formattedToday = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Count matches by status
  const scheduledCount = signals.filter((s) => getMatchLiveStatus(s.kickoff) === "SCHEDULED").length;
  const inPlayCount = signals.filter((s) => getMatchLiveStatus(s.kickoff) === "IN_PLAY").length;
  const finishedCount = signals.filter((s) => getMatchLiveStatus(s.kickoff) === "FINISHED").length;

  // Filter signals strictly for today's matches
  const filteredCandidates = signals.filter((s) => {
    // 1. Text Search Query Filter
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = (s.match || "").toLowerCase();
      const homeText = (s.homeTeam || "").toLowerCase();
      const awayText = (s.awayTeam || "").toLowerCase();
      const leagueText = (s.league || "").toLowerCase();
      const countryText = (s.country || "").toLowerCase();
      const marketText = (s.market || "").toLowerCase();

      const matched =
        matchText.includes(q) ||
        homeText.includes(q) ||
        awayText.includes(q) ||
        leagueText.includes(q) ||
        countryText.includes(q) ||
        marketText.includes(q);

      if (!matched) return false;
    }

    // 2. Match Live Status Filter
    if (matchStatusFilter !== "ALL") {
      const status = getMatchLiveStatus(s.kickoff);
      if (status !== matchStatusFilter) return false;
    }

    // 3. Min probability slider filter
    if (s.probability < minProbability) return false;

    // 4. League filter
    if (selectedLeagues.length > 0) {
      const normLeague = (s.league || "").toLowerCase().trim();
      const normCountry = (s.country || "").toLowerCase().trim();
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

    // 5. Confidence filter
    if (selectedConfidence.length > 0) {
      const isMatch = selectedConfidence.some((c) => {
        if (c === "muy_alta") return s.confidence === "Muy Alta" || s.probability >= 75;
        if (c === "alta") return s.confidence === "Alta" || (s.probability >= 68 && s.probability < 75);
        if (c === "media") return s.confidence === "Media" || (s.probability >= 60 && s.probability < 68);
        return false;
      });
      if (!isMatch) return false;
    }

    // 6. Market filter
    if (selectedMarkets.length > 0) {
      const match = selectedMarkets.some((m) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = s.market.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normActual.includes(normSelected) ||
          normSelected.includes(normActual) ||
          (m.includes("BTTS") && (s.market.includes("Ambos") || s.market.includes("BTTS")))
        );
      });
      if (!match) return false;
    }

    return true;
  });

  const sortedSignals = [...filteredCandidates].sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) {
      return aTier - bTier;
    }
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    return (b.smartScore || 0) - (a.smartScore || 0) || b.odds - a.odds;
  });

  const displayPicks = sortedSignals;

  const avgOdds = displayPicks.length > 0
    ? (displayPicks.reduce((acc, p) => acc + p.odds, 0) / displayPicks.length).toFixed(2)
    : "0.00";

  const avgProb = displayPicks.length > 0
    ? (displayPicks.reduce((acc, p) => acc + p.probability, 0) / displayPicks.length).toFixed(0)
    : "0";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        {/* Title & Stats Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
              <span>🎯</span>
              <span className="capitalize">{formattedToday} • Alertas de Alta Precisión (≥85% Win Rate Target)</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Picks y Alertas Cuantitativas de la Jornada
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Pronósticos de máxima certeza estadística priorizando Ligas Top y Ligas Europeas de élite
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                Picks Filtrados
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {displayPicks.length}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                Cuota Promedio
              </span>
              <span className="text-sm sm:text-base font-black text-sky-700 dark:text-sky-400">
                {avgOdds}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                Prob. Media
              </span>
              <span className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-400">
                {avgProb}%
              </span>
            </div>
          </div>
        </div>

        {/* Search Input and Filter Controls Bar */}
        <div className="space-y-3">
          {/* Instant Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Buscar equipo o liga (ej. Real Madrid, Arsenal, Chelsea, La Liga, Premier League)..."
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

          {/* Match Status Quick Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
            <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">Estado del Partido:</span>
            <button
              onClick={() => setMatchStatusFilter("ALL")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                matchStatusFilter === "ALL"
                  ? "bg-slate-900 text-white dark:bg-slate-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              🌟 Todos ({signals.length})
            </button>
            <button
              onClick={() => setMatchStatusFilter("SCHEDULED")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                matchStatusFilter === "SCHEDULED"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              ⏳ Por Comenzar ({scheduledCount})
            </button>
            <button
              onClick={() => setMatchStatusFilter("IN_PLAY")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                matchStatusFilter === "IN_PLAY"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              🔴 En Juego ({inPlayCount})
            </button>
            <button
              onClick={() => setMatchStatusFilter("FINISHED")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                matchStatusFilter === "FINISHED"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              🏁 Finalizados ({finishedCount})
            </button>
          </div>

          {/* Filter Dropdowns & Slider */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
            {/* Probability Slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Probabilidad Mínima:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="50"
                  max="90"
                  step="5"
                  value={minProbability}
                  onChange={(e) => setMinProbability(Number(e.target.value))}
                  className="h-2 w-28 cursor-pointer accent-emerald-500"
                />
                <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                  {minProbability}%
                </span>
              </div>
            </div>

            {/* Multi-Select Dropdowns */}
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
                label="Nivel de Confianza"
                icon="⭐"
                options={confidenceDropdownOptions}
                selected={selectedConfidence}
                onChange={setSelectedConfidence}
                placeholderAll="Todas las Confianzas"
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
        </div>

        {/* Signals List */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Analizando pronósticos de alta precisión...</p>
          </div>
        ) : displayPicks.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin resultados para hoy</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {searchQuery ? `No encontramos partidos que coincidan con "${searchQuery}".` : "Ajusta los filtros de estado, ligas, confianza o mercados para ver más pronósticos del día."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {displayPicks.map((signal) => (
              <PredictionCard
                key={signal.id || `${signal.fixtureId}-${signal.market}`}
                prediction={signal}
                onOpenDetail={(p) => setActiveModalPick(p)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}
    </div>
  );
}
