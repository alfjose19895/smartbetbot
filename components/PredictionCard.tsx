"use client";

import React, { useState, useRef, useEffect } from "react";
import { toPng } from "html-to-image";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage, Language } from "@/context/LanguageContext";
import { MatchDetailModal } from "@/components/MatchDetailModal";

interface PredictionCardProps {
  prediction: MarketOpportunity;
  onOpenDetail?: (prediction: MarketOpportunity) => void;
}

function formatKickoffDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Próximamente";

    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    const dayName = days[d.getDay()];
    const dayNum = d.getDate();
    const monthName = months[d.getMonth()];
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

    if (isToday) {
      return `Hoy (${dayNum} ${monthName}) • ${timeStr}`;
    }
    if (isTomorrow) {
      return `Mañana (${dayNum} ${monthName}) • ${timeStr}`;
    }

    return `${dayName} ${dayNum} ${monthName} • ${timeStr}`;
  } catch {
    return "Próximamente";
  }
}

function getTimeRemainingStatus(dateString: string) {
  try {
    const kickoffMs = new Date(dateString).getTime();
    const nowMs = Date.now();
    const diffMs = kickoffMs - nowMs;

    if (diffMs > 0) {
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;

      if (diffMins <= 30) {
        return {
          label: `⏳ Inicia en ${diffMins}m`,
          bg: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700",
        };
      }
      if (diffHours < 24) {
        return {
          label: `🟢 Inicia en ${diffHours}h ${remMins}m`,
          bg: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700",
        };
      }
      return {
        label: `📅 Próximo`,
        bg: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      };
    } else {
      const elapsedMins = Math.floor(Math.abs(diffMs) / 60000);
      if (elapsedMins <= 115) {
        return {
          label: `🔴 En Juego (~${elapsedMins}')`,
          bg: "bg-rose-100 text-rose-900 border-rose-300 animate-pulse dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700",
        };
      }
      return {
        label: `🏁 Finalizado`,
        bg: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
      };
    }
  } catch {
    return {
      label: `📅 Programado`,
      bg: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    };
  }
}

function getConfidenceInfo(probability: number, declaredConfidence?: string, lang: Language = "es") {
  const isEn = lang === "en";
  if (probability >= 75 || declaredConfidence === "Muy Alta") {
    return {
      level: "muy_alta",
      label: isEn ? "Very High Confidence" : "Confianza Muy Alta",
      shortLabel: isEn ? "Very High" : "Muy Alta",
      stars: "⭐⭐⭐",
      badgeClass:
        "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700/80",
    };
  }
  if (probability >= 65 || declaredConfidence === "Alta") {
    return {
      level: "alta",
      label: isEn ? "High Confidence" : "Confianza Alta",
      shortLabel: isEn ? "High" : "Alta",
      stars: "⭐⭐",
      badgeClass:
        "bg-cyan-50 text-cyan-800 border-cyan-300 shadow-sm dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700/80",
    };
  }
  if (probability >= 55 || declaredConfidence === "Media") {
    return {
      level: "media",
      label: isEn ? "Medium Confidence" : "Confianza Media",
      shortLabel: isEn ? "Medium" : "Media",
      stars: "⭐",
      badgeClass:
        "bg-amber-50 text-amber-800 border-amber-300 shadow-sm dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700/80",
    };
  }
  return {
    level: "baja",
    label: isEn ? "Low Confidence" : "Confianza Baja / Moderada",
    shortLabel: isEn ? "Low" : "Baja",
    stars: "⚪",
    badgeClass:
      "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
  };
}

export function PredictionCard({ prediction, onOpenDetail }: PredictionCardProps) {
  const { language, t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const storyCardRef = useRef<HTMLDivElement>(null);

  const formattedDate = formatKickoffDate(prediction.kickoff);
  const timeStatus = getTimeRemainingStatus(prediction.kickoff);
  const conf = getConfidenceInfo(prediction.probability, prediction.confidence, language);

  const fairOddsVal = prediction.fairOdds || Math.round((100 / (prediction.probability || 50)) * 100) / 100;
  const countryDisplay = prediction.country || "Mundial";

  const handleOpenDetail = () => {
    if (onOpenDetail) {
      onOpenDetail(prediction);
    } else {
      setShowDetailModal(true);
    }
  };

  const shareText = `📊 *Pronóstico SmartBetBot*\n\n⚽ *Partido:* ${prediction.match}\n🏆 *Liga:* ${prediction.league} (${countryDisplay})\n📅 *Fecha:* ${formattedDate}\n🎯 *Mercado:* ${prediction.market}\n💰 *Cuota Casa:* @${prediction.odds.toFixed(2)} | *Cuota Justa:* @${fairOddsVal.toFixed(2)}\n📈 *Probabilidad:* ${prediction.probability.toFixed(0)}%\n🔥 *Valor (+Edge):* +${prediction.edge}%\n⭐ *Confianza:* ${conf.stars} ${conf.shortLabel}\n\n💡 *Explicación IA:*\n${prediction.explanation}\n\n🔗 https://www.smartbetbot.educandotea.com`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent("https://www.smartbetbot.educandotea.com")}&text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };

  const handleDownloadStoryImage = async () => {
    if (!storyCardRef.current) return;
    try {
      setDownloadingImage(true);
      const dataUrl = await toPng(storyCardRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
      });
      const link = document.createElement("a");
      link.download = `SmartBetBot-Pick-${prediction.match.replace(/\s+/g, "-")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to download story image:", err);
    } finally {
      setDownloadingImage(false);
    }
  };

  return (
    <>
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/5 dark:border-slate-800/90 dark:bg-slate-900/90 dark:hover:border-emerald-500/40">
        {/* Top Badges: League + Country, Live Countdown Status, and Confidence */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
              <span>🏆</span>
              <span>{prediction.league}</span>
              <span className="text-slate-400 font-normal">•</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-black">{countryDisplay}</span>
            </span>
            <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border ${timeStatus.bg}`}>
              <span>{timeStatus.label}</span>
            </div>
          </div>

          {/* Match Title & Date */}
          <div className="mt-3.5 cursor-pointer" onClick={handleOpenDetail}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                📅 {formattedDate}
              </span>
              <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black border ${conf.badgeClass}`}>
                <span>{conf.stars}</span>
                <span>{conf.shortLabel}</span>
              </div>
            </div>

            <h3 className="mt-1.5 text-lg font-black tracking-tight text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {prediction.match}
            </h3>
          </div>

          {/* Market Selection Box */}
          <div className="mt-3 rounded-2xl bg-emerald-50/70 p-3.5 border border-emerald-200/90 dark:bg-emerald-950/40 dark:border-emerald-900/60">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 block">
              {t("marketLabel")}
            </span>
            <span className="text-base font-black text-emerald-950 dark:text-emerald-200 mt-0.5 block">
              🎯 {prediction.market}
            </span>
          </div>

          {/* Dual Odds Box: Cuota Casa de Apuestas vs Cuota Justa (App) */}
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 border border-slate-200/80 text-center dark:bg-slate-950/70 dark:border-slate-800/80">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                Cuota Casa
              </span>
              <p className="text-lg font-black text-sky-700 dark:text-sky-400 mt-0.5">
                @{prediction.odds.toFixed(2)}
              </p>
            </div>
            <div className="border-x border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                Cuota Justa
              </span>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                @{fairOddsVal.toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                Probabilidad
              </span>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {prediction.probability.toFixed(0)}%
              </p>
            </div>
          </div>

          {/* AI Explanation Box */}
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 border border-slate-200/70 dark:bg-slate-950/80 dark:border-slate-800/60">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-300">
              <span>🧠</span>
              <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[10px]">{t("aiExplanation")}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-800 font-medium dark:text-slate-200 line-clamp-3">
              {prediction.explanation}
            </p>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="mt-4 flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/40">
              +{prediction.edge}% Valor
            </span>
            <span className="inline-flex items-center rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-900 border border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/40">
              Score: {prediction.smartScore}/100
            </span>
          </div>

          {/* Controls Bar: H2H, Copy, WhatsApp, Telegram, Story */}
          <div className="grid grid-cols-4 gap-1.5 mt-1">
            <button
              onClick={handleOpenDetail}
              className="col-span-1 inline-flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-800 transition hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700 cursor-pointer"
              title="Ver H2H y últimos 5 partidos"
            >
              📊 H2H
            </button>

            <button
              onClick={handleCopy}
              className="col-span-1 inline-flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-800 transition hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700 cursor-pointer"
              title="Copiar texto"
            >
              {copied ? "✓ Copiado" : "📋 Copiar"}
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="col-span-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 px-2 py-1.5 text-[11px] font-black dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-700 cursor-pointer transition"
              title="Compartir por WhatsApp"
            >
              💬 WhatsApp
            </button>

            <button
              onClick={() => setShowStoryModal(true)}
              className="col-span-1 inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 text-white hover:bg-slate-800 px-2 py-1.5 text-[11px] font-black dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-sm cursor-pointer transition"
              title="Descargar Formato Historia"
            >
              📸 Historia
            </button>
          </div>
        </div>
      </div>

      {/* Match Detail Modal (H2H & Recent 5 Matches) */}
      {showDetailModal && (
        <MatchDetailModal
          prediction={prediction}
          onClose={() => setShowDetailModal(false)}
        />
      )}

      {/* Story / Share Modal */}
      {showStoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-slate-950 p-6 text-slate-100 shadow-2xl border border-slate-700">
            <button
              onClick={() => setShowStoryModal(false)}
              className="absolute right-4 top-4 rounded-full bg-slate-800/80 p-1.5 text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>

            <div ref={storyCardRef} className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-5 border border-slate-800 text-slate-100 shadow-xl">
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/90 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-700/50">
                  <span>🎯 PICK OFICIAL • {conf.stars} {conf.shortLabel.toUpperCase()}</span>
                </div>
                <h4 className="mt-2.5 text-lg font-extrabold tracking-tight text-white">
                  Análisis Estadístico
                </h4>
                <p className="text-xs text-slate-400 font-medium">{prediction.league} • {countryDisplay} • {formattedDate}</p>
              </div>

              <div className="mt-4 rounded-xl bg-slate-950/80 p-4 border border-slate-800/80 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Partido</span>
                <p className="text-base font-extrabold text-white mt-0.5">{prediction.match}</p>

                <div className="mt-3 flex items-center justify-around border-t border-slate-800/80 pt-3">
                  <div className="text-center">
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Mercado</span>
                    <p className="text-sm font-extrabold text-emerald-400 mt-0.5">{prediction.market}</p>
                  </div>
                  <div className="h-7 w-px bg-slate-800" />
                  <div className="text-center">
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Cuota Casa</span>
                    <p className="text-base font-extrabold text-sky-400 mt-0.5">{prediction.odds.toFixed(2)}</p>
                  </div>
                  <div className="h-7 w-px bg-slate-800" />
                  <div className="text-center">
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Prob.</span>
                    <p className="text-base font-extrabold text-emerald-400 mt-0.5">{prediction.probability}%</p>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 rounded-xl bg-slate-950/60 p-3 border border-slate-800/60 text-left">
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
                  <span>🧠</span>
                  <span>Explicación del Modelo IA</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {prediction.explanation}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/50 pt-2.5">
                <span className="font-bold text-white flex items-center gap-1">
                  🎯 SmartBetBot
                </span>
                <span className="text-emerald-400 font-semibold">smartbetbot.app</span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={handleDownloadStoryImage}
                disabled={downloadingImage}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:from-emerald-400 hover:to-teal-400 hover:scale-[1.02] cursor-pointer"
              >
                <span>{downloadingImage ? "⏳" : "📸"}</span>
                <span>{downloadingImage ? "Generando Imagen PNG..." : "Descargar Imagen para Historia"}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleShareWhatsApp}
                  className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-500 cursor-pointer"
                >
                  💬 Enviar WhatsApp
                </button>
                <button
                  onClick={handleShareTelegram}
                  className="rounded-xl bg-sky-600 py-2.5 text-xs font-bold text-white transition hover:bg-sky-500 cursor-pointer"
                >
                  ✈️ Enviar Telegram
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
