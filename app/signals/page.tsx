"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { MarketOpportunity, getTimeSlot } from "@/lib/sports/prediction-engine";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { useLanguage } from "@/context/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { openPushModal } from "@/components/PushNotificationManager";

function getMatchDeduplicationKey(p: MarketOpportunity): string {
  const fixId = Number(p.fixtureId) || 0;
  const m = (p.market || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
  if (fixId > 0) return `fix-${fixId}-${m}`;
  const h = (p.homeTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
  const a = (p.awayTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
  return `${h}-${a}-${m}`;
}

function deduplicatePicksList(picks: MarketOpportunity[]): MarketOpportunity[] {
  const map = new Map<string, MarketOpportunity>();

  for (const p of picks) {
    const key = getMatchDeduplicationKey(p);
    const fixId = Number(p.fixtureId) || 0;
    const h = (p.homeTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
    const a = (p.awayTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
    const m = (p.market || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();

    let matchedExistingKey: string | null = null;
    if (map.has(key)) {
      matchedExistingKey = key;
    } else {
      for (const [exKey, ex] of map.entries()) {
        const exFixId = Number(ex.fixtureId) || 0;
        const exM = (ex.market || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
        if (m === exM) {
          if (fixId > 0 && exFixId > 0 && fixId === exFixId) {
            matchedExistingKey = exKey;
            break;
          }
          const exH = (ex.homeTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
          const exA = (ex.awayTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
          if (h && a && exH && exA && h === exH && a === exA) {
            matchedExistingKey = exKey;
            break;
          }
        }
      }
    }

    if (matchedExistingKey) {
      const existing = map.get(matchedExistingKey)!;
      map.set(matchedExistingKey, {
        ...existing,
        ...p,
        status: existing.status && existing.status !== "pending" ? existing.status : p.status || "pending",
        actualScore: existing.actualScore || p.actualScore,
        result: existing.result || (p as any).result,
        profit: typeof (existing as any).profit === "number" ? (existing as any).profit : (p as any).profit,
      });
    } else {
      map.set(key, p);
    }
  }

  return Array.from(map.values());
}

function getEcuadorDateString(d: Date | number | string = Date.now()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d));
  } catch {
    return new Date().toISOString().split("T")[0];
  }
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
    return (p.status as string) === "in_play" || p.matchTiming === "live";
  }
  if (filter === "SCHEDULED") {
    return !isWon && !isLost && (p.status as string) !== "in_play" && p.matchTiming !== "live" && (p.status as string) !== "finished";
  }
  if (filter === "FINISHED") {
    return isWon || isLost || (p.status as string) === "finished" || p.matchTiming === "finished";
  }
  return true;
}

export default function SignalsPage() {
  const { t, language } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [newlyDiscoveredAlerts, setNewlyDiscoveredAlerts] = useState<MarketOpportunity[]>([]);
  const [newAlertsModalOpen, setNewAlertsModalOpen] = useState<boolean>(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<"ALL" | "VALOR" | "BOMBA" | "MCP" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED">("ALL");
  const [timeSlotFilter, setTimeSlotFilter] = useState<"ALL" | "TOP" | "MORNING" | "AFTERNOON" | "NIGHT">("ALL");
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

  const loadSignals = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const res = await fetch(`/api/signals?sport=football&_t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      const serverSignals: MarketOpportunity[] = Array.isArray(json.signals)
        ? json.signals
        : [];

      // Client-side pure football guarantee
      const cleanUniqueSignals = deduplicatePicksList(serverSignals).filter((s) => {
        const c = (s.country || "").toUpperCase();
        const l = (s.league || "").toUpperCase();
        const sp = ((s as any).sport || "").toLowerCase();
        return c !== "NHL" && !l.includes("NHL") && sp !== "nhl" && c !== "NBA" && !l.includes("NBA") && sp !== "nba" && c !== "NFL" && sp !== "nfl";
      });
      setPredictions(cleanUniqueSignals);
    } catch (err) {
      console.error("Error loading football signals:", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals(true);
    const handleUpdated = () => {
      loadSignals(false);
    };
    window.addEventListener("predictions-updated", handleUpdated);
    const handleNewAlertsDiscovered = (e: any) => {
      if (e.detail?.newAlerts && e.detail.newAlerts.length > 0) {
        setNewlyDiscoveredAlerts(e.detail.newAlerts);
        setNewAlertsModalOpen(true);
      }
    };
    window.addEventListener("new-alerts-discovered", handleNewAlertsDiscovered);
    return () => {
      window.removeEventListener("predictions-updated", handleUpdated);
      window.removeEventListener("new-alerts-discovered", handleNewAlertsDiscovered);
    };
  }, []);

  const handleSyncPredictions = async () => {
    try {
      setSyncing(true);
      setSyncMessage("⚡ Buscando nuevas alertas de hoy con modelos cuantitativos...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: "football" }),
      });
      const data = await res.json();
      if (data.success) {
        const cleanPicks = Array.isArray(data.predictions) ? deduplicatePicksList(data.predictions) : predictions;
        if (data.newAlerts && data.newAlerts.length > 0) {
          setNewlyDiscoveredAlerts(data.newAlerts);
          setNewAlertsModalOpen(true);
          setSyncMessage(`✓ ¡Se encontraron ${data.newAlerts.length} nuevas alertas de hoy! Agregadas al panel.`);
        } else {
          const todayPending = cleanPicks.filter(
            (p: MarketOpportunity) => p.status === "pending" || (!p.actualScore && p.status !== "won" && p.status !== "lost")
          );
          if (todayPending.length > 0) {
            setNewlyDiscoveredAlerts(todayPending);
            setNewAlertsModalOpen(true);
          }
          setSyncMessage(`✓ Mercado de hoy al día (${data.count || cleanPicks.length} alertas activas).`);
        }
        if (Array.isArray(data.predictions)) {
          setPredictions(cleanPicks);
          window.dispatchEvent(new CustomEvent("predictions-updated", { detail: cleanPicks }));
        } else {
          await loadSignals();
        }
      } else {
        setSyncMessage(`⚠️ ${data.message || "Error al buscar alertas de hoy"}`);
      }
    } catch {
      setSyncMessage("❌ Error de conexión al buscar alertas de hoy");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const todayDateStr = getEcuadorDateString(Date.now());
  const activeSignals = predictions.filter((p) => {
    const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
    return pDate === todayDateStr;
  });

  const filteredPredictions = activeSignals.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTeams = p.homeTeam.toLowerCase().includes(q) || p.awayTeam.toLowerCase().includes(q) || (p.match || "").toLowerCase().includes(q);
      const matchLeague = p.league.toLowerCase().includes(q);
      const matchMarket = p.market.toLowerCase().includes(q) || p.selection.toLowerCase().includes(q);
      if (!matchTeams && !matchLeague && !matchMarket) return false;
    }

    if (!matchesStatusBadgeFilter(p, matchStatusFilter)) return false;

    if (timeSlotFilter === "TOP") {
      const isTop = p.isTopPick || p.probability >= 68.0 || p.confidence === "Muy Alta";
      if (!isTop) return false;
    } else if (timeSlotFilter !== "ALL") {
      const pSlot = p.timeSlot || getTimeSlot(p.kickoff);
      if (pSlot !== timeSlotFilter.toLowerCase()) return false;
    }

    if (selectedLeagues.length > 0 && !selectedLeagues.includes(p.league)) {
      return false;
    }

    if (selectedConfidence.length > 0 && !selectedConfidence.includes(p.confidence || "Alta")) {
      return false;
    }

    if (selectedMarkets.length > 0 && !selectedMarkets.includes(p.market)) {
      return false;
    }

    if (p.probability < minProbability) return false;

    return true;
  });

  const wonCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "WON")).length;
  const lostCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "LOST")).length;
  const valorCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "VALOR")).length;
  const bombaCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "BOMBA")).length;
  const mcpCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "MCP")).length;
  const topPickCount = activeSignals.filter((s) => s.isTopPick || s.probability >= 68.0 || s.confidence === "Muy Alta").length;
  const morningCount = activeSignals.filter((s) => (s.timeSlot === "morning" || getTimeSlot(s.kickoff) === "morning")).length;
  const afternoonCount = activeSignals.filter((s) => (s.timeSlot === "afternoon" || getTimeSlot(s.kickoff) === "afternoon")).length;
  const nightCount = activeSignals.filter((s) => (s.timeSlot === "night" || getTimeSlot(s.kickoff) === "night")).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-slate-950">
      <Navbar />

      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-400 border border-emerald-500/20 uppercase tracking-wider mb-2">
              <span>⚽</span>
              <span>FÚTBOL — SUITE CUANTITATIVA PRE-MATCH</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Señales y Pronósticos de Fútbol
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Oportunidades de alto valor (+EV) calculadas algorítmicamente para la jornada de hoy.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/admin?tab=mcp"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-purple-600/25 hover:from-purple-500 hover:to-indigo-500 transition cursor-pointer"
              title="Ir al Agente MCP Fútbol"
            >
              <span>🤖</span>
              <span>Agente MCP Fútbol</span>
            </Link>
            {isAdmin && (
              <button
                onClick={handleSyncPredictions}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-2 text-xs font-bold text-purple-300 transition cursor-pointer disabled:opacity-50"
                title="Buscar alertas de hoy"
              >
                <span className={syncing ? "animate-spin" : ""}>⚡</span>
                <span>{syncing ? "Buscando..." : "Buscar Alertas"}</span>
              </button>
            )}
            <button
              onClick={openPushModal}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow hover:bg-emerald-500 transition cursor-pointer"
            >
              <span>🔔</span>
              <span>Alertas</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/40 p-3.5 text-xs text-purple-200 text-center animate-fade-in">
            {syncMessage}
          </div>
        )}

        {/* Filter Navigation Bar */}
        <div className="space-y-3 bg-slate-900/80 p-4 rounded-3xl border border-slate-800">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setMatchStatusFilter("ALL")}
              className={`rounded-xl px-3.5 py-1.5 font-bold transition cursor-pointer shrink-0 ${
                matchStatusFilter === "ALL"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              Todas ({activeSignals.length})
            </button>
            <button
              onClick={() => setMatchStatusFilter("SCHEDULED")}
              className={`rounded-xl px-3.5 py-1.5 font-bold transition cursor-pointer shrink-0 ${
                matchStatusFilter === "SCHEDULED"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              Por Comenzar
            </button>
            <button
              onClick={() => setMatchStatusFilter("VALOR")}
              className={`rounded-xl px-3.5 py-1.5 font-bold transition cursor-pointer shrink-0 ${
                matchStatusFilter === "VALOR"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              💎 Valor ({valorCount})
            </button>
            <button
              onClick={() => setMatchStatusFilter("BOMBA")}
              className={`rounded-xl px-3.5 py-1.5 font-bold transition cursor-pointer shrink-0 ${
                matchStatusFilter === "BOMBA"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              🔥 Bomba ({bombaCount})
            </button>
            <button
              onClick={() => setMatchStatusFilter("MCP")}
              className={`rounded-xl px-3.5 py-1.5 font-bold transition cursor-pointer shrink-0 ${
                matchStatusFilter === "MCP"
                  ? "bg-purple-600 text-white shadow-md"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              🤖 MCP ({mcpCount})
            </button>
            <button
              onClick={() => setMatchStatusFilter("FINISHED")}
              className={`rounded-xl px-3.5 py-1.5 font-bold transition cursor-pointer shrink-0 ${
                matchStatusFilter === "FINISHED"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              Finalizadas ({wonCount + lostCount})
            </button>
          </div>

          {/* Time Slot Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs border-t border-slate-800/80 pt-2.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase shrink-0 mr-1">Horario:</span>
            <button
              onClick={() => setTimeSlotFilter("ALL")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer shrink-0 ${
                timeSlotFilter === "ALL" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Todos los horarios
            </button>
            <button
              onClick={() => setTimeSlotFilter("TOP")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer shrink-0 ${
                timeSlotFilter === "TOP" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30" : "text-slate-400 hover:text-white"
              }`}
            >
              ⭐ Top Picks ({topPickCount})
            </button>
            <button
              onClick={() => setTimeSlotFilter("MORNING")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer shrink-0 ${
                timeSlotFilter === "MORNING" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              🌅 Mañana ({morningCount})
            </button>
            <button
              onClick={() => setTimeSlotFilter("AFTERNOON")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer shrink-0 ${
                timeSlotFilter === "AFTERNOON" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              ☀️ Tarde ({afternoonCount})
            </button>
            <button
              onClick={() => setTimeSlotFilter("NIGHT")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition cursor-pointer shrink-0 ${
                timeSlotFilter === "NIGHT" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              🌙 Noche ({nightCount})
            </button>
          </div>
        </div>

        {/* Predictions Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-3" />
            <span className="text-xs font-bold text-slate-400">Cargando pronósticos de fútbol...</span>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-base font-bold text-white">Sin pronósticos con los filtros seleccionados</h3>
            <p className="text-xs text-slate-400 mt-1">Prueba seleccionando "Todas" o buscando otro término.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPredictions.map((pick) => {
              const key = pick.id || `${pick.fixtureId}-${pick.market}`;
              return (
                <PredictionCard
                  key={key}
                  prediction={pick}
                  onOpenDetail={setActiveModalPick}
                />
              );
            })}
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

      {/* New Alerts Modal */}
      <NewAlertsModal
        isOpen={newAlertsModalOpen}
        newAlerts={newlyDiscoveredAlerts}
        totalCount={predictions.length}
        onClose={() => setNewAlertsModalOpen(false)}
        onOpenDetail={setActiveModalPick}
      />
    </div>
  );
}
