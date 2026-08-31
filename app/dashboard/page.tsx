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

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  // Filters
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "tomorrow" | "week">("today");

  const loadSignals = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/signals");
      const json = await res.json();
      if (json.signals) {
        setPredictions(json.signals);
      }
    } catch (err) {
      console.error("Error loading signals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals();
  }, []);

  const handleSyncPredictions = async () => {
    try {
      setSyncing(true);
      setSyncMessage("⚡ Consultando partidos y cuotas en vivo de la API de Football...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✓ ¡Listo! ${data.count} pronósticos actualizados desde la API.`);
        await loadSignals();
      } else {
        setSyncMessage(`✗ Error: ${data.error || "No se pudo sincronizar"}`);
      }
    } catch {
      setSyncMessage("✗ Fallo de red al actualizar pronósticos");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  // Build classified league options grouped by Country
  const leagueDropdownOptions: DropdownOption[] = SUPPORTED_LEAGUES.map((l) => ({
    value: l.name,
    label: `${l.name} (${l.country})`,
    group: l.country,
    badge: l.tier ? `Div ${l.tier}` : undefined,
  }));

  // Append any unexpected leagues from prediction data
  predictions.forEach((p) => {
    if (p.league && !leagueDropdownOptions.some((opt) => opt.value === p.league)) {
      leagueDropdownOptions.push({
        value: p.league,
        label: p.league,
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

  const availableMarketNames = Array.from(
    new Set([...coreMarkets, ...predictions.map((p) => p.market).filter(Boolean)])
  );

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: language === "en" ? "⭐⭐⭐ Very High (≥75%)" : "⭐⭐⭐ Muy Alta (≥75%)" },
    { value: "alta", label: language === "en" ? "⭐⭐ High (65% - 74%)" : "⭐⭐ Alta (65% - 74%)" },
    { value: "media", label: language === "en" ? "⭐ Medium (55% - 64%)" : "⭐ Media (55% - 64%)" },
    { value: "baja", label: language === "en" ? "Low / Moderate (<55%)" : "Moderada / Baja (<55%)" },
  ];

  const marketDropdownOptions: DropdownOption[] = availableMarketNames.map((m) => ({
    value: m,
    label: m,
  }));

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

  const todayCount = predictions.filter((p) => getLocalDateStr(p.kickoff) === todayStr).length;
  const tomorrowCount = predictions.filter((p) => getLocalDateStr(p.kickoff) === tomorrowStr).length;

  const filteredPredictions = predictions.filter((p) => {
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

    if (selectedConfidence.length > 0) {
      const isMatch = selectedConfidence.some((c) => {
        if (c === "muy_alta") return p.confidence === "Muy Alta" || p.probability >= 75;
        if (c === "alta") return p.confidence === "Alta" || (p.probability >= 65 && p.probability < 75);
        if (c === "media") return p.confidence === "Media" || (p.probability >= 55 && p.probability < 65);
        if (c === "baja") return p.confidence === "Baja" || p.probability < 55;
        return false;
      });
      if (!isMatch) return false;
    }

    if (selectedMarkets.length > 0) {
      const match = selectedMarkets.some((m) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = p.market.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normActual.includes(normSelected) ||
          normSelected.includes(normActual) ||
          (m.includes("BTTS") && (p.market.includes("Ambos") || p.market.includes("BTTS")))
        );
      });
      if (!match) return false;
    }

    const matchDateStr = getLocalDateStr(p.kickoff);
    const matchTimeMs = new Date(p.kickoff).getTime();

    if (selectedDate === "today") {
      if (matchDateStr !== todayStr) return false;
    } else if (selectedDate === "tomorrow") {
      if (matchDateStr !== tomorrowStr) return false;
    } else if (selectedDate === "week") {
      if (matchTimeMs < todayStartMs || matchTimeMs > weekEndMs) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      {/* Header */}
      <Navbar onSync={handleSyncPredictions} syncing={syncing} />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        {/* Sync feedback notification */}
        {syncMessage && (
          <div
            className={`rounded-2xl p-3 text-center text-xs font-bold shadow-sm ${
              syncMessage.includes("✓")
                ? "bg-emerald-50 border border-emerald-300 text-emerald-900 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-300"
                : "bg-red-50 border border-red-300 text-red-900 dark:bg-red-950/80 dark:border-red-700 dark:text-red-300"
            }`}
          >
            {syncMessage}
          </div>
        )}

        {/* Recommended Parlay Banner */}
        <RecommendedParlay
          predictions={predictions}
          onSelectPrediction={(p) => setActiveModalPick(p)}
        />

        {/* Dashboard Title & KPIs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
              <span>📊</span>
              <span>{t("dashboardKicker")}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {t("dashboardTitle")}
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              {t("dashboardSubtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                {t("statActivePicks")}
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {filteredPredictions.length}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                {t("statAvgOdds")}
              </span>
              <span className="text-sm sm:text-base font-black text-sky-700 dark:text-sky-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.odds, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(2)}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                {t("statAvgProb")}
              </span>
              <span className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.probability, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Compact Filters Toolbar */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          {/* Date Selector Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">
              {t("filterDateLabel")}
            </span>
            <button
              onClick={() => setSelectedDate("today")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "today"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              📅 {t("filterTimeToday")} ({todayCount})
            </button>
            <button
              onClick={() => setSelectedDate("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "all"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              {t("filterTimeAll")} ({predictions.length})
            </button>
            <button
              onClick={() => setSelectedDate("tomorrow")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "tomorrow"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              🔥 {t("filterTimeTomorrow")} ({tomorrowCount})
            </button>
            <button
              onClick={() => setSelectedDate("week")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "week"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              🗓️ {t("filterTimeWeek")}
            </button>
          </div>

          {/* Multi-Select Dropdowns for Classified Leagues, Confidence & Markets */}
          <div className="flex flex-wrap items-center gap-2.5">
            <MultiSelectDropdown
              label="Ligas por País"
              icon="🏆"
              options={leagueDropdownOptions}
              selected={selectedLeagues}
              onChange={setSelectedLeagues}
              placeholderAll={t("allLeagues")}
            />

            <MultiSelectDropdown
              label="4 Niveles de Confianza"
              icon="⭐"
              options={confidenceDropdownOptions}
              selected={selectedConfidence}
              onChange={setSelectedConfidence}
              placeholderAll={language === "en" ? "All Confidence Levels" : "Todas las Confianzas"}
            />

            <MultiSelectDropdown
              label="Mercados"
              icon="🎯"
              options={marketDropdownOptions}
              selected={selectedMarkets}
              onChange={setSelectedMarkets}
              placeholderAll={t("allMarkets")}
            />
          </div>
        </div>

        {/* Grid of Prediction Cards (items-start prevents vertical distortion) */}
        {loading ? (
          <div className="py-20 text-center text-slate-600">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent dark:border-emerald-500" />
            <p className="mt-3 text-sm font-semibold">{t("loadingSignals")}</p>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              {t("noPicksFound")}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {selectedDate === "today" && todayCount === 0
                ? "No hay partidos programados para hoy en las ligas activas. Prueba seleccionando 'Mañana' o 'Todos los Días'."
                : t("noPicksHint")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {filteredPredictions.map((pred) => (
              <PredictionCard
                key={pred.id || `${pred.fixtureId}-${pred.market}`}
                prediction={pred}
                onOpenDetail={(p) => setActiveModalPick(p)}
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
