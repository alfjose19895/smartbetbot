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

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  // Filters (exclusively for Today's Alertas)
  const [matchStatusFilter, setMatchStatusFilter] = useState<"ALL" | "VALOR" | "BOMBA" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);

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
      setSyncMessage("⚡ Consultando los mejores partidos y cuotas del día en API-Football (Ecuador UTC-5)...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✓ ¡Sincronización exitosa! ${data.count} alertas cuantitativas de alta precisión generadas.`);
        await loadSignals();
      } else {
        setSyncMessage(`⚠️ ${data.message || "Error al sincronizar"}`);
      }
    } catch {
      setSyncMessage("❌ Error de conexión al sincronizar");
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

  predictions.forEach((p) => {
    if (p.league && !leagueDropdownOptions.some((opt) => opt.value === p.league)) {
      leagueDropdownOptions.push({
        value: p.league,
        label: p.league,
        group: p.country || "Competiciones Oficiales",
      });
    }
  });

  const coreMarkets = [
    "Gana Local",
    "Empate (X)",
    "Gana Visitante",
    "Over 2.5 Goles",
    "Under 2.5 Goles",
    "Ambos Marcan (BTTS)",
    "Over 8.5 Córners",
    "Over 3.5 Tarjetas",
  ];

  const availableMarkets = Array.from(
    new Set([...coreMarkets, ...predictions.map((p) => p.market).filter(Boolean)])
  );

  const marketDropdownOptions: DropdownOption[] = availableMarkets.map((m) => ({
    value: m,
    label: m,
  }));

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: language === "en" ? "⭐⭐⭐ Very High (≥75%)" : "⭐⭐⭐ Muy Alta (≥75%)" },
    { value: "alta", label: language === "en" ? "⭐⭐ High (68% - 74%)" : "⭐⭐ Alta (68% - 74%)" },
  ];

  const now = new Date();
  const formattedToday = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Count matches by status & badge
  const scheduledCount = predictions.filter((p) => getMatchLiveStatus(p.kickoff) === "SCHEDULED").length;
  const inPlayCount = predictions.filter((p) => getMatchLiveStatus(p.kickoff) === "IN_PLAY").length;
  const finishedCount = predictions.filter((p) => getMatchLiveStatus(p.kickoff) === "FINISHED").length;
  const wonCount = predictions.filter((p) => p.status === "won").length;
  const lostCount = predictions.filter((p) => p.status === "lost").length;
  const valorCount = predictions.filter((p) => p.pickBadge === "valor" || p.probability >= 76).length;
  const bombaCount = predictions.filter((p) => p.pickBadge === "bomba" || p.odds >= 2.05).length;

  const filteredPredictions = predictions.filter((p) => {
    // Result, Badge & Status Filter (Valor, Bomba, Ganadas, Perdidas, En Juego, Por Comenzar, Finalizadas, Todas)
    if (matchStatusFilter === "VALOR") {
      if (p.pickBadge !== "valor" && p.probability < 76) return false;
    } else if (matchStatusFilter === "BOMBA") {
      if (p.pickBadge !== "bomba" && p.odds < 2.05) return false;
    } else if (matchStatusFilter === "WON") {
      if (p.status !== "won") return false;
    } else if (matchStatusFilter === "LOST") {
      if (p.status !== "lost") return false;
    } else if (matchStatusFilter !== "ALL") {
      const status = getMatchLiveStatus(p.kickoff);
      if (status !== matchStatusFilter) return false;
    }

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
        if (c === "alta") return p.confidence === "Alta" || (p.probability >= 68 && p.probability < 75);
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

    return true;
  });

  const displayPicks = filteredPredictions;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
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

        {/* Dashboard Title & KPIs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
              <span>🎯</span>
              <span className="capitalize">{formattedToday} • Alertas de Alta Precisión (≥85% Win Rate Target)</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {t("dashboardTitle")}
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Pronósticos altamente filtrados priorizando Ligas Top y Ligas Europeas de élite
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                Alertas del Día
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {displayPicks.length}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                {t("statAvgOdds")}
              </span>
              <span className="text-sm sm:text-base font-black text-sky-700 dark:text-sky-400">
                {(
                  displayPicks.reduce((acc, p) => acc + p.odds, 0) /
                  (displayPicks.length || 1)
                ).toFixed(2)}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 border border-slate-200 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-600 block font-bold dark:text-slate-400">
                {t("statAvgProb")}
              </span>
              <span className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-400">
                {(
                  displayPicks.reduce((acc, p) => acc + p.probability, 0) /
                  (displayPicks.length || 1)
                ).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Match Status Filter Buttons */}
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
            🌟 Todos ({predictions.length})
          </button>
          <button
            onClick={() => setMatchStatusFilter("VALOR")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "VALOR"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 border border-emerald-400"
                : "bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900"
            }`}
          >
            💎 Valor ({valorCount})
          </button>
          <button
            onClick={() => setMatchStatusFilter("BOMBA")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "BOMBA"
                ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white font-black shadow-md shadow-orange-500/30 border border-orange-400"
                : "bg-orange-50 text-orange-900 border border-orange-200 hover:bg-orange-100 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800 dark:hover:bg-orange-900"
            }`}
          >
            💣 Bomba ({bombaCount})
          </button>
          <button
            onClick={() => setMatchStatusFilter("WON")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "WON"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900"
            }`}
          >
            ✓ Ganadas ({wonCount})
          </button>
          <button
            onClick={() => setMatchStatusFilter("LOST")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "LOST"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900"
            }`}
          >
            ✗ Perdidas ({lostCount})
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

        {/* Filters Toolbar */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <span>💎</span>
              <span>Partidos Analizados de Máxima Seguridad de la Jornada</span>
            </span>
          </div>

          {/* Multi-Select Dropdowns */}
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
              label="Nivel de Confianza"
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

        {/* Grid of Prediction Cards */}
        {loading ? (
          <div className="py-20 text-center text-slate-600">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent dark:border-emerald-500" />
            <p className="mt-3 text-sm font-semibold">{t("loadingSignals")}</p>
          </div>
        ) : displayPicks.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              {t("noPicksFound")}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {t("noPicksHint")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {displayPicks.map((pred) => (
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
