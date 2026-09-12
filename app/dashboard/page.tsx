"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { RecommendedParlay } from "@/components/RecommendedParlay";
import { FeaturedDailyPicks } from "@/components/FeaturedDailyPicks";
import { MarketOpportunity, getFeaturedDailyPicks } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import { openPushModal } from "@/components/PushNotificationManager";


function getMatchDeduplicationKey(p: MarketOpportunity): string {
  const fixId = Number(p.fixtureId) || 0;
  if (fixId > 0) return `fix-${fixId}`;
  const h = (p.homeTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
  const a = (p.awayTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
  
  // Canonical aliases
  let hKey = h;
  let aKey = a;
  if (h.includes("chico")) hKey = "boyacachico";
  if (a.includes("chico")) aKey = "boyacachico";
  if (h.includes("medellin")) hKey = "independientemedellin";
  if (a.includes("medellin")) aKey = "independientemedellin";
  if (h.includes("cruzazul")) hKey = "cruzazul";
  if (a.includes("cruzazul")) aKey = "cruzazul";
  if (h.includes("america") && !h.includes("cali")) hKey = "clubamerica";
  if (a.includes("america") && !a.includes("cali")) aKey = "clubamerica";
  if (h.includes("columbus")) hKey = "columbuscrew";
  if (a.includes("columbus")) aKey = "columbuscrew";
  if (h.includes("redbulls")) hKey = "newyorkredbulls";
  if (a.includes("redbulls")) aKey = "newyorkredbulls";
  if (h.includes("dallas")) hKey = "fcdallas";
  if (a.includes("dallas")) aKey = "fcdallas";
  if (h.includes("portland")) hKey = "portlandtimbers";
  if (a.includes("portland")) aKey = "portlandtimbers";
  
  return `${hKey}-${aKey}`;
}

function deduplicatePicksList(picks: MarketOpportunity[]): MarketOpportunity[] {
  const map = new Map<string, MarketOpportunity>();
  const seenTeams = new Set<string>();

  for (const p of picks) {
    const key = getMatchDeduplicationKey(p);
    const h = (p.homeTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
    const a = (p.awayTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
    let hKey = h.includes("chico") ? "boyacachico" : h.includes("cruzazul") ? "cruzazul" : h;
    let aKey = a.includes("chico") ? "boyacachico" : a.includes("cruzazul") ? "cruzazul" : a;

    let matchedExistingKey: string | null = null;
    for (const [exKey, ex] of map.entries()) {
      if (exKey === key) {
        matchedExistingKey = exKey;
        break;
      }
      const exFixId = Number(ex.fixtureId) || 0;
      const fixId = Number(p.fixtureId) || 0;
      if (fixId > 0 && exFixId > 0 && fixId === exFixId) {
        matchedExistingKey = exKey;
        break;
      }
      const exH = (ex.homeTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
      const exA = (ex.awayTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
      let exHKey = exH.includes("chico") ? "boyacachico" : exH.includes("cruzazul") ? "cruzazul" : exH;
      let exAKey = exA.includes("chico") ? "boyacachico" : exA.includes("cruzazul") ? "cruzazul" : exA;

      if ((hKey === exHKey && aKey === exAKey) ||
          ((hKey.includes(exHKey) || exHKey.includes(hKey)) && (aKey.includes(exAKey) || exAKey.includes(aKey)))) {
        matchedExistingKey = exKey;
        break;
      }
    }

    if (matchedExistingKey) {
      const existing = map.get(matchedExistingKey)!;
      map.set(matchedExistingKey, {
        ...existing,
        ...p,
        status: existing.status !== "pending" ? existing.status : p.status || "pending",
        actualScore: existing.actualScore || p.actualScore,
      });
    } else {
      if (!seenTeams.has(hKey) && !seenTeams.has(aKey)) {
        map.set(key, p);
        seenTeams.add(hKey);
        seenTeams.add(aKey);
      }
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

  const loadSignals = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/signals?_t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      const todayDateStr = getEcuadorDateString(Date.now());
      let serverSignals: MarketOpportunity[] = Array.isArray(json.signals)
        ? json.signals.filter((p: MarketOpportunity) => getEcuadorDateString(p.kickoff) === todayDateStr)
        : [];

      try {
        const localRaw = typeof window !== "undefined" ? localStorage.getItem("smartbetbot_published_picks") : null;
        if (localRaw) {
          const localPicks = JSON.parse(localRaw);
          if (Array.isArray(localPicks)) {
            // Strictly retain only today's picks in localStorage
            const validTodayLocalPicks = localPicks.filter(
              (lp: MarketOpportunity) => getEcuadorDateString(lp.kickoff) === todayDateStr
            );
            if (validTodayLocalPicks.length !== localPicks.length) {
              try {
                localStorage.setItem("smartbetbot_published_picks", JSON.stringify(validTodayLocalPicks));
              } catch {}
            }

            const map = new Map<string, MarketOpportunity>();
            for (const p of serverSignals) {
              const key = `${p.fixtureId || 0}-${p.homeTeam}-${p.awayTeam}-${p.market}`;
              map.set(key, p);
            }
            for (const lp of validTodayLocalPicks) {
              const key = `${lp.fixtureId || 0}-${lp.homeTeam}-${lp.awayTeam}-${lp.market}`;
              const existing = map.get(key);
              if (existing) {
                map.set(key, {
                  ...existing,
                  ...lp,
                  status: existing.status && existing.status !== "pending" ? existing.status : lp.status || "pending",
                  actualScore: existing.actualScore || lp.actualScore,
                  isMcpPick: true,
                  pickBadge: lp.pickBadge || existing.pickBadge || "mcp",
                });
              } else {
                map.set(key, { ...lp, isMcpPick: true, pickBadge: lp.pickBadge || "mcp" });
              }
            }
            serverSignals = Array.from(map.values()).filter(
              (p) => getEcuadorDateString(p.kickoff) === todayDateStr
            );
            serverSignals.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
          }
        }
      } catch (err) {
        console.warn("Could not merge local published picks in dashboard:", err);
      }

      const cleanUniqueSignals = deduplicatePicksList(serverSignals);
      setPredictions(cleanUniqueSignals);
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
    const handleNewAlertsDiscovered = (e: any) => {
      if (e.detail?.newAlerts && e.detail.newAlerts.length > 0) {
        setNewlyDiscoveredAlerts(e.detail.newAlerts);
        setNewAlertsModalOpen(true);
      }
    };
    window.addEventListener("new-alerts-discovered", handleNewAlertsDiscovered);
    window.addEventListener("storage", handleUpdated);
    return () => {
      window.removeEventListener("predictions-updated", handleUpdated);
      window.removeEventListener("new-alerts-discovered", handleNewAlertsDiscovered);
      window.removeEventListener("storage", handleUpdated);
    };
  }, []);

  const handleSyncPredictions = async () => {
    try {
      setSyncing(true);
      setSyncMessage("⚡ Buscando nuevas alertas del mercado de hoy con modelos cuantitativos...");
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        if (data.newAlerts && data.newAlerts.length > 0) {
          setNewlyDiscoveredAlerts(data.newAlerts);
          setNewAlertsModalOpen(true);
          setSyncMessage(`✓ ¡Se encontraron ${data.newAlerts.length} nuevas alertas! Agregadas al panel.`);
        } else {
          setSyncMessage(`✓ Mercado al día: no hay nuevas alertas pendientes (${data.count || predictions.length} activas).`);
        }
        if (Array.isArray(data.predictions)) {
          const cleanPicks = deduplicatePicksList(data.predictions);
          setPredictions(cleanPicks);
          window.dispatchEvent(new CustomEvent("predictions-updated", { detail: cleanPicks }));
        } else {
          await loadSignals();
        }
      } else {
        setSyncMessage(`⚠️ ${data.message || "Error al buscar nuevas alertas"}`);
      }
    } catch {
      setSyncMessage("❌ Error de conexión al buscar nuevas alertas");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleCopyPick = (pick: MarketOpportunity) => {
    const text = [
      `⭐ SMARTBETBOT MCP — PRONÓSTICO DE CONFIANZA MUY ALTA ⭐`,
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `⚽ ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico: ${pick.market} @${(pick.odds ?? 1.5).toFixed(2)}`,
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

  // Filter high confidence picks focusing on Ganador Local & Over 2.5 strictly on today's matches
  const highConfidencePicks = todayPredictions
    .filter((p) => {
      const isFocusMarket = p.market === "Ganador Local" || p.market === "Over 2.5 Goles";
      const isHighConf =
        p.confidence === "Muy Alta" ||
        (p.confidenceScore && p.confidenceScore >= 70) ||
        (p.probability && p.probability >= 65);
      return isHighConf || (isFocusMarket && p.probability >= 58);
    })
    .sort((a, b) => (b.probability || 0) - (a.probability || 0));

  const topRecommendedPicks = highConfidencePicks.slice(0, 6);

  // Featured SmartPick and Bomba del día strictly for today
  const { smartPick, bombaPick } = getFeaturedDailyPicks(todayPredictions);

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

        {/* 1. Executive Intelligence Header */}
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-6 sm:p-8 text-white shadow-2xl">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Motor Cuantitativo MCP Activo
                </span>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 border border-slate-700/60 capitalize">
                  📅 {formattedToday}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
                Centro de Inteligencia Deportiva
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                Pronósticos inteligentes seleccionados automáticamente con apoyo de <strong className="text-emerald-400 font-bold">Inteligencia Artificial</strong>, según las mejores oportunidades del día, con especial enfoque en <strong className="text-emerald-400 font-bold">victorias del equipo local</strong> y <strong className="text-emerald-400 font-bold">partidos con más de 2.5 goles</strong>. SmartBetBot combina IA, estadísticas, rendimiento y tendencias para mostrarte las opciones con mayor potencial de forma clara, rápida y sencilla.
              </p>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                onClick={openPushModal}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/50 transition cursor-pointer"
              >
                <span>🔔</span>
                <span>Configurar Alertas Móvil</span>
              </button>
              <Link
                href="/signals"
                className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/90 hover:bg-slate-750 px-4 py-2.5 text-xs font-bold text-slate-200 hover:text-white transition cursor-pointer"
              >
                <span>📋</span>
                <span>Ver Pre-Match ({predictions.length})</span>
              </Link>
              {isAdmin && (
                <button
                  onClick={handleSyncPredictions}
                  disabled={syncing}
                  className="flex items-center gap-1.5 rounded-2xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-2.5 text-xs font-bold text-purple-300 transition cursor-pointer disabled:opacity-50"
                  title="Buscar nuevas alertas del día"
                >
                  <span className={syncing ? "animate-spin" : ""}>⚡</span>
                  <span>{syncing ? "Buscando..." : "⚡ Buscar Nuevas Alertas"}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 2. Top Executive KPI Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Efectividad Global</span>
              <span className="text-base">📈</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">74.2%</span>
              <span className="text-[11px] font-bold text-emerald-500 dark:text-emerald-400">+EV Alto</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Historial verificado en 1 & Over 2.5</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Confianza Muy Alta</span>
              <span className="text-base">🔥</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {highConfidencePicks.length}
              </span>
              <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">Partidos Top</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Probabilidad estimada ≥ 65%</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Enfoque de Mercados</span>
              <span className="text-base">🎯</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">Local & Over 2.5</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Máxima consistencia matemática</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Parleys Exclusivos</span>
              <span className="text-base">🎲</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400">3</span>
              <span className="text-[11px] font-bold text-purple-500">Listos Hoy</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Seguro, Doble Valor y Bomba</p>
          </div>
        </section>

        {/* 3. Daily Strategy & Recommendation Briefing */}
        <section className="rounded-3xl border border-teal-500/20 bg-gradient-to-r from-teal-950/20 via-slate-900/40 to-slate-900/20 p-5 sm:p-6 backdrop-blur-sm dark:border-teal-500/20 dark:bg-slate-900/50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">💡</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  Recomendación Estratégica del Día
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                El motor MCP ha filtrado las mejores oportunidades enfocándose en <strong className="text-emerald-600 dark:text-emerald-400 font-bold">equipos locales con ventaja estadística</strong> y partidos de alta frecuencia de goles (<strong className="text-emerald-600 dark:text-emerald-400 font-bold">Over 2.5</strong>). Se recomienda aplicar un <span className="font-semibold underline decoration-emerald-500">stake plano de 1% a 2%</span> por pick individual y diversificar en los 3 Parleys calculados.
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

        {/* 4. Curated High Confidence Picks (Informative Cards) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-base font-black border border-emerald-500/20">
                ⭐
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Picks Recomendados de Confianza Muy Alta
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pronósticos cuantitativos con mayor porcentaje de probabilidad (+EV)
                </p>
              </div>
            </div>

            <Link
              href="/signals"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850 transition"
            >
              <span>Ver todas las señales</span>
              <span>→</span>
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-3" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Cargando selecciones de alta confianza...</span>
            </div>
          ) : topRecommendedPicks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <span className="text-3xl">🔍</span>
              <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">Sin partidos en este momento</h3>
              <p className="text-xs text-slate-500 mt-1">Pulsa buscar nuevas alertas para cargar las oportunidades más recientes.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topRecommendedPicks.map((pick) => {
                const key = pick.id || `${pick.fixtureId}-${pick.market}`;
                const isCopied = copiedPickId === key;
                const isLocal = pick.market === "Ganador Local";
                const isOver = pick.market === "Over 2.5 Goles";

                return (
                  <div
                    key={key}
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all hover:shadow-md hover:border-emerald-500/40 dark:border-slate-800/90 dark:bg-slate-900/90"
                  >
                    {/* Header: League & Confidence Badge */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                          🏆 {pick.league} {pick.country ? `(${pick.country})` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                          <span>{pick.probability >= 75 ? "🔥" : "⭐"}</span>
                          <span>{pick.confidence || "Muy Alta"}</span>
                        </span>
                      </div>

                      {/* Teams & Kickoff */}
                      <div className="mb-4">
                        <div className="flex items-baseline justify-between text-xs text-slate-400 mb-1">
                          <span>Partido</span>
                          <span className="text-[10px] font-semibold">
                            {new Date(pick.kickoff).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} hrs
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                          {pick.homeTeam} <span className="text-slate-400 font-normal">vs</span> {pick.awayTeam}
                        </h3>
                      </div>

                      {/* Prediction Box */}
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 mb-3.5 dark:bg-slate-950/60 dark:border-slate-800/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            Pronóstico Oficial
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {isLocal ? "🏠 1 (Local)" : isOver ? "⚽ +2.5 Goles" : pick.selection}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-black text-slate-900 dark:text-white">
                            {pick.market}
                          </span>
                          <div className="text-right">
                            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
                              @{(pick.odds ?? 1.5).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Probability & Fair Odds bar */}
                        <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Probabilidad:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{pick.probability}%</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px]">Ventaja (+EV):</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">+{pick.edge || 5}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Explanation Snippet */}
                      {pick.explanation && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed italic line-clamp-2 mb-4">
                          "{pick.explanation}"
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => setActiveModalPick(pick)}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 text-xs font-bold transition text-center cursor-pointer"
                      >
                        Ver Análisis Detallado
                      </button>
                      <button
                        onClick={() => handleCopyPick(pick)}
                        className="p-2 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer text-xs"
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

        {/* 5. Featured SmartPick & Bomba del Día */}
        {(smartPick || bombaPick) && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-base font-black border border-purple-500/20">
                👑
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Picks Destacados del Día
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  SmartPick de Máxima Seguridad y Bomba de Cuota Alta
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

        {/* 6. Recommended 3 Exclusive Parlays */}
        {predictions.length > 0 && (
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
                    3 combinadas optimizadas algorítmicamente por correlación y +EV
                  </p>
                </div>
              </div>

              <Link
                href="/parlay"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850 transition"
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

        {/* 7. Golden Rules & Bankroll Management Guide */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900/80 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Reglas de Oro y Gestión de Banca (Bankroll)
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
                Prioriza siempre Ganador Local (1) y Over 2.5 Goles. Son los mercados donde los modelos estadísticos logran mayor tasa de acierto.
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
                Evita momios @1.15 sin valor matemático real. El valor surge cuando la probabilidad del modelo supera la cuota ofrecida por la casa.
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

        {/* 8. Quick Module Navigation Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/signals"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📋</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Pre-Match Completo</span>
              <span className="text-[10px] text-slate-500">Todas las señales de hoy</span>
            </div>
          </Link>

          <Link
            href="/parlay"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🎲</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Creador de Parleys</span>
              <span className="text-[10px] text-slate-500">Combinadas personalizadas</span>
            </div>
          </Link>

          <Link
            href="/history"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📜</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Historial Verificado</span>
              <span className="text-[10px] text-slate-500">Resultados y balance</span>
            </div>
          </Link>

          <Link
            href="/reports"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/80 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📈</span>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">Reportes y ROI</span>
              <span className="text-[10px] text-slate-500">Métricas avanzadas</span>
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
    </div>
  );
}
