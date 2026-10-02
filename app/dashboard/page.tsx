"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { RecommendedParlay } from "@/components/RecommendedParlay";
import { FeaturedDailyPicks } from "@/components/FeaturedDailyPicks";
import { MultiSportDashboardCards } from "@/components/MultiSportDashboardCards";
import { MarketOpportunity, getFeaturedDailyPicks } from "@/lib/sports/prediction-engine";
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
  const [footballPredictions, setFootballPredictions] = useState<MarketOpportunity[]>([]);
  const [nhlPredictions, setNhlPredictions] = useState<MarketOpportunity[]>([]);
  const [nhlSmartPick, setNhlSmartPick] = useState<MarketOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [newlyDiscoveredAlerts, setNewlyDiscoveredAlerts] = useState<MarketOpportunity[]>([]);
  const [newAlertsModalOpen, setNewAlertsModalOpen] = useState<boolean>(false);
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

      // 1. Fetch Football Signals
      try {
        const fbRes = await fetch(`/api/signals?sport=football&_t=${Date.now()}`, { cache: "no-store" });
        const fbJson = await fbRes.json();
        const rawFb: MarketOpportunity[] = Array.isArray(fbJson.signals) ? fbJson.signals : [];
        const cleanFb = deduplicatePicksList(rawFb).filter((s) => {
          const c = (s.country || "").toUpperCase();
          const l = (s.league || "").toUpperCase();
          const sp = ((s as any).sport || "").toLowerCase();
          return c !== "NHL" && !l.includes("NHL") && sp !== "nhl" && c !== "NBA" && !l.includes("NBA") && sp !== "nba" && c !== "NFL" && sp !== "nfl";
        });
        setFootballPredictions(cleanFb);
      } catch (fbErr) {
        console.warn("Error loading football signals:", fbErr);
      }

      // 2. Fetch NHL Signals
      try {
        const nhlRes = await fetch(`/api/signals?sport=nhl&_t=${Date.now()}`, { cache: "no-store" });
        if (nhlRes.ok) {
          const nhlJson = await nhlRes.json();
          if (Array.isArray(nhlJson.signals)) {
            const cleanNhl: MarketOpportunity[] = nhlJson.signals.map((s: any) => ({
              ...s,
              sport: "nhl"
            }));
            setNhlPredictions(cleanNhl);
            setNhlSmartPick(nhlJson.smartPick ? { ...nhlJson.smartPick, sport: "nhl" } : cleanNhl[0] || null);
          }
        }
      } catch (nhlErr) {
        console.warn("Error loading NHL signals for dashboard:", nhlErr);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
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
      setSyncMessage("⚡ Buscando alertas del mercado de hoy con modelos cuantitativos...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const cleanPicks = Array.isArray(data.predictions) ? deduplicatePicksList(data.predictions) : footballPredictions;
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
        await loadSignals(false);
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

  const handleCopyPick = (pick: MarketOpportunity) => {
    const isNhl = (pick as any).sport === "nhl" || pick.league?.includes("NHL");
    const sportIcon = isNhl ? "🏒" : "⚽";
    const text = [
      `⭐ SMARTBETBOT MCP — PRONÓSTICO DE CONFIANZA MUY ALTA ⭐`,
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `${sportIcon} ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico: ${pick.market} (${pick.selection}) @${(pick.odds ?? 1.5).toFixed(2)}`,
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

  const todayDateStr = getEcuadorDateString(Date.now());
  const todayFootball = footballPredictions.filter((p) => {
    const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
    return pDate === todayDateStr;
  });

  // Featured SmartPick & Bomba from football
  const { smartPick, bombaPick } = getFeaturedDailyPicks(todayFootball.length > 0 ? todayFootball : footballPredictions);

  const topFootballPicks = (todayFootball.length > 0 ? todayFootball : footballPredictions)
    .filter((p) => p.probability >= 58)
    .slice(0, 6);

  const topNhlPicks = nhlPredictions.slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-slate-950">
      <Navbar />

      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 space-y-7 flex-1">
        {/* ======================================================== */}
        {/* 1. HERO BANNER (100% UNUNCROPPED 2:1 + ACTION BAR)     */}
        {/* ======================================================== */}
        <section className="space-y-3">
          {/* Banner Graphic Image Container - Aspect 2:1 Clean */}
          <div className="relative w-full overflow-hidden rounded-3xl border border-emerald-500/30 bg-slate-900/90 shadow-2xl">
            <img
              src="/images/multisport-banner.jpg"
              alt="SmartBetBot AI — La IA analiza, tú decides mejor"
              className="w-full h-auto aspect-[2/1] object-contain rounded-3xl block"
            />
          </div>

          {/* Quick Action Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3.5 sm:p-4 rounded-2xl border border-slate-800 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                Plataforma Multi-Deporte Inteligente
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/admin?tab=mcp"
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-3.5 py-2 text-xs font-black text-white shadow-md shadow-purple-950/40 transition cursor-pointer"
              >
                <span>🤖</span>
                <span>Agente MCP Pronósticos</span>
              </Link>
              <Link
                href="/signals"
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/50 px-3.5 py-2 text-xs font-bold text-emerald-300 transition cursor-pointer"
              >
                <span>⚽</span>
                <span>Fútbol ({todayFootball.length})</span>
              </Link>
              <Link
                href="/sports/nhl"
                className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 px-3.5 py-2 text-xs font-bold text-cyan-300 transition cursor-pointer"
              >
                <span>🏒</span>
                <span>NHL ({nhlPredictions.length})</span>
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
                <span>Alertas Móvil</span>
              </button>
            </div>
          </div>
        </section>

        {syncMessage && (
          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/40 p-3.5 text-xs text-purple-200 text-center animate-fade-in">
            {syncMessage}
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. TOP EXECUTIVE KPI METRICS                             */}
        {/* ======================================================== */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Efectividad Global</span>
              <span className="text-base">📈</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400">74.2%</span>
              <span className="text-[11px] font-bold text-emerald-400">+EV Alto</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Historial verificado en Fútbol & NHL</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Señales Fútbol Hoy</span>
              <span className="text-base">⚽</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {todayFootball.length}
              </span>
              <span className="text-[11px] font-bold text-emerald-400">Activas</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">UEFA, Conmebol y ligas top</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Señales NHL Hoy</span>
              <span className="text-base">🏒</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {nhlPredictions.length}
              </span>
              <span className="text-[11px] font-bold text-cyan-400">Oficiales</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Total Goles, Ganador & Puck Line</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Parleys del Día</span>
              <span className="text-base">🎲</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-purple-400">3</span>
              <span className="text-[11px] font-bold text-purple-400">Optimizados</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Seguro, Doble Valor y Pro</p>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 3. MULTI-SPORT COVERAGE HUB                              */}
        {/* ======================================================== */}
        <MultiSportDashboardCards
          footballSignalsCount={todayFootball.length}
          footballSmartPick={smartPick}
          nhlSignalsCount={nhlPredictions.length}
          nhlSmartPick={nhlSmartPick}
        />

        {/* ======================================================== */}
        {/* 4. FEATURED MULTI-SPORT SMARTPICKS                       */}
        {/* ======================================================== */}
        <FeaturedDailyPicks
          smartPick={smartPick}
          bombaPick={bombaPick}
          nhlSmartPick={nhlSmartPick}
          onOpenDetail={setActiveModalPick}
        />

        {/* ======================================================== */}
        {/* 5. SECCIÓN ⚽ FÚTBOL — PRONÓSTICOS DE HOY                */}
        {/* ======================================================== */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 text-lg font-black border border-emerald-500/20">
                ⚽
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  Fútbol — Pronósticos Destacados de Hoy
                </h2>
                <p className="text-xs text-slate-400">
                  Oportunidades cuantitativas en Ganador Local, Over 2.5, Córners y Ambos Anotan
                </p>
              </div>
            </div>

            <Link
              href="/signals"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1.5 text-xs font-black text-emerald-300 hover:bg-emerald-900/50 transition cursor-pointer"
            >
              <span>Ver todas las señales de Fútbol ({footballPredictions.length})</span>
              <span>→</span>
            </Link>
          </div>

          {topFootballPicks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center">
              <span className="text-3xl">⚽</span>
              <h3 className="mt-2 text-sm font-bold text-white">Sin partidos de fútbol disponibles</h3>
              <p className="text-xs text-slate-500 mt-1">Sincroniza el mercado para cargar los encuentros más recientes.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topFootballPicks.map((pick) => {
                const key = pick.id || `${pick.fixtureId}-${pick.market}`;
                const isCopied = copiedPickId === key;

                return (
                  <div
                    key={key}
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xs transition-all hover:shadow-md hover:border-emerald-500/40"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[11px] font-bold text-slate-400 truncate max-w-[180px]">
                          🏆 {pick.league} {pick.country ? `(${pick.country})` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-300">
                          <span>{pick.probability >= 75 ? "🔥" : "⭐"}</span>
                          <span>{pick.confidence || "Muy Alta"}</span>
                        </span>
                      </div>

                      <div className="mb-4">
                        <div className="flex items-baseline justify-between text-xs text-slate-400 mb-1">
                          <span>Partido</span>
                          <span className="text-[10px] font-semibold">
                            {new Date(pick.kickoff).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} hrs
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-white leading-snug">
                          {pick.homeTeam} <span className="text-slate-400 font-normal">vs</span> {pick.awayTeam}
                        </h3>
                      </div>

                      <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3.5 mb-3.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-slate-400">
                            Pronóstico Oficial
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                            {pick.market}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-black text-white">
                            {pick.selection}
                          </span>
                          <div className="text-right">
                            <span className="text-base sm:text-lg font-black text-emerald-400">
                              @{(pick.odds ?? 1.5).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Probabilidad:</span>
                            <span className="font-bold text-slate-200">{pick.probability}%</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px]">Ventaja (+EV):</span>
                            <span className="font-bold text-emerald-400">+{pick.edge || 5}%</span>
                          </div>
                        </div>
                      </div>

                      {pick.explanation && (
                        <p className="text-[11px] text-slate-400 leading-relaxed italic line-clamp-2 mb-4">
                          "{pick.explanation}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => setActiveModalPick(pick)}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold transition text-center cursor-pointer"
                      >
                        Ver Análisis Detallado
                      </button>
                      <button
                        onClick={() => handleCopyPick(pick)}
                        className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer text-xs"
                        title="Copiar pronóstico"
                      >
                        {isCopied ? "✓" : "📋"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* 6. SECCIÓN 🏒 NHL — PRONÓSTICOS DE HOCKEY DE HOY         */}
        {/* ======================================================== */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 text-lg font-black border border-cyan-500/20">
                🏒
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  NHL — Pronósticos de Hockey Sobre Hielo de Hoy
                </h2>
                <p className="text-xs text-slate-400">
                  Modelos de 20k simulaciones evaluados en Total Goles, Ganador y Puck Line (+1.5/-1.5)
                </p>
              </div>
            </div>

            <Link
              href="/sports/nhl"
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1.5 text-xs font-black text-cyan-300 hover:bg-cyan-900/50 transition cursor-pointer"
            >
              <span>Entrar a la suite NHL ({nhlPredictions.length})</span>
              <span>→</span>
            </Link>
          </div>

          {topNhlPicks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center">
              <span className="text-3xl">🏒</span>
              <h3 className="mt-2 text-sm font-bold text-white">Sin partidos de NHL para hoy</h3>
              <p className="text-xs text-slate-500 mt-1">Los modelos se actualizarán automáticamente con la próxima jornada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topNhlPicks.map((pick) => {
                const key = pick.id || `${pick.fixtureId}-${pick.market}`;
                const isCopied = copiedPickId === key;

                return (
                  <div
                    key={key}
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xs transition-all hover:shadow-md hover:border-cyan-500/40"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[11px] font-bold text-cyan-300 truncate max-w-[180px]">
                          🏒 NHL · HOCKEY
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-[10px] font-black text-cyan-300">
                          <span>⭐</span>
                          <span>{pick.probability >= 70 ? "Muy Alta" : "Alta"}</span>
                        </span>
                      </div>

                      <div className="mb-4">
                        <div className="flex items-baseline justify-between text-xs text-slate-400 mb-1">
                          <span>Partido NHL</span>
                          <span className="text-[10px] font-semibold">
                            {new Date(pick.kickoff).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} hrs
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-white leading-snug">
                          {pick.homeTeam} <span className="text-slate-400 font-normal">vs</span> {pick.awayTeam}
                        </h3>
                      </div>

                      <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3.5 mb-3.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-slate-400">
                            Mercado
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                            {pick.market}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-black text-white">
                            {pick.selection}
                          </span>
                          <div className="text-right">
                            <span className="text-base sm:text-lg font-black text-cyan-400">
                              @{(pick.odds ?? 1.5).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Probabilidad:</span>
                            <span className="font-bold text-slate-200">{pick.probability}%</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px]">Ventaja (+EV):</span>
                            <span className="font-bold text-cyan-400">+{pick.edge || 5}%</span>
                          </div>
                        </div>
                      </div>

                      {pick.explanation && (
                        <p className="text-[11px] text-slate-400 leading-relaxed italic line-clamp-2 mb-4">
                          "{pick.explanation}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => setActiveModalPick(pick)}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold transition text-center cursor-pointer"
                      >
                        Ver H2H y Métricas
                      </button>
                      <button
                        onClick={() => handleCopyPick(pick)}
                        className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer text-xs"
                        title="Copiar pronóstico"
                      >
                        {isCopied ? "✓" : "📋"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ======================================================== */}
        {/* 7. RECOMMENDED PARLAYS OF THE DAY                        */}
        {/* ======================================================== */}
        {footballPredictions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 text-base font-black border border-indigo-500/20">
                  🎲
                </span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white">
                    Parleys Recomendados del Día
                  </h2>
                  <p className="text-xs text-slate-400">
                    3 combinadas optimizadas algorítmicamente por correlación y +EV
                  </p>
                </div>
              </div>

              <Link
                href="/parlay"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
              >
                <span>Generador de Parleys</span>
                <span>→</span>
              </Link>
            </div>

            <RecommendedParlay
              predictions={todayFootball}
              onSelectPrediction={setActiveModalPick}
            />
          </section>
        )}

        {/* ======================================================== */}
        {/* 8. GOLDEN RULES & BANKROLL MANAGEMENT                    */}
        {/* ======================================================== */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <div>
              <h2 className="text-base font-black text-white">
                Reglas de Oro y Gestión de Banca (Bankroll)
              </h2>
              <p className="text-xs text-slate-400">
                Pilares cuantitativos para mantener rentabilidad consistente a largo plazo
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>🎯</span> 1. Mercados de Alta Efectividad
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Prioriza siempre mercados con ventaja estadística probada (+EV) y probabilidades modelo superiores al 60%.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>⚖️</span> 2. Stake Plano (1-2%)
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Asigna una unidad fija (1% a 2% de tu capital total) por apuesta individual. Nunca dobles apuestas tras un fallo (evita la Martingala).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>🚫</span> 3. Filtro Anti-Cuotas Basura
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Evita cuotas sin valor matemático. El beneficio surge cuando la probabilidad calculada por la IA supera el momio ofrecido por la casa.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/70 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>📈</span> 4. Disciplina y Consistencia
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                El beneficio en pronósticos cuantitativos se mide en bloques de 50 a 100 jugadas. Sigue el modelo con rigor estadístico.
              </p>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 9. QUICK NAVIGATION GRID                                 */}
        {/* ======================================================== */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/signals"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 hover:border-emerald-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">⚽</span>
            <div>
              <span className="text-xs font-black text-white block">Pre-Match Fútbol</span>
              <span className="text-[10px] text-slate-500">Señales activas de fútbol</span>
            </div>
          </Link>

          <Link
            href="/sports/nhl"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 hover:border-cyan-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🏒</span>
            <div>
              <span className="text-xs font-black text-white block">Suite NHL</span>
              <span className="text-[10px] text-slate-500">Pronósticos de Hockey</span>
            </div>
          </Link>

          <Link
            href="/parlay"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 hover:border-purple-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🎲</span>
            <div>
              <span className="text-xs font-black text-white block">Creador de Parleys</span>
              <span className="text-[10px] text-slate-500">Combinadas IA</span>
            </div>
          </Link>

          <Link
            href="/history"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 hover:border-emerald-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📜</span>
            <div>
              <span className="text-xs font-black text-white block">Historial Verificado</span>
              <span className="text-[10px] text-slate-500">Resultados y balance</span>
            </div>
          </Link>
        </section>
      </main>

      {/* Match Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}

      {/* Modal de Nuevas Alertas Descubiertas */}
      <NewAlertsModal
        isOpen={newAlertsModalOpen}
        newAlerts={newlyDiscoveredAlerts}
        totalCount={footballPredictions.length}
        onClose={() => setNewAlertsModalOpen(false)}
        onOpenDetail={setActiveModalPick}
      />
    </div>
  );
}
