"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { NewAlertsModal } from "@/components/NewAlertsModal";
import { RecommendedParlay } from "@/components/RecommendedParlay";
import { FeaturedDailyPicks } from "@/components/FeaturedDailyPicks";
import { LaunchOfferSection } from "@/components/LaunchOfferSection";
import { MarketOpportunity, getFeaturedDailyPicks } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import { openPushModal } from "@/components/PushNotificationManager";

function getMatchDeduplicationKey(p: MarketOpportunity): string {
  const fixId = Number(p.fixtureId) || 0;
  if (fixId > 0) return `fix-${fixId}`;
  const h = (p.homeTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
  const a = (p.awayTeam || "").toLowerCase().replace(/[^a-z0-9]/gi, "").trim();

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

      if (
        (hKey === exHKey && aKey === exAKey) ||
        ((hKey.includes(exHKey) || exHKey.includes(hKey)) && (aKey.includes(exAKey) || exAKey.includes(aKey)))
      ) {
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
      setSyncMessage(null);
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✓ ¡Sincronización completada! ${data.newCount || 0} nuevas alertas encontradas.`);
        await loadSignals();
      } else {
        setSyncMessage(`Error: ${data.error || "Fallo al sincronizar"}`);
      }
    } catch (err) {
      console.error("Sync error:", err);
      setSyncMessage("Error de conexión al sincronizar.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const todayStr = getEcuadorDateString(Date.now());
  const todayPredictions = predictions.filter(
    (p) => !p.kickoff || getEcuadorDateString(p.kickoff) === todayStr
  );

  const homeWinPicks = todayPredictions.filter((p) => p.market === "Ganador Local");
  const overPicks = todayPredictions.filter((p) => p.market === "Over 2.5 Goles");
  const highConfidencePicks = todayPredictions.filter(
    (p) =>
      p.confidence === "Muy Alta" ||
      (p.confidenceScore && p.confidenceScore >= 70) ||
      (p.probability && p.probability >= 65)
  );

  const { smartPick, bombaPick } = getFeaturedDailyPicks(todayPredictions);

  const formattedToday = new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    timeZone: "America/Guayaquil",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      <Navbar onSync={handleSyncPredictions} syncing={syncing} />

      {/* Top Promotional Banner for Launch Offer */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-4 py-2 text-center text-xs sm:text-sm font-black text-white shadow-md flex items-center justify-center gap-2 flex-wrap">
        <span className="flex h-2 w-2 rounded-full bg-white animate-pulse" />
        <span>🎉 OFERTA VITALICIA: $19.99 USD Pago Único (Vence el 31 de Octubre del 2026 · Luego $29.99/mes)</span>
        <a href="#oferta-lanzamiento" className="underline hover:text-slate-950 transition font-extrabold ml-1">
          Ver Oferta →
        </a>
      </div>

      <main className="mx-auto max-w-7xl flex-1 px-3 sm:px-6 py-6 sm:py-8 w-full space-y-8">
        {/* Sync Toast */}
        {syncMessage && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm font-black text-emerald-800 backdrop-blur-md dark:text-emerald-300 animate-fadeIn">
            {syncMessage}
          </div>
        )}

        {/* 1. Quick Category Hub (Matching Tablet Mockup Navigation) */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          <Link
            href="/signals"
            className="flex flex-col justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 hover:border-emerald-400 hover:scale-[1.02] transition shadow-lg group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl group-hover:scale-110 transition-transform">📅</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
                {predictions.length} Picks
              </span>
            </div>
            <div className="mt-3">
              <span className="text-xs sm:text-sm font-black text-white block">Señales de Hoy</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Listos para usar →</span>
            </div>
          </Link>

          <Link
            href="/featured"
            className="flex flex-col justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 border border-amber-500/30 hover:border-amber-400 hover:scale-[1.02] transition shadow-lg group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl group-hover:scale-110 transition-transform">⭐</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-bold">
                Top 1
              </span>
            </div>
            <div className="mt-3">
              <span className="text-xs sm:text-sm font-black text-white block">Smart Pick</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Más confiable →</span>
            </div>
          </Link>

          <Link
            href="/live"
            className="flex flex-col justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-rose-950/30 via-slate-900 to-slate-950 border border-rose-500/30 hover:border-rose-400 hover:scale-[1.02] transition shadow-lg group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl group-hover:scale-110 transition-transform">🔴</span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                Live
              </span>
            </div>
            <div className="mt-3">
              <span className="text-xs sm:text-sm font-black text-white block">En Vivo</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Tiempo real →</span>
            </div>
          </Link>

          <Link
            href="/signals"
            className="flex flex-col justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-cyan-950/30 via-slate-900 to-slate-950 border border-cyan-500/30 hover:border-cyan-400 hover:scale-[1.02] transition shadow-lg group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl group-hover:scale-110 transition-transform">⚽</span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded-full font-bold">
                Dixon-Coles
              </span>
            </div>
            <div className="mt-3">
              <span className="text-xs sm:text-sm font-black text-white block">Pre-Match</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Modelos Poisson →</span>
            </div>
          </Link>

          <a
            href="#oferta-lanzamiento"
            className="flex flex-col justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-950 border border-purple-500/40 hover:border-purple-300 hover:scale-[1.02] transition shadow-lg group col-span-2 sm:col-span-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl group-hover:scale-110 transition-transform">👑</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold">
                $19.99 USD
              </span>
            </div>
            <div className="mt-3">
              <span className="text-xs sm:text-sm font-black text-white block">Mi Membresía</span>
              <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">Pase Vitalicio →</span>
            </div>
          </a>
        </section>

        {/* 2. Executive Intelligence Header */}
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-6 sm:p-8 text-white shadow-2xl">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

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
                Selecciones automáticas de máxima probabilidad con enfoque prioritario en <strong className="text-emerald-400 font-bold">Ganador Local (1)</strong> y <strong className="text-emerald-400 font-bold">Over 2.5 Goles</strong>, respaldadas por modelos Dixon-Coles y simulación Monte Carlo.
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
                  title="Buscar nuevas alertas del día (Solo Administrador)"
                >
                  <span className={syncing ? "animate-spin" : ""}>⚡</span>
                  <span>{syncing ? "Buscando..." : "⚡ Buscar Nuevas Alertas"}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 3. Top Executive KPI Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Victorias Local</span>
              <span className="text-base">🏠</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">80%</span>
              <span className="text-[11px] font-bold text-emerald-500 dark:text-emerald-400">Alta Efectividad</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{homeWinPicks.length} selecciones de hoy</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Over 2.5 Goles</span>
              <span className="text-base">⚽</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-teal-600 dark:text-teal-400">70%</span>
              <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">Frecuencia Goles</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{overPicks.length} selecciones de hoy</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Confianza Muy Alta</span>
              <span className="text-base">🔥</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {highConfidencePicks.length}
              </span>
              <span className="text-[11px] font-bold text-emerald-500">Prob. ≥ 65%</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Picks prioritarios</p>
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

        {/* 4. Daily Strategy & Recommendation Briefing */}
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

        {/* 5. Featured Daily Picks (SmartPick & Bomba) */}
        {(smartPick || bombaPick) && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-base font-black border border-amber-500/20">
                  ⭐
                </span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Smart Pick & Bomba del Día
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nuestras selecciones algorítmicas más destacadas de la jornada
                  </p>
                </div>
              </div>

              <Link
                href="/featured"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850 transition"
              >
                <span>Ver Destacados</span>
                <span>→</span>
              </Link>
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

        {/* 7. Embedded Launch Offer Section */}
        <div id="oferta-lanzamiento" className="pt-2">
          <LaunchOfferSection />
        </div>

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
