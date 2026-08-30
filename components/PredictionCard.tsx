"use client";

import React, { useState, useRef } from "react";
import { toPng } from "html-to-image";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage, Language } from "@/context/LanguageContext";

interface PredictionCardProps {
  prediction: MarketOpportunity;
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
        "bg-teal-50 text-teal-800 border-teal-300 shadow-sm dark:bg-teal-950/80 dark:text-teal-300 dark:border-teal-700/80",
    };
  }
  if (probability >= 55 || declaredConfidence === "Media" || declaredConfidence === "Moderada") {
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
    label: isEn ? "Low Confidence" : "Confianza Baja",
    shortLabel: isEn ? "Low" : "Baja",
    stars: "⭐",
    badgeClass:
      "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
  };
}

export function PredictionCard({ prediction }: PredictionCardProps) {
  const { language, t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const storyCardRef = useRef<HTMLDivElement>(null);

  const formattedDate = formatKickoffDate(prediction.kickoff);
  const conf = getConfidenceInfo(prediction.probability, prediction.confidence, language);

  const handleCopy = () => {
    const text = `📊 *Análisis SmartBetBot*

⚽ *Partido:* ${prediction.match}
🏆 *Liga:* ${prediction.league}
📅 *Fecha:* ${formattedDate}
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

  const handleDownloadStoryImage = async () => {
    if (!storyCardRef.current) return;
    try {
      setDownloadingImage(true);
      const dataUrl = await toPng(storyCardRef.current, {
        cacheBust: true,
        pixelRatio: 3, // Ultra-sharp 3x retina export
      });

      const filename = `smartbetbot-${prediction.match.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Error capturing story screenshot:", err);
    } finally {
      setDownloadingImage(false);
    }
  };

  return (
    <>
      <div className="relative flex flex-col justify-between rounded-3xl bg-white border border-slate-200/90 p-6 text-slate-900 shadow-lg shadow-slate-200/50 backdrop-blur-sm transition-all duration-200 hover:border-emerald-300 hover:shadow-xl dark:bg-gradient-to-b dark:from-slate-900/95 dark:via-slate-900/90 dark:to-slate-950/95 dark:border-slate-800/80 dark:text-slate-100 dark:shadow-2xl dark:hover:border-slate-700/90">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Análisis SmartBetBot</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-400 dark:border-emerald-700/60">
              📅 {formattedDate}
            </span>
            {prediction.league && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/50">
                {prediction.league}
              </span>
            )}
          </div>
        </div>

        {/* Confidence Badge */}
        <div className="mt-3.5 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-black border ${conf.badgeClass}`}>
            <span>{conf.stars}</span>
            <span>{conf.label}</span>
          </span>

          <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 font-bold">
            IA Score: <span className="text-slate-900 dark:text-white">{prediction.smartScore}/100</span>
          </span>
        </div>

        {/* Match & Market Section */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 font-bold">{t("matchLabel")}</span>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white leading-snug">
              {prediction.match}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 font-bold">{t("marketLabel")}</span>
            <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400 font-black leading-snug">
              {prediction.market}
            </p>
          </div>
        </div>

        {/* Odds & Probability Metrics */}
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-3.5 border border-slate-200/80 dark:bg-slate-950/60 dark:border-slate-800/50">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 font-bold">{t("oddsLabel")}</span>
            <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-sky-700 dark:text-sky-400 font-black">
              {prediction.odds.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 font-bold">{t("probLabel")}</span>
            <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400 font-black">
              {prediction.probability.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* AI Explanation Box */}
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 border border-slate-200/80 dark:bg-slate-950/80 dark:border-slate-800/60">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-300">
            <span>🧠</span>
            <span className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">{t("aiExplanation")}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-800 font-medium dark:text-slate-200">
            {prediction.explanation}
          </p>
        </div>

        {/* Action Buttons Footer */}
        <div className="mt-5 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/40">
              +{prediction.edge}% Edge
            </span>
            <span className="inline-flex items-center rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-extrabold text-sky-900 border border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/40">
              Score: {prediction.smartScore}/100
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700/50"
              title="Copiar texto para Telegram/WhatsApp"
            >
              {copied ? t("copiedBtn") : `📋 ${t("copyBtn")}`}
            </button>
            <button
              onClick={() => setShowStoryModal(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 shadow-sm"
              title="Ver formato Historia / Descargar Screenshot"
            >
              📸 {t("storyBtn")}
            </button>
          </div>
        </div>
      </div>

      {/* Story / Share Modal */}
      {showStoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-slate-950 p-6 text-slate-100 shadow-2xl border border-slate-700">
            {/* Close Button */}
            <button
              onClick={() => setShowStoryModal(false)}
              className="absolute right-4 top-4 rounded-full bg-slate-800/80 p-1.5 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            {/* Visual Capture Target */}
            <div ref={storyCardRef} className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-5 border border-slate-800 text-slate-100 shadow-xl">
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/90 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-700/50">
                  <span>🎯 PICK OFICIAL • {conf.stars} {conf.shortLabel.toUpperCase()}</span>
                </div>
                <h4 className="mt-2.5 text-lg font-extrabold tracking-tight text-white">
                  Análisis Estadístico
                </h4>
                <p className="text-xs text-slate-400 font-medium">{prediction.league} • {formattedDate}</p>
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
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Cuota</span>
                    <p className="text-base font-extrabold text-sky-400 mt-0.5">{prediction.odds.toFixed(2)}</p>
                  </div>
                  <div className="h-7 w-px bg-slate-800" />
                  <div className="text-center">
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Prob.</span>
                    <p className="text-base font-extrabold text-emerald-400 mt-0.5">{prediction.probability}%</p>
                  </div>
                </div>
              </div>

              {/* AI Explanation in Story */}
              <div className="mt-3.5 rounded-xl bg-slate-950/60 p-3 border border-slate-800/60 text-left">
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
                  <span>☕</span>
                  <span>Explicación del Modelo IA</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {prediction.explanation}
                </p>
              </div>

              {/* Footer Brand in Screenshot */}
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/50 pt-2.5">
                <span className="font-bold text-white flex items-center gap-1">
                  🎯 SmartBetBot
                </span>
                <span className="text-emerald-400 font-semibold">smartbetbot.app</span>
              </div>
            </div>

            {/* Download and Share Actions */}
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={handleDownloadStoryImage}
                disabled={downloadingImage}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:from-emerald-400 hover:to-teal-400 hover:scale-[1.02]"
              >
                <span>{downloadingImage ? "⏳" : "📸"}</span>
                <span>{downloadingImage ? "Generando Imagen PNG..." : "Descargar Imagen para Historia"}</span>
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 rounded-xl bg-slate-800/90 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white border border-slate-700"
                >
                  {copied ? "✓ Texto Copiado" : "📋 Copiar Texto"}
                </button>
                <button
                  onClick={() => setShowStoryModal(false)}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
