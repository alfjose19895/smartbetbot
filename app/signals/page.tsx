"use client";

import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { RecommendedParlay } from "@/components/RecommendedParlay";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { useLanguage } from "@/context/LanguageContext";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";

export default function SignalsPage() {
  const { language } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  // Filters
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [minProbability, setMinProbability] = useState<number>(55);
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "tomorrow" | "week">("today");

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
        group: "Otras Ligas",
      });
    }
  });

  // Core markets
  const coreMarkets = [
    "Gana Local",
    "Gana Visitante",
    "Ambos Marcan (BTTS)",
    "Over 2.5 Goles",
    "Under 2.5 Goles",
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
    { value: "alta", label: language === "en" ? "⭐⭐ High (65% - 74%)" : "⭐⭐ Alta (65% - 74%)" },
    { value: "media", label: language === "en" ? "⭐ Medium (55% - 64%)" : "⭐ Media (55% - 64%)" },
    { value: "baja", label: language === "en" ? "Low / Moderate (<55%)" : "Moderada / Baja (<55%)" },
  ];

  // Local calendar date helper (YYYY-MM-DD in local time)
  const getLocalDateStr = (d: Date | string) => {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const todayStr = getLocalDateStr(now);

  const tomorrowObj = new Date(now);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = getLocalDateStr(tomorrowObj);

  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekEndMs = todayStartMs + 7 * 86400000;

  const todayCount = signals.filter((s) => getLocalDateStr(s.kickoff) === todayStr).length;
  const tomorrowCount = signals.filter((s) => getLocalDateStr(s.kickoff) === tomorrowStr).length;

  // Filter signals
  const filteredCandidates = signals.filter((s) => {
    // 1. Min probability slider filter
    if (s.probability < minProbability) return false;

    // 2. League filter
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

    // 3. 4-tier Confidence filter
    if (selectedConfidence.length > 0) {
      const isMatch = selectedConfidence.some((c) => {
        if (c === "muy_alta") return s.confidence === "Muy Alta" || s.probability >= 75;
        if (c === "alta") return s.confidence === "Alta" || (s.probability >= 65 && s.probability < 75);
        if (c === "media") return s.confidence === "Media" || (s.probability >= 55 && s.probability < 65);
        if (c === "baja") return s.confidence === "Baja" || s.probability < 55;
        return false;
      });
      if (!isMatch) return false;
    }

    // 4. Market filter
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

    // 5. Date filter
    const matchDateStr = getLocalDateStr(s.kickoff);
    const matchTimeMs = new Date(s.kickoff).getTime();

    if (selectedDate === "today") {
      if (matchDateStr !== todayStr) return false;
    } else if (selectedDate === "tomorrow") {
      if (matchDateStr !== tomorrowStr) return false;
    } else if (selectedDate === "week") {
      if (matchTimeMs < todayStartMs || matchTimeMs > weekEndMs) return false;
    }

    return true;
  });

  // Sort strictly by highest probability & confidence/smartScore, closing strictly at Top 30 daily picks
  const sortedSignals = [...filteredCandidates].sort((a, b) => {
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    return (b.smartScore || 0) - (a.smartScore || 0) || b.odds - a.odds;
  });

  const top30Picks = sortedSignals.slice(0, 30);

  const avgOdds = top30Picks.length > 0
    ? (top30Picks.reduce((acc, p) => acc + p.odds, 0) / top30Picks.length).toFixed(2)
    : "0.00";

  const avgProb = top30Picks.length > 0
    ? (top30Picks.reduce((acc, p) => acc + p.probability, 0) / top30Picks.length).toFixed(0)
    : "0";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      {/* Header */}
      <Navbar />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        {/* Recommended Parlay (Parley Combinado del Día) */}
        <RecommendedParlay
          predictions={signals}
          onSelectPrediction={(p) => setActiveModalPick(p)}
        />

        {/* Title & Stats Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
              <span>🎯</span>
              <span>Top 30 Pronósticos del Día</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Picks Deportivos de Máxima Rentabilidad
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Análisis cuantitativo de cuotas del día con jerarquía Elo, H2H y 4 niveles de confianza
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                Picks Visibles
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {top30Picks.length} / 30
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

        {/* Date Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">Fecha:</span>
          <button
            onClick={() => setSelectedDate("today")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedDate === "today"
                ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
            }`}
          >
            📅 Partidos de Hoy ({todayCount})
          </button>
          <button
            onClick={() => setSelectedDate("all")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedDate === "all"
                ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
            }`}
          >
            🌟 Todos los Picks ({signals.length})
          </button>
          <button
            onClick={() => setSelectedDate("tomorrow")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedDate === "tomorrow"
                ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
            }`}
          >
            🔥 Mañana ({tomorrowCount})
          </button>
          <button
            onClick={() => setSelectedDate("week")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedDate === "week"
                ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
            }`}
          >
            🗓️ Esta Semana
          </button>
        </div>

        {/* Filter Controls Bar: Leagues, 4 Confidence Levels, Markets, Min Probability */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          {/* Probability Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Probabilidad Mínima:</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50"
                max="85"
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
              label="4 Niveles de Confianza"
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

        {/* Signals List (Top 30) */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando los 30 mejores pronósticos...</p>
          </div>
        ) : top30Picks.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin resultados</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ajusta los filtros de ligas, confianza o mercados para ver más pronósticos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {top30Picks.map((signal) => (
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
