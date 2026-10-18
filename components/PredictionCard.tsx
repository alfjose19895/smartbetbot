"use client";

import React, { useState, useEffect } from "react";
import {
  MarketOpportunity,
  isElitePick,
  isDestacadoPick,
  getDestacadoRuleMatch,
} from "@/lib/sports/prediction-engine";
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
  if (normM.includes("puck line") || normM.includes("spread") || normM.includes("handicap")) {
    return selection ? `${market}: ${selection}` : market;
  }
  if (normM.includes("total goals") || normM.includes("totales")) {
    return selection ? `${market}: ${selection}` : market;
  }
  if (normM.includes("moneyline")) {
    return selection ? `${market}: ${selection}` : market;
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
  if (normM.includes("córner") || normM.includes("corner")) {
    if (selection) {
      if (selection.toLowerCase().includes("corner") || selection.toLowerCase().includes("córner")) {
        return selection;
      }
      return `${selection} Córners`;
    }
    return market;
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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copyingImage, setCopyingImage] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  // Detect exact sport context
  const rawSport = (
    (prediction as any).sport ||
    (prediction.country === "NHL"
      ? "nhl"
      : prediction.country === "NBA"
      ? "nba"
      : prediction.country === "NFL" || prediction.country === "NCAAF"
      ? "nfl"
      : "football")
  ).toLowerCase();
  const isNHL = rawSport === "nhl" || (Boolean(prediction.league) && prediction.league.toUpperCase().includes("NHL"));
  const isNBA = rawSport === "nba" || (Boolean(prediction.league) && prediction.league.toUpperCase().includes("NBA"));
  const isNFL =
    rawSport === "nfl" ||
    rawSport === "ncaaf" ||
    (Boolean(prediction.league) &&
      (prediction.league.toUpperCase().includes("NFL") || prediction.league.toUpperCase().includes("NCAA")));
  const isFootball = !isNHL && !isNBA && !isNFL;

  const sportIcon = isNHL ? "🏒" : isNBA ? "🏀" : isNFL ? "🏈" : "⚽";
  const sportTitle = isNHL ? "NHL" : isNBA ? "NBA" : isNFL ? "NFL" : "Fútbol";

  const statusBadge = getMatchLiveStatusBadge(prediction.kickoff);
  const { time: formattedTime, date: formattedDateShort } = formatMatchKickoffTime(prediction.kickoff);

  const isWon = Boolean(
    prediction.status === "won" ||
      (prediction as any).result === "WON" ||
      (prediction.status as string) === "WON"
  );
  const isLost = Boolean(
    prediction.status === "lost" ||
      (prediction as any).result === "LOST" ||
      (prediction.status as string) === "LOST"
  );
  const isPending = !isWon && !isLost;

  const isMcp = Boolean(
    prediction.isMcp ||
      prediction.isMcpPick ||
      prediction.source === "mcp" ||
      prediction.pickBadge === "mcp" ||
      (prediction.explanation && prediction.explanation.includes("MCP"))
  );

  const isElite = Boolean(
    (prediction as any).isElite ||
      prediction.pickBadge === "elite" ||
      isElitePick(prediction)
  );

  const isCornersVip = Boolean(
    prediction.isCornersVip ||
      prediction.source === "corners_vip" ||
      prediction.pickBadge === "corners_vip" ||
      prediction.vipBadge === "Corners VIP"
  );

  const isCardsVip = Boolean(
    prediction.isCardsVip ||
      prediction.source === "cards_vip" ||
      prediction.pickBadge === "cards_vip" ||
      prediction.vipBadge === "Tarjetas VIP"
  );

  const isShotsVip = Boolean(
    prediction.isShotsVip ||
      prediction.source === "shots_vip" ||
      prediction.pickBadge === "shots_vip" ||
      prediction.vipBadge === "Disparos VIP"
  );

  const isWeekendVip = Boolean(
    (prediction as any).isWeekendVip ||
      (prediction as any).source === "weekend" ||
      (prediction as any).pickBadge === "weekend" ||
      prediction.vipBadge === "Finde VIP" ||
      prediction.vipBadge === "Weekend Exclusive"
  );

  const destacadoMatch = getDestacadoRuleMatch(prediction);
  const isDestacado = Boolean(
    prediction.isDestacado ||
      destacadoMatch !== null ||
      isDestacadoPick(prediction)
  );
  const destacadoRule = prediction.destacadoRule || destacadoMatch?.marketDescription;

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

  // Corner statistics exclusively for Football
  const isCornerMarket =
    isFootball &&
    (prediction.market === "Córners" ||
      (Boolean(prediction.market) &&
        (prediction.market.toLowerCase().includes("córner") ||
          prediction.market.toLowerCase().includes("corner"))));

  const homeCornersHistory = isFootball
    ? (prediction.homeLast5 || [])
        .map((m) => m.totalCorners)
        .filter((c): c is number => typeof c === "number")
    : [];
  const awayCornersHistory = isFootball
    ? (prediction.awayLast5 || [])
        .map((m) => m.totalCorners)
        .filter((c): c is number => typeof c === "number")
    : [];

  const recentCornerPills: number[] = isFootball
    ? homeCornersHistory.length > 0
      ? homeCornersHistory
      : (prediction as any).homeCornerStats?.history && (prediction as any).homeCornerStats.history.length > 0
      ? (prediction as any).homeCornerStats.history
      : awayCornersHistory.length > 0
      ? awayCornersHistory
      : (prediction as any).awayCornerStats?.history && (prediction as any).awayCornerStats.history.length > 0
      ? (prediction as any).awayCornerStats.history
      : []
    : [];

  const avgCornerNum = isFootball
    ? recentCornerPills.length > 0
      ? (recentCornerPills.reduce((a, b) => a + b, 0) / recentCornerPills.length).toFixed(1)
      : (prediction as any).homeCornerStats?.avgTotal
      ? ((prediction as any).homeCornerStats.avgTotal).toFixed(1)
      : (prediction as any).awayCornerStats?.avgTotal
      ? ((prediction as any).awayCornerStats.avgTotal).toFixed(1)
      : prediction.cornerAnalysis?.expectedTotalCorners
      ? prediction.cornerAnalysis.expectedTotalCorners.toFixed(1)
      : null
    : null;

  const showCornerHistory =
    isFootball && (isCornerMarket || recentCornerPills.length > 0 || Boolean(prediction.cornerAnalysis));

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
      {!isExpanded ? (
        /* ========================================================================= */
        /* COMPACT / MINIMIZED VIEW (SLEEK STRIP WITH EXPAND BUTTON)                  */
        /* ========================================================================= */
        <div
          onClick={() => onOpenDetail?.(prediction)}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl md:rounded-3xl p-3.5 sm:p-4 shadow-xs transition-all duration-200 hover:shadow-lg cursor-pointer ${
            isWon
              ? "border-2 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 dark:border-emerald-500/80"
              : isLost
              ? "border-2 border-rose-500 bg-rose-50/40 dark:bg-rose-950/30 dark:border-rose-500/80"
              : "border border-slate-200/90 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/90"
          }`}
        >
          <div>
            {/* Header: League & Status / Kickoff + Toggle Button (Zero Overflow) */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800/80 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200 min-w-0 max-w-full"
                  title={`${prediction.league}${prediction.country ? ` (${prediction.country})` : ""}`}
                >
                  <span className="shrink-0">🏆</span>
                  <span className="truncate">{prediction.league}</span>
                  {prediction.country && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold shrink-0 truncate max-w-[80px]">
                      • {prediction.country}
                    </span>
                  )}
                  {prediction.leagueTier && (
                    <span
                      className={`ml-1 inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-black shrink-0 ${
                        prediction.leagueTier === 1
                          ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                          : prediction.leagueTier === 2
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                          : prediction.leagueTier === 3
                          ? "bg-slate-700/40 text-slate-400 border border-slate-600/40"
                          : "bg-slate-800 text-slate-500 border border-slate-700/30"
                      }`}
                      title={`Liga Tier ${prediction.leagueTier}`}
                    >
                      T{prediction.leagueTier}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                  ⏰ {formattedTime}
                </span>

                {isWon ? (
                  <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-0.5 text-[10px] font-black bg-emerald-500 text-slate-950 shadow-xs border border-emerald-400 shrink-0">
                    ✓ Ganada {finalScoreText ? `(${finalScoreText})` : ""}
                  </span>
                ) : isLost ? (
                  <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-0.5 text-[10px] font-black bg-rose-600 text-white shadow-xs border border-rose-400 shrink-0">
                    ✗ Perdida {finalScoreText ? `(${finalScoreText})` : ""}
                  </span>
                ) : statusBadge ? (
                  <span className={`inline-flex items-center rounded-xl px-2 py-0.5 text-[9px] font-black border shrink-0 ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                ) : null}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(true);
                  }}
                  title="Ampliar tarjeta completa"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  <span>▼</span>
                  <span>Ampliar</span>
                </button>
              </div>
            </div>

            {/* Sub Bar: Date & Clean Badge Row */}
            <div className="mt-2 flex items-center justify-between flex-wrap gap-1.5 min-w-0">
              {formattedDateShort && (
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  📅 {formattedDateShort}
                </span>
              )}

              <div className="flex items-center flex-wrap gap-1 ml-auto">
                {isCornersVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-xs shrink-0 border border-amber-300">
                    <span>🚩</span>
                    <span>CORNERS VIP</span>
                  </span>
                )}
                {isCardsVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 shadow-xs shrink-0 border border-yellow-300">
                    <span>🟨</span>
                    <span>TARJETAS VIP</span>
                  </span>
                )}
                {isShotsVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-xs shrink-0 border border-cyan-300">
                    <span>🎯</span>
                    <span>DISPAROS VIP</span>
                  </span>
                )}
                {isWeekendVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xs shrink-0 border border-indigo-400">
                    <span>💎</span>
                    <span>FINDE VIP</span>
                  </span>
                )}
                {isDestacado && (
                  <span
                    title={destacadoRule ? `Destacado: ${destacadoRule}` : "Pronóstico Destacado 5★"}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-xs shrink-0"
                  >
                    <span className="tracking-tighter">⭐⭐⭐⭐⭐</span>
                    <span>DESTACADO</span>
                  </span>
                )}
                {isElite && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shrink-0">
                    <span>👑</span>
                    <span>ÉLITE 80%+</span>
                  </span>
                )}
                {isMcp && (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black bg-purple-600 text-white shrink-0">
                    <span>🤖</span>
                    <span>MCP</span>
                  </span>
                )}
                {prediction.pickBadge === "valor" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black bg-emerald-500 text-slate-950 shrink-0">
                    <span>💎</span>
                    <span>VALOR</span>
                  </span>
                )}
                {prediction.pickBadge === "bomba" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white shrink-0">
                    <span>💣</span>
                    <span>BOMBA</span>
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] border shrink-0 ${confidenceBadge.cls}`}>
                  {confidenceBadge.label}
                </span>
              </div>
            </div>

            {/* Match Teams & Score */}
            <div className="mt-2.5 flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200 shrink-0">
                  {sportIcon}
                </span>
                <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                  <span>{prediction.homeTeam}</span>
                  <span className="text-slate-400 font-normal mx-1">vs</span>
                  <span>{prediction.awayTeam}</span>
                </div>
              </div>
              {finalScoreText && (
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-900 text-white dark:bg-slate-800 text-[11px] font-black">
                  {finalScoreText}
                </span>
              )}
            </div>

            {/* Market Selection & Odds Banner */}
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-950/70 p-2.5 border border-slate-100 dark:border-slate-800/80">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                  {prediction.market}
                </div>
                <div className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400 truncate">
                  {getDisplayMarketSelection(prediction.market, prediction.selection)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-xl bg-sky-600 px-2.5 py-1 text-xs font-black text-white shadow-xs">
                  @{(prediction.odds ?? 1.5).toFixed(2)}
                </span>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {pVal}% prob.
                </span>
              </div>
            </div>
          </div>

          {/* Compact Action Footer */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleShareWhatsAppImage}
                title="Compartir en WhatsApp"
                className="flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-emerald-700 transition cursor-pointer"
              >
                <span>💬</span>
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button
                onClick={handleCopyImage}
                title="Copiar imagen"
                className="flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 transition cursor-pointer"
              >
                <span>📸</span>
                <span className="hidden sm:inline">{copySuccess ? "✓ Copiada" : "Imagen"}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail?.(prediction);
                }}
                className="rounded-xl bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <span>H2H →</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="flex items-center gap-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-[10px] font-black hover:bg-emerald-500/20 transition cursor-pointer"
              >
                <span>Detalles ▼</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* FULL DETAILED / EXPANDED VIEW (ALL METRICS & CONTROLS WITH MINIMIZE)       */
        /* ========================================================================= */
        <div
          onClick={() => onOpenDetail?.(prediction)}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl md:rounded-3xl p-4 sm:p-5 shadow-md transition-all duration-300 hover:shadow-xl cursor-pointer ${
            isWon
              ? "border-2 border-emerald-500 shadow-md shadow-emerald-500/15 bg-gradient-to-b from-emerald-50/50 via-white to-white dark:from-emerald-950/30 dark:via-slate-900/90 dark:to-slate-900/90"
              : isLost
              ? "border-2 border-rose-500 shadow-md shadow-rose-500/15 bg-gradient-to-b from-rose-50/50 via-white to-white dark:from-rose-950/30 dark:via-slate-900/90 dark:to-slate-900/90"
              : "border border-slate-200/90 bg-white hover:border-emerald-500/50 dark:border-slate-800/80 dark:bg-slate-900/90"
          }`}
        >
          <div>
            {/* Top Bar: League, Country, Match Time, Status Badge & Minimize Button */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800/80 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200 min-w-0 max-w-full"
                  title={`${prediction.league}${prediction.country ? ` (${prediction.country})` : ""}`}
                >
                  <span className="shrink-0">🏆</span>
                  <span className="truncate">{prediction.league}</span>
                  {prediction.country && (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold shrink-0 truncate max-w-[90px]">
                      • {prediction.country}
                    </span>
                  )}
                  {prediction.leagueTier && (
                    <span
                      className={`ml-1 inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-black shrink-0 ${
                        prediction.leagueTier === 1
                          ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                          : prediction.leagueTier === 2
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                          : prediction.leagueTier === 3
                          ? "bg-slate-700/40 text-slate-400 border border-slate-600/40"
                          : "bg-slate-800 text-slate-500 border border-slate-700/30"
                      }`}
                      title={`Liga Tier ${prediction.leagueTier}`}
                    >
                      T{prediction.leagueTier}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300 shadow-xs">
                  ⏰ {formattedTime}
                </span>

                {isWon ? (
                  <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 border border-emerald-400 shrink-0">
                    ✓ GANADA {finalScoreText ? `(${finalScoreText})` : ""}
                  </span>
                ) : isLost ? (
                  <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black bg-rose-600 text-white shadow-md shadow-rose-600/30 border border-rose-400 shrink-0">
                    ✗ PERDIDA {finalScoreText ? `(${finalScoreText})` : ""}
                  </span>
                ) : statusBadge ? (
                  <span className={`inline-flex items-center rounded-xl px-2.5 py-1 text-[10px] font-black border shrink-0 ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                ) : null}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                  title="Minimizar tarjeta"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  <span>▲</span>
                  <span className="hidden sm:inline">Minimizar</span>
                </button>
              </div>
            </div>

            {/* Sub Bar: Match Date & Intelligence Badges (Never Overflows) */}
            <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2 min-w-0">
              <div className="flex items-center gap-2">
                {formattedDateShort && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300 capitalize">
                    <span>📅</span>
                    <span>{formattedDateShort}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                {isCornersVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black border border-amber-300 shadow-md shadow-amber-500/30 shrink-0">
                    <span>🚩</span>
                    <span>CORNERS VIP</span>
                  </span>
                )}
                {isCardsVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 font-black border border-yellow-300 shadow-md shadow-yellow-500/30 shrink-0">
                    <span>🟨</span>
                    <span>TARJETAS VIP</span>
                  </span>
                )}
                {isShotsVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-black border border-cyan-300 shadow-md shadow-cyan-500/30 shrink-0">
                    <span>🎯</span>
                    <span>DISPAROS VIP</span>
                  </span>
                )}
                {isWeekendVip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black border border-indigo-400 shadow-md shadow-indigo-500/30 shrink-0">
                    <span>💎</span>
                    <span>FINDE VIP</span>
                  </span>
                )}
                {isDestacado && (
                  <span
                    title={destacadoRule ? `Cumple: ${destacadoRule}` : "Pronóstico Destacado 5 Estrellas"}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-xs shrink-0"
                  >
                    <span className="tracking-tighter">⭐⭐⭐⭐⭐</span>
                    <span>DESTACADO</span>
                  </span>
                )}
                {isElite && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-slate-950 font-black border border-amber-300 shadow-md shadow-amber-500/30 shrink-0">
                    <span>👑</span>
                    <span>ÉLITE 80%+</span>
                  </span>
                )}
                {isMcp && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-gradient-to-r from-purple-600 to-indigo-600 text-white border border-purple-400 shadow-sm shrink-0">
                    🤖 Agente MCP
                  </span>
                )}
                {prediction.pickBadge === "valor" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-emerald-500 text-slate-950 font-extrabold shadow-sm shadow-emerald-500/20 shrink-0">
                    💎 VALOR
                  </span>
                )}
                {prediction.pickBadge === "bomba" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-rose-500 text-white font-extrabold shadow-sm shadow-rose-500/20 shrink-0">
                    💣 BOMBA
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] border shrink-0 ${confidenceBadge.cls}`}>
                  {confidenceBadge.label}
                </span>
              </div>
            </div>

            {/* Teams Container with Prominent Score Banner */}
            <div
              className={`mt-3 rounded-2xl p-3.5 border ${
                isWon
                  ? "bg-emerald-50/40 border-emerald-200 dark:bg-slate-950/90 dark:border-emerald-900/50"
                  : isLost
                  ? "bg-rose-50/40 border-rose-200 dark:bg-slate-950/90 dark:border-rose-900/50"
                  : "bg-slate-50 border-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80"
              }`}
            >
              {/* Prominent Score Banner for Finished or Live Matches */}
              {isWon ? (
                <div className="mb-3 flex items-center justify-center gap-2.5 rounded-xl py-2 px-3 border shadow-sm bg-emerald-500/15 border-emerald-400 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200">
                  <span className="text-xs font-bold">{sportIcon} Marcador Final:</span>
                  <span className="text-base font-black tracking-wider">{finalScoreText}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-500 text-slate-950 shadow-xs">
                    ✓ Ganada
                  </span>
                </div>
              ) : isLost ? (
                <div className="mb-3 flex items-center justify-center gap-2.5 rounded-xl py-2 px-3 border shadow-sm bg-rose-500/15 border-rose-400 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200">
                  <span className="text-xs font-bold">{sportIcon} Marcador Final:</span>
                  <span className="text-base font-black tracking-wider">{finalScoreText}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-600 text-white shadow-xs">
                    ✗ Perdida
                  </span>
                </div>
              ) : prediction.matchTiming === "live" || Boolean(prediction.currentScore) ? (
                <div className="mb-3 flex items-center justify-center gap-2.5 rounded-xl py-2 px-3 border shadow-sm bg-red-500/15 border-red-400 text-red-900 dark:bg-red-950/80 dark:text-red-200 animate-pulse">
                  <span className="text-xs font-bold">🔴 {sportIcon} En Vivo:</span>
                  <span className="text-base font-black tracking-wider">{prediction.currentScore || "0 - 0"}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-red-600 text-white shadow-xs">
                    En Juego {prediction.liveMinute ? `(${prediction.liveMinute}')` : ""}
                  </span>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-black text-slate-900 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800 shrink-0">
                    {prediction.homeTeam.substring(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {prediction.homeTeam}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                      Local {prediction.homeElo ? `• Elo: ${prediction.homeElo}` : ""}
                    </div>
                  </div>
                </div>

                <span className="rounded-xl bg-slate-200/80 px-2.5 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0">
                  VS
                </span>

                <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0 text-right">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {prediction.awayTeam}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                      Visitante {prediction.awayElo ? `• Elo: ${prediction.awayElo}` : ""}
                    </div>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-black text-slate-900 shadow-xs border border-slate-200 dark:bg-slate-900 dark:text-white dark:border-slate-800 shrink-0">
                    {prediction.awayTeam.substring(0, 2).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Recommendation Banner */}
            <div
              className={`mt-3.5 rounded-2xl p-4 border relative overflow-hidden ${
                isWon
                  ? "bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30"
                  : isLost
                  ? "bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/30"
                  : "bg-gradient-to-r from-emerald-500/10 via-slate-50 to-transparent border-emerald-500/20 dark:from-emerald-950/30 dark:via-slate-950/40 dark:border-emerald-500/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Pronóstico Cuantitativo Recomendado
                </span>
                <span className="rounded-lg bg-sky-600 px-2 py-0.5 text-xs font-black text-white shadow-xs">
                  Cuota @{(prediction.odds ?? 1.5).toFixed(2)}
                </span>
              </div>

              <div className="mt-1 flex items-baseline justify-between gap-2">
                <div className="text-base sm:text-lg font-black text-emerald-800 dark:text-emerald-300">
                  {getDisplayMarketSelection(prediction.market, prediction.selection)}
                </div>
              </div>

              {/* Probability & EV Bar */}
              <div className="mt-3">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-600 dark:text-slate-300">
                    Probabilidad IA: <strong className="text-slate-900 dark:text-white">{pVal}%</strong>
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                    Ventaja: +{prediction.edge || 5}% EV
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      pVal >= 70
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : pVal >= 58
                        ? "bg-gradient-to-r from-cyan-500 to-blue-500"
                        : "bg-gradient-to-r from-amber-500 to-yellow-400"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(10, pVal))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* FOOTBALL CORNER HISTORICAL SNIPPET */}
            {showCornerHistory && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 border border-slate-100 dark:bg-slate-950/70 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-800 dark:text-slate-200 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span>🚩</span>
                    <span>Córners Recientes & Proyección</span>
                  </span>
                  {avgCornerNum && (
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                      Promedio: ~{avgCornerNum}
                    </span>
                  )}
                </div>

                {recentCornerPills.length > 0 ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    {recentCornerPills.slice(0, 5).map((c, i) => (
                      <span
                        key={i}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                          c > 8.5
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/60"
                            : "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        🚩 {c}
                      </span>
                    ))}
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 ml-auto">
                      {recentCornerPills.filter((c) => c > 8.5).length}/{recentCornerPills.length} Over 8.5
                    </span>
                  </div>
                ) : prediction.cornerAnalysis ? (
                  <div className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                    Proyección Monte Carlo: ~{prediction.cornerAnalysis.expectedTotalCorners.toFixed(1)} córners esperados (Local: ~{prediction.cornerAnalysis.expectedHomeCorners.toFixed(1)} | Visita: ~{prediction.cornerAnalysis.expectedAwayCorners.toFixed(1)})
                  </div>
                ) : null}
              </div>
            )}

            {/* NHL SPECIFIC STATISTICS SNIPPET */}
            {isNHL && (
              <div className="mt-3 rounded-2xl bg-cyan-500/10 p-3 border border-cyan-500/25 dark:bg-cyan-950/30 dark:border-cyan-500/30">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-800 dark:text-slate-200 mb-1">
                  <span className="flex items-center gap-1.5 text-cyan-800 dark:text-cyan-400">
                    <span>🏒</span>
                    <span>Dinámica de Goles & H2H NHL</span>
                  </span>
                  <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-black text-cyan-700 dark:text-cyan-300">
                    {prediction.market}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                  Tendencia xG conjunta y cobertura de hándicap asiático (-1.5 / +1.5) evaluados mediante modelo Poisson NHL.
                </div>
              </div>
            )}

            {/* NBA / NFL SPECIFIC STATISTICS SNIPPET */}
            {(isNBA || isNFL) && (
              <div className="mt-3 rounded-2xl bg-amber-500/10 p-3 border border-amber-500/25 dark:bg-amber-950/30 dark:border-amber-500/30">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-800 dark:text-slate-200 mb-1">
                  <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400">
                    <span>{sportIcon}</span>
                    <span>Dinámica de Puntos & Ritmo ({sportTitle})</span>
                  </span>
                  <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300">
                    {prediction.market}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                  Proyección de posesiones, ritmo ofensivo y dispersión de puntos evaluados por modelo cuantitativo.
                </div>
              </div>
            )}

            {/* AI Analysis Quote Box */}
            <div className="mt-3.5 rounded-2xl bg-slate-50/90 p-3.5 border border-slate-200/80 dark:bg-slate-950/80 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1.5">
                <span>🧠</span>
                <span>Análisis Cuantitativo SmartBetBot</span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed italic">
                &quot;{prediction.explanation || `Análisis cuantitativo de valor esperado (+EV) con proyección estadística de ${prediction.market} (${prediction.selection}).`}&quot;
              </p>
            </div>
          </div>

          {/* Action Footer: Visual Image Sharing Buttons & Minimize */}
          <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center flex-wrap gap-1.5">
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
                title="Copiar imagen de la tarjeta al portapapeles"
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

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail?.(prediction);
                }}
                className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-black text-white hover:bg-emerald-600 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-400 transition cursor-pointer flex items-center gap-1"
              >
                <span>{isFootball && isCornerMarket ? "🚩 Córners →" : "Ver H2H & Historial →"}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                title="Minimizar tarjeta"
                className="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer border border-slate-200 dark:border-slate-700 flex items-center gap-1"
              >
                <span>▲</span>
                <span className="hidden sm:inline">Minimizar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
