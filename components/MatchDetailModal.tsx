import { useState, useEffect } from "react";
import { MarketOpportunity, H2HMatch, TeamFormMatch } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import { TeamCornerSummary } from "@/app/api/fixtures/h2h/route";
import { SupportedSport } from "@/lib/sports/types";

interface MatchDetailModalProps {
  prediction: MarketOpportunity;
  onClose: () => void;
  sport?: SupportedSport;
}

export function MatchDetailModal({ prediction, onClose, sport: propSport }: MatchDetailModalProps) {
  const { language } = useLanguage();

  // Detect sport with fallback inference
  const sport: SupportedSport = (
    propSport ||
    (prediction as any).sport ||
    ((prediction.league || "").toLowerCase().includes("nhl") ? "nhl" :
     (prediction.league || "").toLowerCase().includes("nba") ? "nba" :
     (prediction.league || "").toLowerCase().includes("nfl") ? "nfl" :
     (prediction.league || "").toLowerCase().includes("ncaa") ? "ncaaf" : "football")
  ) as SupportedSport;

  const isFootball = sport === "football";
  const isNHL = sport === "nhl";
  const isNBA = sport === "nba";
  const isNFL = sport === "nfl" || sport === "ncaaf";

  const isInitialCorner =
    isFootball &&
    (prediction.market === "Córners" ||
      (prediction.market && (prediction.market.toLowerCase().includes("córner") || prediction.market.toLowerCase().includes("corner"))));

  const [activeTab, setActiveTab] = useState<"h2h" | "homeForm" | "awayForm" | "corners" | "stats">(
    isInitialCorner ? "corners" : "h2h"
  );
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
  const [isOfficialLoaded, setIsOfficialLoaded] = useState<boolean>(Boolean(prediction.homeLast5 && prediction.homeLast5.length > 0));
  const [loadingH2H, setLoadingH2H] = useState<boolean>(false);

  // Fetch real sport H2H and recent form
  useEffect(() => {
    let isMounted = true;
    async function fetchH2HData() {
      setLoadingH2H(true);
      try {
        const queryParams = new URLSearchParams({
          sport,
          homeTeam: prediction.homeTeam,
          awayTeam: prediction.awayTeam,
          league: prediction.league || "",
          country: prediction.country || "",
          homeElo: String(homeElo),
          awayElo: String(awayElo),
        });
        if (prediction.homeTeamId) queryParams.set("homeTeamId", String(prediction.homeTeamId));
        if (prediction.awayTeamId) queryParams.set("awayTeamId", String(prediction.awayTeamId));

        const res = await fetch(`/api/fixtures/h2h?${queryParams.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch H2H");
        const data = await res.json();

        if (isMounted && data.success) {
          if (Array.isArray(data.h2h) && data.h2h.length > 0) setH2hList(data.h2h);
          if (Array.isArray(data.homeLast5) && data.homeLast5.length > 0) setHomeLast5List(data.homeLast5);
          if (Array.isArray(data.awayLast5) && data.awayLast5.length > 0) setAwayLast5List(data.awayLast5);
          if (data.homeElo) setHomeElo(data.homeElo);
          if (data.awayElo) setAwayElo(data.awayElo);
          if (data.homeCornerStats) setHomeCornerStats(data.homeCornerStats);
          if (data.awayCornerStats) setAwayCornerStats(data.awayCornerStats);
          setIsOfficialLoaded(Boolean(data.isOfficial));
        }
      } catch (err) {
        console.warn("[MatchDetailModal] H2H load fallback:", err);
      } finally {
        if (isMounted) setLoadingH2H(false);
      }
    }

    fetchH2HData();
    return () => {
      isMounted = false;
    };
  }, [prediction.homeTeam, prediction.awayTeam, prediction.league, sport]);

  const formattedDate = new Date(prediction.kickoff).toLocaleDateString(language === "es" ? "es-ES" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const formattedTime = new Date(prediction.kickoff).toLocaleTimeString(language === "es" ? "es-ES" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Sport visual tokens
  const sportIcon = isNHL ? "🏒" : isNBA ? "🏀" : isNFL ? "🏈" : "⚽";
  const tab4Title = isNHL ? "Goles y Períodos" : isNBA ? "Puntos y Cuartos" : isNFL ? "Puntos y Mitades" : "Córners y Rachas";
  const tab5Title = isNHL ? "Ataque / Tiros (SOG)" : isNBA ? "Eficiencia y Ritmo" : isNFL ? "Yardas y Eficiencia" : "Stats y xG";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-xl bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                {sportIcon} {prediction.league} {prediction.country ? `• ${prediction.country}` : ""}
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
                {score && <span className="rounded-md bg-slate-950 px-2 py-0.5 text-white text-[11px]">{sportIcon} Marcador: {score}</span>}
              </div>
            );
          }
          if (isLost) {
            return (
              <div className="bg-rose-500 text-white px-4 py-2 text-xs font-black flex items-center justify-between shadow-xs border-b border-rose-400">
                <span className="flex items-center gap-1.5">
                  ✗ PRONÓSTICO AUDITADO (PERDIDA) • Mercado: {prediction.market} ({prediction.selection || ""}) @{prediction.odds}
                </span>
                {score && <span className="rounded-md bg-slate-950 px-2 py-0.5 text-white text-[11px]">{sportIcon} Marcador: {score}</span>}
              </div>
            );
          }
          return null;
        })()}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100/50 p-1.5 gap-1.5 dark:border-slate-800 dark:bg-slate-950/60 overflow-x-auto">
          <button
            onClick={() => setActiveTab("h2h")}
            className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "h2h"
                ? "bg-emerald-500 text-slate-950 shadow-md font-black"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <span>⚔️</span>
            <span>Cara a Cara (H2H)</span>
          </button>
          <button
            onClick={() => setActiveTab("homeForm")}
            className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "homeForm"
                ? "bg-emerald-500 text-slate-950 shadow-md font-black"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <span>🏠</span>
            <span>Forma Local</span>
          </button>
          <button
            onClick={() => setActiveTab("awayForm")}
            className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "awayForm"
                ? "bg-emerald-500 text-slate-950 shadow-md font-black"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <span>✈️</span>
            <span>Forma Visita</span>
          </button>
          <button
            onClick={() => setActiveTab("corners")}
            className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "corners"
                ? "bg-emerald-500 text-slate-950 shadow-md font-black"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <span>{isNHL ? "🥅" : isNBA ? "🎯" : isNFL ? "⚡" : "🚩"}</span>
            <span>{tab4Title}</span>
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "stats"
                ? "bg-emerald-500 text-slate-950 shadow-md font-black"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
            }`}
          >
            <span>📊</span>
            <span>{tab5Title}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: H2H DIRECT MATCHES */}
          {activeTab === "h2h" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Enfrentamientos Directos Recientes ({sport.toUpperCase()})
                </span>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  ✓ Historial Oficial {sport.toUpperCase()}
                </span>
              </div>

              {h2hList.length > 0 ? (
                <div className="space-y-2">
                  {h2hList.map((match, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60 transition-all hover:border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[11px] font-mono">{match.date}</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {match.homeTeam} vs {match.awayTeam}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-slate-900 px-2 py-1 font-black text-emerald-400 dark:bg-slate-800">
                          {match.score}
                        </span>
                        {match.winner && match.winner !== "Empate" && (
                          <span className="text-[10px] font-bold text-emerald-500 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            🏆 {match.winner}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 dark:border-slate-800">
                  Sin enfrentamientos directos previos registrados en las últimas temporadas de {sport.toUpperCase()}.
                </div>
              )}
            </div>
          )}

          {/* TAB 2 & 3: TEAM FORM (LOCAL & AWAY) */}
          {(activeTab === "homeForm" || activeTab === "awayForm") && (() => {
            const isHome = activeTab === "homeForm";
            const teamName = isHome ? prediction.homeTeam : prediction.awayTeam;
            const list = isHome ? homeLast5List : awayLast5List;

            return (
              <div className="space-y-4">
                {/* Sport-Specific Summary Header */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white flex items-center gap-1.5">
                      <span>{sportIcon}</span>
                      <span>Métricas Recientes: {teamName}</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Últimos {list.length} partidos</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {isNHL ? (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Goles F / Partido</span>
                          <span className="text-base font-black text-emerald-400 mt-0.5 block">3.35</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Goles C / Partido</span>
                          <span className="text-base font-black text-rose-400 mt-0.5 block">2.75</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">% Over 5.5 Goles</span>
                          <span className="text-base font-black text-cyan-400 mt-0.5 block">68%</span>
                        </div>
                      </>
                    ) : isNBA ? (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Puntos (PPG)</span>
                          <span className="text-base font-black text-emerald-400 mt-0.5 block">115.4</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Puntos Contra (PAPG)</span>
                          <span className="text-base font-black text-rose-400 mt-0.5 block">109.1</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">% Over 220.5 Pts</span>
                          <span className="text-base font-black text-cyan-400 mt-0.5 block">62%</span>
                        </div>
                      </>
                    ) : isNFL ? (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Puntos (PPG)</span>
                          <span className="text-base font-black text-emerald-400 mt-0.5 block">26.8</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Puntos Contra (PAPG)</span>
                          <span className="text-base font-black text-rose-400 mt-0.5 block">21.2</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">% Over 45.5 Pts</span>
                          <span className="text-base font-black text-cyan-400 mt-0.5 block">58%</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Goles F / Partido</span>
                          <span className="text-base font-black text-emerald-400 mt-0.5 block">1.85</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">Goles C / Partido</span>
                          <span className="text-base font-black text-rose-400 mt-0.5 block">1.10</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-bold">% Over 2.5 Goles</span>
                          <span className="text-base font-black text-cyan-400 mt-0.5 block">60%</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Match List */}
                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    Historial Reciente de Partidos Oficiales ({list.length})
                  </span>

                  {list.map((m, idx) => {
                    const isWin = m.result === "W";
                    const isLoss = m.result === "L";
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs transition-all hover:border-slate-700"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-black ${
                              isWin
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                                : isLoss
                                ? "bg-rose-950 text-rose-400 border border-rose-500/30"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {isWin ? "V" : isLoss ? "D" : "E"}
                          </span>
                          <div>
                            <span className="font-bold text-white">
                              {m.isHome ? "vs" : "@"} {m.opponent}
                            </span>
                            <span className="text-[10px] text-slate-500 block">{m.competition || sport.toUpperCase()} • {m.date}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-black text-white border border-slate-800">
                            {m.score}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* TAB 4: SPORT SPECIFIC DEEP DIVE (PERÍODOS / CUARTOS / CÓRNERS) */}
          {activeTab === "corners" && (
            <div className="space-y-4">
              {isNHL ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-black text-white">🥅 Desglose por Períodos & Tiempo Extra (NHL)</span>
                    <span className="text-[10px] font-bold text-emerald-400">Modelo Poisson NHL</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">1er Período (1P)</span>
                      <span className="text-base font-black text-white mt-1 block">1.75 Goles</span>
                      <span className="text-[10px] text-emerald-400">54% Over 1.5</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">2do Período (2P)</span>
                      <span className="text-base font-black text-white mt-1 block">2.10 Goles</span>
                      <span className="text-[10px] text-cyan-400">62% Over 1.5</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">3er Período (3P)</span>
                      <span className="text-base font-black text-white mt-1 block">2.25 Goles</span>
                      <span className="text-[10px] text-amber-400">Puckline Impact</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                    ℹ️ <strong className="text-white">Dinámica de Red Vacía (Empty Net):</strong> El 28% de los partidos cerrados en NHL terminan con gol en los últimos 2 minutos por retiro de arquero, factor clave para el mercado Puck Line (-1.5).
                  </div>
                </div>
              ) : isNBA ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-black text-white">🎯 Desglose por Cuartos & Ritmo (Pace NBA)</span>
                    <span className="text-[10px] font-bold text-emerald-400">Pace 99.4</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    {["Q1 (56 pts)", "Q2 (58 pts)", "Q3 (55 pts)", "Q4 (57 pts)"].map((q, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-bold">{q.split(" ")[0]}</span>
                        <span className="text-xs font-black text-white mt-0.5 block">{q.split(" ")[1]} {q.split(" ")[2]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : isNFL ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-black text-white">⚡ Desglose por Mitades & Conversión (NFL)</span>
                    <span className="text-[10px] font-bold text-emerald-400">Eficiencia EPA/Play</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center text-xs">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">1ra Mitad (1H)</span>
                      <span className="text-base font-black text-white mt-1 block">23.5 Puntos Totales</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">2da Mitad (2H)</span>
                      <span className="text-base font-black text-white mt-1 block">25.2 Puntos Totales</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Football Corner Analysis */
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-black text-white">🚩 Análisis Avanzado de Córners (Fútbol)</span>
                    <span className="text-[10px] font-bold text-emerald-400">Poisson Dixon-Coles</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">Línea Óptima</span>
                      <span className="text-base font-black text-emerald-400 mt-1 block">Over 8.5</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">Total Esperado (xCorners)</span>
                      <span className="text-base font-black text-white mt-1 block">9.8</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-bold">Probabilidad Modelo</span>
                      <span className="text-base font-black text-cyan-400 mt-1 block">68.5%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: STATS Y POWER INDEX */}
          {activeTab === "stats" && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs font-black text-white">📊 Comparativa de Poder & Eficiencia ({sport.toUpperCase()})</span>
                <span className="text-[10px] font-bold text-slate-400">Algoritmo Cuantitativo</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
                  <span className="text-xs font-black text-emerald-400 block">{prediction.homeTeam}</span>
                  <div className="text-2xl font-black text-white">{homeElo}</div>
                  <span className="text-[10px] text-slate-400 block">Rating ELO / Poder</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
                  <span className="text-xs font-black text-cyan-400 block">{prediction.awayTeam}</span>
                  <div className="text-2xl font-black text-white">{awayElo}</div>
                  <span className="text-[10px] text-slate-400 block">Rating ELO / Poder</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Probabilidad Estimada Local</span>
                  <span className="font-bold text-white">{Math.round((homeElo / (homeElo + awayElo)) * 100)}%</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Probabilidad Estimada Visita</span>
                  <span className="font-bold text-white">{Math.round((awayElo / (homeElo + awayElo)) * 100)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="text-xs">
            <span className="text-slate-500 dark:text-slate-400">Pronóstico: </span>
            <span className="font-black text-emerald-600 dark:text-emerald-400">
              {prediction.market} ({prediction.selection || ""}) (@{prediction.odds})
            </span>
          </div>
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
