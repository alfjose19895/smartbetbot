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

export default function ShotsVipPage() {
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

  // 2. Load Shots VIP Snapshot
  const loadShotsSlate = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const res = await fetch(`/api/shots-vip?_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setIsAdmin(false);
          return;
        }
        throw new Error("Error loading shots VIP slate");
      }
      const data = await res.json();
      if (Array.isArray(data?.predictions)) {
        const cleanShots = deduplicatePicksList(data.predictions).filter(
          (p: MarketOpportunity) =>
            p.market === "Disparos" ||
            p.market === "Tiros a Puerta" ||
            (p.selection || "").toLowerCase().includes("disparo") ||
            (p.selection || "").toLowerCase().includes("tiro")
        );
        setPredictions(cleanShots);
      }
    } catch (err) {
      console.error("[Shots VIP Page] Error loading slate:", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin === true) {
      loadShotsSlate(true);
    }
  }, [isAdmin]);

  // 3. Search and Scan New Shots VIP Alerts
  const handleSearchShotsAlerts = async () => {
    try {
      setSearching(true);
      setSearchMessage("⚡ Escaneando volumen ofensivo, tiros a puerta y modelos de Disparos (+EV)...");
      const res = await fetch("/api/shots-vip", {
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
          setNewlyDiscoveredAlerts(sortByKickoff(data.newAlerts, "asc"));
          setNewAlertsModalOpen(true);
          setSearchMessage(`✓ ¡Se descubrieron ${data.newAlerts.length} nuevas alertas de Disparos VIP! Agregadas al panel.`);
        } else {
          const pendingShots = cleanPicks.filter(
            (p: MarketOpportunity) => p.status === "pending" || (!p.actualScore && p.status !== "won" && p.status !== "lost")
          );
          if (pendingShots.length > 0) {
            setNewlyDiscoveredAlerts(pendingShots);
            setNewAlertsModalOpen(true);
          }
          setSearchMessage(`✓ Mercado de Disparos al día (${data.totalAlerts || cleanPicks.length} alertas registradas).`);
        }
      } else {
        setSearchMessage(`⚠️ ${data.message || data.error || "No se encontraron nuevas alertas de disparos."}`);
      }
    } catch {
      setSearchMessage("❌ Error de conexión al buscar alertas de disparos.");
    } finally {
      setSearching(false);
      setTimeout(() => setSearchMessage(null), 6000);
    }
  };

  const todayDateStr = getEcuadorDateString(Date.now());
  const activeSignals = useMemo(() => {
    const list = predictions.filter((p) => {
      const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
      return pDate === todayDateStr;
    });
    return sortByKickoff(list, "asc");
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

  const shotLinesDropdownOptions: DropdownOption[] = useMemo(() => {
    const lines = ["Over 7.5", "Over 8.5", "Over 9.5", "Over 21.5", "Over 23.5"];
    return lines.map((line) => {
      const count = activeSignals.filter((s) => (s.selection || "").toLowerCase().includes(line.toLowerCase())).length;
      return {
        value: line,
        label: `${line} Disparos (${count})`,
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
    const list = activeSignals.filter((p) => {
      // REGLA ESTRICTA: Exclusivamente Over de Disparos (no Under)
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
    return sortByKickoff(list, "asc");
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
  const settledCount = wonCount + lostCount;
  const winRate = settledCount > 0 ? Math.round((wonCount / settledCount) * 1000) / 10 : 0;
  const topPickCount = activeSignals.filter((s) => s.isTopPick || s.probability >= 68.0 || s.confidence === "Muy Alta").length;
  const morningCount = activeSignals.filter((s) => s.timeSlot === "morning" || getTimeSlot(s.kickoff) === "morning").length;
  const afternoonCount = activeSignals.filter((s) => s.timeSlot === "afternoon" || getTimeSlot(s.kickoff) === "afternoon").length;
  const nightCount = activeSignals.filter((s) => s.timeSlot === "night" || getTimeSlot(s.kickoff) === "night").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-slate-950">
      <Navbar onSync={handleSearchShotsAlerts} syncing={searching} />

      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        {/* Verification Loader */}
        {isAdmin === null && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              Verificando autorización de Administrador VIP...
            </p>
          </div>
        )}

        {/* Access Denied Gate */}
        {isAdmin === false && (
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/20 via-slate-900 to-slate-950 p-8 sm:p-12 text-center max-w-2xl mx-auto my-12 shadow-2xl space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-3xl">
              🔒
            </div>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-xs font-black text-cyan-400 uppercase tracking-wider">
                🎯 Disparos VIP — Acceso Restringido
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Módulo Exclusivo para Administradores
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
                La suite cuantitativa de Disparos VIP analiza el volumen ofensivo, ritmo de remates, tiros a puerta y probabilidades Poisson reservada exclusivamente para administradores.
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
                  <span>🎯</span>
                  <span>DISPAROS VIP — SUITE CUANTITATIVA EXCLUSIVA ADMIN</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Módulo de Disparos VIP
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Pronósticos algorítmicos exclusivamente de Tiros a Puerta y Disparos Totales (+EV) con análisis de ritmo ofensivo y modelos Poisson.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/cards-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 px-3.5 py-2 text-xs font-bold text-yellow-300 transition cursor-pointer"
                  title="Ir al Módulo Tarjetas VIP"
                >
                  <span>🟨</span>
                  <span>Tarjetas VIP</span>
                </Link>
                <Link
                  href="/corners-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-2 text-xs font-bold text-amber-300 transition cursor-pointer"
                  title="Ir al Módulo Corners VIP"
                >
                  <span>🚩</span>
                  <span>Corners VIP</span>
                </Link>
                <Link
                  href="/weekend"
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-2 text-xs font-bold text-indigo-300 transition cursor-pointer"
                  title="Ir al Módulo Finde VIP"
                >
                  <span>💎</span>
                  <span>Finde VIP</span>
                </Link>
                <button
                  onClick={handleSearchShotsAlerts}
                  disabled={searching}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/50 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 px-4 py-2 text-xs font-black text-slate-950 shadow-md shadow-cyan-950/40 transition cursor-pointer disabled:opacity-50"
                  title="Buscar nuevas alertas de disparos para hoy (Exclusivo Administrador)"
                >
                  <span className={searching ? "animate-spin" : ""}>⚡</span>
                  <span>{searching ? "Buscando..." : "Buscar Alertas Disparos"}</span>
                </button>
              </div>
            </div>

            {/* Notification Banner */}
            {searchMessage && (
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/40 p-3.5 text-xs text-cyan-200 text-center animate-fade-in font-bold">
                {searchMessage}
              </div>
            )}

            {/* UNIFIED FILTER BAR */}
            <section className="space-y-4">
              {/* Time Slot Segmentation */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2 flex items-center gap-1">
                  ⏱️ Franja:
                </span>
                <button
                  onClick={() => setTimeSlotFilter("ALL")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                    timeSlotFilter === "ALL"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  Todas ({activeSignals.length})
                </button>
                <button
                  onClick={() => setTimeSlotFilter("TOP")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                    timeSlotFilter === "TOP"
                      ? "bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20"
                      : "text-cyan-400 hover:bg-cyan-500/10"
                  }`}
                >
                  ⭐ Top Picks ({topPickCount})
                </button>
                <button
                  onClick={() => setTimeSlotFilter("MORNING")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                    timeSlotFilter === "MORNING"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  🌅 Mañana ({morningCount})
                </button>
                <button
                  onClick={() => setTimeSlotFilter("AFTERNOON")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                    timeSlotFilter === "AFTERNOON"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  ☀️ Tarde ({afternoonCount})
                </button>
                <button
                  onClick={() => setTimeSlotFilter("NIGHT")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                    timeSlotFilter === "NIGHT"
                      ? "bg-slate-100 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  🌙 Noche ({nightCount})
                </button>
              </div>

              {/* Status and Badges Filters */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setMatchStatusFilter("ALL")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "ALL"
                      ? "bg-cyan-500 text-slate-950 font-black shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  }`}
                >
                  Todos ({activeSignals.length})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("DESTACADO")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "DESTACADO"
                      ? "bg-amber-500 text-slate-950 font-black shadow-sm"
                      : "bg-slate-900 text-amber-400 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  ⭐ Destacados ({destacadosCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("ELITE")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "ELITE"
                      ? "bg-cyan-400 text-slate-950 font-black shadow-sm"
                      : "bg-slate-900 text-cyan-300 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  💎 Elite ({eliteCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("VALOR")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "VALOR"
                      ? "bg-yellow-400 text-slate-950 font-black shadow-sm"
                      : "bg-slate-900 text-yellow-300 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  💰 Valor (+EV) ({valorCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("WON")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "WON"
                      ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                      : "bg-slate-900 text-emerald-400 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  ✅ Ganadas ({wonCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("LOST")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "LOST"
                      ? "bg-rose-500 text-slate-100 font-black shadow-sm"
                      : "bg-slate-900 text-rose-400 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  ❌ Perdidas ({lostCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("SCHEDULED")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "SCHEDULED"
                      ? "bg-blue-500 text-slate-950 font-black shadow-sm"
                      : "bg-slate-900 text-blue-400 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  ⏳ Pendientes ({scheduledCount})
                </button>
                <button
                  onClick={() => setMatchStatusFilter("FINISHED")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    matchStatusFilter === "FINISHED"
                      ? "bg-slate-200 text-slate-950 font-black shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  🏁 Finalizados ({finishedCount})
                </button>
              </div>

              {/* Advanced Controls Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    🔍 Buscar Equipo / Liga:
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ej: Liverpool, Premier League..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    🎯 Línea de Disparos (Solo Over):
                  </label>
                  <MultiSelectDropdown
                    label="Líneas de Disparos"
                    options={shotLinesDropdownOptions}
                    selected={selectedLines}
                    onChange={setSelectedLines}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    🏆 Liga / Competición:
                  </label>
                  <MultiSelectDropdown
                    label="Competiciones"
                    options={leagueDropdownOptions}
                    selected={selectedLeagues}
                    onChange={setSelectedLeagues}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    📊 Nivel de Confianza:
                  </label>
                  <MultiSelectDropdown
                    label="Confianza"
                    options={confidenceDropdownOptions}
                    selected={selectedConfidence}
                    onChange={setSelectedConfidence}
                  />
                </div>
              </div>

              {/* Probability Slider Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 px-4 py-2.5 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
                    Probabilidad Mínima: <span className="text-cyan-400 font-black">{minProbability}%</span>
                  </span>
                  <input
                    type="range"
                    min="50"
                    max="85"
                    step="5"
                    value={minProbability}
                    onChange={(e) => setMinProbability(Number(e.target.value))}
                    className="w-36 sm:w-48 accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div className="text-[11px] text-slate-400 font-bold flex items-center gap-2">
                  <span>Mostrando:</span>
                  <span className="text-white font-black bg-slate-800 px-2.5 py-0.5 rounded-md border border-slate-700">
                    {filteredPredictions.length} de {activeSignals.length} alertas
                  </span>
                </div>
              </div>
            </section>

            {/* STATS SUMMARY BAR */}
            <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex flex-col justify-center items-center text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Alertas</span>
                <span className="text-xl font-black text-white mt-0.5">{activeSignals.length}</span>
              </div>
              <div className="bg-slate-900/90 border border-emerald-900/40 p-3.5 rounded-2xl flex flex-col justify-center items-center text-center bg-emerald-950/10">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Ganadas</span>
                <span className="text-xl font-black text-emerald-400 mt-0.5">✓ {wonCount}</span>
              </div>
              <div className="bg-slate-900/90 border border-rose-900/40 p-3.5 rounded-2xl flex flex-col justify-center items-center text-center bg-rose-950/10">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Perdidas</span>
                <span className="text-xl font-black text-rose-400 mt-0.5">✗ {lostCount}</span>
              </div>
              <div className="bg-slate-900/90 border border-cyan-500/30 p-3.5 rounded-2xl flex flex-col justify-center items-center text-center bg-cyan-950/20 shadow-sm shadow-cyan-500/10">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Tasa de Acierto</span>
                <span className={`text-xl font-black mt-0.5 ${
                  settledCount === 0
                    ? "text-slate-400"
                    : winRate >= 70
                    ? "text-emerald-400"
                    : winRate >= 50
                    ? "text-yellow-400"
                    : "text-rose-400"
                }`}>
                  {settledCount > 0 ? `${winRate}%` : "—"}
                </span>
                <span className="text-[9px] text-slate-500 font-bold mt-0.5">
                  {settledCount > 0 ? `(${wonCount}/${settledCount} fin.)` : "Sin finalizar"}
                </span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex flex-col justify-center items-center text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">Pendientes</span>
                <span className="text-xl font-black text-blue-400 mt-0.5">⏳ {scheduledCount}</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex flex-col justify-center items-center text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">Prob. Media</span>
                <span className="text-xl font-black text-cyan-400 mt-0.5">
                  {activeSignals.length > 0
                    ? Math.round((activeSignals.reduce((acc, p) => acc + (p.probability || 0), 0) / activeSignals.length) * 10) / 10
                    : 0}%
                </span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex flex-col justify-center items-center text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Cuota Media</span>
                <span className="text-xl font-black text-cyan-300 mt-0.5">
                  {activeSignals.length > 0
                    ? (activeSignals.reduce((acc, p) => acc + (p.odds || 0), 0) / activeSignals.length).toFixed(2)
                    : "0.00"}
                </span>
              </div>
            </section>

            {/* PREDICTIONS GRID */}
            <section className="space-y-4">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cargando cartelera de Disparos VIP...</p>
                </div>
              )}

              {!loading && filteredPredictions.length === 0 && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-12 text-center space-y-4">
                  <span className="text-4xl">🎯</span>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">No hay alertas de Disparos que coincidan</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Intenta ajustar los filtros seleccionados o haz clic en &quot;Buscar Alertas Disparos&quot; para escanear partidos adicionales.
                    </p>
                  </div>
                  <button
                    onClick={handleSearchShotsAlerts}
                    disabled={searching}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 transition cursor-pointer"
                  >
                    <span>⚡</span>
                    <span>Buscar Nuevas Alertas</span>
                  </button>
                </div>
              )}

              {!loading && filteredPredictions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPredictions.map((pick) => (
                    <PredictionCard
                      key={pick.id || `${pick.fixtureId}-${pick.selection}`}
                      prediction={{
                        ...pick,
                        isShotsVip: true,
                        vipBadge: "Disparos VIP",
                        pickBadge: "shots_vip",
                      }}
                      onOpenDetail={(p) => setActiveModalPick(p)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* MATCH DETAIL MODAL */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}

      {/* NEW ALERTS MODAL */}
      {newAlertsModalOpen && (
        <NewAlertsModal
          isOpen={newAlertsModalOpen}
          onClose={() => setNewAlertsModalOpen(false)}
          newAlerts={newlyDiscoveredAlerts}
          totalCount={newlyDiscoveredAlerts.length}
          onOpenDetail={(p) => setActiveModalPick(p)}
        />
      )}
    </div>
  );
}
