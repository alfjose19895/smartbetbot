"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { formatMatchKickoffTime } from "./PredictionCard";

interface NewAlertsModalProps {
  isOpen: boolean;
  newAlerts: MarketOpportunity[];
  totalCount?: number;
  onClose: () => void;
  onOpenDetail?: (prediction: MarketOpportunity) => void;
}

export function NewAlertsModal({
  isOpen,
  newAlerts,
  totalCount,
  onClose,
  onOpenDetail,
}: NewAlertsModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  if (!isOpen || !newAlerts || newAlerts.length === 0) return null;

  const handleCopySingle = (e: React.MouseEvent, pick: MarketOpportunity) => {
    e.stopPropagation();
    const id = String(pick.fixtureId || pick.id || `${pick.homeTeam}-${pick.awayTeam}`);
    const text = [
      `⚡ NUEVA ALERTA SMARTBETBOT ⚡`,
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `⚽ ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico: ${pick.market} @${(pick.odds ?? 1.5).toFixed(2)}`,
      `📈 Probabilidad: ${pick.probability}% (Fair Odds: @${(pick.fairOdds ?? pick.odds ?? 1.5).toFixed(2)})`,
      `💎 Valor Esperado (+EV): +${pick.edge || 5}%`,
      `⭐ Confianza: ${pick.confidence || "Muy Alta"}`,
      "",
      `🧠 Análisis: "${pick.explanation}"`,
      "",
      `🌐 https://smartbetbot.educandotea.com`,
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const handleCopyAll = () => {
    const lines = [
      `🔥 SE HAN AGREGADO ${newAlerts.length} NUEVAS ALERTAS A SMARTBETBOT 🔥`,
      `📅 Fecha: ${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}`,
      "----------------------------------------",
      ...newAlerts.map((pick, i) => {
        const { time } = formatMatchKickoffTime(pick.kickoff);
        return [
          `#${i + 1} 🏆 ${pick.league} | ⏰ ${time}`,
          `⚽ ${pick.homeTeam} vs ${pick.awayTeam}`,
          `🎯 ${pick.market} @${(pick.odds ?? 1.5).toFixed(2)} | Prob: ${pick.probability}% | +EV: +${pick.edge || 5}%`,
          `🧠 "${pick.explanation}"`,
          "",
        ].join("\n");
      }),
      "🌐 Ver todas las alertas en: https://smartbetbot.educandotea.com",
    ];

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 3000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border-2 border-emerald-500/80 bg-white shadow-2xl dark:border-emerald-500/60 dark:bg-slate-950 overflow-hidden">
        
        {/* Glow Header Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 p-5 text-white">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-xl"></div>
          
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-black tracking-wide uppercase backdrop-blur-sm">
                <span className="animate-ping inline-flex h-2 w-2 rounded-full bg-emerald-300 opacity-75"></span>
                <span>✨ Búsqueda Exitosa</span>
              </div>
              <h2 className="mt-2 text-xl sm:text-2xl font-black tracking-tight">
                ¡{newAlerts.length} {newAlerts.length === 1 ? "Nueva Alerta Encontrada" : "Nuevas Alertas Encontradas"}!
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-emerald-50 leading-relaxed">
                Se han añadido al snapshot del día sin modificar tus pronósticos anteriores.
                {typeof totalCount === "number" && (
                  <span className="font-extrabold text-white"> Total actual: {totalCount} alertas.</span>
                )}
              </p>
            </div>

            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-black/20 hover:bg-black/30 transition text-white text-lg font-bold shrink-0 cursor-pointer"
              title="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* List of Newly Discovered Alerts */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 divide-y divide-slate-100 dark:divide-slate-800/80">
          {newAlerts.map((pick, idx) => {
            const { time } = formatMatchKickoffTime(pick.kickoff);
            const id = String(pick.fixtureId || pick.id || `${pick.homeTeam}-${pick.awayTeam}-${idx}`);
            const isCopied = copiedId === id;

            return (
              <div
                key={id}
                onClick={() => onOpenDetail?.(pick)}
                className={`group relative rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-50/40 via-white to-slate-50/50 p-4 transition hover:border-emerald-500 hover:shadow-lg dark:from-emerald-950/20 dark:via-slate-900/90 dark:to-slate-900/50 dark:border-emerald-500/30 dark:hover:border-emerald-500 cursor-pointer ${
                  idx > 0 ? "pt-4.5" : ""
                }`}
              >
                {/* Top Badge strip */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 text-slate-950 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-xs animate-pulse">
                      ⚡ NUEVA #{idx + 1}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 text-[11px] font-bold">
                      🏆 {pick.league} {pick.country ? `(${pick.country})` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 px-2 py-0.5 text-[10px] font-bold">
                      ⏰ {time}
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleCopySingle(e, pick)}
                    className="flex items-center gap-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer shrink-0 shadow-xs"
                    title="Copiar pronóstico"
                  >
                    {isCopied ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-black">✓ Copiado</span>
                    ) : (
                      <span>📋 Copiar</span>
                    )}
                  </button>
                </div>

                {/* Matchup */}
                <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-emerald-800 dark:text-emerald-400 font-bold">⚽</span>
                  <span>{pick.homeTeam} <span className="text-slate-400 font-normal">vs</span> {pick.awayTeam}</span>
                </div>

                {/* Market & Value Metrics */}
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-2 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Pronóstico</span>
                    <span className="font-black text-xs sm:text-sm text-emerald-800 dark:text-emerald-400">
                      {pick.market} <span className="text-sky-600 dark:text-sky-400 font-extrabold">@{(pick.odds ?? 1.5).toFixed(2)}</span>
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-100/90 dark:bg-slate-800/80 p-2 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Probabilidad</span>
                    <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                      {pick.probability}% <span className="text-[10px] text-slate-500 font-normal">(Fair: @{(pick.fairOdds ?? pick.odds ?? 1.5).toFixed(2)})</span>
                    </span>
                  </div>

                  <div className="col-span-2 sm:col-span-1 rounded-xl bg-emerald-100/60 dark:bg-emerald-950/40 p-2 border border-emerald-300/60 dark:border-emerald-800/40 flex items-center justify-between sm:block">
                    <span className="block text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase">Valor (+EV)</span>
                    <span className="font-black text-xs sm:text-sm text-emerald-900 dark:text-emerald-300">
                      +{pick.edge || 5}% Ventaja
                    </span>
                  </div>
                </div>

                {/* Explanation */}
                {pick.explanation && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-white/70 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 font-medium">
                    💡 {pick.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/90">
          <button
            onClick={handleCopyAll}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white transition shadow-sm cursor-pointer"
          >
            {copiedAll ? (
              <span>✓ ¡Todas las {newAlerts.length} Alertas Copiadas!</span>
            ) : (
              <span>📋 Copiar {newAlerts.length} Nuevas Alertas</span>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-black text-white transition shadow-sm cursor-pointer"
          >
            <span>Ver en el Panel Principal</span>
            <span>→</span>
          </button>
        </div>

      </div>
    </div>
  );
}
