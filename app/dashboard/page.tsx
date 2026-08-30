"use client";

import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { useLanguage } from "@/context/LanguageContext";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";

export default function DashboardPage() {
  const { t } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Filters
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "tomorrow" | "week">("all");

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
      setSyncMessage("⚡ Consultando cuotas en vivo de casas de apuestas...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✓ ¡Listo! ${data.count} pronósticos actualizados.`);
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

  // Distinct lists
  const availableLeagueNames = Array.from(
    new Set([
      ...predictions.map((p) => p.league).filter(Boolean),
      ...SUPPORTED_LEAGUES.map((l) => l.name),
    ])
  ).sort();

  const availableMarketNames = Array.from(
    new Set(predictions.map((p) => p.market).filter(Boolean))
  ).sort();

  // Precise Local Calendar Day Filtering
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowDay = todayDay + 86400000;
  const weekEndDay = todayDay + 7 * 86400000;

  const filteredPredictions = predictions.filter((p) => {
    // League multi-select filter
    if (selectedLeagues.length > 0 && !selectedLeagues.includes(p.league)) {
      return false;
    }

    // Market multi-select filter
    if (selectedMarkets.length > 0 && !selectedMarkets.includes(p.market)) {
      return false;
    }

    // Date filter
    if (selectedDate === "today") {
      const d = new Date(p.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay !== todayDay) return false;
    } else if (selectedDate === "tomorrow") {
      const d = new Date(p.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay !== tomorrowDay) return false;
    } else if (selectedDate === "week") {
      const d = new Date(p.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay < todayDay || matchDay > weekEndDay) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      {/* Header */}
      <Navbar onSync={handleSyncPredictions} syncing={syncing} />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Sync feedback notification */}
        {syncMessage && (
          <div
            className={`mb-6 rounded-2xl p-3 text-center text-xs font-bold shadow-sm ${
              syncMessage.includes("✓")
                ? "bg-emerald-50 border border-emerald-300 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-300"
                : "bg-red-50 border border-red-300 text-red-800 dark:bg-red-950/80 dark:border-red-700 dark:text-red-300"
            }`}
          >
            {syncMessage}
          </div>
        )}

        {/* Dashboard Title & KPIs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              <span>📊</span>
              <span>{t("dashboardKicker")}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {t("dashboardTitle")}
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
              {t("dashboardSubtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 block font-semibold dark:text-slate-400">
                {t("statActivePicks")}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                {filteredPredictions.length}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 block font-semibold dark:text-slate-400">
                {t("statAvgOdds")}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-sky-600 dark:text-sky-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.odds, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(2)}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 block font-semibold dark:text-slate-400">
                {t("statAvgProb")}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.probability, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Compact Filters Toolbar */}
        <div className="mt-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          {/* Date Selector Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1 dark:text-slate-400">
              {t("filterDateLabel")}
            </span>
            <button
              onClick={() => setSelectedDate("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "all"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t("filterTimeAll")} ({predictions.length})
            </button>
            <button
              onClick={() => setSelectedDate("today")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "today"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t("filterTimeToday")}
            </button>
            <button
              onClick={() => setSelectedDate("tomorrow")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "tomorrow"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t("filterTimeTomorrow")}
            </button>
            <button
              onClick={() => setSelectedDate("week")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === "week"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t("filterTimeWeek")}
            </button>
          </div>

          {/* Multi-Select Dropdowns for Leagues & Markets */}
          <div className="flex flex-wrap items-center gap-2.5">
            <MultiSelectDropdown
              label="Ligas"
              icon="🏆"
              options={availableLeagueNames}
              selected={selectedLeagues}
              onChange={setSelectedLeagues}
              placeholderAll={t("allLeagues")}
            />

            <MultiSelectDropdown
              label="Mercados"
              icon="🎯"
              options={availableMarketNames}
              selected={selectedMarkets}
              onChange={setSelectedMarkets}
              placeholderAll={t("allMarkets")}
            />
          </div>
        </div>

        {/* Grid of Prediction Cards */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">{t("loadingSignals")}</p>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              {t("noPicksFound")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("noPicksHint")}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPredictions.map((pred) => (
              <PredictionCard key={pred.id || pred.fixtureId} prediction={pred} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
