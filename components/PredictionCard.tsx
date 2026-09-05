"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import { shareCardAsImage, copyCardImageToClipboard, downloadCardImage } from "@/lib/sports/card-image-generator";

interface PredictionCardProps {
  prediction: MarketOpportunity;
  onOpenDetail?: (prediction: MarketOpportunity) => void;
}

function getMatchLiveStatusBadge(kickoff: string) {
  if (!kickoff) return null;
  const nowMs = Date.now();
  const kickoffMs = new Date(kickoff).getTime();
  const diffMinutes = Math.floor((nowMs - kickoffMs) / 60000);

  if (diffMinutes < -60) {
    const hours = Math.floor(Math.abs(diffMinutes) / 60);
    const mins = Math.abs(diffMinutes) % 60;
    return {
      label: `🟢 Inicia en ${hours}h ${mins}m`,
      cls: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700",
    };
  }
  if (diffMinutes < 0) {
    return {
      label: `⏳ Inicia en ${Math.abs(diffMinutes)}m`,
      cls: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700 animate-pulse",
    };
  }
  if (diffMinutes >= 0 && diffMinutes <= 115) {
    return {
      label: `🔴 En Juego (~${diffMinutes}')`,
      cls: "bg-red-50 text-red-800 border-red-300 dark:bg-red-950/80 dark:text-red-300 dark:border-red-700 font-black animate-pulse",
    };
  }
  return {
    label: "🏁 Finalizado",
    cls: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  };
}

export function PredictionCard({ prediction, onOpenDetail }: PredictionCardProps) {
  const { language } = useLanguage();
  const [copyingImage, setCopyingImage] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const statusBadge = getMatchLiveStatusBadge(prediction.kickoff);

  const handleCopyImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setCopyingImage(true);
      const ok = await copyCardImageToClipboard(prediction);
      if (ok) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setCopyingImage(false);
    }
  };

  const handleShareWhatsAppImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    shareCardAsImage(prediction, "whatsapp");
  };

  const handleShareTelegramImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    shareCardAsImage(prediction, "telegram");
  };

  const handleDownloadImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadCardImage(prediction);
  };

  const formattedDate = new Date(prediction.kickoff).toLocaleDateString("es-ES", {
    month: "short",
    day: "numeric",
  });

  const formattedTime = new Date(prediction.kickoff).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const confidenceBadge =
    prediction.confidence === "Muy Alta"
      ? { label: "⭐⭐⭐ Muy Alta", cls: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700" }
      : { label: "⭐⭐ Alta", cls: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700" };

  return (
    <div
      onClick={() => onOpenDetail?.(prediction)}
      className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-xl dark:border-slate-800/80 dark:bg-slate-900/90 cursor-pointer w-full"
    >
      <div>
        {/* Top Bar: League, Country & Status Badge */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              <span>🏆</span>
              <span>{prediction.league}</span>
              {prediction.country && (
                <>
                  <span className="text-slate-400 font-normal">•</span>
                  <span className="text-emerald-700 dark:text-emerald-400">{prediction.country}</span>
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {prediction.status === "won" ? (
              <span className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30">
                ✓ Ganado
              </span>
            ) : prediction.status === "lost" ? (
              <span className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-black bg-rose-600 text-white shadow-md shadow-rose-600/30">
                ✗ Perdido
              </span>
            ) : statusBadge ? (
              <span className={`inline-flex items-center rounded-xl px-2.5 py-1 text-[10px] font-black border ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            ) : null}
          </div>
        </div>

        {/* Kickoff Date/Time & Badges (Bomba / Valor / Confidence) */}
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            📅 {formattedDate} • ⏰ {formattedTime} (Ecuador UTC-5)
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {prediction.pickBadge === "bomba" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-sm border border-orange-400 animate-pulse">
                💣 BOMBA
              </span>
            )}
            {prediction.pickBadge === "valor" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-sm border border-emerald-400 font-extrabold">
                💎 VALOR
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border ${confidenceBadge.cls}`}>
              <span>{confidenceBadge.label}</span>
            </span>
          </div>
        </div>

        {/* Match Header (Teams) */}
        <div className="mt-3 rounded-2xl bg-slate-50 p-3.5 border border-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80">
          <div className="text-base font-black text-slate-900 dark:text-white leading-snug">
            {prediction.homeTeam}
          </div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-400 my-0.5">vs</div>
          <div className="text-base font-black text-slate-900 dark:text-white leading-snug">
            {prediction.awayTeam}
          </div>

          {prediction.actualScore && (
            <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Resultado Oficial:</span>
              <span className="px-3 py-1 rounded-xl bg-slate-900 text-xs font-black text-emerald-400 border border-slate-700 font-mono">
                {prediction.actualScore}
              </span>
            </div>
          )}
        </div>

        {/* Main Pick Highlight Box with Side-by-Side Odds and Model Odds */}
        <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50/60 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-950/20 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
              🎯 PRONÓSTICO SMARTBETBOT
            </div>
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Valor / Ventaja: <strong className="text-emerald-700 dark:text-emerald-300">+{prediction.edge}%</strong>
            </div>
          </div>

          <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
            {prediction.market} ({prediction.selection})
          </div>

          {/* Side-by-Side Odds Comparison Cards with Descriptions */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {/* Casa de Apuestas */}
            <div className="rounded-xl bg-white p-2.5 border border-sky-200 shadow-sm dark:bg-slate-900 dark:border-sky-900/60">
              <div className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                <span>🏢</span> Casa
              </div>
              <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                @{prediction.odds.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-400 leading-tight truncate">
                Cuota Casa
              </div>
            </div>

            {/* Cuota Modelo SmartBetBot */}
            <div className="rounded-xl bg-white p-2.5 border border-indigo-200 shadow-sm dark:bg-slate-900 dark:border-indigo-900/60">
              <div className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <span>🧠</span> Modelo
              </div>
              <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                @{prediction.fairOdds.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-400 leading-tight truncate">
                Cuota Justa
              </div>
            </div>

            {/* Probabilidad */}
            <div className="rounded-xl bg-white p-2.5 border border-emerald-200 shadow-sm dark:bg-slate-900 dark:border-emerald-900/60">
              <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span>📊</span> Prob.
              </div>
              <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                {prediction.probability}%
              </div>
              <div className="text-[9px] text-slate-400 leading-tight truncate">
                Conf. {prediction.confidence || "Alta"}
              </div>
            </div>
          </div>
        </div>

        {/* AI Analysis Quote */}
        {prediction.explanation && (
          <div className="mt-3 rounded-2xl bg-slate-50/80 p-3 border border-slate-100 dark:bg-slate-950/60 dark:border-slate-800">
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed italic">
              &quot;{prediction.explanation}&quot;
            </p>
          </div>
        )}
      </div>

      {/* Action Footer: Visual Image Sharing Buttons & Detail Trigger */}
      <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Share as Image to WhatsApp */}
          <button
            onClick={handleShareWhatsAppImage}
            title="Compartir tarjeta gráfica en WhatsApp"
            className="flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-emerald-700 transition cursor-pointer shadow-sm"
          >
            <span>💬</span>
            <span>WhatsApp</span>
          </button>

          {/* Share as Image to Telegram */}
          <button
            onClick={handleShareTelegramImage}
            title="Compartir tarjeta gráfica en Telegram"
            className="flex items-center gap-1 rounded-xl bg-sky-600 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-sky-700 transition cursor-pointer shadow-sm"
          >
            <span>✈️</span>
            <span>Telegram</span>
          </button>

          {/* Copy Card Image Directly */}
          <button
            onClick={handleCopyImage}
            title="Copiar imagen de la tarjeta al portapapeles"
            className="flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-800 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            <span>📸</span>
            <span>{copySuccess ? "✓ ¡Copiada!" : copyingImage ? "..." : "Copiar"}</span>
          </button>

          {/* Download Image */}
          <button
            onClick={handleDownloadImage}
            title="Descargar imagen PNG de la tarjeta"
            className="flex items-center justify-center rounded-xl bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 transition cursor-pointer"
          >
            <span>📥</span>
          </button>
        </div>

        {/* View Details Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail?.(prediction);
          }}
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-black text-white hover:bg-emerald-600 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-400 transition cursor-pointer ml-auto"
        >
          Ver H2H →
        </button>
      </div>
    </div>
  );
}
