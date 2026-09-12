"use client";

import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";
import Link from "next/link";
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

function matchesStatusBadgeFilter(
  p: MarketOpportunity,
  filter: "ALL" | "VALOR" | "BOMBA" | "MCP" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED"
): boolean {
  const isWon = p.status === "won" || (p as any).result === "WON" || (p.status as string) === "WON";
  const isLost = p.status === "lost" || (p as any).result === "LOST" || (p.status as string) === "LOST";
  const isMcp = Boolean(p.isMcp || p.isMcpPick || p.source === "mcp" || p.pickBadge === "mcp" || (p.explanation && p.explanation.includes("MCP")));

  if (filter === "ALL") return true;
  if (filter === "VALOR") return p.pickBadge === "valor";
  if (filter === "BOMBA") return p.pickBadge === "bomba";
  if (filter === "MCP") return isMcp;
  if (filter === "WON") return isWon;
  if (filter === "LOST") return isLost;
  if (filter === "IN_PLAY") {
    return p.matchTiming === "live" || Boolean(p.currentScore) || getMatchLiveStatus(p.kickoff) === "IN_PLAY";
  }
  if (filter === "SCHEDULED") {
    return !isWon && !isLost && (p.matchTiming === "prematch" || (!p.currentScore && getMatchLiveStatus(p.kickoff) === "SCHEDULED"));
  }
  if (filter === "FINISHED") {
    return isWon || isLost || (getMatchLiveStatus(p.kickoff) === "FINISHED" && p.matchTiming !== "live");
  }
  return true;
}

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  // Filters (exclusively for Today's Alertas)
  const [matchStatusFilter, setMatchStatusFilter] = useState<"ALL" | "VALOR" | "BOMBA" | "MCP" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED">("ALL");
  const [minProbability, setMinProbability] = useState<number>(35);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);

  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.role === "admin") {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  const loadSignals = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/signals");
      const json = await res.json();
      let serverSignals: MarketOpportunity[] = Array.isArray(json.signals) ? [...json.signals] : [];

      try {
        const localRaw = typeof window !== "undefined" ? localStorage.getItem("smartbetbot_published_picks") : null;
        if (localRaw) {
          const localPicks = JSON.parse(localRaw);
          if (Array.isArray(localPicks)) {
            const map = new Map<string, MarketOpportunity>();
            for (const p of serverSignals) {
              const key = `${p.fixtureId || 0}-${p.homeTeam}-${p.awayTeam}-${p.market}`;
              map.set(key, p);
            }
            for (const lp of localPicks) {
              const key = `${lp.fixtureId || 0}-${lp.homeTeam}-${lp.awayTeam}-${lp.market}`;
              map.set(key, { ...lp, isMcpPick: true, pickBadge: lp.pickBadge || "mcp" });
            }
            serverSignals = Array.from(map.values());
            serverSignals.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
          }
        }
      } catch (err) {
        console.warn("Could not merge local published picks in dashboard:", err);
      }

      setPredictions(serverSignals);
    } catch (err) {
      console.error("Error loading signals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals();
    const handleUpdated = () => {
      loadSignals();
    };
    window.addEventListener("predictions-updated", handleUpdated);
    window.addEventListener("storage", handleUpdated);
    return () => {
      window.removeEventListener("predictions-updated", handleUpdated);
      window.removeEventListener("storage", handleUpdated);
    };
  }, []);

  const handleSyncPredictions = async () => {
    try {
      setSyncing(true);
      setSyncMessage("⚡ Consultando los mejores partidos y cuotas del día en API-Football...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh: true, refreshRemaining: true }),
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

  const handleRefreshRemainingAlerts = async () => {
    try {
      setSyncing(true);
      setSyncMessage("🔄 Analizando mercado y buscando nuevas alertas de confianza muy alta...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshRemaining: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(data.message || "✓ Alertas actualizadas con éxito.");
        if (data.predictions && Array.isArray(data.predictions)) {
          setPredictions(data.predictions);
        } else {
          await loadSignals();
        }
      } else {
        setSyncMessage(`❌ ${data.error || "No se pudo actualizar"}`);
      }
    } catch {
      setSyncMessage("❌ Error de conexión al buscar nuevas alertas");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 6000);
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
    "Ganador Local",
    "Ganador Visitante",
    "Over 2.5 Goles",
    "Ambos Equipos Anotan",
  ];

  const availableMarkets = Array.from(
    new Set([...coreMarkets, ...predictions.map((p) => p.market).filter(Boolean)])
  );

  const marketDropdownOptions: DropdownOption[] = availableMarkets.map((m) => ({
    value: m,
    label: m,
  }));

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: language === "en" ? "⭐⭐⭐ Very High (≥70%)" : "⭐⭐⭐ Muy Alta (≥70%)" },
    { value: "alta", label: language === "en" ? "⭐⭐ High (58% - 69%)" : "⭐⭐ Alta (58% - 69%)" },
    { value: "media", label: language === "en" ? "⭐ Medium (50% - 57%)" : "⭐ Media (50% - 57%)" },
    { value: "moderada", label: language === "en" ? "⚠️ Moderate / Value (<50%)" : "⚠️ Moderada / Valor (<50%)" },
  ];

  const now = new Date();
  const formattedToday = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Count matches strictly matching status/badge filters
  const scheduledCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "SCHEDULED")).length;
  const inPlayCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "IN_PLAY")).length;
  const finishedCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "FINISHED")).length;
  const wonCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "WON")).length;
  const lostCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "LOST")).length;
  const mcpCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "MCP")).length;
  const valorCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "VALOR")).length;
  const bombaCount = predictions.filter((p) => matchesStatusBadgeFilter(p, "BOMBA")).length;

  const filteredPredictions = predictions.filter((p) => {
    // 1. Result, Badge & Status Filter
    if (!matchesStatusBadgeFilter(p, matchStatusFilter)) {
      return false;
    }

    // 2. League filter
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

    // 3. Confidence filter
    if (selectedConfidence.length > 0) {
      const isMatch = selectedConfidence.some((c) => {
        if (c === "muy_alta") return p.confidence === "Muy Alta" || p.probability >= 70;
        if (c === "alta") return p.confidence === "Alta" || (p.probability >= 55 && p.probability < 70);
        return false;
      });
      if (!isMatch) return false;
    }

    // 4. Market filter
    if (selectedMarkets.length > 0) {
      const match = selectedMarkets.some((m) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = p.market.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normActual.includes(normSelected) ||
          normSelected.includes(normActual)
        );
      });
      if (!match) return false;
    }

    // 5. Min probability filter
    if (p.probability < minProbability) {
      return false;
    }

    return true;
  });

  const avgOdds = predictions.length > 0
    ? (predictions.reduce((acc, p) => acc + p.odds, 0) / predictions.length).toFixed(2)
    : "—";

  const avgProb = predictions.length > 0
    ? (predictions.reduce((acc, p) => acc + p.probability, 0) / predictions.length).toFixed(1)
    : "—";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar onSync={handleSyncPredictions} syncing={syncing} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Top Header Strip with Live Status & Title */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                🎯
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {t("dashboardKicker")}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                📅 {formattedToday}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {t("dashboardTitle")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              {t("dashboardSubtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live Alerts Direct Button */}
            <Link
              href="/signals"
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-black text-emerald-600 hover:bg-emerald-500/20 transition dark:text-emerald-400 cursor-pointer"
            >
              <span>📋</span>
              <span>Módulo Pre-Match ({scheduledCount})</span>
            </Link>



            {isAdmin && (
              <button
                onClick={handleRefreshRemainingAlerts}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-500/20 transition dark:text-emerald-400 cursor-pointer disabled:opacity-50"
                title="Buscar nuevas oportunidades de alta confianza"
              >
                <span>🔄</span>
                <span>Buscar Nuevas Alertas</span>
              </button>
            )}
          </div>
        </div>

        {/* Sync Message Alert */}
        {syncMessage && (
          <div className="mb-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs font-black text-emerald-700 dark:text-emerald-300 flex items-center justify-between animate-in fade-in">
            <span>{syncMessage}</span>
            <button onClick={() => setSyncMessage(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
          </div>
        )}

        {/* Stats Row */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("statActivePicks")}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {predictions.length}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">hoy</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("statAvgOdds")}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                @{avgOdds}
              </span>
              <span className="text-xs font-bold text-slate-500">cuota</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("statAvgProb")}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {avgProb}%
              </span>
              <span className="text-xs font-bold text-slate-500">media</span>
            </div>
          </div>


        </div>

        {/* Status / Category Filter Pills */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setMatchStatusFilter("ALL")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "ALL"
                ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            🌐 Todas ({predictions.length})
          </button>
          <button
            onClick={() => setMatchStatusFilter("VALOR")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "VALOR"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900"
            }`}
          >
            💎 Valor ({valorCount})
          </button>
          <button
            onClick={() => setMatchStatusFilter("MCP")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              matchStatusFilter === "MCP"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 border border-purple-500"
                : "bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
            }`}
          >
            <span>🤖 Agente MCP ({mcpCount})</span>
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
            onClick={() => setMatchStatusFilter("SCHEDULED")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "SCHEDULED"
                ? "bg-slate-900 text-white shadow-sm dark:bg-slate-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            📋 Pre-Match ({scheduledCount})
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
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80 mb-6">
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

            <MultiSelectDropdown
              label={t("filterConfidenceLabel").replace(":", "")}
              options={confidenceDropdownOptions}
              selected={selectedConfidence}
              onChange={setSelectedConfidence}
            />

            {/* Min probability control */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <span>Prob. ≥</span>
              <select
                value={minProbability}
                onChange={(e) => setMinProbability(Number(e.target.value))}
                aria-label="Filtrar por probabilidad mínima"
                className="bg-transparent font-black text-emerald-600 dark:text-emerald-400 outline-none cursor-pointer"
              >
                <option value={35} className="dark:bg-slate-900">35% (Todas)</option>
                <option value={50} className="dark:bg-slate-900">50%</option>
                <option value={60} className="dark:bg-slate-900">60%</option>
                <option value={70} className="dark:bg-slate-900">70% (Muy Alta)</option>
              </select>
            </div>

            {(selectedLeagues.length > 0 || selectedMarkets.length > 0 || selectedConfidence.length > 0 || minProbability > 35) && (
              <button
                onClick={() => {
                  setSelectedLeagues([]);
                  setSelectedMarkets([]);
                  setSelectedConfidence([]);
                  setMinProbability(35);
                }}
                className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Predictions Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-4" />
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
              {t("loadingSignals")}
            </span>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/30">
            <span className="text-4xl mb-3">🔍</span>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {t("noPicksFound")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              {t("noPicksHint")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPredictions.map((pred) => (
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
