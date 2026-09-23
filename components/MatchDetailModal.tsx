"use client";

import React, { useState, useEffect } from "react";
import {
  MarketOpportunity,
  H2HMatch,
  TeamFormMatch,
} from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";

interface TeamCornerSummary {
  avgTotal: number;
  avgFor: number;
  avgAgainst: number;
  over85Rate: number;
  over95Rate: number;
  over105Rate: number;
  history: number[];
}

interface MatchDetailModalProps {
  prediction: MarketOpportunity;
  onClose: () => void;
}

export function MatchDetailModal({ prediction, onClose }: MatchDetailModalProps) {
  const { language } = useLanguage();
  const isInitialCorner =
    prediction.market === "Córners" ||
    (prediction.market && (prediction.market.toLowerCase().includes("córner") || prediction.market.toLowerCase().includes("corner")));
  const [activeTab, setActiveTab] = useState<"h2h" | "homeForm" | "awayForm" | "corners" | "stats">(isInitialCorner ? "corners" : "h2h");
  const [cornerViewTeam, setCornerViewTeam] = useState<"both" | "home" | "away">("both");
  const [formMode, setFormMode] = useState<"all" | "score" | "corners">("all");

  const initialHomeElo = prediction.homeElo || 1650;
  const initialAwayElo = prediction.awayElo || 1620;

  const [h2hList, setH2hList] = useState<H2HMatch[]>(prediction.h2h || []);
  const [homeLast5List, setHomeLast5List] = useState<TeamFormMatch[]>(prediction.homeLast5 || []);
  const [awayLast5List, setAwayLast5List] = useState<TeamFormMatch[]>(prediction.awayLast5 || []);
  const [homeElo, setHomeElo] = useState<number>(initialHomeElo);
  const [awayElo, setAwayElo] = useState<number>(initialAwayElo);
  const [homeCornerStats, setHomeCornerStats] = useState<TeamCornerSummary | null>(null);
  const [awayCornerStats, setAwayCornerStats] = useState<TeamCornerSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(!(prediction.homeLast5 && prediction.homeLast5.length > 0));
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
          if (Array.isArray(data.h2h)) setH2hList(data.h2h);
          if (Array.isArray(data.homeLast5) && data.homeLast5.length > 0) setHomeLast5List(data.homeLast5);
          if (Array.isArray(data.awayLast5) && data.awayLast5.length > 0) setAwayLast5List(data.awayLast5);
          if (data.homeElo) setHomeElo(data.homeElo);
          if (data.awayElo) setAwayElo(data.awayElo);
          if (data.homeCornerStats !== undefined) setHomeCornerStats(data.homeCornerStats);
          if (data.awayCornerStats !== undefined) setAwayCornerStats(data.awayCornerStats);
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

  // Calculate real corner averages from verified matches only
  const computeRealCornerStats = (list: TeamFormMatch[]): TeamCornerSummary | null => {
    const valid = list.filter((m) => m.totalCorners !== undefined && m.totalCorners !== null && m.teamCorners !== undefined);
    if (valid.length === 0) return null;
    const totals = valid.map((m) => m.totalCorners!);
    const forList = valid.map((m) => m.teamCorners!);
    const againstList = valid.map((m) => m.opponentCorners!);
    const sumTotal = totals.reduce((a, b) => a + b, 0);
    const sumFor = forList.reduce((a, b) => a + b, 0);
    const sumAgainst = againstList.reduce((a, b) => a + b, 0);
    return {
      avgTotal: Math.round((sumTotal / valid.length) * 10) / 10,
      avgFor: Math.round((sumFor / valid.length) * 10) / 10,
      avgAgainst: Math.round((sumAgainst / valid.length) * 10) / 10,
      over85Rate: Math.round((totals.filter((t) => t > 8.5).length / valid.length) * 100),
      over95Rate: Math.round((totals.filter((t) => t > 9.5).length / valid.length) * 100),
      over105Rate: Math.round((totals.filter((t) => t > 10.5).length / valid.length) * 100),
      history: totals,
    };
  };

  const finalHomeCorners = homeCornerStats || computeRealCornerStats(homeLast5List);
  const finalAwayCorners = awayCornerStats || computeRealCornerStats(awayLast5List);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
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

        {/* Settled Result Status Banner */}
        {(() => {
          const isWon = prediction.status === "won" || (prediction as any).result === "WON";
          const isLost = prediction.status === "lost" || (prediction as any).result === "LOST";
          const score = prediction.actualScore || prediction.currentScore || (prediction as any).score;
          if (isWon) {
            return (
              <div className="bg-emerald-500 text-slate-950 px-4 py-2 text-xs font-black flex items-center justify-between shadow-xs border-b border-emerald-400">
                <span className="flex items-center gap-1.5">
                  ✓ PRONÓSTICO ACERTADO (GANADA) • Mercado: {prediction.market} ({prediction.selection || ""}) @{prediction.odds}
                </span>
                {score && <span className="rounded-md bg-slate-950 px-2 py-0.5 text-white text-[11px]">⚽ Marcador: {score}</span>}
              </div>
            );
          }
          if (isLost) {
            return (
              <div className="bg-rose-600 text-white px-4 py-2 text-xs font-black flex items-center justify-between shadow-xs border-b border-rose-500">
                <span className="flex items-center gap-1.5">
                  ✗ PRONÓSTICO NO ACERTADO (PERDIDA) • Mercado: {prediction.market} ({prediction.selection || ""}) @{prediction.odds}
                </span>
                {score && <span className="rounded-md bg-black px-2 py-0.5 text-white text-[11px]">⚽ Marcador: {score}</span>}
              </div>
            );
          }
          return null;
        })()}

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto no-scrollbar border-b border-slate-200 bg-slate-100/50 px-2 sm:px-4 text-xs font-black dark:border-slate-800 dark:bg-slate-950/40">
          <button
            onClick={() => setActiveTab("h2h")}
            className={`shrink-0 border-b-2 py-3 px-3 transition cursor-pointer ${
              activeTab === "h2h"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            ⚔️ Cara a Cara (H2H)
          </button>
          <button
            onClick={() => setActiveTab("homeForm")}
            className={`shrink-0 border-b-2 py-3 px-3 transition cursor-pointer ${
              activeTab === "homeForm"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            🏠 {prediction.homeTeam} (Últimos 5)
          </button>
          <button
            onClick={() => setActiveTab("awayForm")}
            className={`shrink-0 border-b-2 py-3 px-3 transition cursor-pointer ${
              activeTab === "awayForm"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            ✈️ {prediction.awayTeam} (Últimos 5)
          </button>
          <button
            onClick={() => setActiveTab("corners")}
            className={`shrink-0 border-b-2 py-3 px-3 transition cursor-pointer ${
              activeTab === "corners"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            🚩 Historial Córners
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`shrink-0 border-b-2 py-3 px-3 transition cursor-pointer ${
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
              <p className="mt-2 text-xs font-semibold">Consultando historial oficial de resultados y córners...</p>
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
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3.5 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              {clash.date}
                            </span>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className={clash.winner === clash.homeTeam ? "text-emerald-700 dark:text-emerald-400 font-black" : "text-slate-900 dark:text-white"}>
                                {clash.homeTeam}
                              </span>
                              <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-slate-900 dark:bg-slate-800 dark:text-white">
                                {clash.score}
                              </span>
                              <span className={clash.winner === clash.awayTeam ? "text-emerald-700 dark:text-emerald-400 font-black" : "text-slate-900 dark:text-white"}>
                                {clash.awayTeam}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {clash.totalCorners !== undefined && clash.totalCorners !== null ? (
                              <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                🚩 {clash.homeCorners ?? 0} - {clash.awayCorners ?? 0} ({clash.totalCorners} corn.)
                              </span>
                            ) : null}
                            <span className="rounded-md bg-slate-200/60 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              {clash.competition}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Home Team Last 5 Matches */}
              {activeTab === "homeForm" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Últimos 5 Partidos de {prediction.homeTeam}
                    </h4>
                    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
                      <button
                        onClick={() => setFormMode("all")}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold cursor-pointer transition ${
                          formMode === "all" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        ⚡ Todo
                      </button>
                      <button
                        onClick={() => setFormMode("score")}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold cursor-pointer transition ${
                          formMode === "score" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        ⚽ Goles
                      </button>
                      <button
                        onClick={() => setFormMode("corners")}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold cursor-pointer transition ${
                          formMode === "corners" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        🚩 Córners
                      </button>
                    </div>
                  </div>

                  {homeLast5List.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                      Sin partidos previos recientes disponibles en la base de datos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {homeLast5List.map((m, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white ${
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

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {(formMode === "all" || formMode === "score") && (
                              <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs text-slate-900 dark:bg-slate-800 dark:text-white">
                                {m.score}
                              </span>
                            )}
                            {(formMode === "all" || formMode === "corners") && (
                              m.totalCorners !== undefined && m.totalCorners !== null ? (
                                <span className="flex items-center gap-1 rounded-lg bg-emerald-100/70 px-2 py-0.5 text-xs font-black text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  🚩 {m.teamCorners ?? 0}-{m.opponentCorners ?? 0} ({m.totalCorners} corn.)
                                </span>
                              ) : formMode === "corners" ? (
                                <span className="text-[10px] font-bold text-slate-400">Sin córners registrados</span>
                              ) : null
                            )}
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              {m.date}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Away Team Last 5 Matches */}
              {activeTab === "awayForm" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Últimos 5 Partidos de {prediction.awayTeam}
                    </h4>
                    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
                      <button
                        onClick={() => setFormMode("all")}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold cursor-pointer transition ${
                          formMode === "all" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        ⚡ Todo
                      </button>
                      <button
                        onClick={() => setFormMode("score")}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold cursor-pointer transition ${
                          formMode === "score" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        ⚽ Goles
                      </button>
                      <button
                        onClick={() => setFormMode("corners")}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold cursor-pointer transition ${
                          formMode === "corners" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        🚩 Córners
                      </button>
                    </div>
                  </div>

                  {awayLast5List.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                      Sin partidos previos recientes disponibles en la base de datos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {awayLast5List.map((m, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white ${
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

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {(formMode === "all" || formMode === "score") && (
                              <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs text-slate-900 dark:bg-slate-800 dark:text-white">
                                {m.score}
                              </span>
                            )}
                            {(formMode === "all" || formMode === "corners") && (
                              m.totalCorners !== undefined && m.totalCorners !== null ? (
                                <span className="flex items-center gap-1 rounded-lg bg-emerald-100/70 px-2 py-0.5 text-xs font-black text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  🚩 {m.teamCorners ?? 0}-{m.opponentCorners ?? 0} ({m.totalCorners} corn.)
                                </span>
                              ) : formMode === "corners" ? (
                                <span className="text-[10px] font-bold text-slate-400">Sin córners registrados</span>
                              ) : null
                            )}
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              {m.date}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Corners History Tab (100% REAL & VERIFIED) */}
              {activeTab === "corners" && (
                <div className="space-y-4 animate-fade-in">
                  {/* Summary Comparison Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Home Team Corner Card */}
                    <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                          🏠 {prediction.homeTeam}
                        </span>
                        {finalHomeCorners ? (
                          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {finalHomeCorners.avgTotal} Córn./part.
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">Sin estadísticas</span>
                        )}
                      </div>
                      {finalHomeCorners ? (
                        <>
                          <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] mt-3">
                            <div className="rounded-xl bg-white p-2 border border-slate-200/80 dark:bg-slate-800/80 dark:border-slate-700">
                              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">A Favor</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs">+{finalHomeCorners.avgFor}</span>
                            </div>
                            <div className="rounded-xl bg-white p-2 border border-slate-200/80 dark:bg-slate-800/80 dark:border-slate-700">
                              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">En Contra</span>
                              <span className="text-rose-500 font-black text-xs">-{finalHomeCorners.avgAgainst}</span>
                            </div>
                            <div className="rounded-xl bg-white p-2 border border-slate-200/80 dark:bg-slate-800/80 dark:border-slate-700">
                              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">% Over 8.5</span>
                              <span className="text-slate-900 dark:text-white font-black text-xs">{finalHomeCorners.over85Rate}%</span>
                            </div>
                          </div>
                          {/* Corner Sequence Pills */}
                          <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5 dark:border-slate-800">
                            <span className="text-[10px] font-bold text-slate-500">Historial real ({finalHomeCorners.history.length} partidos):</span>
                            <div className="flex gap-1.5">
                              {finalHomeCorners.history.map((val, i) => (
                                <span
                                  key={i}
                                  className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black text-white ${
                                    val >= 10 ? "bg-emerald-600" : val >= 8 ? "bg-teal-600" : "bg-slate-500"
                                  }`}
                                  title={`${val} córners reales`}
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
                          No se encontraron registros de córners para partidos previos de este equipo.
                        </p>
                      )}
                    </div>

                    {/* Away Team Corner Card */}
                    <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                          ✈️ {prediction.awayTeam}
                        </span>
                        {finalAwayCorners ? (
                          <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[11px] font-black text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            {finalAwayCorners.avgTotal} Córn./part.
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">Sin estadísticas</span>
                        )}
                      </div>
                      {finalAwayCorners ? (
                        <>
                          <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] mt-3">
                            <div className="rounded-xl bg-white p-2 border border-slate-200/80 dark:bg-slate-800/80 dark:border-slate-700">
                              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">A Favor</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs">+{finalAwayCorners.avgFor}</span>
                            </div>
                            <div className="rounded-xl bg-white p-2 border border-slate-200/80 dark:bg-slate-800/80 dark:border-slate-700">
                              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">En Contra</span>
                              <span className="text-rose-500 font-black text-xs">-{finalAwayCorners.avgAgainst}</span>
                            </div>
                            <div className="rounded-xl bg-white p-2 border border-slate-200/80 dark:bg-slate-800/80 dark:border-slate-700">
                              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">% Over 8.5</span>
                              <span className="text-slate-900 dark:text-white font-black text-xs">{finalAwayCorners.over85Rate}%</span>
                            </div>
                          </div>
                          {/* Corner Sequence Pills */}
                          <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5 dark:border-slate-800">
                            <span className="text-[10px] font-bold text-slate-500">Historial real ({finalAwayCorners.history.length} partidos):</span>
                            <div className="flex gap-1.5">
                              {finalAwayCorners.history.map((val, i) => (
                                <span
                                  key={i}
                                  className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black text-white ${
                                    val >= 10 ? "bg-emerald-600" : val >= 8 ? "bg-teal-600" : "bg-slate-500"
                                  }`}
                                  title={`${val} córners reales`}
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
                          No se encontraron registros de córners para partidos previos de este equipo.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Corner View Team Filter Buttons */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Historial Real Partido a Partido
                    </span>
                    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
                      <button
                        onClick={() => setCornerViewTeam("both")}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold cursor-pointer transition ${
                          cornerViewTeam === "both" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Ambos
                      </button>
                      <button
                        onClick={() => setCornerViewTeam("home")}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold cursor-pointer transition ${
                          cornerViewTeam === "home" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        🏠 {prediction.homeTeam.split(" ")[0]}
                      </button>
                      <button
                        onClick={() => setCornerViewTeam("away")}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold cursor-pointer transition ${
                          cornerViewTeam === "away" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        ✈️ {prediction.awayTeam.split(" ")[0]}
                      </button>
                    </div>
                  </div>

                  {/* Home Match Breakdown in Corners Tab */}
                  {(cornerViewTeam === "both" || cornerViewTeam === "home") && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 block">
                        🏠 {prediction.homeTeam} • Córners en sus partidos recientes:
                      </span>
                      {homeLast5List.map((m, idx) => (
                        <div
                          key={`home-c-${idx}`}
                          className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-16">{m.date}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {m.isHome ? `vs ${m.opponent}` : `@ ${m.opponent}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {m.totalCorners !== undefined && m.totalCorners !== null ? (
                              <>
                                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  Favor: {m.teamCorners ?? 0} • Contra: {m.opponentCorners ?? 0}
                                </span>
                                <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs text-slate-900 dark:bg-slate-800 dark:text-white">
                                  🚩 {m.totalCorners} Córners
                                </span>
                                {m.totalCorners > 8.5 && (
                                  <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                                    +8.5 ✓
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">Sin registro oficial</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Away Match Breakdown in Corners Tab */}
                  {(cornerViewTeam === "both" || cornerViewTeam === "away") && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 block">
                        ✈️ {prediction.awayTeam} • Córners en sus partidos recientes:
                      </span>
                      {awayLast5List.map((m, idx) => (
                        <div
                          key={`away-c-${idx}`}
                          className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-16">{m.date}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {m.isHome ? `vs ${m.opponent}` : `@ ${m.opponent}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {m.totalCorners !== undefined && m.totalCorners !== null ? (
                              <>
                                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                  Favor: {m.teamCorners ?? 0} • Contra: {m.opponentCorners ?? 0}
                                </span>
                                <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs text-slate-900 dark:bg-slate-800 dark:text-white">
                                  🚩 {m.totalCorners} Córners
                                </span>
                                {m.totalCorners > 8.5 && (
                                  <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                                    +8.5 ✓
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">Sin registro oficial</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* H2H Corners List if available */}
                  {h2hList.some((c) => c.totalCorners !== undefined) && (
                    <div className="space-y-2 border-t border-slate-200/60 pt-3 dark:border-slate-800">
                      <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 block">
                        ⚔️ Córners en Enfrentamientos Directos Recientes (H2H):
                      </span>
                      {h2hList.filter((c) => c.totalCorners !== undefined).map((c, idx) => (
                        <div
                          key={`h2h-c-${idx}`}
                          className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-200 text-xs dark:bg-slate-900/80 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-16">{c.date}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {c.homeTeam} ({c.homeCorners}) vs {c.awayTeam} ({c.awayCorners})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-slate-200 px-2 py-0.5 font-black text-xs text-slate-900 dark:bg-slate-800 dark:text-white">
                              🚩 {c.totalCorners} Córners Totales
                            </span>
                            {c.totalCorners! > 8.5 && (
                              <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                                +8.5 ✓
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quantitative Projection Card */}
                  <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-4 border border-emerald-500/20 dark:border-emerald-500/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase">
                        <span>🎯</span>
                        <span>Proyección del Modelo Matemático de Córners</span>
                      </div>
                      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                        Poisson / Monte Carlo
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                      Córners Esperados: <strong>~{prediction.cornerAnalysis?.expectedTotalCorners ? prediction.cornerAnalysis.expectedTotalCorners.toFixed(1) : (finalHomeCorners && finalAwayCorners ? ((finalHomeCorners.avgTotal + finalAwayCorners.avgTotal) / 2).toFixed(1) : "10.0")} Totales</strong> (Local: ~{prediction.cornerAnalysis?.expectedHomeCorners ? prediction.cornerAnalysis.expectedHomeCorners.toFixed(1) : (finalHomeCorners ? finalHomeCorners.avgFor.toFixed(1) : "5.5")} | Visita: ~{prediction.cornerAnalysis?.expectedAwayCorners ? prediction.cornerAnalysis.expectedAwayCorners.toFixed(1) : (finalAwayCorners ? finalAwayCorners.avgFor.toFixed(1) : "4.5")}).
                    </p>
                  </div>
                </div>
              )}

              {/* 5. Stats & Elo Analysis */}
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
            Pronóstico: <strong className="text-emerald-700 dark:text-emerald-400">{prediction.market}</strong> (@{(prediction.odds ?? 1.5).toFixed(2)})
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
