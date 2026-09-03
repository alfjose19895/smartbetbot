"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import { copyParlayCardImageToClipboard } from "@/lib/sports/card-image-generator";
import { buildDualExclusiveParlays } from "@/lib/sports/parlay-generator";

interface RecommendedParlayProps {
  predictions: MarketOpportunity[];
  onSelectPrediction?: (prediction: MarketOpportunity) => void;
}

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

export function RecommendedParlay({ predictions, onSelectPrediction }: RecommendedParlayProps) {
  const { language } = useLanguage();
  const [parlaySize, setParlaySize] = useState<3 | 5>(3);
  const [stake, setStake] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);

  const now = new Date();

  // Generate dual mutually exclusive parlays with diversified markets
  const { elite3, premium5 } = buildDualExclusiveParlays(predictions);
  const selectedPicks: MarketOpportunity[] = parlaySize === 5 ? premium5 : elite3;

  // Calculate accumulated parlay odds and combined probability
  const totalOdds = selectedPicks.reduce((acc, p) => acc * p.odds, 1);
  const totalFairOdds = selectedPicks.reduce((acc, p) => acc * (p.fairOdds || 1.3), 1);
  const combinedProbability =
    selectedPicks.reduce((acc, p) => acc * (p.probability / 100), 1) * 100;
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

  const handleCopyParlay = () => {
    const lines = [
      `🔥 PARLEY COMBINADO DEL DÍA (${selectedPicks.length} PICKS)`,
      `🎯 Cuota Casa: @${totalOdds.toFixed(2)} | Cuota Modelo: @${totalFairOdds.toFixed(2)} | Prob: ${combinedProbability.toFixed(1)}%`,
      `📅 Fecha: ${now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
      "",
      ...selectedPicks.map(
        (p, idx) =>
          `${idx + 1}. ${p.match} (${p.league})\n   🎯 Pronóstico: ${p.market}\n   🏢 Cuota Casa: @${p.odds.toFixed(2)} | 🤖 Cuota Modelo: @${p.fairOdds.toFixed(2)} (${p.probability}% prob)`
      ),
      "",
      `💰 Simulación ($${stake}): Retorno $${potentialTotalReturn} (+$${potentialProfit})`,
      "🔒 Pronóstico Oficial de SmartBetBot AI",
      "🌐 https://smartbetbot.educandotea.com/parlay",
    ];

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

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
                {language === "en" ? "Official Daily Parlays" : "Parleys Oficiales del Día"}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-0.5 text-[11px] font-extrabold text-indigo-300 border border-indigo-500/30">
              <span>✨</span>
              <span>Sin Repetición de Partidos • Mercados Diversificados</span>
            </div>
          </div>
          <h2 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-white">
            {parlaySize === 3
              ? language === "en"
                ? "🛡️ Elite Parlay (3 High-Probability Picks)"
                : "🛡️ Parley Élite (3 Selecciones de Máxima Probabilidad)"
              : language === "en"
              ? "🚀 Premium Parlay (5 High-Yield Picks)"
              : "🚀 Parley Premium (5 Selecciones de Gran Rentabilidad)"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {parlaySize === 3
              ? "Picks independientes de máxima probabilidad (1X2, Doble Oportunidad, Over/Under y BTTS) para un crecimiento seguro del capital."
              : "5 selecciones totalmente distintas al Parley Élite para multiplicar exponencialmente el beneficio con cuotas de alto valor."}
          </p>
        </div>

        {/* Parlay Mode Selector: 3 picks vs 5 picks */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-2xl bg-slate-950/80 p-1.5 border border-slate-800 flex-wrap">
          <button
            onClick={() => setParlaySize(3)}
            disabled={elite3.length < 3}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              parlaySize === 3
                ? "bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/30 font-black"
                : "text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            <span>🛡️</span>
            <span>Parley Élite (3 Picks)</span>
          </button>
          <button
            onClick={() => setParlaySize(5)}
            disabled={premium5.length < 5}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              parlaySize === 5
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/30 font-black"
                : "text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            <span>🚀</span>
            <span>Parley Premium (5 Picks)</span>
          </button>
        </div>
      </div>

      {/* Picks Grid & Summary */}
      <div className="relative z-10 mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Selected Picks List */}
        <div className="lg:col-span-2 space-y-2.5">
          {selectedPicks.map((pick, idx) => (
            <div
              key={pick.id || `${pick.fixtureId}-${pick.market}`}
              onClick={() => onSelectPrediction && onSelectPrediction(pick)}
              className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/90 transition hover:border-emerald-500/50 hover:bg-slate-900/80 ${
                onSelectPrediction ? "cursor-pointer" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-xs font-black text-emerald-400 border border-emerald-500/30">
                  {idx + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      {pick.league}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-black text-emerald-400 border border-emerald-950">
                      🕒 {formatKickoffTime(pick.kickoff)}
                    </span>
                  </div>
                  <span className="text-sm font-black text-white group-hover:text-emerald-300 transition mt-0.5 block">
                    {pick.match}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 border-slate-800/80 pt-2 sm:pt-0 flex-wrap">
                <span className="rounded-xl bg-slate-900 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-950">
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
                <span className="text-xs font-extrabold text-emerald-400 bg-emerald-950/50 px-2 py-1 rounded-xl border border-emerald-800/40">
                  {pick.probability.toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Parlay Ticket Summary & Payout Box */}
        <div className="rounded-2xl bg-slate-950/90 p-5 border border-slate-800 text-slate-100 flex flex-col justify-between h-full shadow-lg">
          <div>
            <div className="space-y-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-sky-400">🏢 Cuota Casa de Apuestas Combinada</span>
                <span className="text-2xl font-black text-sky-400">
                  @{totalOdds.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-indigo-400">🤖 Cuota Modelo SmartBetBot</span>
                <span className="text-lg font-black text-indigo-400">
                  @{totalFairOdds.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
              <span>Probabilidad Estimada:</span>
              <span className="font-extrabold text-emerald-400">
                {combinedProbability.toFixed(1)}%
              </span>
            </div>

            {/* Stake Input Simulator */}
            <div className="mt-4 pt-3 border-t border-slate-800/80">
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
                  className="w-24 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white border border-slate-700 focus:border-emerald-500 focus:outline-none"
                />
                <div className="flex gap-1">
                  {[10, 25, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setStake(amt)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                        stake === amt
                          ? "bg-emerald-500 text-slate-950 font-black"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-emerald-950/40 p-3 border border-emerald-500/30">
              <div className="flex justify-between text-xs font-bold text-slate-300">
                <span>Retorno Total:</span>
                <span className="text-sm font-black text-emerald-400">${potentialTotalReturn}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>Ganancia Neta:</span>
                <span className="font-bold text-emerald-300">+${potentialProfit}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <button
              onClick={handleCopyParlayImage}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 py-3 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 cursor-pointer"
            >
              <span>📸</span>
              <span>
                {copyImageSuccess
                  ? "✓ ¡Imagen Copiada! (Pega con Ctrl+V)"
                  : copyingImage
                  ? "Generando Imagen PNG..."
                  : "📸 Copiar Parley como Imagen"}
              </span>
            </button>

            <button
              onClick={handleCopyParlay}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
            >
              <span>📋</span>
              <span>{copied ? "✓ ¡Texto Copiado!" : "Copiar como Texto"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
