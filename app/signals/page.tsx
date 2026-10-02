"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { MultiSelectDropdown, DropdownOption } from "@/components/MultiSelectDropdown";
import { MarketOpportunity, getTimeSlot } from "@/lib/sports/prediction-engine";
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
  const { t } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [newlyDiscoveredAlerts, setNewlyDiscoveredAlerts] = useState<MarketOpportunity[]>([]);
  const [newAlertsModalOpen, setNewAlertsModalOpen] = useState<boolean>(false);
  const [nhlCount, setNhlCount] = useState<number>(0);

  // Search & Filters matching exact MultiSport / NHL suite structure
  const [searchQuery, setSearchQuery] = useState("");
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

    fetch(`/api/signals?sport=nhl&_t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.signals)) {
          setNhlCount(data.signals.length);
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

      // Client-side pure football guarantee (strictly exclude non-football data)
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
  const activeSignals = useMemo(() => {
    return predictions.filter((p) => {
      const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
      return pDate === todayDateStr;
    });
  }, [predictions, todayDateStr]);

  // Dropdown Options Generation
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

  const marketDropdownOptions: DropdownOption[] = useMemo(() => {
    const coreMarkets = [
      "Over Córners",
      "Ambos Equipos Anotan",
      "Over 2.5 Goles",
      "Ganador Local",
      "Ganador Visitante",
    ];
    return coreMarkets.map((m) => {
      const count = activeSignals.filter((s) => {
        const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normActual = (s.market || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const normSel = (s.selection || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normSelected.includes("overcorner") || (normSelected.includes("corner") && !normSelected.includes("under"))) {
          return (normActual.includes("corner") || normActual.includes("crner")) && !normActual.includes("under") && !normSel.includes("under");
        }
        if (normSelected.includes("ambos") || normSelected.includes("btts")) {
          return normActual.includes("ambos") || normActual.includes("btts");
        }
        if (normSelected.includes("overgol") || normSelected.includes("over25") || normSelected.includes("over")) {
          return (normActual.includes("gol") || normActual.includes("25") || normActual.includes("over")) && !normActual.includes("under") && !normActual.includes("corner");
        }
        if (normSelected.includes("local") || normSelected === "1") {
          return normActual.includes("local") || normSel === "1" || normSel === "local";
        }
        if (normSelected.includes("visitante") || normSelected === "2") {
          return normActual.includes("visitante") || normSel === "2" || normSel === "visitante";
        }
        return normActual.includes(normSelected) || normSelected.includes(normActual);
      }).length;
      return {
        value: m,
        label: `${m} (${count})`,
      };
    });
  }, [activeSignals]);

  const confidenceDropdownOptions: DropdownOption[] = [
    { value: "muy_alta", label: "⭐⭐⭐ Muy Alta (≥70%)" },
    { value: "alta", label: "⭐⭐ Alta (58% - 69%)" },
    { value: "media", label: "⭐ Media (50% - 57%)" },
    { value: "moderada", label: "⚠️ Moderada / Valor (<50%)" },
  ];

  const filteredPredictions = useMemo(() => {
    return activeSignals.filter((p) => {
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

      if (selectedConfidence.length > 0) {
        const matchesConf = selectedConfidence.some((c) => {
          if (c === "muy_alta") return p.confidence === "Muy Alta" || p.probability >= 70;
          if (c === "alta") return p.confidence === "Alta" || (p.probability >= 58 && p.probability < 70);
          if (c === "media") return p.confidence === "Media" || (p.probability >= 50 && p.probability < 58);
          if (c === "moderada") return p.confidence === "Moderada" || p.probability < 50;
          return false;
        });
        if (!matchesConf) return false;
      }

      if (selectedMarkets.length > 0) {
        const match = selectedMarkets.some((m) => {
          const normSelected = m.toLowerCase().replace(/[^a-z0-9]/g, "");
          const normActual = (p.market || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const normSel = (p.selection || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normSelected.includes("overcorner") || (normSelected.includes("corner") && !normSelected.includes("under"))) {
            return (normActual.includes("corner") || normActual.includes("crner")) && !normActual.includes("under") && !normSel.includes("under");
          }
          if (normSelected.includes("ambos") || normSelected.includes("btts")) {
            return normActual.includes("ambos") || normActual.includes("btts");
          }
          if (normSelected.includes("overgol") || normSelected.includes("over25") || normSelected.includes("over")) {
            return (normActual.includes("gol") || normActual.includes("25") || normActual.includes("over")) && !normActual.includes("under") && !normActual.includes("corner");
          }
          if (normSelected.includes("local") || normSelected === "1") {
            return normActual.includes("local") || normSel === "1" || normSel === "local";
          }
          if (normSelected.includes("visitante") || normSelected === "2") {
            return normActual.includes("visitante") || normSel === "2" || normSel === "visitante";
          }
          return normActual.includes(normSelected) || normSelected.includes(normActual);
        });
        if (!match) return false;
      }

      if (p.probability < minProbability) return false;

      return true;
    });
  }, [activeSignals, searchQuery, matchStatusFilter, timeSlotFilter, selectedLeagues, selectedConfidence, selectedMarkets, minProbability]);

  const wonCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "WON")).length;
  const lostCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "LOST")).length;
  const valorCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "VALOR")).length;
  const bombaCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "BOMBA")).length;
  const mcpCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "MCP")).length;
  const scheduledCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "SCHEDULED")).length;
  const finishedCount = activeSignals.filter((s) => matchesStatusBadgeFilter(s, "FINISHED")).length;
  const topPickCount = activeSignals.filter((s) => s.isTopPick || s.probability >= 68.0 || s.confidence === "Muy Alta").length;
  const morningCount = activeSignals.filter((s) => (s.timeSlot === "morning" || getTimeSlot(s.kickoff) === "morning")).length;
  const afternoonCount = activeSignals.filter((s) => (s.timeSlot === "afternoon" || getTimeSlot(s.kickoff) === "afternoon")).length;
  const nightCount = activeSignals.filter((s) => (s.timeSlot === "night" || getTimeSlot(s.kickoff) === "night")).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-slate-950">
      <Navbar />

      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        {/* Top Header with Multi-Sport Toolbar */}
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
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-3.5 py-2 text-xs font-black text-white shadow-md shadow-purple-950/40 transition cursor-pointer"
              title="Ir al Agente MCP"
            >
              <span>🤖</span>
              <span>Agente MCP Pronósticos</span>
            </Link>
            <Link
              href="/signals"
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition cursor-pointer"
            >
              <span>⚽</span>
              <span>Fútbol ({activeSignals.length})</span>
            </Link>
            <Link
              href="/sports/nhl"
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 px-3.5 py-2 text-xs font-bold text-cyan-300 transition cursor-pointer"
            >
              <span>🏒</span>
              <span>NHL ({nhlCount})</span>
            </Link>
            {isAdmin && (
              <button
                onClick={handleSyncPredictions}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-2 text-xs font-bold text-purple-300 transition cursor-pointer disabled:opacity-50"
                title="Buscar alertas de hoy (Solo Administrador)"
              >
                <span className={syncing ? "animate-spin" : ""}>⚡</span>
                <span>{syncing ? "Buscando..." : "Buscar Alertas"}</span>
              </button>
            )}
            <button
              onClick={openPushModal}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-black text-white shadow-md transition cursor-pointer"
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

        {/* ======================================================== */}
        {/* UNIFIED FILTER BAR (EXACT NHL / MULTISPORT STRUCTURE)    */}
        {/* ======================================================== */}
        <section className="space-y-4">
          {/* Time Slot & High Conviction Segmentation Pills (Franja) */}
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
              🌐 Todas ({activeSignals.length})
            </button>
            <button
              onClick={() => setMatchStatusFilter("SCHEDULED")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                matchStatusFilter === "SCHEDULED"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
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
              onClick={() => setMatchStatusFilter("BOMBA")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                matchStatusFilter === "BOMBA"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-amber-950/60 text-amber-300 border border-amber-800 hover:bg-amber-900"
              }`}
            >
              🔥 Bomba ({bombaCount})
            </button>
            <button
              onClick={() => setMatchStatusFilter("MCP")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                matchStatusFilter === "MCP"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-purple-950/60 text-purple-300 border border-purple-800 hover:bg-purple-900"
              }`}
            >
              🤖 MCP ({mcpCount})
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

          {/* Secondary Multi-Select Filters Bar */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-3 shadow-xs">
            {/* Search bar */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar equipo o torneo..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 pl-9 pr-8 text-xs font-bold text-slate-100 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-slate-900"
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

              {marketDropdownOptions.length > 0 && (
                <MultiSelectDropdown
                  label="Mercados"
                  options={marketDropdownOptions}
                  selected={selectedMarkets}
                  onChange={setSelectedMarkets}
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
                  className="bg-transparent font-black text-emerald-400 outline-none cursor-pointer"
                >
                  <option value={35} className="bg-slate-900 text-white">35% (Todas)</option>
                  <option value={50} className="bg-slate-900 text-white">50%</option>
                  <option value={60} className="bg-slate-900 text-white">60%</option>
                  <option value={70} className="bg-slate-900 text-white">70% (Muy Alta)</option>
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
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-extrabold text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </section>

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
            <p className="text-xs text-slate-400 mt-1">Prueba seleccionando "Todas" o limpiando los filtros.</p>
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
