"use client";

import React, { useState } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";

interface MatchDetailModalProps {
  prediction: MarketOpportunity;
  onClose: () => void;
}

export function MatchDetailModal({ prediction, onClose }: MatchDetailModalProps) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<"h2h" | "homeForm" | "awayForm" | "stats">("h2h");

  const formattedDate = new Date(prediction.kickoff).toLocaleDateString(
    language === "en" ? "en-US" : "es-ES",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  const confidenceBadge = {
    "Muy Alta": { label: "Muy Alta", stars: "⭐⭐⭐", bg: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700" },
    "Alta": { label: "Alta", stars: "⭐⭐", bg: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-700" },
    "Media": { label: "Media", stars: "⭐", bg: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700" },
    "Baja": { label: "Moderada / Baja", stars: "⚪", bg: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  }[prediction.confidence] || { label: prediction.confidence, stars: "⭐", bg: "bg-emerald-100 text-emerald-900 border-emerald-300" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-2xl border border-slate-200 dark:border-slate-800 my-8">
        {/* Modal Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-white transition cursor-pointer"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="relative border-b border-slate-200 bg-slate-50/80 p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
              🏆 {prediction.league}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-extrabold border ${confidenceBadge.bg}`}>
              <span>{confidenceBadge.stars}</span>
              <span>{confidenceBadge.label}</span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              📅 {formattedDate}
            </span>
          </div>

          <h2 className="mt-3 text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {prediction.match}
          </h2>

          {/* Dual Odds Box: Casa de Apuestas vs Cuota Justa Modelo */}
          <div className="mt-4 grid grid-cols-3 gap-2.5 rounded-2xl bg-white p-3.5 border border-slate-200 shadow-sm dark:bg-slate-950 dark:border-slate-800">
            <div className="text-center">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                Cuota Casa
              </span>
              <span className="text-lg font-black text-sky-700 dark:text-sky-400">
                @{prediction.odds.toFixed(2)}
              </span>
            </div>

            <div className="text-center border-x border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                Cuota Justa (App)
              </span>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                @{prediction.fairOdds.toFixed(2)}
              </span>
            </div>

            <div className="text-center">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                Prob. / Valor
              </span>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {prediction.probability.toFixed(1)}% <small className="text-xs text-sky-500">(+{prediction.edge}%)</small>
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs (H2H, Home Last 5, Away Last 5, Elo & Stats) */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 dark:border-slate-800 dark:bg-slate-900/40 p-1">
          {[
            { id: "h2h", label: "⚔️ Historial H2H" },
            { id: "homeForm", label: `🏠 ${prediction.homeTeam.slice(0, 12)} (5 Recientes)` },
            { id: "awayForm", label: `✈️ ${prediction.awayTeam.slice(0, 12)} (5 Recientes)` },
            { id: "stats", label: "🧠 Análisis IA & ELO" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 text-center text-xs font-bold transition rounded-xl cursor-pointer ${
                activeTab === tab.id
                  ? "bg-white text-emerald-800 shadow-sm dark:bg-slate-950 dark:text-emerald-400 font-extrabold"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6 max-h-96 overflow-y-auto">
          {/* 1. H2H Clashes */}
          {activeTab === "h2h" && (
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Últimos 5 Enfrentamientos Directos (H2H)
              </h4>
              {prediction.h2h && prediction.h2h.length > 0 ? (
                <div className="space-y-2">
                  {prediction.h2h.map((clash, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                    >
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {clash.date}
                      </span>
                      <div className="flex items-center gap-2 font-bold">
                        <span className={clash.winner === clash.homeTeam ? "text-emerald-600 dark:text-emerald-400 font-black" : ""}>
                          {clash.homeTeam}
                        </span>
                        <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black dark:bg-slate-800 dark:text-white">
                          {clash.score}
                        </span>
                        <span className={clash.winner === clash.awayTeam ? "text-emerald-600 dark:text-emerald-400 font-black" : ""}>
                          {clash.awayTeam}
                        </span>
                      </div>
                      <span className="rounded bg-slate-200/60 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                        {clash.competition}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No hay registros H2H previos disponibles.</p>
              )}
            </div>
          )}

          {/* 2. Home Team Last 5 Matches */}
          {activeTab === "homeForm" && (
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Últimos 5 Partidos de {prediction.homeTeam}
              </h4>
              {prediction.homeLast5 && prediction.homeLast5.length > 0 ? (
                <div className="space-y-2">
                  {prediction.homeLast5.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black text-white ${
                            m.result === "W"
                              ? "bg-emerald-600"
                              : m.result === "D"
                              ? "bg-amber-500"
                              : "bg-red-600"
                          }`}
                        >
                          {m.result === "W" ? "V" : m.result === "D" ? "E" : "D"}
                        </span>
                        <span className="font-bold">
                          {m.isHome ? `vs ${m.opponent}` : `@ ${m.opponent}`}
                        </span>
                      </div>
                      <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs dark:bg-slate-800">
                        {m.score}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {m.date}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Historial reciente no disponible.</p>
              )}
            </div>
          )}

          {/* 3. Away Team Last 5 Matches */}
          {activeTab === "awayForm" && (
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Últimos 5 Partidos de {prediction.awayTeam}
              </h4>
              {prediction.awayLast5 && prediction.awayLast5.length > 0 ? (
                <div className="space-y-2">
                  {prediction.awayLast5.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black text-white ${
                            m.result === "W"
                              ? "bg-emerald-600"
                              : m.result === "D"
                              ? "bg-amber-500"
                              : "bg-red-600"
                          }`}
                        >
                          {m.result === "W" ? "V" : m.result === "D" ? "E" : "D"}
                        </span>
                        <span className="font-bold">
                          {m.isHome ? `vs ${m.opponent}` : `@ ${m.opponent}`}
                        </span>
                      </div>
                      <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs dark:bg-slate-800">
                        {m.score}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {m.date}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Historial reciente no disponible.</p>
              )}
            </div>
          )}

          {/* 4. Stats & Elo Analysis */}
          {activeTab === "stats" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    Jerarquía ELO: {prediction.homeTeam} ({prediction.homeElo || 78}) vs {prediction.awayTeam} ({prediction.awayElo || 72})
                  </span>
                  <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                    Score: {prediction.smartScore}/100
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 flex">
                  <div
                    style={{ width: `${Math.min(90, Math.max(10, ((prediction.homeElo || 78) / ((prediction.homeElo || 78) + (prediction.awayElo || 72))) * 100))}%` }}
                    className="bg-emerald-500"
                  />
                  <div className="flex-1 bg-sky-500" />
                </div>
                <div className="flex justify-between text-[11px] font-extrabold text-slate-500 dark:text-slate-400 mt-1">
                  <span>Local: {prediction.homeElo || 78} ELO</span>
                  <span>Visitante: {prediction.awayElo || 72} ELO</span>
                </div>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/40">
                <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase">
                  <span>🧠</span>
                  <span>Fundamentación del Modelo Cuantitativo</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
                  {prediction.explanation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
            Pronóstico: <strong className="text-emerald-600 dark:text-emerald-400">{prediction.market}</strong> (@{prediction.odds.toFixed(2)})
          </span>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
