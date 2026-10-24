"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { PredictionCard } from "@/components/PredictionCard";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";
import {
  MarketOpportunity,
  getTimeSlot,
  isElitePick,
  sortByKickoff,
  isDestacadoPick,
} from "@/lib/sports/prediction-engine";

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
    if (!map.has(key)) {
      map.set(key, p);
    }
  }
  return Array.from(map.values());
}

function matchesStatusBadgeFilter(
  p: MarketOpportunity,
  filter: "ALL" | "DESTACADO" | "ELITE" | "VALOR" | "BOMBA" | "MCP" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED"
): boolean {
  const isWon = p.status === "won" || (p as any).result === "WON" || (p.status as string) === "WON";
  const isLost = p.status === "lost" || (p as any).result === "LOST" || (p.status as string) === "LOST";
  const isMcp = Boolean(p.isMcp || p.isMcpPick || p.source === "mcp" || p.pickBadge === "mcp");

  if (filter === "ALL") return true;
  if (filter === "DESTACADO") return isDestacadoPick(p);
  if (filter === "ELITE") return isElitePick(p);
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

export default function BttsVipPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // Predictions state
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [newAlertsModalOpen, setNewAlertsModalOpen] = useState(false);
  const [newlyDiscoveredAlerts, setNewlyDiscoveredAlerts] = useState<MarketOpportunity[]>([]);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<
    "ALL" | "DESTACADO" | "ELITE" | "VALOR" | "BOMBA" | "MCP" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED"
  >("ALL");
  const [timeSlotFilter, setTimeSlotFilter] = useState<"ALL" | "TOP" | "MORNING" | "AFTERNOON" | "NIGHT">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);
  const [minProbability, setMinProbability] = useState<number>(58);

  // 1. Verify Admin Access
  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === "admin" || (data?.user?.email || "").toLowerCase().includes("ajhs1589")) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

  // 2. Load Ambos Anotan VIP Snapshot
  const loadBttsSlate = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const res = await fetch(`/api/btts-vip?_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setIsAdmin(false);
          return;
        }
        throw new Error("Error loading Ambos Anotan VIP slate");
      }
      const data = await res.json();
      if (Array.isArray(data?.predictions)) {
        const cleanBtts = deduplicatePicksList(data.predictions).filter(
          (p: MarketOpportunity) =>
            (p.market === "Ambos Equipos Anotan" || (p.selection || "").toLowerCase().includes("ambos") || (p.selection || "").toLowerCase().includes("sí") || (p.selection || "").toLowerCase().includes("si")) &&
            p.probability >= 58.0
        );
        setPredictions(cleanBtts);
      }
    } catch (err) {
      console.error("[Ambos Anotan VIP Page] Error loading slate:", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin === true) {
      loadBttsSlate(true);
    }
  }, [isAdmin]);

  // 3. Search and Scan New Ambos Anotan VIP Alerts
  const handleSearchBttsAlerts = async () => {
    try {
      setSearching(true);
      setSearchMessage("⚡ Escaneando partidos de hoy en busca de cuotas y modelos de Ambos Equipos Anotan (≥ 58%)...");
      const res = await fetch("/api/btts-vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (data.success) {
        const cleanPicks = Array.isArray(data.predictions)
          ? deduplicatePicksList(data.predictions).filter(
              (p: MarketOpportunity) =>
                (p.market === "Ambos Equipos Anotan" || (p.selection || "").toLowerCase().includes("ambos") || (p.selection || "").toLowerCase().includes("sí") || (p.selection || "").toLowerCase().includes("si")) &&
                p.probability >= 58.0
            )
          : predictions;
        setPredictions(cleanPicks);

        if (data.newAlerts && data.newAlerts.length > 0) {
          setNewlyDiscoveredAlerts(sortByKickoff(data.newAlerts, "asc"));
          setNewAlertsModalOpen(true);
          setSearchMessage(`✓ ¡Se descubrieron ${data.newAlerts.length} nuevas alertas de Ambos Anotan VIP (≥ 58%)! Agregadas al panel.`);
        } else {
          setSearchMessage(`✓ Panel de Ambos Anotan VIP al día (${cleanPicks.length} alertas disponibles).`);
        }
      } else {
        setSearchMessage(`❌ Error: ${data.error || "No se pudo completar el escaneo de Ambos Anotan VIP."}`);
      }
    } catch (err: any) {
      setSearchMessage(`❌ Error de conexión al buscar alertas de Ambos Anotan VIP.`);
    } finally {
      setSearching(false);
      setTimeout(() => setSearchMessage(null), 8000);
    }
  };

  // Extract dropdown options
  const leagueOptions: DropdownOption[] = useMemo(() => {
    const counts: Record<string, number> = {};
    predictions.forEach((p) => {
      const leg = p.league || "Otra";
      counts[leg] = (counts[leg] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([value, count]) => ({
        label: value,
        value,
        count,
      }))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [predictions]);

  const confidenceOptions: DropdownOption[] = useMemo(() => {
    const counts: Record<string, number> = {};
    predictions.forEach((p) => {
      const conf = p.confidence || "Media";
      counts[conf] = (counts[conf] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([value, count]) => ({
        label: value,
        value,
        count,
      }))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [predictions]);

  // Filtered predictions
  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const m = (p.match || `${p.homeTeam} vs ${p.awayTeam}`).toLowerCase();
        const leg = (p.league || "").toLowerCase();
        if (!m.includes(q) && !leg.includes(q)) return false;
      }

      if (!matchesStatusBadgeFilter(p, matchStatusFilter)) return false;

      if (timeSlotFilter === "TOP") {
        const isTop = (p as any).isTopPick || p.probability >= 70.0 || p.confidence === "Muy Alta";
        if (!isTop) return false;
      } else if (timeSlotFilter !== "ALL") {
        const pSlot = (p as any).timeSlot || getTimeSlot(p.kickoff);
        if (pSlot !== timeSlotFilter.toLowerCase()) return false;
      }

      if (selectedLeagues.length > 0 && !selectedLeagues.includes(p.league || "")) {
        return false;
      }

      if (selectedConfidence.length > 0 && !selectedConfidence.includes(p.confidence || "")) {
        return false;
      }

      if (p.probability < minProbability) return false;

      return true;
    });
  }, [
    predictions,
    searchQuery,
    matchStatusFilter,
    timeSlotFilter,
    selectedLeagues,
    selectedConfidence,
    minProbability,
  ]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const total = predictions.length;
    const won = predictions.filter((p) => p.status === "won" || (p as any).result === "WON").length;
    const lost = predictions.filter((p) => p.status === "lost" || (p as any).result === "LOST").length;
    const settled = won + lost;
    const pending = total - settled;
    const winRate = settled > 0 ? Math.round((won / settled) * 100) : 0;
    const avgProb = total > 0 ? Math.round((predictions.reduce((acc, p) => acc + (p.probability || 0), 0) / total) * 10) / 10 : 0;
    const avgOdds = total > 0 ? Math.round((predictions.reduce((acc, p) => acc + (p.odds || 0), 0) / total) * 100) / 100 : 0;

    return { total, won, lost, pending, winRate, avgProb, avgOdds };
  }, [predictions]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
            <p className="text-xs sm:text-sm text-slate-400 font-bold tracking-wide">
              Cargando módulo cuantitativo de Ambos Anotan VIP...
            </p>
          </div>
        )}

        {/* Unauthorized State */}
        {!loading && isAdmin === false && (
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/20 via-slate-900 to-slate-950 p-8 sm:p-12 text-center max-w-2xl mx-auto my-12 shadow-2xl space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-3xl">
              🔒
            </div>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-xs font-black text-cyan-400 uppercase tracking-wider">
                🥅 Ambos Anotan VIP — Acceso Restringido
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Módulo Exclusivo para Administradores
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
                La suite cuantitativa de Ambos Anotan VIP utiliza modelos Poisson bivariados y umbrales estrictos de convicción (≥ 58%) reservados únicamente para administradores de SmartBetBot.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <Link
                href="/signals"
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-2.5 text-xs font-black text-slate-950 shadow-md hover:brightness-110 transition cursor-pointer"
              >
                ← Volver a Pronósticos Pre-Match
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-750 transition cursor-pointer"
              >
                Ir al Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Admin Authorized Content */}
        {isAdmin === true && (
          <>
            {/* Header with Navigation and Search Action */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-400 border border-cyan-500/30 uppercase tracking-wider mb-2">
                  <span>🥅</span>
                  <span>AMBOS ANOTAN VIP — SUITE CUANTITATIVA EXCLUSIVA (REGLA STRICTA ≥ 58%)</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Módulo de Ambos Equipos Anotan VIP
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Pronósticos algorítmicos exclusivamente de Ambos Equipos Anotan (BTTS Sí) desacoplados del pre-match con convicción mínima estricta del 58% y cuotas oficiales de casas de apuestas.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/corners-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-2 text-xs font-bold text-amber-300 transition cursor-pointer"
                  title="Ir al Módulo Corners VIP"
                >
                  <span>🚩</span>
                  <span>Corners VIP</span>
                </Link>
                <Link
                  href="/over25-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-300 transition cursor-pointer"
                  title="Ir al Módulo Over 2.5 VIP"
                >
                  <span>⚽</span>
                  <span>Over 2.5 VIP</span>
                </Link>
                <Link
                  href="/cards-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 px-3.5 py-2 text-xs font-bold text-yellow-300 transition cursor-pointer"
                >
                  <span>🟨</span>
                  <span>Tarjetas VIP</span>
                </Link>
                <Link
                  href="/shots-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-2 text-xs font-bold text-purple-300 transition cursor-pointer"
                >
                  <span>🎯</span>
                  <span>Disparos VIP</span>
                </Link>
                <Link
                  href="/weekend"
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-2 text-xs font-bold text-indigo-300 transition cursor-pointer"
                >
                  <span>💎</span>
                  <span>Finde VIP</span>
                </Link>
                <button
                  onClick={handleSearchBttsAlerts}
                  disabled={searching}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/50 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 px-4 py-2 text-xs font-black text-slate-950 shadow-md shadow-cyan-950/40 transition cursor-pointer disabled:opacity-50"
                  title="Buscar nuevas alertas de Ambos Anotan para hoy (Exclusivo Administrador)"
                >
                  <span className={searching ? "animate-spin" : ""}>⚡</span>
                  <span>{searching ? "Buscando..." : "Buscar Alertas Ambos Anotan"}</span>
                </button>
              </div>
            </div>

            {/* Notification Banner */}
            {searchMessage && (
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/40 p-3.5 text-xs text-cyan-200 text-center animate-fade-in font-bold">
                {searchMessage}
              </div>
            )}

            {/* Filter Bar */}
            <section className="space-y-4">
              {/* Time Slot Segmentation */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2 flex items-center gap-1">
                  ⏱️ Franja:
                </span>
                {(
                  [
                    { id: "ALL", label: "Todas" },
                    { id: "TOP", label: "Top (Próximos)" },
                    { id: "MORNING", label: "Mañana (05-12h)" },
                    { id: "AFTERNOON", label: "Tarde (12-18h)" },
                    { id: "NIGHT", label: "Noche (18h+)" },
                  ] as const
                ).map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setTimeSlotFilter(slot.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      timeSlotFilter === slot.id
                        ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40"
                        : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>

              {/* Status and Badge Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {(
                  [
                    { id: "ALL", label: "Todos", count: predictions.length },
                    { id: "DESTACADO", label: "⭐ Destacados (≥58%)", count: predictions.filter((p) => p.probability >= 58).length },
                    { id: "ELITE", label: "👑 Élite", count: predictions.filter((p) => isElitePick(p)).length },
                    { id: "VALOR", label: "💎 Valor", count: predictions.filter((p) => p.pickBadge === "valor").length },
                    { id: "BOMBA", label: "💣 Bomba", count: predictions.filter((p) => p.pickBadge === "bomba").length },
                    { id: "WON", label: "✓ Ganadas", count: stats.won },
                    { id: "LOST", label: "✗ Perdidas", count: stats.lost },
                    { id: "SCHEDULED", label: "⏳ Programados", count: stats.pending },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setMatchStatusFilter(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      matchStatusFilter === tab.id
                        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-md shadow-cyan-950/40"
                        : "bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        matchStatusFilter === tab.id
                          ? "bg-slate-950/30 text-slate-950 font-black"
                          : "bg-slate-800 text-slate-400 font-bold"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Secondary Controls: Search, Dropdowns, and Minimum Probability */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/80">
                {/* Search text filter */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar equipo o liga..."
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-xs text-slate-500 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* League dropdown */}
                <MultiSelectDropdown
                  label="Ligas"
                  options={leagueOptions}
                  selected={selectedLeagues}
                  onChange={setSelectedLeagues}
                  placeholderAll="Todas las Ligas"
                />

                {/* Confidence dropdown */}
                <MultiSelectDropdown
                  label="Confianza"
                  options={confidenceOptions}
                  selected={selectedConfidence}
                  onChange={setSelectedConfidence}
                  placeholderAll="Toda Confianza"
                />

                {/* Min probability range slider (Strict rule >= 58%) */}
                <div className="flex flex-col justify-center px-2">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 mb-1">
                    <span>Probabilidad Mínima:</span>
                    <span className="text-cyan-400 font-black">{minProbability}%</span>
                  </div>
                  <input
                    type="range"
                    min="58"
                    max="90"
                    step="1"
                    value={minProbability}
                    onChange={(e) => setMinProbability(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                </div>
              </div>
            </section>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Alertas</span>
                <p className="text-lg sm:text-xl font-black text-white mt-0.5">{stats.total}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Aciertos (Won)</span>
                <p className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5">{stats.won}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Fallos (Lost)</span>
                <p className="text-lg sm:text-xl font-black text-rose-400 mt-0.5">{stats.lost}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Pendientes</span>
                <p className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">{stats.pending}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">Efectividad</span>
                <p className="text-lg sm:text-xl font-black text-cyan-300 mt-0.5">{stats.winRate}%</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Prob Prom</span>
                <p className="text-lg sm:text-xl font-black text-indigo-300 mt-0.5">{stats.avgProb}%</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">Cuota Prom</span>
                <p className="text-lg sm:text-xl font-black text-teal-300 mt-0.5">@{stats.avgOdds.toFixed(2)}</p>
              </div>
            </div>

            {/* Content Predictions Grid */}
            {filteredPredictions.length === 0 ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-12 text-center space-y-4">
                <span className="text-4xl">🥅</span>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">No hay alertas de Ambos Anotan que cumplan el filtro actual</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Los pronósticos en este módulo requieren estrictamente ≥ 58% de probabilidad y cuotas reales de mercado. Puedes buscar nuevas alertas con el botón superior.
                  </p>
                </div>
                <button
                  onClick={handleSearchBttsAlerts}
                  disabled={searching}
                  className="rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 px-4 py-2 text-xs font-black text-cyan-300 transition cursor-pointer"
                >
                  ⚡ Escanear Nuevas Alertas de Ambos Anotan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPredictions.map((prediction) => (
                  <PredictionCard
                    key={prediction.id || `${prediction.fixtureId}-${prediction.selection}`}
                    prediction={{
                      ...prediction,
                      isBttsVip: true,
                      vipBadge: "Ambos Anotan VIP",
                      pickBadge: "btts_vip",
                    }}
                    onOpenDetail={(pick) => setActiveModalPick(pick)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Match Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}

      {/* New Alerts Discovered Modal */}
      <NewAlertsModal
        isOpen={newAlertsModalOpen}
        onClose={() => setNewAlertsModalOpen(false)}
        newAlerts={newlyDiscoveredAlerts}
      />
    </div>
  );
}
