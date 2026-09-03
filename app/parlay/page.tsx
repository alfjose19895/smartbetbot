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

export default function DailyParlayPage() {
  const { language } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [parlaySize, setParlaySize] = useState<3 | 5>(3);
  const [stake, setStake] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [expandedLegs, setExpandedLegs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/signals");
        const json = await res.json();
        if (json.signals) {
          setSignals(json.signals);
        }
      } catch (err) {
        console.error("Error fetching signals:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
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
  const selectedPicks: MarketOpportunity[] = parlaySize === 5 ? premium5 : elite3;

  // Compute accumulated parlay odds and combined probability
  const totalOdds = selectedPicks.reduce((acc, p) => acc * p.odds, 1);
  const totalFairOdds = selectedPicks.reduce((acc, p) => acc * (p.fairOdds || 1.3), 1);
  const combinedProbability =
    selectedPicks.reduce((acc, p) => acc * (p.probability / 100), 1) * 100;
  const potentialProfit = (stake * totalOdds - stake).toFixed(2);
  const potentialTotalReturn = (stake * totalOdds).toFixed(2);

  const parlayShareText = [
    `🔥 *PARLEY COMBINADO DEL DÍA (${selectedPicks.length} JUGADAS)*`,
    `🎯 *Cuota Total Acumulada:* @${totalOdds.toFixed(2)} | *Probabilidad:* ${combinedProbability.toFixed(1)}%`,
    `📅 *Fecha:* ${todayFormatted}`,
    "",
    ...selectedPicks.map(
      (p, idx) =>
        `${idx + 1}. *${p.match}*\n   🏆 ${p.league} (${p.country || "Mundial"})\n   🕒 ${formatKickoffTime(p.kickoff)}\n   🎯 *Pronóstico:* ${p.market} (@${p.odds.toFixed(2)})\n   ⭐ *Confianza:* ${p.confidence || "Alta"} (${p.probability.toFixed(0)}% prob)`
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

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(parlayShareText)}`;
    window.open(url, "_blank");
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent("https://www.smartbetbot.educandotea.com/parlay")}&text=${encodeURIComponent(parlayShareText)}`;
    window.open(url, "_blank");
  };

  const parlayTierDescriptions: Record<3 | 5, { title: string; desc: string; icon: string }> = {
    3: {
      title: "🛡️ Parley Élite (3 Jugadas de Máxima Seguridad)",
      desc: "3 picks con la probabilidad más alta y menor dispersión de varianza (1X2, Doble Oportunidad, Over/Under y BTTS).",
      icon: "🛡️",
    },
    5: {
      title: "🚀 Parley Premium (5 Jugadas - Gran Multiplicador)",
      desc: "5 selecciones totalmente distintas al Parley Élite (sin partidos repetidos) para multiplicar la rentabilidad de la jornada.",
      icon: "🚀",
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        {/* Header & Immutable Notice */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                <span>🔥</span>
                <span className="capitalize">{todayFormatted} • Módulo Exclusivo</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                <span>✨</span>
                <span>100% Sin Repetición entre Parleys • Mercados Diversificados</span>
              </div>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Parleys Oficiales del Día
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Dos combinadas cuantitativas independientes sin partidos duplicados para diversificar el riesgo de forma óptima
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-xs font-black text-sky-900 border border-sky-300 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800">
            <span>🔒</span>
            <span>Pronósticos Inmutables (Trazabilidad 100%)</span>
          </div>
        </div>

        {/* Parlay Combinations Selector (3 Jugadas vs 5 Jugadas) */}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Selecciona el Tipo de Parley:
            </span>
            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              {parlayTierDescriptions[parlaySize].title}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([3, 5] as const).map((size) => {
              const info = parlayTierDescriptions[size];
              const isSelected = parlaySize === size;
              const disabled = size === 3 ? elite3.length < 3 : premium5.length < 5;
              return (
                <button
                  key={size}
                  onClick={() => setParlaySize(size)}
                  disabled={disabled}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition text-left cursor-pointer ${
                    isSelected
                      ? size === 3
                        ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-md shadow-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500 font-black ring-2 ring-emerald-500/30"
                        : "border-amber-500 bg-amber-50 text-amber-950 shadow-md shadow-amber-500/20 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-500 font-black ring-2 ring-amber-500/30"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <span className="text-3xl">{info.icon}</span>
                  <div>
                    <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      {size === 3 ? "🛡️ Parley Élite (3 Picks)" : "🚀 Parley Premium (5 Picks)"}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                      {info.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 italic">
            💡 {parlayTierDescriptions[parlaySize].desc}
          </p>
        </div>

        {/* Main Content: Picks List + Floating Slip */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando las mejores combinadas del día...</p>
          </div>
        ) : selectedPicks.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin pronósticos disponibles</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No se encontraron partidos activos para hoy.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Picks List */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Selecciones del Parley ({selectedPicks.length})
                </span>
                <button
                  onClick={() => {
                    const allExp = selectedPicks.every((p) => expandedLegs[p.id || p.match]);
                    const nextState: Record<string, boolean> = {};
                    selectedPicks.forEach((p) => {
                      nextState[p.id || p.match] = !allExp;
                    });
                    setExpandedLegs(nextState);
                  }}
                  className="text-xs font-black text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 transition cursor-pointer"
                >
                  {selectedPicks.every((p) => expandedLegs[p.id || p.match])
                    ? "▲ Minimizar Todo"
                    : "▼ Expandir Todo"}
                </button>
              </div>

              {selectedPicks.map((pick, idx) => {
                const legKey = pick.id || pick.match;
                const isLegExpanded = Boolean(expandedLegs[legKey]);
                const timeStatus = getTimeRemainingStatus(pick.kickoff);
                const isWon = pick.status === "won";
                const isLost = pick.status === "lost";

                // 1. MINIMIZED / COMPACT ROW VIEW (Identical to Dashboard / Picks)
                if (!isLegExpanded) {
                  return (
                    <div
                      key={pick.id || `${pick.fixtureId}-${pick.market}`}
                      onClick={() => setActiveModalPick(pick)}
                      className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-xs transition-all duration-200 hover:border-emerald-500/50 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90 cursor-pointer"
                    >
                      {/* Left: Index, League & Teams */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black border ${
                            isWon
                              ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20"
                              : isLost
                              ? "bg-rose-500 text-white border-rose-400"
                              : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800"
                          }`}
                        >
                          {isWon ? "✓" : isLost ? "✗" : `#${idx + 1}`}
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {pick.match}
                          </div>
                          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                            🏆 {pick.league} {pick.country ? `(${pick.country})` : ""} • ⏰ {formatKickoffTime(pick.kickoff)}
                          </div>
                        </div>
                      </div>

                      {/* Center: Market Badge, Casa vs Modelo Odds & Probability */}
                      <div className="hidden md:flex items-center gap-2 shrink-0 flex-wrap">
                        <span className="rounded-xl bg-emerald-50 border border-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-700/60 px-2.5 py-1 text-xs font-black text-emerald-800 dark:text-emerald-300">
                          🎯 {pick.market}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-xl bg-sky-950/80 px-2.5 py-1 text-xs font-black text-sky-300 border border-sky-800/60" title="Cuota de la Casa de Apuestas">
                          <span className="text-[10px] opacity-70">Casa de Apuestas:</span>
                          <span>@{pick.odds.toFixed(2)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-950/80 px-2.5 py-1 text-xs font-black text-indigo-300 border border-indigo-800/60" title="Cuota Justa del Modelo SmartBetBot">
                          <span className="text-[10px] opacity-70">Modelo SmartBetBot:</span>
                          <span>@{pick.fairOdds.toFixed(2)}</span>
                        </span>
                        <span className="rounded-xl bg-emerald-600 px-2.5 py-1 text-xs font-black text-white">
                          {pick.probability}%
                        </span>
                      </div>

                      {/* Right: Settlement Status & Toggle Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isWon ? (
                          <span className="rounded-xl px-2.5 py-1 text-xs font-black bg-emerald-500 text-slate-950">
                            ✓ {pick.actualScore ? `(${pick.actualScore})` : "Ganado"}
                          </span>
                        ) : isLost ? (
                          <span className="rounded-xl px-2.5 py-1 text-xs font-black bg-rose-600 text-white">
                            ✗ {pick.actualScore ? `(${pick.actualScore})` : "Perdido"}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center rounded-xl px-2 py-0.5 text-[10px] font-black border ${timeStatus.bg}`}>
                            {timeStatus.label}
                          </span>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedLegs((prev) => ({ ...prev, [legKey]: true }));
                          }}
                          title="Ampliar tarjeta completa"
                          className="flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          <span>▼</span>
                          <span className="hidden sm:inline">Ampliar</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                // 2. EXPANDED FULL VIEW (Identical to Dashboard / Picks)
                return (
                  <div
                    key={pick.id || `${pick.fixtureId}-${pick.market}`}
                    onClick={() => setActiveModalPick(pick)}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-300 hover:border-emerald-500/50 hover:shadow-xl dark:border-slate-800/80 dark:bg-slate-900/90 cursor-pointer space-y-4"
                  >
                    {/* Top Bar: League, Country, Status Badge & Toggle Minimize Button */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                          #{idx + 1}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                          <span>🏆</span>
                          <span>{pick.league}</span>
                          {pick.country && (
                            <>
                              <span className="text-slate-400 font-normal">•</span>
                              <span className="text-emerald-700 dark:text-emerald-400">{pick.country}</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isWon ? (
                          <span className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30">
                            ✓ {pick.actualScore ? `(${pick.actualScore})` : "Ganado"}
                          </span>
                        ) : isLost ? (
                          <span className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-black bg-rose-600 text-white shadow-md shadow-rose-600/30">
                            ✗ {pick.actualScore ? `(${pick.actualScore})` : "Perdido"}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center rounded-xl px-2.5 py-1 text-[10px] font-black border ${timeStatus.bg}`}>
                            {timeStatus.label}
                          </span>
                        )}

                        {/* Toggle Minimize Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedLegs((prev) => ({ ...prev, [legKey]: false }));
                          }}
                          title="Minimizar a vista compacta"
                          className="flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          <span>▲</span>
                          <span className="hidden sm:inline">Minimizar</span>
                        </button>
                      </div>
                    </div>

                    {/* Kickoff & Badges */}
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                      <span className="font-bold text-slate-600 dark:text-slate-400">
                        ⏰ {formatKickoffTime(pick.kickoff)} (Ecuador UTC-5)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700">
                          {pick.confidence} ({pick.probability}%)
                        </span>
                      </div>
                    </div>

                    {/* Match Teams Box */}
                    <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80">
                      <div className="font-black text-slate-900 dark:text-white text-base">
                        {pick.match}
                      </div>
                    </div>

                    {/* Odds Comparison: Casa vs Modelo SmartBetBot */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div className="flex flex-col justify-center rounded-2xl bg-sky-50 p-3 border border-sky-200 dark:bg-sky-950/60 dark:border-sky-800/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-sky-800 dark:text-sky-300">🏢 Cuota Casa de Apuestas</span>
                          <span className="text-base font-black text-sky-900 dark:text-sky-200">@{pick.odds.toFixed(2)}</span>
                        </div>
                        <span className="text-[9px] text-sky-600 dark:text-sky-400 mt-0.5">Precio en casa de apuestas</span>
                      </div>

                      <div className="flex flex-col justify-center rounded-2xl bg-indigo-50 p-3 border border-indigo-200 dark:bg-indigo-950/60 dark:border-indigo-800/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-indigo-800 dark:text-indigo-300">🤖 Cuota Modelo SmartBetBot</span>
                          <span className="text-base font-black text-indigo-900 dark:text-indigo-200">@{pick.fairOdds.toFixed(2)}</span>
                        </div>
                        <span className="text-[9px] text-indigo-600 dark:text-indigo-400 mt-0.5">Cuota justa SmartBetBot</span>
                      </div>

                      <div className="col-span-2 sm:col-span-1 flex flex-col justify-center rounded-2xl bg-emerald-50 p-3 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-300">📈 Probabilidad</span>
                          <span className="text-base font-black text-emerald-900 dark:text-emerald-200">{pick.probability}%</span>
                        </div>
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-0.5">Confianza {pick.confidence || "Alta"} (+{pick.edge}% Valor)</span>
                      </div>
                    </div>

                    {/* Tactical Analysis Box */}
                    <div className="rounded-2xl bg-white p-3.5 border border-slate-200 shadow-sm dark:bg-slate-900/90 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-black text-emerald-700 dark:text-emerald-400">
                        <span>🧠</span>
                        <span>Análisis Táctico y Estadístico del Modelo:</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                        {pick.explanation}
                      </p>
                    </div>

                    {/* Footer Action: H2H button */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        🎯 Mercado: <strong>{pick.market}</strong> (+{pick.edge}% Valor)
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveModalPick(pick);
                        }}
                        className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                      >
                        <span>📊 Ver H2H y Racha</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Parley Ticket Summary & Payout Calculator */}
            <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-6 text-white shadow-xl lg:sticky lg:top-24">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                      Boleto Combinado Oficial
                    </span>
                    {selectedPicks.some((p) => p.status === "won" || p.status === "lost") && (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${
                          selectedPicks.some((p) => p.status === "lost")
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : selectedPicks.every((p) => p.status === "won")
                            ? "bg-emerald-500 text-slate-950 font-black"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        }`}
                      >
                        {selectedPicks.some((p) => p.status === "lost")
                          ? `❌ No Acertado (${selectedPicks.filter((p) => p.status === "lost").length} fallo${selectedPicks.filter((p) => p.status === "lost").length > 1 ? "s" : ""})`
                          : selectedPicks.every((p) => p.status === "won")
                          ? "🏆 ¡Ganado y Cobrado!"
                          : `⏳ En Curso (${selectedPicks.filter((p) => p.status === "won").length}/${selectedPicks.length} OK)`}
                      </span>
                    )}
                  </div>
                  <span className="text-lg font-black text-white">
                    {parlayTierDescriptions[parlaySize].title}
                  </span>
                </div>
                <div className="text-right space-y-1">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-sky-400 block">🏢 Cuota Casa de Apuestas</span>
                    <span className="text-2xl sm:text-3xl font-black text-sky-400">
                      @{totalOdds.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-indigo-400 block">🤖 Cuota Modelo SmartBetBot</span>
                    <span className="text-sm font-black text-indigo-400">
                      @{totalFairOdds.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>Probabilidad Combinada:</span>
                <span className="font-extrabold text-emerald-400">
                  {combinedProbability.toFixed(1)}%
                </span>
              </div>

              {/* Stake Simulator */}
              <div className="mt-4 pt-3 border-t border-slate-800">
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
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Potential Return Box */}
              <div className="mt-4 rounded-2xl bg-emerald-950/60 p-4 border border-emerald-500/30">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span>Retorno Total Estimado:</span>
                  <span className="text-base font-black text-emerald-400">${potentialTotalReturn}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                  <span>Ganancia Neta:</span>
                  <span className="font-extrabold text-emerald-300">+${potentialProfit}</span>
                </div>
              </div>

              {/* Action Buttons: Visual Image Copy & Direct Sharing */}
              <div className="mt-5 space-y-2.5">
                {/* Primary Button: Copy Ticket as Image */}
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

                {/* Secondary Image Actions: WhatsApp, Telegram & Download */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleShareParlayWhatsAppImage}
                    title="Compartir tarjeta gráfica en WhatsApp"
                    className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-500 shadow-sm transition cursor-pointer"
                  >
                    <span>💬</span>
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={handleShareParlayTelegramImage}
                    title="Compartir tarjeta gráfica en Telegram"
                    className="flex items-center justify-center gap-1 rounded-xl bg-sky-600 py-2.5 text-xs font-black text-white hover:bg-sky-500 shadow-sm transition cursor-pointer"
                  >
                    <span>✈️</span>
                    <span>Telegram</span>
                  </button>
                  <button
                    onClick={handleDownloadParlayImage}
                    title="Descargar imagen PNG del Parley"
                    className="flex items-center justify-center gap-1 rounded-xl bg-slate-800 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-700 border border-slate-700 shadow-sm transition cursor-pointer"
                  >
                    <span>📥</span>
                    <span>Descargar</span>
                  </button>
                </div>

                {/* Tertiary Button: Copy as Text */}
                <button
                  onClick={handleCopyParlay}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
                >
                  <span>📋</span>
                  <span>{copied ? "✓ ¡Texto Copiado!" : "Copiar como Texto"}</span>
                </button>
              </div>

              <div className="mt-4 text-center">
                <span className="text-[10px] text-slate-400 font-medium">
                  🔒 Pronóstico fijado para garantizar trazabilidad durante toda la jornada
                </span>
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
