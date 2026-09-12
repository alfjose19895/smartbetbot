"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import { copyParlayCardImageToClipboard } from "@/lib/sports/card-image-generator";
import { getImmutableDailyParlays } from "@/lib/sports/parlay-generator";

interface RecommendedParlayProps {
  predictions: MarketOpportunity[];
  onSelectPrediction?: (prediction: MarketOpportunity) => void;
}

function formatMatchTime(dateString: string): string {
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

export function RecommendedParlay({ predictions, onSelectPrediction }: RecommendedParlayProps) {
  const { language } = useLanguage();
  const [selectedParlayIndex, setSelectedParlayIndex] = useState<1 | 2 | 3>(1);
  const [stake, setStake] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);

  const now = new Date();

  // Load IMMUTABLE 3 parlays for today (never changes across reloads)
  const { parlay1, parlay2, parlay3 } = getImmutableDailyParlays(predictions);

  const selectedPicks: MarketOpportunity[] =
    selectedParlayIndex === 3 ? parlay3 : selectedParlayIndex === 2 ? parlay2 : parlay1;

  const currentTitle =
    selectedParlayIndex === 1
      ? "🛡️ Parley Seguro (3 Picks)"
      : selectedParlayIndex === 2
      ? "💎 Parley Valor (3 Picks)"
      : "💣 Parley Bomba (3 Picks)";

  const currentDesc =
    selectedParlayIndex === 1
      ? "3 selecciones de máxima probabilidad y mayor confianza estadística."
      : selectedParlayIndex === 2
      ? "3 selecciones con el mayor valor esperado (+EV) y ventaja matemática del día."
      : "3 selecciones audaces con cuota alta y gran multiplicador potencial.";

  const totalOdds = selectedPicks.reduce((acc, p) => acc * (p.odds || 1.5), 1);
  const potentialPayout = stake * totalOdds;
  const potentialProfit = potentialPayout - stake;

  const formattedDate = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const handleCopyText = () => {
    const textLines = [
      `⭐ SMARTBETBOT MCP — ${currentTitle.toUpperCase()} ⭐`,
      `📅 Fecha: ${formattedDate}`,
      `💰 Cuota Total Combinada: @${totalOdds.toFixed(2)}`,
      "",
      ...selectedPicks.map(
        (p, idx) =>
          `${idx + 1}. [${p.league}] ${p.homeTeam} vs ${p.awayTeam} ➔ ${p.market} @${(p.odds || 1.5).toFixed(2)} (${p.probability}% Prob.)`
      ),
      "",
      `💵 Apuesta sugerida: $${stake} ➔ Ganancia potencial: $${potentialProfit.toFixed(2)}`,
      "🌐 https://smartbetbot.educandotea.com",
    ];

    navigator.clipboard.writeText(textLines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleCopyImage = () => {
    copyParlayCardImageToClipboard(
      selectedPicks,
      totalOdds,
      Math.round(selectedPicks.reduce((acc, p) => acc * ((p.probability || 50) / 100), 1) * 100),
      stake
    ).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    });
  };

  if (selectedPicks.length === 0) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
      {/* Selector Tabs for 3 Mutually Exclusive Parlays */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>🎲</span>
            <span>3 Parleys Exclusivos Inmutables de Hoy</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {currentDesc}
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setSelectedParlayIndex(1)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              selectedParlayIndex === 1
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            🛡️ Seguro (3)
          </button>
          <button
            onClick={() => setSelectedParlayIndex(2)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              selectedParlayIndex === 2
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            💎 Doble Valor (3)
          </button>
          <button
            onClick={() => setSelectedParlayIndex(3)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              selectedParlayIndex === 3
                ? "bg-purple-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            💣 Bomba (3)
          </button>
        </div>
      </div>

      {/* Parlay Legs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {selectedPicks.map((pick, idx) => (
          <div
            key={pick.id || `${pick.fixtureId}-${pick.market}-${idx}`}
            onClick={() => onSelectPrediction && onSelectPrediction(pick)}
            className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/60 hover:border-emerald-500/50 transition cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2">
                <span className="truncate max-w-[140px]">🏆 {pick.league}</span>
                <span>{formatMatchTime(pick.kickoff)}</span>
              </div>
              <h4 className="text-xs font-extrabold text-slate-900 dark:text-white mb-2 leading-tight">
                {pick.homeTeam} vs {pick.awayTeam}
              </h4>
            </div>

            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block">Pronóstico:</span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                  {pick.market}
                </span>
              </div>
              <span className="text-sm font-black text-slate-900 dark:text-white">
                @{(pick.odds || 1.5).toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Parlay Calculation & Copy Bar */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Cuota Total Combinada:</span>
            <span className="text-2xl font-black text-emerald-400">@{totalOdds.toFixed(2)}</span>
          </div>
          <div className="border-l border-slate-800 pl-4">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Retorno con $10:</span>
            <span className="text-lg font-extrabold text-white">${(10 * totalOdds).toFixed(2)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleCopyText}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition cursor-pointer shadow"
          >
            {copied ? "✓ ¡Copiado!" : "📋 Copiar Parley"}
          </button>
          <button
            onClick={handleCopyImage}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition cursor-pointer"
            title="Copiar tarjeta como imagen"
          >
            🖼️ Imagen
          </button>
        </div>
      </div>
    </div>
  );
}
