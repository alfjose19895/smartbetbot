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

function matchesStatusBadgeFilter(
  p: MarketOpportunity,
  filter: "ALL" | "VALOR" | "BOMBA" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED"
): boolean {
  if (filter === "ALL") return true;
  if (filter === "VALOR") return p.pickBadge === "valor";
  if (filter === "BOMBA") return p.pickBadge === "bomba";
  if (filter === "WON") return p.status === "won";
  if (filter === "LOST") return p.status === "lost";
  if (filter === "IN_PLAY") {
    return p.matchTiming === "live" || Boolean(p.currentScore) || getMatchLiveStatus(p.kickoff) === "IN_PLAY";
  }
  if (filter === "SCHEDULED") {
    return p.matchTiming === "prematch" || (!p.currentScore && getMatchLiveStatus(p.kickoff) === "SCHEDULED");
  }
  if (filter === "FINISHED") {
    return (getMatchLiveStatus(p.kickoff) === "FINISHED" && p.matchTiming !== "live") || p.status === "won" || p.status === "lost";
  }
  return true;
}

export default function SignalsPage() {
  const { language, t } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<"ALL" | "VALOR" | "BOMBA" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [minProbability, setMinProbability] = useState<number>(35);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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

  useEffect(() => {
    fetchSignals();
  }, []);

  const handleSyncSignals = async () => {
    try {
      setSyncing(true);
      setSyncMessage("⚡ Sincronizando alertas pre-match con modelos cuantitativos...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✓ ¡Sincronización exitosa! ${data.count} alertas cuantitativas generadas.`);
        await fetchSignals();
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
    "Ganador Local",
    "Ganador Visitante",
    "Over 2.5 Goles",
    "Ambos Equipos Anotan",
  ];

  const availableMarkets = Array.from(
    new Set([...coreMarkets, ...signals.map((s) => s.market).filter(Boolean)])
  );

  const marketDropdownOptions: DropdownOption[] = availableMarkets.map((m) => ({
    value: m,
    label: m,
  }));

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: language === "en" ? "⭐⭐⭐ Very High (≥70%)" : "⭐⭐⭐ Muy Alta (≥70%)" },
    { value: "alta", label: language === "en" ? "⭐⭐ High (55% - 69%)" : "⭐⭐ Alta (55% - 69%)" },
  ];

  const now = new Date();
  const formattedToday = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Count matches strictly matching filter conditions
  const scheduledCount = signals.filter((s) => matchesStatusBadgeFilter(s, "SCHEDULED")).length;
  const inPlayCount = signals.filter((s) => matchesStatusBadgeFilter(s, "IN_PLAY")).length;
  const finishedCount = signals.filter((s) => matchesStatusBadgeFilter(s, "FINISHED")).length;
  const wonCount = signals.filter((s) => matchesStatusBadgeFilter(s, "WON")).length;
  const lostCount = signals.filter((s) => matchesStatusBadgeFilter(s, "LOST")).length;
  const valorCount = signals.filter((s) => matchesStatusBadgeFilter(s, "VALOR")).length;
  const bombaCount = signals.filter((s) => matchesStatusBadgeFilter(s, "BOMBA")).length;

  // Filter signals strictly matching all active constraints
  const filteredCandidates = signals.filter((s) => {
    // 1. Text Search Query Filter
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = `${s.match} ${s.homeTeam} ${s.awayTeam} ${s.league} ${s.market} ${s.country || ""}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    // 2. Status & Badge Filter
    if (!matchesStatusBadgeFilter(s, matchStatusFilter)) {
      return false;
    }

    // 3. League Multi-Select Filter
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

    // 4. Confidence Multi-Select Filter
    if (selectedConfidence.length > 0) {
      const isMatch = selectedConfidence.some((c) => {
        if (c === "muy_alta") return s.confidence === "Muy Alta" || s.probability >= 70;
        if (c === "alta") return s.confidence === "Alta" || (s.probability >= 55 && s.probability < 70);
        return false;
      });
      if (!isMatch) return false;
    }

    // 5. Market Multi-Select Filter
    if (selectedMarkets.length > 0) {
      const match = selectedMarkets.some((m) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = s.market.toLowerCase().replace(/[^a-z0-9]/g, "");
        return (
          normActual.includes(normSelected) ||
          normSelected.includes(normActual)
        );
      });
      if (!match) return false;
    }

    // 6. Minimum Probability Filter
    if (s.probability < minProbability) {
      return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header Strip with Pre-Match Title & Date */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                📋
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {t("signalsKicker")}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                📅 {formattedToday}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {t("signalsTitle")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              {t("signalsSubtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={handleSyncSignals}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 transition cursor-pointer disabled:opacity-50"
              >
                <span className={syncing ? "animate-spin" : ""}>⚡</span>
                <span>{syncing ? "Sincronizando..." : "Sincronizar Alertas"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Sync message banner */}
        {syncMessage && (
          <div className="mb-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs font-black text-emerald-700 dark:text-emerald-300 flex items-center justify-between animate-in fade-in">
            <span>{syncMessage}</span>
            <button onClick={() => setSyncMessage(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
          </div>
        )}

        {/* Status and Badge Filter Pills */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setMatchStatusFilter("ALL")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "ALL"
                ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
            }`}
          >
            🌐 Todas ({signals.length})
          </button>
          <button
            onClick={() => setMatchStatusFilter("SCHEDULED")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "SCHEDULED"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
            }`}
          >
            ⏳ Por Comenzar ({scheduledCount})
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
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            ✓ Ganadas ({wonCount})
          </button>
          <button
            onClick={() => setMatchStatusFilter("LOST")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              matchStatusFilter === "LOST"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
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
            🏁 Finalizadas ({finishedCount})
          </button>
        </div>

        {/* Secondary Filters Bar */}
        <div className="mb-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar equipo o torneo..."
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

            {(selectedLeagues.length > 0 || selectedMarkets.length > 0 || selectedConfidence.length > 0 || searchQuery || minProbability > 35) && (
              <button
                onClick={() => {
                  setSelectedLeagues([]);
                  setSelectedMarkets([]);
                  setSelectedConfidence([]);
                  setSearchQuery("");
                  setMinProbability(35);
                }}
                className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Signals Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-4" />
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
              {t("loadingSignals")}
            </span>
          </div>
        ) : filteredCandidates.length === 0 ? (
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
            {filteredCandidates.map((signal) => (
              <PredictionCard
                key={signal.id || `${signal.fixtureId}-${signal.market}`}
                prediction={signal}
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
