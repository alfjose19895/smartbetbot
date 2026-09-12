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
import { getImmutableDailyParlays } from "@/lib/sports/parlay-generator";

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

interface PublishedMcpParlay {
  title: string;
  totalOdds: number;
  picks: MarketOpportunity[];
  publishedAt: string;
}

export default function DailyParlayPage() {
  const { t } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [stake, setStake] = useState<number>(10);
  const [copied, setCopied] = useState(false);
  const [selectedMatchModal, setSelectedMatchModal] = useState<MarketOpportunity | null>(null);
  const [parlayMode, setParlayMode] = useState<"PARLAY_1" | "PARLAY_2" | "PARLAY_3" | "MCP">("PARLAY_1");
  const [publishedMcpParlay, setPublishedMcpParlay] = useState<PublishedMcpParlay | null>(null);

  const [copyingImage, setCopyingImage] = useState(false);
  const [copyImageSuccess, setCopyImageSuccess] = useState(false);

  useEffect(() => {
    const fetchSignalsAndMcp = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/signals");
        const json = await res.json();
        const serverSignals = Array.isArray(json.signals) ? json.signals : [];
        setSignals(serverSignals);

        // Check if there is a published MCP Parlay in localStorage
        if (typeof window !== "undefined") {
          try {
            const parlayRaw = localStorage.getItem("smartbetbot_published_parlay");
            if (parlayRaw) {
              const parsedParlay = JSON.parse(parlayRaw);
              if (parsedParlay && Array.isArray(parsedParlay.picks) && parsedParlay.picks.length > 0) {
                setPublishedMcpParlay(parsedParlay);
              }
            }
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error("Error loading signals for parlay:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignalsAndMcp();

    // Listen for real-time parlay publication events
    const handleParlayPublished = (e: Event) => {
      const customEvent = e as CustomEvent<{ parlay: PublishedMcpParlay }>;
      if (customEvent.detail && customEvent.detail.parlay) {
        setPublishedMcpParlay(customEvent.detail.parlay);
        setParlayMode("MCP");
      } else if (typeof window !== "undefined") {
        try {
          const parlayRaw = localStorage.getItem("smartbetbot_published_parlay");
          if (parlayRaw) {
            const parsed = JSON.parse(parlayRaw);
            setPublishedMcpParlay(parsed);
            setParlayMode("MCP");
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("parlay-published", handleParlayPublished);
    window.addEventListener("storage", handleParlayPublished);
    return () => {
      window.removeEventListener("parlay-published", handleParlayPublished);
      window.removeEventListener("storage", handleParlayPublished);
    };
  }, []);

  const now = new Date();
  const todayFormatted = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Generate 3 mutually exclusive parlays with 3 picks each
  const { parlay1, parlay2, parlay3 } = getImmutableDailyParlays(signals);

  let selectedPicks: MarketOpportunity[] = [];
  let parlayTitle = "🛡️ Parley Seguro (3 Picks)";
  let parlayDescription = "3 selecciones de máxima probabilidad y confianza (Ganador Local, Over 2.5, Ambos Anotan).";

  if (parlayMode === "MCP" && publishedMcpParlay && publishedMcpParlay.picks.length > 0) {
    selectedPicks = publishedMcpParlay.picks;
    parlayTitle = `🤖 Parley MCP del Día (${selectedPicks.length} Picks)`;
    parlayDescription = "Combinada descubierta y publicada por el Agente de Inteligencia MCP.";
  } else if (parlayMode === "PARLAY_2") {
    selectedPicks = parlay2;
    parlayTitle = "💎 Parley Valor (3 Picks)";
    parlayDescription = "3 selecciones con máximo valor esperado (+EV) y ventaja matemática de partidos distintos.";
  } else if (parlayMode === "PARLAY_3") {
    selectedPicks = parlay3;
    parlayTitle = "💣 Parley Bomba (3 Picks)";
    parlayDescription = "3 selecciones multiplicadoras de alto rendimiento sin repetición de partidos.";
  } else {
    selectedPicks = parlay1;
    parlayTitle = "🛡️ Parley Seguro (3 Picks)";
    parlayDescription = "3 selecciones de máxima probabilidad y confianza estadística para crecimiento sostenido.";
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
    `🔥 *${parlayTitle.toUpperCase()}*`,
    `🎯 *Cuota Total Acumulada:* @${totalOdds.toFixed(2)} | *Probabilidad:* ${combinedProbability.toFixed(1)}%`,
    `📅 *Fecha:* ${todayFormatted}`,
    "",
    ...selectedPicks.map(
      (p, idx) =>
        `${idx + 1}. *${p.match}*\n   🏆 ${p.league} (${p.country || "Mundial"})\n   🕒 ${formatKickoffTime(p.kickoff)}\n   🎯 *Pronóstico:* ${p.market} (@${p.odds.toFixed(2)})\n   ⭐ *Confianza:* ${p.confidence || "Alta"} (${(p.probability || 50).toFixed(0)}% prob)`
    ),
    "",
    `💰 *Simulación:* Apostando $${stake} ➔ Retorno: *$${potentialTotalReturn}* (+$${potentialProfit})`,
    "🔒 _Pronóstico Oficial de SmartBetBot - Cero Repetición de Partidos_",
    "🌐 https://smartbetbot.educandotea.com/parlay",
  ].join("\n");

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
    navigator.clipboard.writeText(parlayShareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  // Helper for parlay stats in selector
  const calcOdds = (picks: MarketOpportunity[]) => picks.reduce((acc, p) => acc * (p.odds || 1.5), 1).toFixed(2);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 pb-20">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {/* Header Banner */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-6 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                <span>🎯</span>
                <span>3 PARLEYS EXCLUSIVOS DE 3 PICKS</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-black text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                <span>✨</span>
                <span>Cero Repetición de Partidos</span>
              </span>
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              Combinadas Inteligentes del Día
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              3 combinadas independientes de 3 pronósticos cada una (9 partidos diferentes en total), seleccionadas con valor esperado positivo (+EV).
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-xs font-black text-sky-900 border border-sky-300 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800">
            <span>🔒</span>
            <span>Pronósticos Inmutables (Trazabilidad 100%)</span>
          </div>
        </div>

        {/* 3-Parlay Combinations Selector */}
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Selecciona tu Parley de 3 Jugadas:
            </span>
            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              {parlayTitle}
            </span>
          </div>

          <div className={`grid grid-cols-1 ${publishedMcpParlay ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3`}>
            {/* Parley 1: Seguro */}
            <button
              onClick={() => setParlayMode("PARLAY_1")}
              className={`flex items-start gap-3 p-4 rounded-2xl border transition text-left cursor-pointer ${
                parlayMode === "PARLAY_1"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-md shadow-emerald-500/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-500 ring-2 ring-emerald-500/30"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80"
              }`}
            >
              <span className="text-2xl mt-0.5">🛡️</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                    1. Parley Seguro
                  </span>
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-emerald-500 text-slate-950">
                    @{calcOdds(parlay1)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  3 picks de máxima probabilidad y mayor certeza estadística.
                </div>
              </div>
            </button>

            {/* Parley 2: Valor */}
            <button
              onClick={() => setParlayMode("PARLAY_2")}
              className={`flex items-start gap-3 p-4 rounded-2xl border transition text-left cursor-pointer ${
                parlayMode === "PARLAY_2"
                  ? "border-amber-500 bg-amber-50 text-amber-950 shadow-md shadow-amber-500/20 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-500 ring-2 ring-amber-500/30"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80"
              }`}
            >
              <span className="text-2xl mt-0.5">💎</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                    2. Parley Valor
                  </span>
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-amber-500 text-slate-950">
                    @{calcOdds(parlay2)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  3 picks con máximo valor esperado (+EV) de partidos distintos.
                </div>
              </div>
            </button>

            {/* Parley 3: Bomba */}
            <button
              onClick={() => setParlayMode("PARLAY_3")}
              className={`flex items-start gap-3 p-4 rounded-2xl border transition text-left cursor-pointer ${
                parlayMode === "PARLAY_3"
                  ? "border-rose-500 bg-rose-50 text-rose-950 shadow-md shadow-rose-500/20 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-500 ring-2 ring-rose-500/30"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80"
              }`}
            >
              <span className="text-2xl mt-0.5">💣</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                    3. Parley Bomba
                  </span>
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-rose-500 text-white">
                    @{calcOdds(parlay3)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  3 picks multiplicadores de alta rentabilidad sin repetición.
                </div>
              </div>
            </button>

            {/* Optional Published MCP Parlay */}
            {publishedMcpParlay && (
              <button
                onClick={() => setParlayMode("MCP")}
                className={`flex items-start gap-3 p-4 rounded-2xl border transition text-left cursor-pointer ${
                  parlayMode === "MCP"
                    ? "border-purple-500 bg-purple-50 text-purple-950 shadow-md shadow-purple-500/20 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-500 ring-2 ring-purple-500/30"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80"
                }`}
              >
                <span className="text-2xl mt-0.5">🤖</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                      Parley MCP
                    </span>
                    <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-purple-600 text-white">
                      @{publishedMcpParlay.totalOdds}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    Combinada especial descubierta por el Agente MCP.
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
            <p className="mt-3 text-sm font-semibold">Cargando 3 combinadas oficiales sin repetición...</p>
          </div>
        ) : selectedPicks.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin pronósticos disponibles</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No se encontraron suficientes partidos activos para hoy.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Col: The 3 Parlay Picks */}
            <div className="lg:col-span-2 space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  {selectedPicks.length} Selecciones del {parlayTitle}:
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {parlayDescription}
                </span>
              </div>

              {selectedPicks.map((pick, idx) => (
                <div
                  key={`${pick.fixtureId || idx}-${pick.homeTeam}-${pick.market}`}
                  onClick={() => setSelectedMatchModal(pick)}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all duration-300 hover:border-emerald-500/50 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800/80 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white dark:bg-white dark:text-slate-900">
                        {idx + 1}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-0.5 text-xs font-extrabold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        🏆 {pick.league} {pick.country ? `• ${pick.country}` : ""}
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-black text-emerald-700 dark:text-emerald-400">
                      ⏰ {formatKickoffTime(pick.kickoff)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-900 dark:bg-slate-800 dark:text-white shrink-0">
                        {pick.homeTeam.substring(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                          {pick.homeTeam}
                        </div>
                        <div className="text-[10px] text-slate-400">Local</div>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-slate-400 shrink-0">VS</span>

                    <div className="flex items-center justify-end gap-2.5 min-w-0 text-right">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                          {pick.awayTeam}
                        </div>
                        <div className="text-[10px] text-slate-400">Visitante</div>
                      </div>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-900 dark:bg-slate-800 dark:text-white shrink-0">
                        {pick.awayTeam.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between rounded-2xl bg-emerald-50/70 p-3.5 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/60 flex-wrap gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                        🎯 Pronóstico de la Jugada
                      </div>
                      <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                        {pick.market} {pick.selection && `(${pick.selection})`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">Probabilidad</div>
                        <div className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                          {pick.probability}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-black text-white dark:bg-white dark:text-slate-900 shadow-xs">
                        @{(pick.odds || 1.5).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Right Col: Interactive Betting Slip & Sharing */}
            <div className="space-y-4">
              <div className="sticky top-24 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🧾</span>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Boleto de Apuesta
                    </h3>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
                    {selectedPicks.length} Selecciones
                  </span>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-500 dark:text-slate-400">Cuota Total Acumulada:</span>
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      @{totalOdds.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-500 dark:text-slate-400">Probabilidad Estimada:</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                      {combinedProbability.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-500 dark:text-slate-400">Cuota Justa Modelo:</span>
                    <span className="font-bold text-slate-600 dark:text-slate-300">
                      @{totalFairOdds.toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Monto a Simular ($ USD):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                      <input
                        type="number"
                        min="1"
                        step="5"
                        value={stake}
                        onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm font-black text-slate-900 focus:border-emerald-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-emerald-500/10 p-3.5 border border-emerald-500/30 text-emerald-950 dark:text-emerald-300">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold">Ganancia Neta:</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">+${potentialProfit}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-emerald-500/20">
                      <span className="font-extrabold">Retorno Total:</span>
                      <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">${potentialTotalReturn}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {/* Visual Card Sharing Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleShareParlayWhatsAppImage}
                        title="Compartir tarjeta gráfica en WhatsApp"
                        className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 transition cursor-pointer shadow-sm"
                      >
                        <span>💬</span>
                        <span>WhatsApp</span>
                      </button>

                      <button
                        onClick={handleShareParlayTelegramImage}
                        title="Compartir tarjeta gráfica en Telegram"
                        className="flex items-center justify-center gap-1 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white hover:bg-sky-700 transition cursor-pointer shadow-sm"
                      >
                        <span>✈️</span>
                        <span>Telegram</span>
                      </button>
                    </div>

                    <button
                      onClick={handleCopyParlayImage}
                      title="Copiar imagen del parley al portapapeles"
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-black text-slate-800 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 transition cursor-pointer"
                    >
                      <span>📸</span>
                      <span>{copyImageSuccess ? "✓ ¡Imagen Copiada!" : copyingImage ? "Generando..." : "Copiar Tarjeta Gráfica"}</span>
                    </button>

                    <button
                      onClick={handleDownloadParlayImage}
                      title="Descargar imagen PNG del boleto de parley"
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 transition cursor-pointer"
                    >
                      <span>📥</span>
                      <span>Descargar Imagen PNG</span>
                    </button>

                    <button
                      onClick={handleCopyParlay}
                      title="Copiar texto del parley"
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <span>📋</span>
                      <span>{copied ? "✓ ¡Texto Copiado!" : "Copiar Texto"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Match Detail Modal */}
      {selectedMatchModal && (
        <MatchDetailModal
          prediction={selectedMatchModal}
          onClose={() => setSelectedMatchModal(null)}
        />
      )}
    </div>
  );
}
