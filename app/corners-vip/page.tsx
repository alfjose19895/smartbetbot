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

export default function CornersVipPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // Predictions state
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [newAlertsModalOpen, setNewAlertsModalOpen] = useState(false);
  const [newlyDiscoveredAlerts, setNewlyDiscoveredAlerts] = useState<MarketOpportunity[]>([]);

  // Filters state (matching pre-match suite)
  const [searchQuery, setSearchQuery] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<
    "ALL" | "DESTACADO" | "ELITE" | "VALOR" | "BOMBA" | "MCP" | "WON" | "LOST" | "SCHEDULED" | "IN_PLAY" | "FINISHED"
  >("ALL");
  const [timeSlotFilter, setTimeSlotFilter] = useState<"ALL" | "TOP" | "MORNING" | "AFTERNOON" | "NIGHT">("ALL");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<string[]>([]);
  const [minProbability, setMinProbability] = useState<number>(50);

  // 1. Verify Admin Access
  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === "admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

  // 2. Load Corners VIP Snapshot
  const loadCornersSlate = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const res = await fetch(`/api/corners-vip?_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setIsAdmin(false);
          return;
        }
        throw new Error("Error loading corners VIP slate");
      }
      const data = await res.json();
      if (Array.isArray(data?.predictions)) {
        const cleanCorners = deduplicatePicksList(data.predictions).filter(
          (p: MarketOpportunity) => p.market === "Córners" || (p.selection || "").toLowerCase().includes("córner")
        );
        setPredictions(cleanCorners);
      }
    } catch (err) {
      console.error("[Corners VIP Page] Error loading slate:", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin === true) {
      loadCornersSlate(true);
    }
  }, [isAdmin]);

  // 3. Search and Scan New Corners VIP Alerts
  const handleSearchCornersAlerts = async () => {
    try {
      setSearching(true);
      setSearchMessage("⚡ Escaneando partidos de hoy en busca de cuotas y modelos de Córners...");
      const res = await fetch("/api/corners-vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (data.success) {
        const cleanPicks = Array.isArray(data.predictions)
          ? deduplicatePicksList(data.predictions)
          : predictions;
        setPredictions(cleanPicks);

        if (data.newAlerts && data.newAlerts.length > 0) {
          setNewlyDiscoveredAlerts(data.newAlerts);
          setNewAlertsModalOpen(true);
          setSearchMessage(`✓ ¡Se descubrieron ${data.newAlerts.length} nuevas alertas de Córners VIP! Agregadas al panel.`);
        } else {
          const pendingCorners = cleanPicks.filter(
            (p: MarketOpportunity) => p.status === "pending" || (!p.actualScore && p.status !== "won" && p.status !== "lost")
          );
          if (pendingCorners.length > 0) {
            setNewlyDiscoveredAlerts(pendingCorners);
            setNewAlertsModalOpen(true);
          }
          setSearchMessage(`✓ Mercado de Córners al día (${data.totalAlerts || cleanPicks.length} alertas registradas).`);
        }
      } else {
        setSearchMessage(`⚠️ ${data.message || data.error || "No se encontraron nuevas alertas de córners."}`);
      }
    } catch {
      setSearchMessage("❌ Error de conexión al buscar alertas de córners.");
    } finally {
      setSearching(false);
      setTimeout(() => setSearchMessage(null), 6000);
    }
  };

  const todayDateStr = getEcuadorDateString(Date.now());
  const activeSignals = useMemo(() => {
    return predictions.filter((p) => {
      const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
      return pDate === todayDateStr;
    });
  }, [predictions, todayDateStr]);

  // Dropdown Options
  const leagueDropdownOptions: DropdownOption[] = useMemo(() => {
    const map = new Map<string, { count: number; group: string }>();
    for (const s of activeSignals) {
      if (!s.league) continue;
      const existing = map.get(s.league);
      if (existing) {
        existing.count++;
      } else {
        map.set(s.league, {
          count: 1,
          group: s.country || "Internacional",
        });
      }
    }
    return Array.from(map.entries())
      .map(([league, info]) => ({
        value: league,
        label: `${league} (${info.count})`,
        group: info.group,
      }))
      .sort((a, b) => (a.group || "").localeCompare(b.group || "") || a.label.localeCompare(b.label));
  }, [activeSignals]);

  const cornerLinesDropdownOptions: DropdownOption[] = useMemo(() => {
    const lines = ["Over 6.5", "Over 7.5", "Over 8.5", "Over 9.5", "Over 10.5"];
    return lines.map((line) => {
      const count = activeSignals.filter((s) => (s.selection || "").toLowerCase().includes(line.toLowerCase())).length;
      return {
        value: line,
        label: `${line} Córners (${count})`,
      };
    });
  }, [activeSignals]);

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: "⭐⭐⭐ Muy Alta (≥70%)" },
    { value: "alta", label: "⭐⭐ Alta (58% - 69%)" },
    { value: "media", label: "⭐ Media (50% - 57%)" },
  ];

  // Filtering Logic
  const filteredPredictions = useMemo(() => {
    return activeSignals.filter((p) => {
      // REGLA ESTRICTA: Exclusivamente Over de Córners (no Under)
      const selLower = (p.selection || "").toLowerCase();
      const mktLower = (p.market || "").toLowerCase();
      if (
        selLower.includes("under") ||
        selLower.includes("menos") ||
        selLower.includes("baja") ||
        mktLower.includes("under") ||
        mktLower.includes("menos") ||
        mktLower.includes("baja")
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTeams =
          p.homeTeam.toLowerCase().includes(q) ||
          p.awayTeam.toLowerCase().includes(q) ||
          (p.match || "").toLowerCase().includes(q);
        const matchLeague = p.league.toLowerCase().includes(q);
        const matchSelection = (p.selection || "").toLowerCase().includes(q);
        if (!matchTeams && !matchLeague && !matchSelection) return false;
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

      if (selectedLines.length > 0) {
        const selNorm = (p.selection || "").toLowerCase();
        const matchesLine = selectedLines.some((l) => selNorm.includes(l.toLowerCase()));
        if (!matchesLine) return false;
      }

      if (selectedConfidence.length > 0) {
        const prob = p.probability || 0;
        const matches = selectedConfidence.some((c) => {
          if (c === "muy_alta") return prob >= 70;
          if (c === "alta") return prob >= 58 && prob < 70;
          if (c === "media") return prob >= 50 && prob < 58;
          return true;
        });
        if (!matches) return false;
      }

      if (p.probability < minProbability) return false;

      return true;
    });
  }, [
    activeSignals,
    searchQuery,
    matchStatusFilter,
    timeSlotFilter,
    selectedLeagues,
    selectedLines,
    selectedConfidence,
    minProbability,
  ]);

  // Counts for pills
  const destacadosCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "DESTACADO")).length;
  const eliteCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "ELITE")).length;
  const wonCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "WON")).length;
  const lostCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "LOST")).length;
  const valorCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "VALOR")).length;
  const scheduledCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "SCHEDULED")).length;
  const finishedCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "FINISHED")).length;
  const topPickCount = activeSignals.filter((s) => s.isTopPick || s.probability >= 68.0 || s.confidence === "Muy Alta").length;
  const morningCount = activeSignals.filter((s) => s.timeSlot === "morning" || getTimeSlot(s.kickoff) === "morning").length;
  const afternoonCount = activeSignals.filter((s) => s.timeSlot === "afternoon" || getTimeSlot(s.kickoff) === "afternoon").length;
  const nightCount = activeSignals.filter((s) => s.timeSlot === "night" || getTimeSlot(s.kickoff) === "night").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-amber-500 selection:text-slate-950">
      <Navbar onSync={handleSearchCornersAlerts} syncing={searching} />

      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        {/* Verification Loader */}
        {isAdmin === null && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              Verificando autorización de Administrador VIP...
            </p>
          </div>
        )}

        {/* Access Denied Gate */}
        {isAdmin === false && (
          <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-b from-amber-950/20 via-slate-900 to-slate-950 p-8 sm:p-12 text-center max-w-2xl mx-auto my-12 shadow-2xl space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-3xl">
              🔒
            </div>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-black text-amber-400 uppercase tracking-wider">
                🚩 Corners VIP — Acceso Restringido
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Módulo Exclusivo para Administradores
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
                La suite cuantitativa de Córners VIP utiliza telemetría avanzada de saques de esquina y distribución Poisson bivariada reservada únicamente para administradores de SmartBetBot.
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
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-400 border border-amber-500/30 uppercase tracking-wider mb-2">
                  <span>🚩</span>
                  <span>CORNERS VIP — SUITE CUANTITATIVA EXCLUSIVA ADMIN</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Módulo de Córners VIP
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Pronósticos algorítmicos exclusivamente de saques de esquina (+EV) con cuotas oficiales y modelos Poisson/Bivariada.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/weekend"
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-2 text-xs font-bold text-indigo-300 transition cursor-pointer"
                  title="Ir al Módulo Finde VIP"
                >
                  <span>💎</span>
                  <span>Finde VIP</span>
                </Link>
                <Link
                  href="/featured"
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-2 text-xs font-bold text-amber-300 transition cursor-pointer"
                >
                  <span>⭐</span>
                  <span>Destacados</span>
                </Link>
                <Link
                  href="/signals"
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/50 px-3.5 py-2 text-xs font-bold text-emerald-300 transition cursor-pointer"
                >
                  <span>⚽</span>
                  <span>Fútbol Pre-Match</span>
                </Link>
                <button
                  onClick={handleSearchCornersAlerts}
                  disabled={searching}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 px-4 py-2 text-xs font-black text-slate-950 shadow-md shadow-amber-950/40 transition cursor-pointer disabled:opacity-50"
                  title="Buscar nuevas alertas de córners para hoy (Exclusivo Administrador)"
                >
                  <span className={searching ? "animate-spin" : ""}>⚡</span>
                  <span>{searching ? "Buscando..." : "Buscar Alertas Córners"}</span>
                </button>
              </div>
            </div>

            {/* Notification Banner */}
            {searchMessage && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/40 p-3.5 text-xs text-amber-200 text-center animate-fade-in font-bold">
                {searchMessage}
              </div>
            )}

            {/* ======================================================== */}
            {/* UNIFIED FILTER BAR (TIME SLOTS & PRE-MATCH FILTERS)      */}
            {/* ======================================================== */}
            <section className="space-y-4">
              {/* Time Slot Segmentation (Franja) */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2 flex items-center gap-1">
                  ⏱️ Franja:
                </span>
                <button
                  onClick={() => setTimeSlotFilter("ALL")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                    timeSlotFilter === "ALL"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  🌟 Toda la Jornada ({activeSignals.length})
                </button>
                <button
                  onClick={() => setTimeSlotFilter("TOP")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                    timeSlotFilter === "TOP"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black"
                      : "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  }`}
                >
                  <span>🔥 Top Convicción ({topPickCount})</span>
                </button>
                <button
                  onClick={() => setTimeSlotFilter("MORNING")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                    timeSlotFilter === "MORNING"
                      ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                      : "bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                  }`}
                >
                  <span>☀️ Mañana ({morningCount})</span>
                </button>
                <button
                  onClick={() => setTimeSlotFilter("AFTERNOON")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                    timeSlotFilter === "AFTERNOON"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                  }`}
                >
                  <span>🌤️ Tarde ({afternoonCount})</span>
                </button>
                <button
                  onClick={() => setTimeSlotFilter("NIGHT")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                    timeSlotFilter === "NIGHT"
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                      : "bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                  }`}
                >
                  <span>🌙 Noche ({nightCount})</span>
                </button>
              </div>

              {/* Status and Badge Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setMatchStatusFilter("ALL")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    matchStatusFilter === "ALL"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-750"
                  }`}
                >
                  🚩 Todos los Córners ({activeSignals.length})
                </button>
                <button
                  onClick={() => setMatchStatusFilter(matchStatusFilter === "DESTACADO" ? "ALL" : "DESTACADO")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                    matchStatusFilter === "DESTACADO"
                      ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/40 border border-amber-300 scale-105"
                      : "bg-amber-950/60 text-amber-300 border border-amber-800/80 hover:bg-amber-900/70"
                  }`}
                >
                  <span className="tracking-tighter">⭐⭐⭐⭐⭐</span>
                  <span>Destacados ({destacadosCount})</span>
                </button>
                <button
                  onClick={() => setMatchStatusFilter(matchStatusFilter === "ELITE" ? "ALL" : "ELITE")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                    matchStatusFilter === "ELITE"
                      ? "bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/40 border border-amber-300 scale-105"
                      : "bg-amber-950/60 text-amber-300 border border-amber-800/80 hover:bg-amber-900/70"
                  }`}
                >
                  <span>👑</span>
                  <span>Élite 80%+ ({eliteCount})</span>
                </button>
                <button
                  onClick={() => setMatchStatusFilter("SCHEDULED")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    matchStatusFilter === "SCHEDULED"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-amber-950/60 text-amber-300 border border-amber-800 hover:bg-amber-900"
                  }`}
                >
                  ⏳ Por Comenzar ({scheduledCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("VALOR")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    matchStatusFilter === "VALOR"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
                  }`}
                >
                  💎 Valor ({valorCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("WON")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    matchStatusFilter === "WON"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 border border-emerald-500"
                      : "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
                  }`}
                >
                  ✓ Ganadas ({wonCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("LOST")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    matchStatusFilter === "LOST"
                      ? "bg-rose-600 text-white shadow-md shadow-rose-600/30 border border-rose-500"
                      : "bg-rose-950/60 text-rose-300 border border-rose-800"
                  }`}
                >
                  ✗ Perdidas ({lostCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("FINISHED")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    matchStatusFilter === "FINISHED"
                      ? "bg-sky-600 text-white shadow-sm"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-750"
                  }`}
                >
                  🏁 Finalizadas ({finishedCount})
                </button>
              </div>

              {/* Multi-Select Filters Bar */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-3 shadow-xs">
                {/* Search bar */}
                <div className="relative flex-1 min-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar equipo o torneo..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 pl-9 pr-8 text-xs font-bold text-slate-100 placeholder-slate-400 outline-none focus:border-amber-500 focus:bg-slate-900"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <MultiSelectDropdown
                    label="Ligas"
                    options={leagueDropdownOptions}
                    selected={selectedLeagues}
                    onChange={setSelectedLeagues}
                  />

                  {cornerLinesDropdownOptions.length > 0 && (
                    <MultiSelectDropdown
                      label="Líneas de Córners"
                      options={cornerLinesDropdownOptions}
                      selected={selectedLines}
                      onChange={setSelectedLines}
                    />
                  )}

                  <MultiSelectDropdown
                    label="Confianza"
                    options={confidenceDropdownOptions}
                    selected={selectedConfidence}
                    onChange={setSelectedConfidence}
                  />

                  {/* Min probability control */}
                  <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300">
                    <span>Prob. ≥</span>
                    <select
                      value={minProbability}
                      onChange={(e) => setMinProbability(Number(e.target.value))}
                      aria-label="Filtrar por probabilidad mínima"
                      className="bg-transparent font-black text-amber-400 outline-none cursor-pointer"
                    >
                      <option value={35} className="bg-slate-900 text-white">35% (Todas)</option>
                      <option value={50} className="bg-slate-900 text-white">50%</option>
                      <option value={60} className="bg-slate-900 text-white">60%</option>
                      <option value={70} className="bg-slate-900 text-white">70% (Muy Alta)</option>
                    </select>
                  </div>

                  {(selectedLeagues.length > 0 ||
                    selectedLines.length > 0 ||
                    selectedConfidence.length > 0 ||
                    searchQuery ||
                    minProbability > 50) && (
                    <button
                      onClick={() => {
                        setSelectedLeagues([]);
                        setSelectedLines([]);
                        setSelectedConfidence([]);
                        setSearchQuery("");
                        setMinProbability(50);
                      }}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-extrabold text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Grid of Corner Predictions */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  Cargando proyecciones de Córners VIP...
                </p>
              </div>
            ) : filteredPredictions.length === 0 ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
                <span className="text-4xl">🚩</span>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">
                    No hay pronósticos de córners con los filtros seleccionados
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Intenta ajustar la franja horaria, disminuir el umbral de probabilidad o pulsa &quot;Buscar Alertas Córners&quot; para escanear partidos adicionales.
                  </p>
                </div>
                <button
                  onClick={handleSearchCornersAlerts}
                  disabled={searching}
                  className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 transition cursor-pointer"
                >
                  ⚡ Escanear Nuevas Alertas de Córners
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPredictions.map((prediction) => (
                  <PredictionCard
                    key={prediction.id || `${prediction.fixtureId}-${prediction.selection}`}
                    prediction={{
                      ...prediction,
                      isCornersVip: true,
                      vipBadge: "Corners VIP",
                      pickBadge: "corners_vip",
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
        totalCount={newlyDiscoveredAlerts.length}
        onOpenDetail={(p) => setActiveModalPick(p)}
      />
    </div>
  );
}
