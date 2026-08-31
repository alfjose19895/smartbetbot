"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";

interface RecommendedParlayProps {
  predictions: MarketOpportunity[];
  onSelectPrediction?: (prediction: MarketOpportunity) => void;
}

export function RecommendedParlay({ predictions, onSelectPrediction }: RecommendedParlayProps) {
  const { language } = useLanguage();
  const [parlaySize, setParlaySize] = useState<3 | 4 | 5>(3);
  const [stake, setStake] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);

  // Local calendar date helper (YYYY-MM-DD in local time)
  const getLocalDateStr = (d: Date | string) => {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const todayStr = getLocalDateStr(now);

  // Strictly filter for today's matches with high quality (prob >= 55% & odds >= 1.35)
  const todayPicks = [...predictions]
    .filter((p) => {
      const isToday = getLocalDateStr(p.kickoff) === todayStr;
      return isToday && p.probability >= 55 && p.odds >= 1.35;
    })
    .sort((a, b) => b.probability - a.probability || (b.smartScore || 0) - (a.smartScore || 0));

  // If today's list has at least 3 matches, use strictly today's matches.
  // If late at night and fewer than 3 matches left today, fallback to closest upcoming matches in next 24h
  const candidatePicks =
    todayPicks.length >= 3
      ? todayPicks
      : [...predictions]
          .filter((p) => p.probability >= 55 && p.odds >= 1.35)
          .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
          .slice(0, 15)
          .sort((a, b) => b.probability - a.probability);

  if (candidatePicks.length < 3) {
    return null;
  }

  const selectedPicks = candidatePicks.slice(0, Math.min(parlaySize, candidatePicks.length));

  // Calculate accumulated parlay odds and combined probability
  const totalOdds = selectedPicks.reduce((acc, p) => acc * p.odds, 1);
  const combinedProbability =
    selectedPicks.reduce((acc, p) => acc * (p.probability / 100), 1) * 100;
  const potentialProfit = (stake * totalOdds - stake).toFixed(2);
  const potentialTotalReturn = (stake * totalOdds).toFixed(2);

  const handleCopyParlay = () => {
    const lines = [
      `🔥 PARLEY COMBINADO DEL DÍA (${selectedPicks.length} PICKS)`,
      `🎯 Cuota Total: ${totalOdds.toFixed(2)} | Probabilidad: ${combinedProbability.toFixed(1)}%`,
      `📅 Fecha: ${now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
      "",
      ...selectedPicks.map(
        (p, idx) =>
          `${idx + 1}. ${p.match}\n   🏆 ${p.league}\n   🎯 Selección: ${p.market} (Cuota: ${p.odds.toFixed(2)})\n   ⭐ Confianza: ${p.confidence || "Alta"} (${p.probability.toFixed(0)}%)`
      ),
      "",
      `💰 Apuesta simulada: $${stake} ➔ Ganancia potencial: $${potentialTotalReturn}`,
      "🚀 Generado por SmartBetBot - Inteligencia Cuantitativa",
    ];

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/60 p-5 sm:p-7 text-white shadow-xl shadow-emerald-950/20">
      {/* Background ambient glow */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-950/80 px-3 py-1 text-xs font-black tracking-wider text-emerald-400 border border-emerald-500/40 uppercase">
            <span>🔥</span>
            <span>
              {todayPicks.length >= 3
                ? language === "en"
                  ? "Today's Recommended Parlay"
                  : "Parley Recomendado del Día de Hoy"
                : language === "en"
                ? "Next 24h Recommended Parlay"
                : "Parley Recomendado de la Jornada"}
            </span>
          </div>
          <h2 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-white">
            {language === "en" ? "Top Daily Combination" : "Combinada Élite del Día Actual"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {language === "en"
              ? "Algorithmic multi-match combination strictly from today's matches"
              : "Selección matemática multi-partido del día actual para maximizar cuota y valor esperado"}
          </p>
        </div>

        {/* Parlay Size Selector (3, 4, 5 picks) */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-2xl bg-slate-950/80 p-1.5 border border-slate-800">
          <span className="text-xs font-bold text-slate-400 px-2">Picks:</span>
          {([3, 4, 5] as const).map((size) => (
            <button
              key={size}
              onClick={() => setParlaySize(size)}
              disabled={candidatePicks.length < size}
              className={`rounded-xl px-3 py-1 text-xs font-extrabold transition cursor-pointer ${
                parlaySize === size
                  ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30"
                  : "text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              }`}
            >
              {size}
            </button>
          ))}
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
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    {pick.league}
                  </span>
                  <span className="text-sm font-black text-white group-hover:text-emerald-300 transition">
                    {pick.match}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-slate-800/80 pt-2 sm:pt-0">
                <span className="rounded-xl bg-slate-900 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-950">
                  🎯 {pick.market}
                </span>
                <span className="text-xs font-extrabold text-slate-300">
                  {pick.probability.toFixed(0)}%
                </span>
                <span className="rounded-xl bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-300 border border-emerald-500/30">
                  @{pick.odds.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Parlay Ticket Summary & Payout Box */}
        <div className="rounded-2xl bg-slate-950/90 p-5 border border-slate-800 text-slate-100 flex flex-col justify-between h-full shadow-lg">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <span className="text-xs font-bold uppercase text-slate-400">Cuota Combinada</span>
              <span className="text-2xl font-black text-sky-400">
                @{totalOdds.toFixed(2)}
              </span>
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

          <div className="mt-5">
            <button
              onClick={handleCopyParlay}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-400 hover:scale-[1.01] cursor-pointer"
            >
              <span>{copied ? "✓" : "📋"}</span>
              <span>{copied ? "¡Parley Copiado al Portapapeles!" : "Copiar Parley para Telegram/WhatsApp"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
