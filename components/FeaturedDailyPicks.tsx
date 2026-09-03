"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { shareCardAsImage, copyCardImageToClipboard } from "@/lib/sports/card-image-generator";

interface FeaturedDailyPicksProps {
  smartPick: MarketOpportunity | null;
  bombaPick: MarketOpportunity | null;
  onOpenDetail?: (prediction: MarketOpportunity) => void;
}

export function FeaturedDailyPicks({ smartPick, bombaPick, onOpenDetail }: FeaturedDailyPicksProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);
  const [copyImageSuccessId, setCopyImageSuccessId] = useState<string | null>(null);

  if (!smartPick && !bombaPick) return null;

  const handleCopyText = (pick: MarketOpportunity, isBomba: boolean) => {
    const title = isBomba ? "💣 BOMBA DEL DÍA (ALTA CUOTA CON VALOR)" : "👑 SMARTPICK DEL DÍA (MÁXIMA SEGURIDAD)";
    const text = [
      `⭐ ${title} ⭐`,
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `⚽ ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico Oficial: ${pick.market} (${pick.selection})`,
      `🏢 Cuota Casa de Apuestas: @${pick.odds.toFixed(2)}`,
      `🤖 Cuota Modelo SmartBetBot: @${pick.fairOdds.toFixed(2)}`,
      `📈 Probabilidad Estimada: ${pick.probability}% (+${pick.edge}% Valor)`,
      `⭐ Confianza: ${pick.confidence || "Muy Alta"}`,
      "",
      `🧠 Análisis: "${pick.explanation}"`,
      "",
      "🔒 Pronóstico Oficial Cuantitativo de SmartBetBot AI",
      "🌐 https://smartbetbot.educandotea.com",
    ].join("\n");

    const key = pick.id || pick.match;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 3000);
    });
  };

  const handleCopyImage = async (pick: MarketOpportunity) => {
    const key = pick.id || pick.match;
    try {
      setCopyingImageId(key);
      const ok = await copyCardImageToClipboard(pick);
      if (ok) {
        setCopyImageSuccessId(key);
        setTimeout(() => setCopyImageSuccessId(null), 3000);
      }
    } finally {
      setCopyingImageId(null);
    }
  };

  const renderFeaturedCard = (pick: MarketOpportunity, type: "smart" | "bomba") => {
    const isBomba = type === "bomba";
    const cardKey = pick.id || pick.match;
    const isWon = pick.status === "won";
    const isLost = pick.status === "lost";

    const formattedTime = new Date(pick.kickoff).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div
        key={cardKey}
        onClick={() => onOpenDetail?.(pick)}
        className={`relative overflow-hidden rounded-3xl border p-5 sm:p-6 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer flex flex-col justify-between ${
          isBomba
            ? "border-amber-500/40 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950/40 hover:border-amber-400"
            : "border-emerald-500/40 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40 hover:border-emerald-400"
        }`}
      >
        {/* Glow ambient background */}
        <div
          className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-25 ${
            isBomba ? "bg-amber-500" : "bg-emerald-500"
          }`}
        />

        <div>
          {/* Header Badge */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black tracking-wider uppercase shadow-md ${
                  isBomba
                    ? "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 shadow-orange-500/20"
                    : "bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-slate-950 shadow-emerald-500/20"
                }`}
              >
                <span>{isBomba ? "💣" : "👑"}</span>
                <span>{isBomba ? "BOMBA DEL DÍA" : "SMARTPICK DEL DÍA"}</span>
              </span>

              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                {isBomba ? "🔥 Alta Cuota con Valor" : "🛡️ Máxima Seguridad"}
              </span>
            </div>

            {/* Match Settlement Status Badge */}
            {isWon ? (
              <span className="rounded-xl px-2.5 py-1 text-xs font-black bg-emerald-500 text-slate-950 shadow-md">
                ✓ Ganado {pick.actualScore ? `(${pick.actualScore})` : ""}
              </span>
            ) : isLost ? (
              <span className="rounded-xl px-2.5 py-1 text-xs font-black bg-rose-600 text-white shadow-md">
                ✗ Perdido {pick.actualScore ? `(${pick.actualScore})` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-300">
                ⏰ {formattedTime}
              </span>
            )}
          </div>

          {/* League & Country */}
          <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <span>🏆</span>
            <span>{pick.league}</span>
            {pick.country && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300">{pick.country}</span>
              </>
            )}
          </div>

          {/* Teams */}
          <div className="mt-2 rounded-2xl bg-slate-950/80 p-3.5 border border-slate-800/80">
            <div className="text-base sm:text-lg font-black text-white leading-snug">
              {pick.homeTeam} <span className="text-slate-500 font-normal text-sm">vs</span> {pick.awayTeam}
            </div>
          </div>

          {/* Market Highlight */}
          <div className="mt-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                🎯 Pronóstico Cuantitativo Oficial:
              </span>
              <span className="text-[10px] font-extrabold text-emerald-400">
                +{pick.edge}% Valor
              </span>
            </div>
            <div className="rounded-2xl bg-slate-900/90 px-4 py-2.5 border border-slate-800 text-sm font-black text-white flex items-center justify-between">
              <span>{pick.market}</span>
              <span className="text-xs font-bold text-slate-400">({pick.selection})</span>
            </div>
          </div>

          {/* Side-by-Side Odds Comparison Cards */}
          <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Casa de Apuestas */}
            <div className="rounded-2xl bg-sky-950/60 p-2.5 border border-sky-800/60 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase text-sky-300">🏢 Cuota Casa</span>
              <span className="text-lg font-black text-sky-200 mt-0.5">@{pick.odds.toFixed(2)}</span>
              <span className="text-[9px] text-sky-400/80 mt-0.5">Casa de Apuestas</span>
            </div>

            {/* Cuota Modelo */}
            <div className="rounded-2xl bg-indigo-950/60 p-2.5 border border-indigo-800/60 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase text-indigo-300">🤖 Cuota Modelo</span>
              <span className="text-lg font-black text-indigo-200 mt-0.5">@{pick.fairOdds.toFixed(2)}</span>
              <span className="text-[9px] text-indigo-400/80 mt-0.5">SmartBetBot AI</span>
            </div>

            {/* Probabilidad */}
            <div className="col-span-2 sm:col-span-1 rounded-2xl bg-emerald-950/60 p-2.5 border border-emerald-800/60 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase text-emerald-300">📈 Probabilidad</span>
              <span className="text-lg font-black text-emerald-200 mt-0.5">{pick.probability}%</span>
              <span className="text-[9px] text-emerald-400/80 mt-0.5">Confianza {pick.confidence || "Alta"}</span>
            </div>
          </div>

          {/* Tactical Explanation */}
          {pick.explanation && (
            <div className="mt-3.5 rounded-2xl bg-slate-950/60 p-3 border border-slate-800/60">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mb-1">
                <span>🧠</span>
                <span>Análisis del Modelo:</span>
              </div>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                {pick.explanation}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopyImage(pick);
              }}
              title="Copiar tarjeta gráfica"
              className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 transition cursor-pointer"
            >
              <span>📸</span>
              <span>{copyImageSuccessId === cardKey ? "✓ ¡Copiada!" : "Imagen"}</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                shareCardAsImage(pick, "whatsapp");
              }}
              title="Compartir en WhatsApp"
              className="flex items-center gap-1 rounded-xl bg-emerald-600/30 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/50 border border-emerald-500/40 transition cursor-pointer"
            >
              <span>💬</span>
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopyText(pick, isBomba);
              }}
              title="Copiar texto"
              className="flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
            >
              <span>📋</span>
              <span>{copiedId === cardKey ? "✓ Copiado" : "Texto"}</span>
            </button>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail?.(pick);
            }}
            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 transition cursor-pointer"
          >
            <span>📊 H2H y Stats</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-7 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-400 border border-amber-500/30 uppercase">
            <span>⭐</span>
            <span>Pronósticos Estrella del Día</span>
          </div>
          <h2 className="mt-2 text-xl sm:text-2xl font-black text-white tracking-tight">
            👑 SmartPick del Día & 💣 Bomba del Día
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Las dos mejores oportunidades seleccionadas por el modelo cuantitativo para apostar con máxima seguridad y máximo rendimiento.
          </p>
        </div>
      </div>

      {/* Dual Featured Cards Grid */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {smartPick && renderFeaturedCard(smartPick, "smart")}
        {bombaPick && renderFeaturedCard(bombaPick, "bomba")}
      </div>
    </section>
  );
}
