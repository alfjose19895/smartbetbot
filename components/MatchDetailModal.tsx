"use client";

import React, { useState, useEffect } from "react";
import {
  MarketOpportunity,
  H2HMatch,
  TeamFormMatch,
} from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";

interface MatchDetailModalProps {
  prediction: MarketOpportunity;
  onClose: () => void;
}

export function MatchDetailModal({ prediction, onClose }: MatchDetailModalProps) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<"h2h" | "homeForm" | "awayForm" | "stats">("h2h");

  const initialHomeElo = prediction.homeElo || 1650;
  const initialAwayElo = prediction.awayElo || 1620;

  const [h2hList, setH2hList] = useState<H2HMatch[]>([]);
  const [homeLast5List, setHomeLast5List] = useState<TeamFormMatch[]>([]);
  const [awayLast5List, setAwayLast5List] = useState<TeamFormMatch[]>([]);
  const [homeElo, setHomeElo] = useState<number>(initialHomeElo);
  const [awayElo, setAwayElo] = useState<number>(initialAwayElo);
  const [loading, setLoading] = useState<boolean>(true);
  const [isOfficialLoaded, setIsOfficialLoaded] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchOfficialH2H = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          homeTeamId: String(prediction.homeTeamId || 0),
          awayTeamId: String(prediction.awayTeamId || 0),
          homeTeam: prediction.homeTeam,
          awayTeam: prediction.awayTeam,
          league: prediction.league,
          kickoff: prediction.kickoff,
        });

        const res = await fetch(`/api/fixtures/h2h?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();

        if (isMounted && data.success) {
          if (data.h2h && data.h2h.length > 0) setH2hList(data.h2h);
          if (data.homeLast5 && data.homeLast5.length > 0) setHomeLast5List(data.homeLast5);
          if (data.awayLast5 && data.awayLast5.length > 0) setAwayLast5List(data.awayLast5);
          if (data.homeElo) setHomeElo(data.homeElo);
          if (data.awayElo) setAwayElo(data.awayElo);
          setIsOfficialLoaded(Boolean(data.isOfficial));
        }
      } catch (err) {
        console.warn("Could not load real-time H2H API:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOfficialH2H();
    return () => {
      isMounted = false;
    };
  }, [prediction]);

  const formattedDate = new Date(prediction.kickoff).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const formattedTime = new Date(prediction.kickoff).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                🏆 {prediction.league} {prediction.country ? `• ${prediction.country}` : ""}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                📅 {formattedDate} - {formattedTime} (Ecuador UTC-5)
              </span>
            </div>
            <h3 className="mt-1.5 text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              {prediction.homeTeam} vs {prediction.awayTeam}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/50 px-4 text-xs font-black dark:border-slate-800 dark:bg-slate-950/40">
          <button
            onClick={() => setActiveTab("h2h")}
            className={`border-b-2 py-3 px-3.5 transition cursor-pointer ${
              activeTab === "h2h"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            ⚔️ Cara a Cara (H2H)
          </button>
          <button
            onClick={() => setActiveTab("homeForm")}
            className={`border-b-2 py-3 px-3.5 transition cursor-pointer ${
              activeTab === "homeForm"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            🏠 {prediction.homeTeam} (Últimos 5)
          </button>
          <button
            onClick={() => setActiveTab("awayForm")}
            className={`border-b-2 py-3 px-3.5 transition cursor-pointer ${
              activeTab === "awayForm"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            ✈️ {prediction.awayTeam} (Últimos 5)
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`border-b-2 py-3 px-3.5 transition cursor-pointer ${
              activeTab === "stats"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            📊 Análisis Elo
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="mt-2 text-xs font-semibold">Consultando historial verificado...</p>
            </div>
          ) : (
            <>
              {/* 1. H2H Clashes */}
              {activeTab === "h2h" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Enfrentamientos Directos Recientes
                    </h4>
                    {isOfficialLoaded && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        ✓ API-Football Oficial
                      </span>
                    )}
                  </div>

                  {h2hList.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                      Sin enfrentamientos directos previos registrados en las bases de datos para estos dos equipos.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {h2hList.map((clash, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-2xl bg-slate-50 p-3.5 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                        >
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {clash.date}
                          </span>
                          <div className="flex items-center gap-2 font-bold">
                            <span className={clash.winner === clash.homeTeam ? "text-emerald-700 dark:text-emerald-400 font-black" : ""}>
                              {clash.homeTeam}
                            </span>
                            <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-slate-900 dark:bg-slate-800 dark:text-white">
                              {clash.score}
                            </span>
                            <span className={clash.winner === clash.awayTeam ? "text-emerald-700 dark:text-emerald-400 font-black" : ""}>
                              {clash.awayTeam}
                            </span>
                          </div>
                          <span className="rounded bg-slate-200/60 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                            {clash.competition}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Home Team Last 5 Matches */}
              {activeTab === "homeForm" && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
                    Últimos 5 Partidos de {prediction.homeTeam} (Forma Reciente)
                  </h4>
                  {homeLast5List.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                      Sin partidos previos recientes disponibles en la base de datos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {homeLast5List.map((m, idx) => (
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
                              title={m.result === "W" ? "Victoria" : m.result === "D" ? "Empate" : "Derrota"}
                            >
                              {m.result === "W" ? "V" : m.result === "D" ? "E" : "D"}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {m.isHome ? `vs ${m.opponent}` : `@ ${m.opponent}`}
                            </span>
                          </div>
                          <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs text-slate-900 dark:bg-slate-800 dark:text-white">
                            {m.score}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {m.date}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Away Team Last 5 Matches */}
              {activeTab === "awayForm" && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
                    Últimos 5 Partidos de {prediction.awayTeam} (Forma Reciente)
                  </h4>
                  {awayLast5List.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                      Sin partidos previos recientes disponibles en la base de datos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {awayLast5List.map((m, idx) => (
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
                              title={m.result === "W" ? "Victoria" : m.result === "D" ? "Empate" : "Derrota"}
                            >
                              {m.result === "W" ? "V" : m.result === "D" ? "E" : "D"}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {m.isHome ? `vs ${m.opponent}` : `@ ${m.opponent}`}
                            </span>
                          </div>
                          <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs text-slate-900 dark:bg-slate-800 dark:text-white">
                            {m.score}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {m.date}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Stats & Elo Analysis */}
              {activeTab === "stats" && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Jerarquía ELO: {prediction.homeTeam} ({homeElo}) vs {prediction.awayTeam} ({awayElo})
                      </span>
                      <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                        SmartScore: {prediction.smartScore}/100
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 flex">
                      <div
                        style={{ width: `${Math.min(90, Math.max(10, (homeElo / (homeElo + awayElo)) * 100))}%` }}
                        className="bg-emerald-500 transition-all duration-500"
                      />
                      <div className="flex-1 bg-sky-500" />
                    </div>
                    <div className="flex justify-between text-[11px] font-black text-slate-600 dark:text-slate-400 mt-1.5">
                      <span>🏠 Local: {homeElo} ELO ({Math.round((homeElo / (homeElo + awayElo)) * 100)}%)</span>
                      <span>✈️ Visitante: {awayElo} ELO ({Math.round((awayElo / (homeElo + awayElo)) * 100)}%)</span>
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
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
            Pronóstico: <strong className="text-emerald-700 dark:text-emerald-400">{prediction.market}</strong> (@{prediction.odds.toFixed(2)})
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
