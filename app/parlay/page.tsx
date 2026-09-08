"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import {
  copyParlayCardImageToClipboard,
  downloadParlayCardImage,
  shareParlayCardAsImage,
} from "@/lib/sports/card-image-generator";
import { buildDualExclusiveParlays } from "@/lib/sports/parlay-generator";

function formatKickoffTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Hoy";

    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`;

    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow =
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate();

    const dayNum = d.getDate();
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const monthName = months[d.getMonth()];

    if (isToday) return `Hoy • ${timeStr}`;
    if (isTomorrow) return `Mañana • ${timeStr}`;
    return `${dayNum} ${monthName} • ${timeStr}`;
  } catch {
    return "Hoy";
  }
}

function getTimeRemainingStatus(dateString: string) {
  try {
    const kickoffMs = new Date(dateString).getTime();
    const nowMs = Date.now();
    const diffMs = kickoffMs - nowMs;

    if (diffMs > 0) {
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;

      if (diffMins <= 30) {
        return {
          label: `⏳ En ${diffMins}m`,
          bg: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700",
        };
      }
      if (diffHours < 24) {
        return {
          label: `🟢 En ${diffHours}h ${remMins}m`,
          bg: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700",
        };
      }
      return {
        label: `📅 Próximo`,
        bg: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      };
    } else {
      const elapsedMins = Math.floor(Math.abs(diffMs) / 60000);
      if (elapsedMins <= 115) {
        return {
          label: `🔴 En Juego (~${elapsedMins}')`,
          bg: "bg-rose-100 text-rose-900 border-rose-300 animate-pulse dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700",
        };
      }
      return {
        label: `🏁 Finalizado`,
        bg: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
      };
    }
  } catch {
    return {
      label: `📅 Programado`,
      bg: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    };
  }
}

interface PublishedMcpParlay {
  totalOdds: string;
  combinedProbability: string;
  selectionsCount: number;
  legs: Array<{
    match: string;
    market: string;
    selection: string;
    odds: number;
  }>;
  picks: MarketOpportunity[];
  date?: string;
}

export default function DailyParlayPage() {
  const { language } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [parlayMode, setParlayMode] = useState<"ELITE" | "PREMIUM" | "MCP">("ELITE");
  const [publishedMcpParlay, setPublishedMcpParlay] = useState<PublishedMcpParlay | null>(null);
  const [stake, setStake] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [expandedLegs, setExpandedLegs] = useState<Record<string, boolean>>({});

  const fetchSignals = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/signals");
      const json = await res.json();
      let serverSignals: MarketOpportunity[] = Array.isArray(json.signals) ? [...json.signals] : [];

      try {
        if (typeof window !== "undefined") {
          // Check for published parlay
          const parlayRaw = localStorage.getItem("smartbetbot_published_parlay");
          if (parlayRaw) {
            const parsedParlay = JSON.parse(parlayRaw);
            if (parsedParlay && Array.isArray(parsedParlay.picks) && parsedParlay.picks.length > 0) {
              setPublishedMcpParlay(parsedParlay);
            }
          }

          // Merge published individual picks
          const localRaw = localStorage.getItem("smartbetbot_published_picks");
          if (localRaw) {
            const localPicks = JSON.parse(localRaw);
            if (Array.isArray(localPicks)) {
              const map = new Map<string, MarketOpportunity>();
              for (const p of serverSignals) {
                const key = `${p.fixtureId || 0}-${p.homeTeam}-${p.awayTeam}-${p.market}`;
                map.set(key, p);
              }
              for (const lp of localPicks) {
                const key = `${lp.fixtureId || 0}-${lp.homeTeam}-${lp.awayTeam}-${lp.market}`;
                map.set(key, { ...lp, isMcpPick: true, pickBadge: lp.pickBadge || "mcp" });
              }
              serverSignals = Array.from(map.values());
              serverSignals.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
            }
          }
        }
      } catch (err) {
        console.warn("Error loading local storage signals:", err);
      }

      setSignals(serverSignals);
    } catch (err) {
      console.error("Error fetching signals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    const handleUpdated = (e?: any) => {
      if (e?.detail?.parlay) {
        setPublishedMcpParlay({
          ...e.detail.parlay,
          picks: e.detail.picks || [],
        });
        setParlayMode("MCP");
      }
      fetchSignals();
    };
    window.addEventListener("predictions-updated", handleUpdated);
    window.addEventListener("storage", handleUpdated);
    return () => {
      window.removeEventListener("predictions-updated", handleUpdated);
      window.removeEventListener("storage", handleUpdated);
    };
  }, []);

  const now = new Date();
  const todayFormatted = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Generate dual mutually exclusive parlays with diversified markets
  const { elite3, premium5 } = buildDualExclusiveParlays(signals);

  let selectedPicks: MarketOpportunity[] = [];
  let parlayTitle = "🛡️ Parley Élite (3 Picks)";

  if (parlayMode === "MCP" && publishedMcpParlay && publishedMcpParlay.picks.length > 0) {
    selectedPicks = publishedMcpParlay.picks;
    parlayTitle = `🤖 Parley MCP del Día (${selectedPicks.length} Picks)`;
  } else if (parlayMode === "PREMIUM") {
    selectedPicks = premium5;
    parlayTitle = "🚀 Parley Premium (5 Picks)";
  } else {
    selectedPicks = elite3;
    parlayTitle = "🛡️ Parley Élite (3 Picks)";
  }

  // Fallback if empty
  if (selectedPicks.length === 0 && signals.length > 0) {
    selectedPicks = signals.slice(0, 3);
  }

  // Compute accumulated parlay odds and combined probability
  const totalOdds = selectedPicks.reduce((acc, p) => acc * (p.odds || 1.5), 1);
  const totalFairOdds = selectedPicks.reduce((acc, p) => acc * (p.fairOdds || p.odds || 1.3), 1);
  const combinedProbability =
    selectedPicks.reduce((acc, p) => acc * ((p.probability || 50) / 100), 1) * 100;
  const potentialProfit = (stake * totalOdds - stake).toFixed(2);
  const potentialTotalReturn = (stake * totalOdds).toFixed(2);

  const parlayShareText = [
    `🔥 *PARLEY COMBINADO DEL DÍA (${selectedPicks.length} JUGADAS)*`,
    `🎯 *Cuota Total Acumulada:* @${totalOdds.toFixed(2)} | *Probabilidad:* ${combinedProbability.toFixed(1)}%`,
    `📅 *Fecha:* ${todayFormatted}`,
    "",
    ...selectedPicks.map(
      (p, idx) =>
        `${idx + 1}. *${p.match}*\n   🏆 ${p.league} (${p.country || "Mundial"})\n   🕒 ${formatKickoffTime(p.kickoff)}\n   🎯 *Pronóstico:* ${p.market} (@${p.odds.toFixed(2)})\n   ⭐ *Confianza:* ${p.confidence || "Alta"} (${(p.probability || 50).toFixed(0)}% prob)`
    ),
    "",
    `💰 *Simulación:* Apostando $${stake} ➔ Retorno: *$${potentialTotalReturn}* (+$${potentialProfit})`,
    "🔒 _Pronóstico Oficial Diario de SmartBetBot - Inmutable_",
    "🔗 https://www.smartbetbot.educandotea.com/parlay",
  ].join("\n");

  const [copyingImage, setCopyingImage] = useState(false);
  const [copyImageSuccess, setCopyImageSuccess] = useState(false);

  const handleCopyParlayImage = async () => {
    try {
      setCopyingImage(true);
      const ok = await copyParlayCardImageToClipboard(
        selectedPicks,
        totalOdds,
        Number(combinedProbability.toFixed(1)),
        stake
      );
      if (ok) {
        setCopyImageSuccess(true);
        setTimeout(() => setCopyImageSuccess(false), 3500);
      }
    } finally {
      setCopyingImage(false);
    }
  };

  const handleDownloadParlayImage = async () => {
    await downloadParlayCardImage(
      selectedPicks,
      totalOdds,
      Number(combinedProbability.toFixed(1)),
      stake
    );
  };

  const handleShareParlayWhatsAppImage = async () => {
    await shareParlayCardAsImage(
      selectedPicks,
      totalOdds,
      Number(combinedProbability.toFixed(1)),
      stake,
      "whatsapp"
    );
  };

  const handleShareParlayTelegramImage = async () => {
    await shareParlayCardAsImage(
      selectedPicks,
      totalOdds,
      Number(combinedProbability.toFixed(1)),
      stake,
      "telegram"
    );
  };

  const handleCopyParlay = () => {
    navigator.clipboard.writeText(parlayShareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🔥</span>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-black text-emerald-800 dark:text-emerald-400 border border-emerald-500/20">
                <span>100% Cuotas Reales Bet365/Pinnacle • Mercados Diversificados</span>
              </div>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Parleys Oficiales del Día
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Combinadas cuantitativas optimizadas con cuotas reales de Bet365 y control estricto de correlación de riesgo
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-xs font-black text-sky-900 border border-sky-300 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800">
            <span>🔒</span>
            <span>Pronósticos Inmutables (Trazabilidad 100%)</span>
          </div>
        </div>

        {/* Parlay Combinations Selector */}
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Selecciona el Tipo de Parley:
            </span>
            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              {parlayTitle}
            </span>
          </div>

          <div className={`grid grid-cols-1 ${publishedMcpParlay ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>
            {/* Parley Élite */}
            <button
              onClick={() => setParlayMode("ELITE")}
              className={`flex items-center gap-3.5 p-4 rounded-2xl border transition text-left cursor-pointer ${
                parlayMode === "ELITE"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-md shadow-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500 font-black ring-2 ring-emerald-500/30"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <span className="text-3xl">🛡️</span>
              <div>
                <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  Parley Élite (3 Picks)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                  3 selecciones de máxima probabilidad y mercados distintos
                </div>
              </div>
            </button>

            {/* Parley Premium */}
            <button
              onClick={() => setParlayMode("PREMIUM")}
              className={`flex items-center gap-3.5 p-4 rounded-2xl border transition text-left cursor-pointer ${
                parlayMode === "PREMIUM"
                  ? "border-amber-500 bg-amber-50 text-amber-950 shadow-md shadow-amber-500/20 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-500 font-black ring-2 ring-amber-500/30"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <span className="text-3xl">🚀</span>
              <div>
                <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  Parley Premium (5 Picks)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                  5 selecciones de alto rendimiento sin repetición de partidos
                </div>
              </div>
            </button>

            {/* Published MCP Parlay */}
            {publishedMcpParlay && (
              <button
                onClick={() => setParlayMode("MCP")}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border transition text-left cursor-pointer ${
                  parlayMode === "MCP"
                    ? "border-purple-500 bg-purple-50 text-purple-950 shadow-md shadow-purple-500/20 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-500 font-black ring-2 ring-purple-500/30"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <span className="text-3xl">🤖</span>
                <div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Parley MCP Publicado</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500 text-white font-black">
                      @{publishedMcpParlay.totalOdds}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                    Combinada descubierta y publicada por el Agente MCP
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Main Content: Picks List + Floating Slip */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando combinadas oficiales con cuotas reales...</p>
          </div>
        ) : selectedPicks.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin pronósticos disponibles</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No se encontraron partidos activos para hoy.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Side: Picks list */}
            <div className="lg:col-span-2 space-y-3">
              {selectedPicks.map((pick, idx) => {
                const timeStatus = getTimeRemainingStatus(pick.kickoff);
                return (
                  <div
                    key={pick.id || `${pick.fixtureId}-${pick.market}`}
                    onClick={() => setActiveModalPick(pick)}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-sm transition hover:border-emerald-500/50 hover:shadow-md dark:bg-slate-900 dark:border-slate-800 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-xs font-black text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                            {pick.league}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            🕒 {formatKickoffTime(pick.kickoff)}
                          </span>
                          {timeStatus && (
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold border ${timeStatus.bg}`}>
                              {timeStatus.label}
                            </span>
                          )}
                        </div>
                        <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition mt-0.5 block">
                          {pick.match}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/80 pt-2 sm:pt-0 flex-wrap">
                      <span className="rounded-xl bg-emerald-50 dark:bg-emerald-950/80 px-3 py-1 text-xs font-black text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        🎯 {pick.market}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-sky-50 dark:bg-sky-950/80 px-2.5 py-1 text-xs font-black text-sky-900 dark:text-sky-300 border border-sky-200 dark:border-sky-800" title="Cuota Real Bet365">
                        <span className="text-[10px] opacity-70">Bet365:</span>
                        <span>@{(pick.odds ?? 1.5).toFixed(2)}</span>
                      </span>
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                        {(pick.probability ?? 50).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Side: Slip */}
            <div className="rounded-3xl bg-slate-900 p-6 text-white border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-xs font-bold uppercase text-amber-400 block">
                    {parlayTitle}
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-white">
                    @{totalOdds.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-400 block">Probabilidad Combinada</span>
                  <span className="text-base font-black text-emerald-400">
                    {combinedProbability.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Stake Simulator */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                  Simular Apuesta ($):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={stake}
                    onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24 rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white border border-slate-700 focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="flex gap-1 flex-1 justify-end">
                    {[10, 25, 50, 100].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setStake(amt)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          stake === amt
                            ? "bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        $${amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Potential Return Box */}
              <div className="rounded-2xl bg-emerald-950/60 p-4 border border-emerald-500/30">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span>Retorno Total Estimado:</span>
                  <span className="text-base font-black text-emerald-400">$${potentialTotalReturn}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                  <span>Ganancia Neta:</span>
                  <span className="font-extrabold text-emerald-300">+$${potentialProfit}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  onClick={handleCopyParlayImage}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 py-3.5 px-4 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110 active:scale-[0.99] cursor-pointer"
                >
                  <span>📸</span>
                  <span>
                    {copyImageSuccess
                      ? "✓ ¡Imagen del Parley Copiada! (Pega con Ctrl+V)"
                      : copyingImage
                      ? "Generando Imagen PNG..."
                      : "📸 Copiar Parley como Imagen"}
                  </span>
                </button>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleShareParlayWhatsAppImage}
                    className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-500 transition cursor-pointer"
                  >
                    <span>💬</span>
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={handleShareParlayTelegramImage}
                    className="flex items-center justify-center gap-1 rounded-xl bg-sky-600 py-2.5 text-xs font-black text-white hover:bg-sky-500 transition cursor-pointer"
                  >
                    <span>✈️</span>
                    <span>Telegram</span>
                  </button>
                  <button
                    onClick={handleDownloadParlayImage}
                    className="flex items-center justify-center gap-1 rounded-xl bg-slate-800 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
                  >
                    <span>📥</span>
                    <span>Descargar</span>
                  </button>
                </div>

                <button
                  onClick={handleCopyParlay}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2 text-[11px] font-bold text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                >
                  <span>📋</span>
                  <span>{copied ? "✓ ¡Texto Copiado!" : "Copiar como Texto"}</span>
                </button>
              </div>
            </div>
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
    </div>
  );
}
