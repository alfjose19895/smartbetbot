"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import {
  copyCardImageToClipboard,
  downloadCardImage,
  shareCardAsImage,
} from "@/lib/sports/card-image-generator";

interface PredictionCardProps {
  prediction: MarketOpportunity;
  onOpenDetail?: (prediction: MarketOpportunity) => void;
  defaultExpanded?: boolean;
  onPublishAlert?: (prediction: MarketOpportunity) => void;
  isPublished?: boolean;
}

export function getMatchLiveStatusBadge(kickoffStr?: string): {
  label: string;
  cls: string;
} | null {
  if (!kickoffStr) return null;
  const matchDate = new Date(kickoffStr);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - matchDate.getTime()) / (1000 * 60));

  if (diffMinutes < -120) {
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

export function formatMatchKickoffTime(kickoff?: string): { time: string; date: string } {
  if (!kickoff) return { time: "--:--", date: "" };
  try {
    const dateObj = new Date(kickoff);
    if (isNaN(dateObj.getTime())) return { time: "--:--", date: "" };
    const time = dateObj.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const date = dateObj.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return { time, date };
  } catch {
    return { time: "--:--", date: "" };
  }
}

export function getDisplayMarketSelection(market: string, selection?: string): string {
  const normM = (market || "").toLowerCase().trim();
  if (normM.includes("ganador local") || normM.includes("gana local")) {
    return `${market} (1)`;
  }
  if (normM.includes("ganador visitante") || normM.includes("gana visitante")) {
    return `${market} (2)`;
  }
  if (normM.includes("empate") || normM.includes("draw")) {
    return `${market} (X)`;
  }
  if (normM.includes("over 0.5") || normM.includes("más de 0.5")) {
    return `${market} (Over 0.5)`;
  }
  if (normM.includes("over 1.5") || normM.includes("más de 1.5")) {
    return `${market} (Over 1.5)`;
  }
  if (normM.includes("over 2.5") || normM.includes("más de 2.5")) {
    return `${market} (Over 2.5)`;
  }
  if (normM.includes("ambos equipos") || normM.includes("btts")) {
    return `${market} (Sí)`;
  }
  if (selection && selection !== market && !market.includes(selection)) {
    return `${market} (${selection})`;
  }
  return market;
}

export function PredictionCard({
  prediction,
  onOpenDetail,
  defaultExpanded = false,
  onPublishAlert,
  isPublished = false,
}: PredictionCardProps) {
  const { language } = useLanguage();
  const [isMobileExpanded, setIsMobileExpanded] = useState(defaultExpanded);
  const [copyingImage, setCopyingImage] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const statusBadge = getMatchLiveStatusBadge(prediction.kickoff);
  const { time: formattedTime, date: formattedDateShort } = formatMatchKickoffTime(prediction.kickoff);

  const isWon =
    prediction.status === "won" ||
    (prediction as any).result === "WON" ||
    (prediction.status as string) === "WON";
  const isLost =
    prediction.status === "lost" ||
    (prediction as any).result === "LOST" ||
    (prediction.status as string) === "LOST";
  const isMcp = Boolean(
    prediction.isMcp ||
      prediction.isMcpPick ||
      prediction.source === "mcp" ||
      prediction.pickBadge === "mcp" ||
      (prediction.explanation && prediction.explanation.includes("MCP"))
  );

  const finalScoreText =
    prediction.actualScore ||
    prediction.currentScore ||
    (prediction as any).score ||
    "";

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

  const pVal = typeof prediction.probability === "number" ? prediction.probability : 50;
  const confidenceBadge =
    pVal >= 70.0
      ? {
          label: "⭐⭐⭐ Muy Alta",
          cls: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700 font-extrabold",
        }
      : pVal >= 58.0
      ? {
          label: "⭐⭐ Alta",
          cls: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700 font-bold",
        }
      : pVal >= 50.0
      ? {
          label: "⭐ Media",
          cls: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700 font-bold",
        }
      : {
          label: "⚠️ Moderada",
          cls: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-700 font-bold",
        };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE VIEW (< md): COMPACT STRIP BY DEFAULT WITH EXPAND TOGGLE        */}
      {/* ========================================================================= */}
      <div className="block md:hidden">
        {!isMobileExpanded ? (
          /* Mobile Compact Strip */
          <div
            onClick={() => onOpenDetail?.(prediction)}
            className={`group relative flex items-center justify-between gap-2 overflow-hidden rounded-2xl px-3.5 py-3 transition-all duration-200 cursor-pointer ${
              isWon
                ? "border-2 border-emerald-500 bg-emerald-50/40 shadow-sm dark:bg-emerald-950/30 dark:border-emerald-500/80"
                : isLost
                ? "border-2 border-rose-500 bg-rose-50/40 shadow-sm dark:bg-rose-950/30 dark:border-rose-500/80"
                : "border border-slate-200/90 bg-white shadow-xs hover:border-emerald-500/50 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90"
            }`}
          >
            {/* Left: League & Teams */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black shrink-0 ${
                  isWon
                    ? "bg-emerald-500 text-slate-950 shadow-sm"
                    : isLost
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {isWon ? "✓" : isLost ? "✗" : "🏆"}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                  <span className="truncate">
                    {prediction.homeTeam} <span className="text-slate-400 font-normal">vs</span> {prediction.awayTeam}
                  </span>
                  {finalScoreText && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-slate-900 text-white dark:bg-slate-800 text-[10px] font-black">
                      {finalScoreText}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-black text-[10px]">
                    ⏰ {formattedTime}
                  </span>
                  <span className="text-slate-400 font-normal">•</span>
                  <span className="truncate">
                    {prediction.league} {prediction.country ? `(${prediction.country})` : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Badges, Status & Expand Button */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isMcp && (
                <span className="rounded-lg px-1.5 py-0.5 text-[9px] font-black bg-purple-600 text-white shadow-sm border border-purple-400 flex items-center gap-0.5">
                  🤖 MCP
                </span>
              )}
              {prediction.pickBadge === "bomba" && (
                <span className="rounded-lg px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white animate-pulse">
                  💣
                </span>
              )}
              {prediction.pickBadge === "valor" && (
                <span className="rounded-lg px-1.5 py-0.5 text-[9px] font-black bg-emerald-500 text-slate-950 font-extrabold">
                  💎
                </span>
              )}
              {isWon ? (
                <span className="rounded-xl px-2.5 py-1 text-[10px] font-black bg-emerald-500 text-slate-950 shadow-sm border border-emerald-400 flex items-center gap-1">
                  <span>✓</span> Ganada
                </span>
              ) : isLost ? (
                <span className="rounded-xl px-2.5 py-1 text-[10px] font-black bg-rose-600 text-white shadow-sm border border-rose-400 flex items-center gap-1">
                  <span>✗</span> Perdida
                </span>
              ) : statusBadge ? (
                <span className={`inline-flex items-center rounded-xl px-2 py-0.5 text-[9px] font-black border ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
              ) : (
                <span className="rounded-xl bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white">
                  @{(prediction.odds ?? 1.5).toFixed(2)}
                </span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMobileExpanded(true);
                }}
                title="Ampliar tarjeta completa"
                className="flex items-center gap-1 rounded-xl bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <span>▼</span>
                <span>Ampliar</span>
              </button>
            </div>
          </div>
        ) : (
          /* Mobile Full Expanded View */
          <div
            onClick={() => onOpenDetail?.(prediction)}
            className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl p-4 shadow-md transition-all cursor-pointer ${
              isWon
                ? "border-2 border-emerald-500 bg-gradient-to-b from-emerald-50/50 to-white dark:from-emerald-950/40 dark:to-slate-900/95"
                : isLost
                ? "border-2 border-rose-500 bg-gradient-to-b from-rose-50/50 to-white dark:from-rose-950/40 dark:to-slate-900/95"
                : "border border-emerald-500/40 bg-white dark:border-emerald-500/30 dark:bg-slate-900/95"
            }`}
          >
            <div>
              {/* Header: League & Minimize Button */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800/80">
                <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  <span>🏆</span>
                  <span>{prediction.league}</span>
                  {prediction.country && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">• {prediction.country}</span>
                  )}
                </span>

                <div className="flex items-center gap-1.5">
                  {isWon ? (
                    <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-0.5 text-[10px] font-black bg-emerald-500 text-slate-950 shadow-sm border border-emerald-400">
                      ✓ Ganada
                    </span>
                  ) : isLost ? (
                    <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-0.5 text-[10px] font-black bg-rose-600 text-white shadow-sm border border-rose-400">
                      ✗ Perdida
                    </span>
                  ) : statusBadge ? (
                    <span className={`inline-flex items-center rounded-xl px-2 py-0.5 text-[9px] font-black border ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                  ) : null}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMobileExpanded(false);
                    }}
                    title="Minimizar tarjeta"
                    className="flex items-center gap-1 rounded-xl bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    <span>▲</span>
                    <span>Minimizar</span>
                  </button>
                </div>
              </div>

              {/* Time & Badges */}
              <div className="mt-2.5 flex items-center justify-between flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                  ⏰ {formattedTime} {formattedDateShort ? `(${formattedDateShort})` : ""}
                </span>
                <div className="flex items-center gap-1">
                  {isMcp && (
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                      🤖 MCP
                    </span>
                  )}
                  {prediction.pickBadge === "bomba" && (
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-black bg-rose-500 text-white">
                      💣 BOMBA
                    </span>
                  )}
                  {prediction.pickBadge === "valor" && (
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-black bg-emerald-500 text-slate-950 font-black">
                      💎 VALOR
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[9px] border ${confidenceBadge.cls}`}>
                    {confidenceBadge.label}
                  </span>
                </div>
              </div>

              {/* Teams & Score Box */}
              <div className="mt-3 rounded-xl bg-slate-50 p-3 border border-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80">
                {finalScoreText && (
                  <div
                    className={`mb-2 flex items-center justify-center gap-2 rounded-lg py-1 px-2 text-xs font-black border ${
                      isWon
                        ? "bg-emerald-500/20 text-emerald-800 border-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : isLost
                        ? "bg-rose-500/20 text-rose-800 border-rose-400 dark:bg-rose-950/60 dark:text-rose-300"
                        : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <span>⚽ Marcador Final:</span>
                    <span className="text-sm tracking-widest">{finalScoreText}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 text-center font-black text-slate-900 dark:text-white text-xs">
                    {prediction.homeTeam}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-[10px] font-black text-slate-600 dark:text-slate-300">
                    VS
                  </span>
                  <div className="flex-1 text-center font-black text-slate-900 dark:text-white text-xs">
                    {prediction.awayTeam}
                  </div>
                </div>
              </div>

              {/* Pick Market Details */}
              <div
                className={`mt-3 rounded-xl p-3 border space-y-2 ${
                  isWon
                    ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-500/50 dark:bg-emerald-950/30"
                    : isLost
                    ? "border-rose-400 bg-rose-50/70 dark:border-rose-500/50 dark:bg-rose-950/30"
                    : "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/20"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-black">
                  <span className={isWon ? "text-emerald-800 dark:text-emerald-400 font-extrabold" : isLost ? "text-rose-800 dark:text-rose-400 font-extrabold" : "text-emerald-800 dark:text-emerald-400"}>
                    {isWon ? "✓ PRONÓSTICO ACERTADO (GANADA)" : isLost ? "✗ PRONÓSTICO NO ACERTADO (PERDIDA)" : "🎯 PRONÓSTICO SMARTBETBOT"}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-300">
                    +{prediction.edge}% EV
                  </span>
                </div>
                <div className="text-sm font-black text-slate-900 dark:text-white">
                  {getDisplayMarketSelection(prediction.market, prediction.selection)}
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center pt-1">
                  <div className="rounded-lg bg-white p-1.5 border border-sky-200 dark:bg-slate-900 dark:border-sky-900/50">
                    <div className="text-[9px] font-bold text-sky-600 dark:text-sky-400">Cuota Casa</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">@{(prediction.odds ?? 1.5).toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-white p-1.5 border border-indigo-200 dark:bg-slate-900 dark:border-indigo-900/50">
                    <div className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400">Cuota Justa</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">@{(prediction.fairOdds ?? prediction.odds ?? 1.5).toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-white p-1.5 border border-emerald-200 dark:bg-slate-900 dark:border-emerald-900/50">
                    <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Probabilidad</div>
                    <div className="text-xs font-black text-emerald-700 dark:text-emerald-400">{prediction.probability}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-3.5 border-t border-slate-100 pt-2.5 dark:border-slate-800/80 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  onClick={handleShareWhatsAppImage}
                  title="WhatsApp"
                  className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white cursor-pointer"
                >
                  💬 WA
                </button>
                <button
                  onClick={handleShareTelegramImage}
                  title="Telegram"
                  className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-black text-white cursor-pointer"
                >
                  ✈️ TG
                </button>
                <button
                  onClick={handleCopyImage}
                  title="Copiar"
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  {copySuccess ? "✓ Copiada" : "📸 Copiar"}
                </button>

                {onPublishAlert && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPublishAlert(prediction);
                    }}
                    disabled={isPublished}
                    className={`rounded-lg px-2 py-1 text-[10px] font-black transition cursor-pointer ${
                      isPublished
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-emerald-500 text-slate-950 font-black"
                    }`}
                  >
                    {isPublished ? "✓ En App" : "📥 Publicar"}
                  </button>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail?.(prediction);
                }}
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white hover:bg-emerald-600 dark:bg-white dark:text-slate-950 cursor-pointer ml-auto"
              >
                Ver H2H →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. WEB / DESKTOP VIEW (>= md): FULL RICH CARD IN RESPONSIVE GRID          */}
      {/* ========================================================================= */}
      <div
        onClick={() => onOpenDetail?.(prediction)}
        className={`hidden md:flex flex-col justify-between overflow-hidden rounded-3xl p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer ${
          isWon
            ? "border-2 border-emerald-500 shadow-md shadow-emerald-500/15 bg-gradient-to-b from-emerald-50/50 via-white to-white dark:from-emerald-950/30 dark:via-slate-900/90 dark:to-slate-900/90"
            : isLost
            ? "border-2 border-rose-500 shadow-md shadow-rose-500/15 bg-gradient-to-b from-rose-50/50 via-white to-white dark:from-rose-950/30 dark:via-slate-900/90 dark:to-slate-900/90"
            : "border border-slate-200/90 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/90"
        }`}
      >
        <div>
          {/* Top Bar: League, Country, Match Time, Status Badge */}
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
              {/* Kickoff Time Badge */}
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300 shadow-xs">
                <span>⏰</span>
                <span>{formattedTime}</span>
              </span>

              {isWon ? (
                <span className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 border border-emerald-400">
                  ✓ Ganada
                </span>
              ) : isLost ? (
                <span className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-black bg-rose-600 text-white shadow-md shadow-rose-600/30 border border-rose-400">
                  ✗ Perdida
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
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                <span>⏰</span>
                <span>Hora del Partido: {formattedTime}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                🕒 PRE-MATCH
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {isMcp && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-purple-600 to-indigo-600 text-white border border-purple-400 shadow-sm">
                  🤖 Agente MCP
                </span>
              )}

              {prediction.pickBadge === "bomba" && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-rose-500 text-white shadow-sm shadow-rose-500/20 animate-pulse">
                  💣 BOMBA
                </span>
              )}

              {prediction.pickBadge === "valor" && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-emerald-500 text-slate-950 font-extrabold shadow-sm shadow-emerald-500/20">
                  💎 VALOR
                </span>
              )}

              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] border ${confidenceBadge.cls}`}>
                {confidenceBadge.label}
              </span>
            </div>
          </div>

          {/* Teams Container with Final Score Banner */}
          <div
            className={`mt-3 rounded-2xl p-3.5 border ${
              isWon
                ? "bg-emerald-50/40 border-emerald-200 dark:bg-slate-950/90 dark:border-emerald-900/50"
                : isLost
                ? "bg-rose-50/40 border-rose-200 dark:bg-slate-950/90 dark:border-rose-900/50"
                : "bg-slate-50 border-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80"
            }`}
          >
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
                <span>🕒 Hora de Inicio:</span>
                <span className="font-black text-emerald-700 dark:text-emerald-400 text-xs">⏰ {formattedTime}</span>
              </div>
              {formattedDateShort && (
                <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 capitalize">
                  {formattedDateShort}
                </span>
              )}
            </div>

            {/* Prominent Score Banner for Finished Matches */}
            {finalScoreText && (
              <div
                className={`mb-3 flex items-center justify-center gap-2.5 rounded-xl py-1.5 px-3 border shadow-xs ${
                  isWon
                    ? "bg-emerald-500/15 border-emerald-400 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200"
                    : isLost
                    ? "bg-rose-500/15 border-rose-400 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200"
                    : "bg-slate-200 border-slate-300 text-slate-900 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                <span className="text-xs font-bold">⚽ Marcador Final:</span>
                <span className="text-base font-black tracking-wider">{finalScoreText}</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    isWon ? "bg-emerald-500 text-slate-950" : isLost ? "bg-rose-600 text-white" : "bg-slate-700 text-white"
                  }`}
                >
                  {isWon ? "Acertada" : isLost ? "No Acertada" : "Final"}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-black text-slate-900 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800 shrink-0">
                  {prediction.homeTeam.substring(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {prediction.homeTeam}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">Local</div>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-center">
                <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  VS
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0 text-right">
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {prediction.awayTeam}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">Visitante</div>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-black text-slate-900 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800 shrink-0">
                  {prediction.awayTeam.substring(0, 2).toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Main Pick Highlight Box with Side-by-Side Odds and Model Odds */}
          <div
            className={`mt-4 rounded-2xl p-3.5 space-y-3 border ${
              isWon
                ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-500/50 dark:bg-emerald-950/25"
                : isLost
                ? "border-rose-400 bg-rose-50/70 dark:border-rose-500/50 dark:bg-rose-950/25"
                : "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/20"
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className={`text-[10px] font-black uppercase tracking-wider ${
                isWon ? "text-emerald-800 dark:text-emerald-400" : isLost ? "text-rose-800 dark:text-rose-400" : "text-emerald-800 dark:text-emerald-400"
              }`}>
                {isWon ? "✓ PRONÓSTICO ACERTADO (GANADA)" : isLost ? "✗ PRONÓSTICO NO ACERTADO (PERDIDA)" : "🎯 PRONÓSTICO SMARTBETBOT"}
              </div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Valor / Ventaja: <strong className="text-emerald-700 dark:text-emerald-300">+{prediction.edge}%</strong>
              </div>
            </div>

            <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              {getDisplayMarketSelection(prediction.market, prediction.selection)}
            </div>

            {/* Side-by-Side Odds Comparison Cards with Descriptions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {/* Casa de Apuestas */}
              <div className="rounded-xl bg-white p-2.5 border border-sky-200 shadow-sm dark:bg-slate-900 dark:border-sky-900/60">
                <div className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                  <span>🏢</span> Cuota Casa
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  @{(prediction.odds ?? 1.5).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Precio casa apuestas
                </div>
              </div>

              {/* Cuota Modelo SmartBetBot */}
              <div className="rounded-xl bg-white p-2.5 border border-indigo-200 shadow-sm dark:bg-slate-900 dark:border-indigo-900/60">
                <div className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <span>🤖</span> Cuota Modelo
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  @{(prediction.fairOdds ?? prediction.odds ?? 1.5).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Cuota justa SmartBetBot
                </div>
              </div>

              {/* Probabilidad Estimada */}
              <div className="rounded-xl bg-white p-2.5 border border-emerald-200 shadow-sm dark:bg-slate-900 dark:border-emerald-900/60">
                <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span>📈</span> Probabilidad
                </div>
                <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {prediction.probability}%
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Confianza {prediction.confidence || "Muy Alta"}
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

        {/* Action Footer: Visual Image Sharing Buttons */}
        <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleShareWhatsAppImage}
              title="Compartir tarjeta gráfica en WhatsApp"
              className="flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-emerald-700 transition cursor-pointer shadow-sm"
            >
              <span>💬</span>
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handleShareTelegramImage}
              title="Compartir tarjeta gráfica en Telegram"
              className="flex items-center gap-1 rounded-xl bg-sky-600 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-sky-700 transition cursor-pointer shadow-sm"
            >
              <span>✈️</span>
              <span>Telegram</span>
            </button>

            <button
              onClick={handleCopyImage}
              title="Copiar imagen de la tarjeta al portapapeles (para pegar con Ctrl+V)"
              className="flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-800 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 transition cursor-pointer"
            >
              <span>📸</span>
              <span>{copySuccess ? "✓ ¡Copiada!" : copyingImage ? "Generando..." : "Copiar Imagen"}</span>
            </button>

            <button
              onClick={handleDownloadImage}
              title="Descargar imagen PNG de la tarjeta"
              className="flex items-center justify-center rounded-xl bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 transition cursor-pointer"
            >
              <span>📥</span>
            </button>

            {onPublishAlert && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPublishAlert(prediction);
                }}
                disabled={isPublished}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black transition cursor-pointer shadow-sm ${
                  isPublished
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                    : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:brightness-110 shadow-emerald-600/30"
                }`}
              >
                <span>{isPublished ? "✓" : "📥"}</span>
                <span>{isPublished ? "En App" : "Publicar"}</span>
              </button>
            )}
          </div>

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
    </>
  );
}
