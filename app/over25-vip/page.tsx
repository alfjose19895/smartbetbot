"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { PredictionCard } from "@/components/PredictionCard";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";
import { VipDateFilter } from "@/components/VipDateFilter";
import {
  MarketOpportunity,
  getTimeSlot,
  isElitePick,
  sortByKickoff,
  isDestacadoPick,
} from "@/lib/sports/prediction-engine";

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

export default function Over25VipPage() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => getEcuadorDateString());

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
  const [minProbability, setMinProbability] = useState<number>(60);

  // 1. Verify User VIP Permissions (Admin or explicitly granted)
  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const u = data?.user;
        const isAdm = u?.role === "admin" || (u?.email || "").toLowerCase().includes("ajhs1589");
        const hasVip =
          isAdm ||
          Boolean(u?.vipAccess) ||
          (u?.vipModules || []).includes("*") ||
          (u?.vipModules || []).includes("over25_vip");

        if (hasVip) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
          setLoading(false);
        }
      })
      .catch(() => {
        setHasAccess(false);
        setLoading(false);
      });
  }, []);

  // 2. Load Slate by Date
  const loadSlate = async (dateStr?: string, showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const target = dateStr || selectedDate;
      const res = await fetch(`/api/over25-vip?date=${target}&_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setHasAccess(false);
          return;
        }
        throw new Error("Error loading VIP slate");
      }
      const data = await res.json();
      if (Array.isArray(data?.predictions)) {
        const cleanPicks = deduplicatePicksList(data.predictions).filter(
          (p: MarketOpportunity) => (p.market === "Over 2.5 Goles" || (p.selection || "").toLowerCase().includes("over 2.5")) && p.probability >= 60.0
        );
        setPredictions(cleanPicks);
      }
    } catch (err) {
      console.error("[VIP Page] Error loading slate:", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess === true) {
      loadSlate(selectedDate, true);
    }
  }, [hasAccess, selectedDate]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    loadSlate(newDate, true);
  };

  // 3. Search and Scan New Alerts for Selected Date
  const handleSearchAlerts = async () => {
    try {
      setSearching(true);
      setSearchMessage(`⚡ Escaneando partidos del ${selectedDate} (Over 2.5 Goles ≥ 60%)...`);
      const res = await fetch("/api/over25-vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });

      const data = await res.json();
      if (data.success) {
        const cleanPicks = Array.isArray(data.predictions)
          ? deduplicatePicksList(data.predictions).filter(
              (p: MarketOpportunity) => (p.market === "Over 2.5 Goles" || (p.selection || "").toLowerCase().includes("over 2.5")) && p.probability >= 60.0
            )
          : predictions;
        setPredictions(cleanPicks);

        if (data.newAlerts && data.newAlerts.length > 0) {
          setNewlyDiscoveredAlerts(sortByKickoff(data.newAlerts, "asc"));
          setNewAlertsModalOpen(true);
          setSearchMessage(`✓ ¡Se descubrieron ${data.newAlerts.length} nuevas alertas VIP para ${selectedDate}! Agregadas al panel.`);
        } else {
          setSearchMessage(`✓ Panel VIP al día para ${selectedDate} (${cleanPicks.length} alertas disponibles).`);
        }
      } else {
        setSearchMessage(`⚠️ ${data.error || "No se pudieron obtener nuevas alertas."}`);
      }
    } catch (err) {
      setSearchMessage("✕ Error de conexión al escanear nuevas alertas.");
    } finally {
      setSearching(false);
    }
  };

  // Options for Dropdowns
  const leagueDropdownOptions: DropdownOption[] = useMemo(() => {
    const unique = Array.from(new Set(predictions.map((p) => p.league).filter(Boolean))) as string[];
    return unique.sort().map((l) => ({
      value: l,
      label: l,
      badge: String(predictions.filter((p) => p.league === l).length),
    }));
  }, [predictions]);

  const confidenceDropdownOptions: DropdownOption[] = useMemo(() => {
    const confs = ["Muy Alta", "Alta", "Media", "Moderada"];
    return confs
      .filter((c) => predictions.some((p) => p.confidence === c))
      .map((c) => ({
        value: c,
        label: c,
        badge: String(predictions.filter((p) => p.confidence === c).length),
      }));
  }, [predictions]);

  // Filtered Predictions List
  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      // Status badge filter
      if (!matchesStatusBadgeFilter(p, matchStatusFilter)) return false;

      // Time slot filter
      if (timeSlotFilter !== "ALL") {
        const slot = getTimeSlot(p.kickoff);
        if (timeSlotFilter === "TOP") {
          if (!isElitePick(p) && p.probability < 75) return false;
        } else if (slot !== timeSlotFilter.toLowerCase()) {
          return false;
        }
      }

      // Leagues multi-select
      if (selectedLeagues.length > 0 && !selectedLeagues.includes(p.league)) {
        return false;
      }

      // Confidence multi-select
      if (selectedConfidence.length > 0 && !selectedConfidence.includes(p.confidence)) {
        return false;
      }

      // Minimum probability slider
      if (p.probability < minProbability) return false;

      // Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const m = (p.match || "").toLowerCase();
        const h = (p.homeTeam || "").toLowerCase();
        const a = (p.awayTeam || "").toLowerCase();
        const l = (p.league || "").toLowerCase();
        if (!m.includes(q) && !h.includes(q) && !a.includes(q) && !l.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [predictions, matchStatusFilter, timeSlotFilter, selectedLeagues, selectedConfidence, minProbability, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Loading Spinner */}
        {hasAccess === null || (loading && predictions.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="h-10 w-10 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-400 animate-pulse">
              Verificando permisos de acceso VIP y cargando cartelera...
            </p>
          </div>
        ) : null}

        {/* Access Denied (No VIP permission) */}
        {hasAccess === false && (
          <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-b from-amber-950/20 via-slate-900/60 to-slate-950 p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-2xl backdrop-blur-xl space-y-5 my-12">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl shadow-inner">
              🔒
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white tracking-tight">
                Módulo Exclusivo VIP
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
                Tu cuenta no tiene permisos activos para acceder al <strong>Módulo de Over 2.5 Goles VIP</strong>. Un administrador puede asignarte el permiso exclusivo desde el panel de gestión de usuarios.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <Link
                href="/signals"
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition border border-slate-700 cursor-pointer"
              >
                Volver a Pre-Match
              </Link>
            </div>
          </div>
        )}

        {/* Authorized Content */}
        {hasAccess === true && (
          <>
            {/* Header with Navigation and Search Action */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-400 border border-emerald-500/30 uppercase tracking-wider mb-2">
                  <span>⚽</span>
                  <span>OVER 2.5 VIP — SUITE CUANTITATIVA EXCLUSIVA (REGLA STRICTA ≥ 60%)</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Módulo de Over 2.5 Goles VIP
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Pronósticos algorítmicos exclusivamente de Alta de Goles (+2.5) desacoplados del pre-match con convicción mínima estricta del 60% y cuotas oficiales de casas de apuestas.
                </p>
              </div>

              {/* VIP Modules Nav */}
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/corners-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 transition cursor-pointer"
                >
                  <span>🚩</span>
                  <span>Corners VIP</span>
                </Link>
                <Link
                  href="/over25-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 transition cursor-pointer"
                >
                  <span>⚽</span>
                  <span>Over 2.5 VIP</span>
                </Link>
                <Link
                  href="/btts-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-300 transition cursor-pointer"
                >
                  <span>🥅</span>
                  <span>Ambos Anotan VIP</span>
                </Link>
                <Link
                  href="/home-win-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 text-xs font-bold text-blue-300 transition cursor-pointer"
                >
                  <span>🏠</span>
                  <span>Gana Local VIP</span>
                </Link>
                <Link
                  href="/away-win-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 px-3 py-1.5 text-xs font-bold text-teal-300 transition cursor-pointer"
                >
                  <span>✈️</span>
                  <span>Gana Visitante VIP</span>
                </Link>
                <Link
                  href="/cards-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 px-3 py-1.5 text-xs font-bold text-yellow-300 transition cursor-pointer"
                >
                  <span>🟨</span>
                  <span>Tarjetas VIP</span>
                </Link>
                <Link
                  href="/shots-vip"
                  className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 text-xs font-bold text-purple-300 transition cursor-pointer"
                >
                  <span>🎯</span>
                  <span>Disparos VIP</span>
                </Link>
              </div>
            </div>

            {/* Date Selector & Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-800">
              <VipDateFilter
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                loading={loading || searching}
              />

              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadSlate(selectedDate, true)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 transition cursor-pointer disabled:opacity-50"
                  title="Recargar cartelera"
                >
                  <span>🔄</span>
                  <span>Recargar</span>
                </button>

                <button
                  onClick={handleSearchAlerts}
                  disabled={searching}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/50 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-4 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-emerald-950/40 transition cursor-pointer disabled:opacity-50"
                  title="Escanear y buscar nuevas alertas para esta fecha"
                >
                  <span className={searching ? "animate-spin" : ""}>⚡</span>
                  <span>{searching ? "Buscando..." : "Buscar Alertas Over 2.5"}</span>
                </button>
              </div>
            </div>

            {/* Notification Banner */}
            {searchMessage && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 text-xs font-semibold text-slate-300 flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>{searchMessage}</span>
                </div>
                <button
                  onClick={() => setSearchMessage(null)}
                  className="text-slate-500 hover:text-white cursor-pointer ml-3 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Stats Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fecha Activa</span>
                <span className="text-base font-black text-white mt-1">{selectedDate}</span>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Alertas</span>
                <span className="text-xl font-black text-white mt-1">{predictions.length}</span>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Ganadas</span>
                <span className="text-xl font-black text-emerald-400 mt-1">
                  {predictions.filter((p) => p.status === "won" || (p as any).result === "WON").length}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Perdidas</span>
                <span className="text-xl font-black text-rose-400 mt-1">
                  {predictions.filter((p) => p.status === "lost" || (p as any).result === "LOST").length}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Pendientes</span>
                <span className="text-xl font-black text-amber-400 mt-1">
                  {predictions.filter((p) => p.status !== "won" && p.status !== "lost" && (p as any).result !== "WON" && (p as any).result !== "LOST").length}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">Win Rate Real</span>
                <span className="text-xl font-black text-cyan-400 mt-1">
                  {(() => {
                    const w = predictions.filter((p) => p.status === "won" || (p as any).result === "WON").length;
                    const l = predictions.filter((p) => p.status === "lost" || (p as any).result === "LOST").length;
                    const tot = w + l;
                    return tot > 0 ? `${Math.round((w / tot) * 100)}%` : "N/A";
                  })()}
                </span>
              </div>
            </div>

            {/* Filter Control Card */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 space-y-4 shadow-xl">
              {/* Status and Badge Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-800/70">
                {[
                  { id: "ALL", label: "Todos", count: predictions.length },
                  { id: "DESTACADO", label: "⭐ Destacados (≥60%)", count: predictions.filter((p) => p.probability >= 60).length },
                  { id: "ELITE", label: "👑 Élite", count: predictions.filter((p) => isElitePick(p)).length },
                  { id: "VALOR", label: "💎 Valor", count: predictions.filter((p) => p.pickBadge === "valor").length },
                  { id: "BOMBA", label: "💣 Bomba", count: predictions.filter((p) => p.pickBadge === "bomba").length },
                  { id: "WON", label: "✓ Ganadas", count: predictions.filter((p) => p.status === "won" || (p as any).result === "WON").length },
                  { id: "LOST", label: "✕ Perdidas", count: predictions.filter((p) => p.status === "lost" || (p as any).result === "LOST").length },
                  { id: "SCHEDULED", label: "⏳ Por Jugar", count: predictions.filter((p) => p.status !== "won" && p.status !== "lost" && (p as any).result !== "WON" && (p as any).result !== "LOST").length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setMatchStatusFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      matchStatusFilter === tab.id
                        ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black"
                        : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                        matchStatusFilter === tab.id
                          ? "bg-slate-950/30 text-slate-950 font-black"
                          : "bg-slate-900 text-slate-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Advanced Dropdowns & Search Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                {/* Search Text */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar equipo o liga..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Time slot filter */}
                <div>
                  <select
                    value={timeSlotFilter}
                    onChange={(e) => setTimeSlotFilter(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 focus:border-emerald-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL">⏰ Todos los Horarios</option>
                    <option value="TOP">⭐ TOP Picks (Alta Probabilidad)</option>
                    <option value="MORNING">🌅 Mañana (00:00 - 12:00)</option>
                    <option value="AFTERNOON">☀️ Tarde (12:00 - 18:00)</option>
                    <option value="NIGHT">🌙 Noche (18:00 - 24:00)</option>
                  </select>
                </div>

                {/* Leagues MultiSelect */}
                <MultiSelectDropdown
                  label="Ligas"
                  icon="🏆"
                  options={leagueDropdownOptions}
                  selected={selectedLeagues}
                  onChange={setSelectedLeagues}
                  placeholderAll="Todas las Ligas"
                />

                {/* Confidence MultiSelect */}
                <MultiSelectDropdown
                  label="Confianza"
                  icon="🎯"
                  options={confidenceDropdownOptions}
                  selected={selectedConfidence}
                  onChange={setSelectedConfidence}
                  placeholderAll="Toda Confianza"
                />

                {/* Min probability range slider */}
                <div className="flex flex-col justify-center px-2">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 mb-1">
                    <span>Probabilidad Mínima:</span>
                    <span className="text-emerald-400 font-black">{minProbability}%</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="90"
                    step="1"
                    value={minProbability}
                    onChange={(e) => setMinProbability(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Predictions Slate Grid */}
            {filteredPredictions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPredictions.map((pick) => (
                  <PredictionCard
                    key={getMatchDeduplicationKey(pick)}
                    prediction={pick}
                    onOpenDetail={(p) => setActiveModalPick(p)}
                    defaultExpanded={false}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-12 text-center space-y-4">
                <div className="h-12 w-12 mx-auto rounded-2xl bg-slate-800/80 flex items-center justify-center text-2xl">
                  ⚽
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">No hay alertas que cumplan el filtro actual para el {selectedDate}</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Los pronósticos en este módulo requieren estrictamente ≥ 60% de probabilidad y cuotas reales de mercado. Puedes buscar nuevas alertas con el botón superior.
                  </p>
                </div>
                <button
                  onClick={handleSearchAlerts}
                  disabled={searching}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition cursor-pointer"
                >
                  ⚡ Escanear Alertas para {selectedDate}
                </button>
              </div>
            )}

            {/* Modals */}
            {activeModalPick && (
              <MatchDetailModal
                prediction={activeModalPick}
                onClose={() => setActiveModalPick(null)}
              />
            )}

            {newAlertsModalOpen && newlyDiscoveredAlerts.length > 0 && (
              <NewAlertsModal
                isOpen={newAlertsModalOpen}
                newAlerts={newlyDiscoveredAlerts}
                totalCount={newlyDiscoveredAlerts.length}
                onClose={() => setNewAlertsModalOpen(false)}
                onOpenDetail={(pick: MarketOpportunity) => {
                  setNewAlertsModalOpen(false);
                  setActiveModalPick(pick);
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
