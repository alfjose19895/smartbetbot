"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import { copyParlayCardImageToClipboard } from "@/lib/sports/card-image-generator";
import { buildTripleExclusiveParlays } from "@/lib/sports/parlay-generator";

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

  // Generate 3 mutually exclusive parlays of 3 picks each
  const { parlay1, parlay2, parlay3 } = buildTripleExclusiveParlays(predictions);

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
      ? "3 picks de máxima probabilidad y mayor certeza estadística para crecimiento sostenido."
      : selectedParlayIndex === 2
      ? "3 selecciones con máximo valor esperado (+EV) de partidos totalmente distintos."
      : "3 selecciones multiplicadoras de alta rentabilidad sin repetición de partidos.";

  // Calculate accumulated parlay odds and combined probability
  const totalOdds = selectedPicks.reduce((acc, p) => acc * (p.odds || 1.5), 1);
  const totalFairOdds = selectedPicks.reduce((acc, p) => acc * (p.fairOdds || p.odds || 1.3), 1);
  const combinedProbability =
    selectedPicks.reduce((acc, p) => acc * ((p.probability || 50) / 100), 1) * 100;
  const potentialProfit = (stake * totalOdds - stake).toFixed(2);
  const potentialTotalReturn = (stake * totalOdds).toFixed(2);

  const [copyingImage, setCopyingImage] = useState(false);
  const [copyImageSuccess, setCopyImageSuccess] = useState(false);

  const handleCopyParlayImage = async () => {
    try {
      setCopyingImage(true);
      const ok = await copyParlayCardImageToClipboard(
        selectedPicks,
        totalOdds,
        Number((combinedProbability ?? 50).toFixed(1)),
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

  const handleCopyParlay = () => {
    const lines = [
      `🔥 ${currentTitle.toUpperCase()}`,
      `🎯 Cuota Casa: @${(totalOdds ?? 1.5).toFixed(2)} | Cuota Modelo: @${(totalFairOdds ?? 1.5).toFixed(2)} | Prob: ${(combinedProbability ?? 50).toFixed(1)}%`,
      `📅 Fecha: ${now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
      "",
      ...selectedPicks.map(
        (p, idx) =>
          `${idx + 1}. ${p.match} (${p.league})\n   🎯 Pronóstico: ${p.market}\n   🏢 Cuota Casa: @${(p.odds ?? 1.5).toFixed(2)} | 🤖 Cuota Modelo: @${(p.fairOdds ?? p.odds ?? 1.5).toFixed(2)} (${p.probability}% prob)`
      ),
      "",
      `💰 Simulación ($${stake}): Retorno $${potentialTotalReturn} (+$${potentialProfit})`,
      "🔒 Pronóstico Oficial de SmartBetBot AI - Cero Repetición de Partidos",
      "🌐 https://smartbetbot.educandotea.com/parlay",
    ];

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const calcOdds = (picks: MarketOpportunity[]) => picks.reduce((acc, p) => acc * (p.odds || 1.5), 1).toFixed(2);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/95 p-5 sm:p-7 shadow-2xl backdrop-blur-xl">
      {/* Decorative Glow */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-950/80 px-3 py-1 text-xs font-black tracking-wider text-emerald-400 border border-emerald-500/40 uppercase">
              <span>🎯</span>
              <span>
                {language === "en" ? "Official Daily Parlays" : "3 Parleys Oficiales del Día"}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-0.5 text-[11px] font-extrabold text-indigo-300 border border-indigo-500/30">
              <span>✨</span>
              <span>3 Parleys de 3 Picks • Cero Repetición de Partidos</span>
            </div>
          </div>
          <h2 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-white">
            {currentTitle}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {currentDesc}
          </p>
        </div>

        {/* 3-Parlay Selector Tabs */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-2xl bg-slate-950/80 p-1.5 border border-slate-800 flex-wrap">
          <button
            onClick={() => setSelectedParlayIndex(1)}
            disabled={parlay1.length < 3}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
              selectedParlayIndex === 1
                ? "bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/30 font-black"
                : "text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            <span>🛡️</span>
            <span>Seguro (@{calcOdds(parlay1)})</span>
          </button>
          <button
            onClick={() => setSelectedParlayIndex(2)}
            disabled={parlay2.length < 3}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
              selectedParlayIndex === 2
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/30 font-black"
                : "text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            <span>💎</span>
            <span>Valor (@{calcOdds(parlay2)})</span>
          </button>
          <button
            onClick={() => setSelectedParlayIndex(3)}
            disabled={parlay3.length < 3}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
              selectedParlayIndex === 3
                ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/30 font-black"
                : "text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            <span>💣</span>
            <span>Bomba (@{calcOdds(parlay3)})</span>
          </button>
        </div>
      </div>

      {/* Picks Grid & Summary */}
      <div className="relative z-10 mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Selected Picks List */}
        <div className="lg:col-span-2 space-y-2.5">
          {selectedPicks.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-8 text-center text-slate-400">
              <span className="text-3xl">⏳</span>
              <p className="mt-2 text-xs font-medium">Generando combinadas del día...</p>
            </div>
          ) : (
            selectedPicks.map((pick, idx) => (
              <div
                key={`${pick.fixtureId}-${pick.homeTeam}-${pick.market}`}
                onClick={() => onSelectPrediction?.(pick)}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 transition-all duration-300 hover:border-emerald-500/50 hover:bg-slate-900/80 cursor-pointer"
              >
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/20 text-[11px] font-black text-emerald-400">
                      {idx + 1}
                    </span>
                    <span className="font-extrabold text-slate-300">
                      🏆 {pick.league} {pick.country ? `• ${pick.country}` : ""}
                    </span>
                  </div>
                  <span className="font-bold text-slate-400 text-[11px]">
                    ⏰ {formatMatchTime(pick.kickoff)}
                  </span>
                </div>

                <div className="my-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 text-left font-black text-sm text-white truncate">
                    {pick.homeTeam}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-black text-slate-400">
                    VS
                  </span>
                  <div className="flex-1 text-right font-black text-sm text-white truncate">
                    {pick.awayTeam}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2 border border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-emerald-400">🎯 {pick.market}</span>
                    {pick.selection && (
                      <span className="text-slate-400 text-[11px]">({pick.selection})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      {pick.probability}% prob
                    </span>
                    <span className="rounded-lg bg-emerald-500 px-2 py-0.5 text-xs font-black text-slate-950">
                      @{(pick.odds ?? 1.5).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Parlay Ticket Summary & Payout Box */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>🧾</span>
              <span>Resumen del Boleto</span>
            </h3>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-black text-emerald-400 border border-emerald-500/30">
              3 Selecciones
            </span>
          </div>

          <div className="mt-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Cuota Combinada:</span>
              <span className="text-base font-black text-white">@{(totalOdds ?? 1.5).toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Probabilidad Combinada:</span>
              <span className="font-extrabold text-emerald-400">
                {(combinedProbability ?? 50).toFixed(1)}%
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Simulación de Monto ($ USD):
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={stake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 py-1.5 pl-6 pr-2 text-xs font-black text-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="rounded-xl bg-emerald-950/40 p-3 border border-emerald-500/30">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400/80">Ganancia Neta:</span>
                <span className="text-sm font-black text-emerald-300">+${potentialProfit}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-emerald-500/20">
                <span className="font-bold text-emerald-300">Retorno Total:</span>
                <span className="text-base font-black text-emerald-400">${potentialTotalReturn}</span>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                onClick={handleCopyParlayImage}
                title="Copiar imagen del parley al portapapeles"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-black text-white hover:bg-emerald-500 transition cursor-pointer shadow-md shadow-emerald-600/20"
              >
                <span>📸</span>
                <span>
                  {copyImageSuccess ? "✓ ¡Imagen Copiada!" : copyingImage ? "Generando..." : "Copiar Tarjeta Gráfica"}
                </span>
              </button>

              <button
                onClick={handleCopyParlay}
                title="Copiar texto del parley"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer border border-slate-700"
              >
                <span>📋</span>
                <span>{copied ? "✓ ¡Texto Copiado!" : "Copiar Texto"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
