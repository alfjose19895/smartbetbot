"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

interface PredictionCardProps {
  prediction: MarketOpportunity;
  onShare?: (prediction: MarketOpportunity) => void;
}

export function PredictionCard({ prediction, onShare }: PredictionCardProps) {
  const [copied, setCopied] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);

  const handleCopy = () => {
    const text = `📊 *Análisis SmartBetBot*

⚽ *Partido:* ${prediction.match}
🏆 *Liga:* ${prediction.league}
🎯 *Mercado:* ${prediction.market}
💰 *Cuota:* ${prediction.odds.toFixed(2)}
📈 *Probabilidad:* ${prediction.probability}%
🔥 *Smart Edge:* +${prediction.edge}%

💡 *Explicación IA:*
${prediction.explanation}

🔗 _Generado por SmartBetBot_`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <div className="relative flex flex-col justify-between rounded-2xl bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 p-6 text-slate-100 shadow-xl border border-slate-800/80 backdrop-blur-sm transition-all duration-200 hover:border-slate-700/90 hover:shadow-2xl hover:shadow-cyan-950/20">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h3 className="text-base font-bold tracking-tight text-white">Análisis SmartBetBot</h3>
          </div>
          {prediction.league && (
            <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-300 border border-slate-700/50">
              {prediction.league}
            </span>
          )}
        </div>

        {/* Match & Market Section */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Partido</span>
            <p className="mt-1 text-sm font-bold text-white leading-snug">
              {prediction.match}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Mercado</span>
            <p className="mt-1 text-sm font-bold text-emerald-400 leading-snug">
              {prediction.market}
            </p>
          </div>
        </div>

        {/* Odds & Probability Metrics */}
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-950/60 p-3.5 border border-slate-800/50">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Cuota</span>
            <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-sky-400">
              {prediction.odds.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Probabilidad</span>
            <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-emerald-400">
              {prediction.probability.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* AI Explanation Box */}
        <div className="mt-4 rounded-xl bg-slate-950/80 p-4 border border-slate-800/60">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <span>☕</span>
            <span>Explicación IA</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300 font-normal">
            {prediction.explanation}
          </p>
        </div>

        {/* Action Buttons Footer */}
        <div className="mt-5 flex items-center justify-between gap-2 pt-2 border-t border-slate-800/40">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-md bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-800/40">
              +{prediction.edge}% Edge
            </span>
            <span className="inline-flex items-center rounded-md bg-sky-950/60 px-2 py-0.5 text-[11px] font-semibold text-sky-300 border border-sky-800/40">
              Score: {prediction.smartScore}/100
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white border border-slate-700/50"
              title="Copiar texto para Telegram/WhatsApp"
            >
              {copied ? "✓ Copiado" : "📋 Copiar"}
            </button>
            <button
              onClick={() => setShowStoryModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/90 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 shadow-sm"
              title="Ver formato Historia / Screenshot"
            >
              📸 Historia
            </button>
          </div>
        </div>
      </div>

      {/* Story / Share Modal */}
      {showStoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-slate-950 p-6 text-slate-100 shadow-2xl border border-slate-700">
            {/* Close Button */}
            <button
              onClick={() => setShowStoryModal(false)}
              className="absolute right-4 top-4 rounded-full bg-slate-800/80 p-1.5 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            {/* Story Card Container */}
            <div className="mt-2 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-700/50">
                <span>🔥 PICK DEL DÍA</span>
              </div>
              <h4 className="mt-2 text-xl font-extrabold tracking-tight text-white">
                Análisis SmartBetBot
              </h4>
              <p className="text-xs text-slate-400">{prediction.league}</p>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-900/90 p-4 border border-slate-800">
              <div className="text-center">
                <span className="text-[11px] font-semibold uppercase text-slate-400">Partido</span>
                <p className="text-base font-bold text-white mt-0.5">{prediction.match}</p>
              </div>

              <div className="mt-4 flex items-center justify-around border-t border-slate-800/60 pt-3">
                <div className="text-center">
                  <span className="text-[11px] font-semibold uppercase text-slate-400">Mercado</span>
                  <p className="text-sm font-extrabold text-emerald-400 mt-0.5">{prediction.market}</p>
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <div className="text-center">
                  <span className="text-[11px] font-semibold uppercase text-slate-400">Cuota</span>
                  <p className="text-lg font-extrabold text-sky-400 mt-0.5">{prediction.odds.toFixed(2)}</p>
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <div className="text-center">
                  <span className="text-[11px] font-semibold uppercase text-slate-400">Probabilidad</span>
                  <p className="text-lg font-extrabold text-emerald-400 mt-0.5">{prediction.probability}%</p>
                </div>
              </div>
            </div>

            {/* AI Explanation in Story */}
            <div className="mt-4 rounded-xl bg-slate-900/70 p-3.5 border border-slate-800/60 text-left">
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                <span>☕</span>
                <span>Explicación IA</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                {prediction.explanation}
              </p>
            </div>

            {/* Footer Brand */}
            <div className="mt-5 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/50 pt-3">
              <span className="font-semibold text-white">SmartBetBot</span>
              <span className="text-emerald-400 font-medium">smartbetbot.app</span>
            </div>

            {/* Download/Copy Actions */}
            <div className="mt-5 flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700"
              >
                {copied ? "✓ Texto Copiado" : "📋 Copiar Texto"}
              </button>
              <button
                onClick={() => setShowStoryModal(false)}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-500"
              >
                Listo (Tomar Screenshot)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
