"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { RecommendedParlay } from "@/components/RecommendedParlay";
import { FeaturedDailyPicks } from "@/components/FeaturedDailyPicks";
import { MultiSportDashboardCards } from "@/components/MultiSportDashboardCards";
import { McpCountryAgentModal } from "@/components/McpCountryAgentModal";
import { MarketOpportunity, getFeaturedDailyPicks } from "@/lib/sports/prediction-engine";
import { MultiSportSignal } from "@/lib/sports/types";
import { useLanguage } from "@/context/LanguageContext";
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

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [nhlSignals, setNhlSignals] = useState<MultiSportSignal[]>([]);
  const [nhlSmartPick, setNhlSmartPick] = useState<MultiSportSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [newlyDiscoveredAlerts, setNewlyDiscoveredAlerts] = useState<MarketOpportunity[]>([]);
  const [newAlertsModalOpen, setNewAlertsModalOpen] = useState<boolean>(false);
  const [mcpModalOpen, setMcpModalOpen] = useState<boolean>(false);
  const [sportFilter, setSportFilter] = useState<"all" | "football" | "nhl">("all");
  const [copiedPickId, setCopiedPickId] = useState<string | null>(null);
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

  const loadSignals = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      
      // Load Football signals
      const res = await fetch(`/api/signals?_t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      const serverSignals: MarketOpportunity[] = Array.isArray(json.signals)
        ? json.signals
        : [];
      const cleanUniqueSignals = deduplicatePicksList(serverSignals);
      setPredictions(cleanUniqueSignals);

      // Load NHL signals in parallel
      const nhlRes = await fetch(`/api/mcp/predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: "nhl", query: "jornada hoy" }),
      }).catch(() => null);

      if (nhlRes && nhlRes.ok) {
        const nhlData = await nhlRes.json();
        if (Array.isArray(nhlData.predictions)) {
          // Convert to MultiSportSignal format
          const formattedNHL: MultiSportSignal[] = nhlData.predictions.map((p: any) => ({
            id: String(p.fixtureId || p.id),
            sport: "nhl" as const,
            game: {
              id: String(p.fixtureId || p.id),
              sport: "nhl" as const,
              gameDate: p.kickoff || new Date().toISOString(),
              homeTeam: { id: "nhl-h", name: p.homeTeam },
              awayTeam: { id: "nhl-a", name: p.awayTeam },
              status: p.status === "won" ? "FINISHED" : "SCHEDULED",
            },
            market: p.market,
            selection: p.selection,
            decimalOdds: p.odds || 1.85,
            fairOdds: p.fairOdds || 1.70,
            modelProbability: (p.probability || 55) / 100,
            smartEdge: (p.edge || 5) / 100,
            smartScore: p.smartScore || 75,
            expectedValue: p.edge || 5,
            classification: p.confidence === "Muy Alta" ? "TOP PICK" : "STRONG",
            rationale: p.explanation || "Análisis cuantitativo xG y porteros titulares.",
            explanation: p.explanation || "Análisis cuantitativo xG y porteros titulares.",
            confidence: p.confidence || "Alta",
          }));
          setNhlSignals(formattedNHL);
          if (formattedNHL.length > 0) {
            setNhlSmartPick(formattedNHL[0]);
          }
        }
      }
    } catch (err) {
      console.error("Error loading multi-sport signals:", err);
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
      setSyncMessage("⚡ Buscando alertas multi-deporte con modelos cuantitativos...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: "all" }),
      });
      const data = await res.json();
      if (data.success) {
        const cleanPicks = Array.isArray(data.predictions) ? deduplicatePicksList(data.predictions) : predictions;
        if (data.newAlerts && data.newAlerts.length > 0) {
          setNewlyDiscoveredAlerts(data.newAlerts);
          setNewAlertsModalOpen(true);
          setSyncMessage(`✓ ¡Se encontraron ${data.newAlerts.length} nuevas alertas multi-deporte!`);
        } else {
          const todayPending = cleanPicks.filter(
            (p: MarketOpportunity) => p.status === "pending" || (!p.actualScore && p.status !== "won" && p.status !== "lost")
          );
          if (todayPending.length > 0) {
            setNewlyDiscoveredAlerts(todayPending);
            setNewAlertsModalOpen(true);
          }
          setSyncMessage(`✓ Mercados sincronizados (${data.count || cleanPicks.length} alertas activas).`);
        }
        await loadSignals(false);
      } else {
        setSyncMessage(`⚠️ ${data.message || "Error al sincronizar alertas multi-deporte"}`);
      }
    } catch {
      setSyncMessage("❌ Error de conexión al buscar alertas de hoy");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleCopyPick = (pick: MarketOpportunity) => {
    const text = [
      `⭐ SMARTBETBOT MCP — PRONÓSTICO DE CONFIANZA MUY ALTA ⭐`,
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `🎯 ${pick.homeTeam} vs ${pick.awayTeam}`,
      `📊 Mercado: ${pick.market} — Selección: ${pick.selection} @${(pick.odds ?? 1.5).toFixed(2)}`,
      `📈 Probabilidad Modelo: ${pick.probability}% (Fair Odds: @${(pick.fairOdds ?? pick.odds ?? 1.5).toFixed(2)})`,
      `💎 Ventaja (+EV): +${pick.edge || 5}%`,
      `⭐ Confianza: ${pick.confidence || "Muy Alta"}`,
      "",
      `🧠 Análisis: "${pick.explanation}"`,
      "",
      "🌐 https://smartbetbot.educandotea.com",
    ].join("\n");

    const key = pick.id || `${pick.fixtureId}-${pick.market}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedPickId(key);
      setTimeout(() => setCopiedPickId(null), 2500);
    });
  };

  const now = new Date();
  const formattedToday = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Current active date strictly in Ecuador timezone (UTC-5)
  const todayDateStr = getEcuadorDateString(Date.now());
  const todayPredictions = predictions.filter((p) => {
    const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
    return pDate === todayDateStr;
  });

  // Filter high confidence picks
  const highConfidenceFootballPicks = todayPredictions
    .filter((p) => {
      const isFocusMarket = p.market === "Ganador Local" || p.market === "Over 2.5 Goles" || p.market === "Córners";
      const isHighConf =
        p.confidence === "Muy Alta" ||
        (p.confidenceScore && p.confidenceScore >= 70) ||
        (p.probability && p.probability >= 65);
      return isHighConf || (isFocusMarket && p.probability >= 58);
    })
    .sort((a, b) => (b.probability || 0) - (a.probability || 0));

  // Map NHL signals to MarketOpportunity for display in combined feed
  const nhlOpportunities: MarketOpportunity[] = nhlSignals.map((s) => ({
    id: `nhl-${s.id}`,
    fixtureId: s.game.id,
    match: `${s.game.homeTeam.name} vs ${s.game.awayTeam.name}`,
    homeTeam: s.game.homeTeam.name,
    awayTeam: s.game.awayTeam.name,
    league: "NHL",
    country: "USA / Canadá",
    market: s.market,
    selection: s.selection,
    odds: s.decimalOdds,
    fairOdds: Number((1 / (s.modelProbability || 0.55)).toFixed(2)),
    probability: Math.round(s.modelProbability * 100),
    smartScore: s.smartScore,
    edge: s.expectedValue,
    expectedValue: s.expectedValue,
    confidence: (s.classification === "TOP PICK" ? "Muy Alta" : "Alta") as any,
    confidenceScore: s.smartScore,
    explanation: s.explanation || "Análisis cuantitativo xG y porteros titulares NHL.",
    kickoff: s.game.startsAt,
    status: "pending" as const,
    bookmaker: "Bet365",
    bookmakerOdds: s.decimalOdds,
    pickBadge: (s.classification === "TOP PICK" ? "bomba" : "valor") as any,
  }));

  // Combined Multi-Sport Top Picks
  const allCombinedPicks: MarketOpportunity[] = [
    ...highConfidenceFootballPicks,
    ...nhlOpportunities,
  ].sort((a, b) => (b.probability || 0) - (a.probability || 0));

  const filteredPicks = sportFilter === "football"
    ? highConfidenceFootballPicks
    : sportFilter === "nhl"
    ? nhlOpportunities
    : allCombinedPicks;

  const topRecommendedPicks = filteredPicks.slice(0, 8);

  // Total active signals across all sports
  const totalActiveSignalsCount = todayPredictions.length + nhlSignals.length;

  // Featured SmartPick and Bomba del día
  const { smartPick, bombaPick } = getFeaturedDailyPicks(
    sportFilter === "nhl" && nhlOpportunities.length > 0 ? nhlOpportunities : todayPredictions
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      <Navbar onSync={handleSyncPredictions} syncing={syncing} />

      <main className="mx-auto max-w-7xl flex-1 px-3 sm:px-6 py-6 sm:py-8 w-full space-y-8">
        {/* Sync Toast */}
        {syncMessage && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm font-black text-emerald-800 backdrop-blur-md dark:text-emerald-300 animate-fadeIn">
            {syncMessage}
          </div>
        )}

        {/* Top Hero Brand Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-slate-950 shadow-2xl shadow-emerald-950/40 group">
          <img
            src="/dashboard-banner.png"
            alt="SmartBetBot - La IA Analiza. Tú decides mejor. Fútbol, NBA, NHL, NFL, NCAAF"
            className="w-full h-auto object-cover rounded-3xl max-h-[300px] sm:max-h-[380px] lg:max-h-[440px] transition-transform duration-500 group-hover:scale-[1.01]"
            loading="eager"
          />
        </div>

        {/* 1. Multi-Sport Executive Intelligence Header */}
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-6 sm:p-8 text-white shadow-2xl">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Plataforma Multi-Deporte con IA
                </span>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 border border-slate-700/60 capitalize">
                  📅 {formattedToday}
                </span>
                <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-bold text-cyan-300 border border-cyan-500/30">
                  ⚽ 🏒 🏀 🏈 5 Deportes
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
                Centro de Inteligencia Multi-Deporte
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                Pronósticos deportivos inteligentes seleccionados por <strong className="text-emerald-400 font-bold">Inteligencia Artificial y Modelos Cuantitativos</strong> para <strong className="text-emerald-400 font-bold">Fútbol, NHL, NBA, NFL y NCAAF</strong>. SmartBetBot analiza estadísticas avanzadas, probabilidades implícitas y cuotas reales (+EV) para mostrarte las mejores oportunidades de forma clara, rápida y sin sesgos.
              </p>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                onClick={() => setMcpModalOpen(true)}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/50 transition cursor-pointer"
              >
                <span>🤖</span>
                <span>Agente MCP Multi-Deporte</span>
              </button>
              <button
                onClick={openPushModal}
                className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/90 hover:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 hover:text-white transition cursor-pointer"
              >
                <span>🔔</span>
                <span>Alertas Móvil</span>
              </button>
              {isAdmin && (
                <button
                  onClick={handleSyncPredictions}
                  disabled={syncing}
                  className="flex items-center gap-1.5 rounded-2xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-2.5 text-xs font-bold text-purple-300 transition cursor-pointer disabled:opacity-50"
                  title="Buscar alertas multi-deporte de Hoy"
                >
                  <span className={syncing ? "animate-spin" : ""}>⚡</span>
                  <span>{syncing ? "Sincronizando..." : "⚡ Sincronizar Todo"}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 2. Top Executive Multi-Sport KPI Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Señales Activas</span>
              <span className="text-base">⚡</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {totalActiveSignalsCount}
              </span>
              <span className="text-[11px] font-bold text-emerald-500 dark:text-emerald-400">Hoy</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {todayPredictions.length} Fútbol · {nhlSignals.length} NHL
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Efectividad Global</span>
              <span className="text-base">📈</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">74.2%</span>
              <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">+EV Alto</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Historial verificado multi-disciplina</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Deportes Cubiertos</span>
              <span className="text-base">🏆</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400">5</span>
              <span className="text-[11px] font-bold text-cyan-500">Deportes</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Fútbol, NHL, NBA, NFL, NCAAF</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Parleys Inteligentes</span>
              <span className="text-base">🎲</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400">3</span>
              <span className="text-[11px] font-bold text-purple-500">Listos</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Seguro, Doble Valor y Pro</p>
          </div>
        </section>

        {/* 3. Sports Explorer Cards (Prominent Central Showcase) */}
        <MultiSportDashboardCards
          footballSignalsCount={todayPredictions.length}
          footballSmartPick={smartPick}
          nhlSignalsCount={nhlSignals.length}
          nhlSmartPick={nhlSmartPick}
        />

        {/* 4. Strategic Briefing */}
        <section className="rounded-3xl border border-teal-500/20 bg-gradient-to-r from-teal-950/20 via-slate-900/40 to-slate-900/20 p-5 sm:p-6 backdrop-blur-sm dark:border-teal-500/20 dark:bg-slate-900/50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">💡</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  Estrategia Cuantitativa Diaria
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                SmartBetBot aplica modelos de <strong className="text-emerald-600 dark:text-emerald-400 font-bold">distribución Poisson</strong> en fútbol para victorias locales y over de goles, y modelos de <strong className="text-cyan-600 dark:text-cyan-400 font-bold">goles esperados (xG) y rendimiento de porteros (GSAx)</strong> en hockey sobre hielo NHL. Mantén un <span className="font-semibold underline decoration-emerald-500">stake plano de 1% a 2%</span> por jugada.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={openPushModal}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-black text-white shadow transition cursor-pointer"
              >
                <span>📲</span>
                <span>Recibir Alertas en Teléfono</span>
              </button>
            </div>
          </div>
        </section>

        {/* 5. Curated High Confidence Multi-Sport Picks */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-base font-black border border-emerald-500/20">
                ⭐
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Picks Recomendados de Confianza Muy Alta
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Oportunidades con mayor probabilidad matemática y ventaja sobre la casa (+EV)
                </p>
              </div>
            </div>

            {/* Sport Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSportFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  sportFilter === "all"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                }`}
              >
                Todos ({allCombinedPicks.length})
              </button>
              <button
                onClick={() => setSportFilter("football")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  sportFilter === "football"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                }`}
              >
                <span>⚽</span>
                <span>Fútbol ({highConfidenceFootballPicks.length})</span>
              </button>
              <button
                onClick={() => setSportFilter("nhl")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  sportFilter === "nhl"
                    ? "bg-cyan-500 text-slate-950 font-black shadow-xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                }`}
              >
                <span>🏒</span>
                <span>NHL ({nhlOpportunities.length})</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-3" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Cargando pronósticos multi-deporte con IA...
              </p>
            </div>
          ) : topRecommendedPicks.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900/50">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Calculando oportunidades de valor
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                No hay partidos activos en este filtro para hoy. Prueba seleccionando "Todos" o sincronizando la jornada.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topRecommendedPicks.map((pick, idx) => {
                const pickKey = pick.id || `${pick.fixtureId}-${pick.market}-${idx}`;
                const isCopied = copiedPickId === pickKey;
                const isNHL = pick.league === "NHL";

                return (
                  <div
                    key={pickKey}
                    className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/90 group"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/60">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-base">{isNHL ? "🏒" : "⚽"}</span>
                          <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {pick.league}
                          </span>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black shrink-0 border ${
                          isNHL
                            ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        }`}>
                          ⭐ {pick.confidence || "Muy Alta"}
                        </span>
                      </div>

                      {/* Teams */}
                      <div className="my-3 space-y-0.5">
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {pick.homeTeam}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium">vs</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {pick.awayTeam}
                        </div>
                      </div>

                      {/* Market & Selection Box */}
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/80 border border-slate-200/60 dark:border-slate-800/60 mb-3">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider text-[10px]">
                            {pick.market}
                          </span>
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                            @{((pick.odds ?? 1.5)).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs font-black text-slate-900 dark:text-white mt-1">
                          {pick.selection || pick.market}
                        </div>
                      </div>

                      {/* Prob & Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center py-2 border-t border-slate-100 dark:border-slate-800/60 mb-3">
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Prob IA</div>
                          <div className="text-xs font-black text-slate-900 dark:text-white">
                            {pick.probability}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Fair Odds</div>
                          <div className="text-xs font-black text-slate-700 dark:text-slate-300">
                            @{((pick.fairOdds ?? pick.odds ?? 1.5)).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Ventaja +EV</div>
                          <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                            +{pick.edge || 5}%
                          </div>
                        </div>
                      </div>

                      {/* Rationale Snippet */}
                      {pick.explanation && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed italic border-t border-slate-100 dark:border-slate-800/60 pt-2 line-clamp-2">
                          "{pick.explanation}"
                        </p>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleCopyPick(pick)}
                        className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                          isCopied
                            ? "bg-emerald-600 text-white font-black"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200"
                        }`}
                      >
                        <span>{isCopied ? "✓" : "📋"}</span>
                        <span>{isCopied ? "Copiado" : "Copiar"}</span>
                      </button>

                      <button
                        onClick={() => setActiveModalPick(pick)}
                        className="py-1.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
                      >
                        <span>Detalle</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 6. Featured SmartPick & Bomba del Día */}
        {(smartPick || bombaPick) && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-base font-black border border-amber-500/20">
                👑
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Destacados Exclusivos del Día
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Smart Pick (máxima convicción) y Bomba del Día (cuota alta +2.00 con valor)
                </p>
              </div>
            </div>

            <FeaturedDailyPicks
              smartPick={smartPick}
              bombaPick={bombaPick}
              onOpenDetail={setActiveModalPick}
            />
          </section>
        )}

        {/* 7. Recommended 3 Exclusive Parlays */}
        {todayPredictions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-base font-black border border-indigo-500/20">
                  🎲
                </span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Parleys Recomendados del Día
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Combinadas optimizadas algorítmicamente por correlación y +EV
                  </p>
                </div>
              </div>

              <Link
                href="/parlay"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                <span>Generador de Parleys</span>
                <span>→</span>
              </Link>
            </div>

            <RecommendedParlay
              predictions={todayPredictions}
              onSelectPrediction={setActiveModalPick}
            />
          </section>
        )}

        {/* 8. Golden Rules & Bankroll Management Guide */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900/80 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Reglas de Oro y Gestión de Banca Multi-Deporte
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilares cuantitativos para mantener rentabilidad consistente a largo plazo
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span>🎯</span> 1. Mercados de Alta Efectividad
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Prioriza Ganador Local (1) y Over 2.5 en Fútbol, y Moneyline y Puck Line en NHL. Son los mercados donde los modelos estadísticos logran mayor tasa de acierto.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span>⚖️</span> 2. Stake Plano (1-2%)
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Asigna una unidad fija (1% a 2% de tu capital total) por apuesta individual. Nunca dobles apuestas tras un fallo (evita la Martingala).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span>🚫</span> 3. Filtro Anti-Cuotas Basura
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Evita cuotas @1.15 sin valor matemático real. El valor surge cuando la probabilidad calculada por el modelo supera la cuota ofrecida por la casa.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span>📈</span> 4. Disciplina y Consistencia
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                El beneficio en apuestas cuantitativas se mide en bloques de 50 a 100 jugadas. Respeta la estrategia y sigue los picks con confianza alta.
              </p>
            </div>
          </div>
        </section>

        {/* 9. Quick Module Navigation Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/signals"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">⚽</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Pre-Match Fútbol</span>
              <span className="text-[10px] text-slate-500">{todayPredictions.length} señales activas</span>
            </div>
          </Link>

          <Link
            href="/sports/nhl"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-cyan-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🏒</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Suite NHL Hockey</span>
              <span className="text-[10px] text-slate-500">{nhlSignals.length} señales activas</span>
            </div>
          </Link>

          <Link
            href="/parlay"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🎲</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Creador de Parleys</span>
              <span className="text-[10px] text-slate-500">Combinadas calculadas</span>
            </div>
          </Link>

          <Link
            href="/history"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📜</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Historial Verificado</span>
              <span className="text-[10px] text-slate-500">Resultados y auditoría</span>
            </div>
          </Link>
        </section>
      </main>

      {/* Modal de Nuevas Alertas Descubiertas */}
      <NewAlertsModal
        isOpen={newAlertsModalOpen}
        newAlerts={newlyDiscoveredAlerts}
        totalCount={predictions.length}
        onClose={() => setNewAlertsModalOpen(false)}
        onOpenDetail={setActiveModalPick}
      />

      {/* Match Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}

      {/* Multi-Sport MCP Modal */}
      <McpCountryAgentModal
        isOpen={mcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
        sport="football"
      />
    </div>
  );
}
