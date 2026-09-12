"use client";

function getEcuadorDateString(d: Date | number | string = Date.now()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d));
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

import React, { useState, useEffect } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { SUPPORTED_LEAGUES, SupportedLeague } from "@/lib/sports/api-football";
import { PredictionCard } from "./PredictionCard";

interface McpCountryAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrediction?: (prediction: MarketOpportunity) => void;
}

interface AiAgentAnalysis {
  intent: string;
  summary: string;
  insights: string[];
  recommendation: string;
  parlayRecommendation?: {
    totalOdds: string;
    combinedProbability: string;
    selectionsCount: number;
    legs: {
      match: string;
      market: string;
      selection: string;
      odds: number;
    }[];
  };
}

interface QuickChip {
  id: string;
  label: string;
  icon: string;
  query: string;
  leagueId?: number;
  league?: string;
  country?: string;
}

const QUICK_CHIPS: QuickChip[] = [
  { id: "champions", label: "Champions League", icon: "🏆", query: "Pronósticos de UEFA Champions League", leagueId: 2, league: "UEFA Champions League", country: "Europa" },
  { id: "europa", label: "Europa League", icon: "🇪🇺", query: "Pronósticos de UEFA Europa League", leagueId: 3, league: "UEFA Europa League", country: "Europa" },
  { id: "premier", label: "Premier League", icon: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", query: "Pronósticos de Premier League", leagueId: 39, league: "Premier League", country: "Inglaterra" },
  { id: "laliga", label: "La Liga", icon: "🇪🇸", query: "Pronósticos de La Liga España", leagueId: 140, league: "La Liga", country: "España" },
  { id: "seriea", label: "Serie A", icon: "🇮🇹", query: "Pronósticos de Serie A Italia", leagueId: 135, league: "Serie A", country: "Italia" },
  { id: "bundesliga", label: "Bundesliga", icon: "🇩🇪", query: "Pronósticos de Bundesliga Alemania", leagueId: 78, league: "Bundesliga", country: "Alemania" },
  { id: "ligue1", label: "Ligue 1", icon: "🇫🇷", query: "Pronósticos de Ligue 1 Francia", leagueId: 61, league: "Ligue 1", country: "Francia" },
  { id: "brasileirao", label: "Brasileirão", icon: "🇧🇷", query: "Pronósticos de Brasileirão Série A", leagueId: 71, league: "Brasileirão Série A", country: "Brasil" },
  { id: "argentina", label: "Liga Argentina", icon: "🇦🇷", query: "Pronósticos de Liga Profesional Argentina", leagueId: 128, league: "Liga Profesional Argentina", country: "Argentina" },
  { id: "mls", label: "MLS (USA)", icon: "🇺🇸", query: "Pronósticos de Major League Soccer MLS", leagueId: 253, league: "Major League Soccer (MLS)", country: "Estados Unidos" },
  { id: "ecuador", label: "Liga Pro Ecuador", icon: "🇪🇨", query: "Pronósticos de Liga Pro Ecuador", leagueId: 242, league: "Liga Pro", country: "Ecuador" },
  { id: "saudi", label: "Saudi Pro League", icon: "🇸🇦", query: "Pronósticos de Saudi Pro League", leagueId: 307, league: "Saudi Pro League", country: "Arabia Saudita" },
  { id: "sudamericana", label: "Copa Sudamericana", icon: "🌎", query: "Pronósticos de Copa Sudamericana", leagueId: 11, league: "Copa Sudamericana", country: "Sudamérica" },
  { id: "libertadores", label: "Copa Libertadores", icon: "🌎", query: "Pronósticos de Copa Libertadores", leagueId: 13, league: "Copa Libertadores", country: "Sudamérica" },
  { id: "local_value", label: "Ganador Local (+60%)", icon: "🎯", query: "Pronósticos de Ganador Local con probabilidad superior al 60% y cuota de valor" },
  { id: "parlay_top", label: "Parlay del Día", icon: "🔥", query: "Crea una combinada parlay segura de 2 o 3 selecciones de alto valor" },
];

export function McpCountryAgentModal({ isOpen, onClose, onSelectPrediction }: McpCountryAgentModalProps) {
  const [query, setQuery] = useState("");
  const [selectedChip, setSelectedChip] = useState<string>("champions");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MarketOpportunity[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AiAgentAnalysis | null>(null);
  const [metrics, setMetrics] = useState<{
    totalMatches: number;
    averageProbability: string;
    averageOdds: string;
    highConfidenceCount: number;
  } | null>(null);
  const [searched, setSearched] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<Set<string | number>>(new Set());
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);

  // Default search on open
  useEffect(() => {
    if (isOpen) {
      handleSearch({
        customQuery: "Pronósticos de UEFA Champions League",
        chipId: "champions",
        leagueId: 2,
        league: "UEFA Champions League",
        country: "Europa",
      });
    }
  }, [isOpen]);

  const handleSearch = async (opts?: {
    customQuery?: string;
    chipId?: string;
    leagueId?: number;
    league?: string;
    country?: string;
  }) => {
    const activeQuery = opts?.customQuery !== undefined ? opts.customQuery : query;
    if (opts?.chipId) setSelectedChip(opts.chipId);

    let effectiveLeagueId = opts?.leagueId;
    let effectiveLeague = opts?.league;
    let effectiveCountry = opts?.country;

    if (!effectiveLeagueId && selectedLeagueId && selectedLeagueId !== "all") {
      effectiveLeagueId = Number(selectedLeagueId);
      const foundL = SUPPORTED_LEAGUES.find((l) => l.id === effectiveLeagueId);
      if (foundL) {
        effectiveLeague = foundL.name;
        effectiveCountry = foundL.country;
      }
    }

    setLoading(true);
    setSearched(true);
    setPublishSuccessMessage(null);

    try {
      const res = await fetch("/api/mcp/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: activeQuery,
          leagueId: effectiveLeagueId,
          league: effectiveLeague,
          country: effectiveCountry,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.predictions || []);
        setMetrics(data.metrics || null);
        setAiAnalysis(data.aiAnalysis || null);
      }
    } catch (err) {
      console.error("MCP Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (chip: QuickChip) => {
    setSelectedChip(chip.id);
    if (chip.leagueId) {
      setSelectedLeagueId(String(chip.leagueId));
    } else {
      setSelectedLeagueId("all");
    }
    setQuery(chip.query);
    handleSearch({
      customQuery: chip.query,
      chipId: chip.id,
      leagueId: chip.leagueId,
      league: chip.league,
      country: chip.country,
    });
  };

  const handleLeagueDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedLeagueId(val);
    setSelectedChip("");

    if (val === "all") {
      handleSearch({ customQuery: query || "Pronósticos de fútbol y cuotas de valor" });
    } else {
      const lid = Number(val);
      const foundL = SUPPORTED_LEAGUES.find((l) => l.id === lid);
      if (foundL) {
        const customQ = `Pronósticos de ${foundL.name} (${foundL.country})`;
        setQuery(customQ);
        handleSearch({
          customQuery: customQ,
          leagueId: lid,
          league: foundL.name,
          country: foundL.country,
        });
      }
    }
  };

  const handlePublishPicks = async (picksToPublish: MarketOpportunity[], successMsg?: string, isParlay = false) => {
    if (picksToPublish.length === 0) return;
    try {
      setPublishing(true);

      const taggedPicks = picksToPublish.map((p) => ({
        ...p,
        isMcpPick: true,
        isMcp: true,
        source: "mcp" as const,
        pickBadge: (p.pickBadge || "mcp") as "bomba" | "valor" | "estandar" | "mcp",
      }));

      // Store in localStorage for client instant merge (strictly today)
      if (typeof window !== "undefined") {
        const todayDateStr = getEcuadorDateString(Date.now());
        const localRaw = localStorage.getItem("smartbetbot_published_picks");
        const existing: MarketOpportunity[] = localRaw ? JSON.parse(localRaw) : [];
        const map = new Map<string, MarketOpportunity>();
        for (const p of [...existing, ...taggedPicks]) {
          const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
          if (pDate === todayDateStr) {
            const key = `${p.fixtureId || 0}-${p.homeTeam}-${p.awayTeam}-${p.market}`;
            map.set(key, p);
          }
        }
        localStorage.setItem("smartbetbot_published_picks", JSON.stringify(Array.from(map.values())));

        if (isParlay && aiAnalysis?.parlayRecommendation) {
          localStorage.setItem(
            "smartbetbot_published_parlay",
            JSON.stringify({
              ...aiAnalysis.parlayRecommendation,
              date: new Date().toISOString(),
              picks: taggedPicks,
            })
          );
        }
      }

      // Sync with server snapshot
      const res = await fetch("/api/mcp/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          picks: taggedPicks,
          parlay: isParlay ? aiAnalysis?.parlayRecommendation : null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPublishSuccessMessage(successMsg || data.message || `✓ ¡${taggedPicks.length} pronósticos publicados con éxito en el Dashboard!`);
        
        const newPublished = new Set(publishedIds);
        taggedPicks.forEach((p) => {
          const key = `${p.fixtureId || 0}-${p.homeTeam}-${p.awayTeam}-${p.market}`;
          newPublished.add(key);
        });
        setPublishedIds(newPublished);

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("predictions-updated"));
        }
      }
    } catch (err) {
      console.error("Error publishing picks:", err);
      setPublishSuccessMessage("⚠️ Ocurrió un error al publicar las alertas.");
    } finally {
      setPublishing(false);
      setTimeout(() => setPublishSuccessMessage(null), 5000);
    }
  };

  const handlePublishSinglePick = (prediction: MarketOpportunity) => {
    handlePublishPicks([prediction], `✓ ¡Pronóstico ${prediction.homeTeam} vs ${prediction.awayTeam} publicado en el Dashboard!`);
  };

  if (!isOpen) return null;

  const isParlayActive = Boolean(aiAnalysis?.parlayRecommendation);

  // Group supported leagues for the dropdown
  const topLeagues = SUPPORTED_LEAGUES.filter((l) => l.category === "top5" || l.category === "cups");
  const americasLeagues = SUPPORTED_LEAGUES.filter((l) => l.category === "americas");
  const otherEuropeanLeagues = SUPPORTED_LEAGUES.filter((l) => l.category === "europe_mid");
  const secondDivLeagues = SUPPORTED_LEAGUES.filter((l) => l.category === "second_divisions");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-xl shadow-lg shadow-purple-600/30 text-white">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Agente MCP de Inteligencia Cuantitativa
                </h3>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                  ⚡ Pre-Match • Cuotas Reales Bet365/Pinnacle
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Filtros por ligas oficiales, pronósticos antes del inicio y modelado matemático
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Success Banner Notification */}
        {publishSuccessMessage && (
          <div className="bg-emerald-600 px-5 py-2.5 text-xs font-black text-white flex items-center justify-between shadow-md animate-in slide-in-from-top duration-300">
            <span className="flex items-center gap-2">
              <span>🚀</span>
              <span>{publishSuccessMessage}</span>
            </span>
            <button
              onClick={() => setPublishSuccessMessage(null)}
              className="text-white/80 hover:text-white font-bold text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Quick Access Chips Bar */}
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Acceso Rápido por Ligas Oficiales & Estrategias:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CHIPS.map((c) => {
                const isSelected = selectedChip === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleChipClick(c)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                      isSelected
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 scale-105"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span>{c.icon}</span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* League Dropdown Selector & Freeform Search Bar */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* League Selector Dropdown */}
              <div className="flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800 shrink-0">
                <span className="text-xs font-bold text-slate-500">🏆 Liga:</span>
                <select
                  value={selectedLeagueId}
                  onChange={handleLeagueDropdownChange}
                  aria-label="Seleccionar liga oficial"
                  className="bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="all" className="dark:bg-slate-900">🌐 Todas las Ligas Oficiales</option>
                  <optgroup label="Top Ligas Europeas & Copas" className="dark:bg-slate-900">
                    {topLeagues.map((l) => (
                      <option key={l.id} value={l.id} className="dark:bg-slate-900">
                        {l.name} ({l.country})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Américas & Conmebol" className="dark:bg-slate-900">
                    {americasLeagues.map((l) => (
                      <option key={l.id} value={l.id} className="dark:bg-slate-900">
                        {l.name} ({l.country})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Otras Ligas Principales de Europa" className="dark:bg-slate-900">
                    {otherEuropeanLeagues.map((l) => (
                      <option key={l.id} value={l.id} className="dark:bg-slate-900">
                        {l.name} ({l.country})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Segundas Divisiones de Élite" className="dark:bg-slate-900">
                    {secondDivLeagues.map((l) => (
                      <option key={l.id} value={l.id} className="dark:bg-slate-900">
                        {l.name} ({l.country})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Freeform Prompt Search Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch();
                }}
                className="flex items-center gap-2 flex-1"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ej: Ganador local con cuota superior a 1.50 en Premier League..."
                    className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-4 pr-10 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  <span>{loading ? "🔄" : "🔍"}</span>
                  <span className="hidden sm:inline">{loading ? "Buscando..." : "Buscar"}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Summary Metrics Banner */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
              <div className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-500">Partidos Próximos</div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  {metrics.totalMatches}
                </div>
              </div>
              <div className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-500">Probabilidad Media</div>
                <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {metrics.averageProbability}
                </div>
              </div>
              <div className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-500">Cuota Media</div>
                <div className="text-base font-black text-sky-600 dark:text-sky-400 mt-0.5">
                  {metrics.averageOdds}
                </div>
              </div>
              <div className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-500">Alta Convicción</div>
                <div className="text-base font-black text-purple-600 dark:text-purple-400 mt-0.5">
                  {metrics.highConfidenceCount}
                </div>
              </div>
            </div>
          )}

          {/* AI Intelligence Briefing Box */}
          {aiAnalysis && (
            <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/50 p-4 dark:border-purple-900/40 dark:from-purple-950/20 dark:via-slate-900 dark:to-indigo-950/20 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-2.5 dark:border-purple-900/30">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <span className="text-xs font-black text-purple-950 dark:text-purple-200 uppercase tracking-wider">
                    {aiAnalysis.intent}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2.5 py-0.5 rounded-full">
                  Líneas Reales Bet365 • Pre-Match
                </span>
              </div>

              {/* Briefing Summary */}
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                {aiAnalysis.summary}
              </p>

              {/* Tactical Insights & Risk Warnings */}
              {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Puntos Clave y Evaluación Cuantitativa:
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 text-xs">
                    {aiAnalysis.insights.map((insight, idx) => {
                      const isRisk = insight.toLowerCase().includes("riesgo") || insight.toLowerCase().includes("atención") || insight.toLowerCase().includes("cautela") || insight.toLowerCase().includes("alerta");
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 rounded-xl p-2.5 border text-xs font-medium ${
                            isRisk
                              ? "bg-amber-50/80 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50"
                              : "bg-white/80 text-slate-800 border-slate-200/80 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span className="shrink-0 text-sm">{isRisk ? "⚠️" : "✦"}</span>
                          <span className="leading-snug">{insight}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recommended Bankroll Strategy */}
              {aiAnalysis.recommendation && (
                <div className="flex items-center gap-2.5 rounded-xl bg-purple-500/10 p-2.5 border border-purple-500/20 text-xs font-bold text-purple-900 dark:text-purple-300">
                  <span className="text-base shrink-0">💡</span>
                  <div>
                    <span className="font-black text-purple-800 dark:text-purple-200 uppercase text-[10px] block">
                      Recomendación de Bankroll & Gestión de Riesgo:
                    </span>
                    <span className="font-semibold text-xs leading-snug">
                      {aiAnalysis.recommendation}
                    </span>
                  </div>
                </div>
              )}

              {/* Parlay Preview & Publishing Action Button */}
              {aiAnalysis.parlayRecommendation && (
                <div className="rounded-2xl bg-slate-900 text-white p-4 border border-slate-800 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="text-amber-400 flex items-center gap-1.5 text-sm">
                      <span>🔥</span> Combinada Parlay Descubierta
                    </span>
                    <span className="bg-amber-500/20 text-amber-300 px-3 py-1 rounded-xl border border-amber-500/40 text-sm font-black">
                      Cuota Total: @{aiAnalysis.parlayRecommendation.totalOdds}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {aiAnalysis.parlayRecommendation.legs.map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-200 py-1 border-b border-slate-800/80 last:border-none">
                        <span className="font-bold">• {l.match} <span className="text-slate-400 font-normal">({l.market})</span></span>
                        <span className="font-black text-emerald-400">@{l.odds}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-400">
                      Probabilidad combinada: <span className="text-emerald-400 font-black">{aiAnalysis.parlayRecommendation.combinedProbability}</span>
                    </div>

                    <button
                      onClick={() => handlePublishPicks(results, `✓ ¡Combinada Parlay de ${results.length} selecciones (@${aiAnalysis?.parlayRecommendation?.totalOdds}) publicada en el Dashboard y la Sección Parlay!`, true)}
                      disabled={publishing}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 py-2.5 text-xs font-black text-slate-950 hover:brightness-110 shadow-lg shadow-amber-500/30 transition cursor-pointer disabled:opacity-50"
                    >
                      <span>{publishing ? "⏳" : "🚀"}</span>
                      <span>{publishing ? "Publicando..." : "Publicar Parlay en Dashboard"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results List */}
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              <div className="text-2xl animate-spin mb-2">🔄</div>
              <p className="text-xs font-bold">El Agente MCP está consultando cuotas reales de Bet365 para partidos próximos a iniciar...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                <span>Nuevos pronósticos pre-match descubiertos ({results.length}):</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePublishPicks(results)}
                    disabled={publishing}
                    className="flex items-center gap-1.5 rounded-xl bg-purple-600/10 hover:bg-purple-600 px-3 py-1.5 text-xs font-black text-purple-700 hover:text-white dark:text-purple-300 dark:hover:text-white border border-purple-500/30 transition cursor-pointer disabled:opacity-50"
                  >
                    <span>📤</span>
                    <span>{publishing ? "Publicando..." : "Publicar Todo al Dashboard"}</span>
                  </button>
                  <span className="text-emerald-600 dark:text-emerald-400 hidden sm:inline">100% Cuotas Reales</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {results.map((pick) => {
                  const pickKey = `${pick.fixtureId || 0}-${pick.homeTeam}-${pick.awayTeam}-${pick.market}`;
                  const isAlreadyPublished = publishedIds.has(pickKey);
                  const isExpanded = expandedCardKey === pickKey;
                  const formattedTime = new Date(pick.kickoff).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const formattedDate = new Date(pick.kickoff).toLocaleDateString("es-ES", {
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <div
                      key={pickKey}
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition-all duration-200 hover:border-purple-500/50 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90"
                    >
                      <div>
                        {/* Header: League, Kickoff Time & Badges */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800/80 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                              <span>🏆</span>
                              <span className="truncate">{pick.league}</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              📅 {formattedDate} • ⏰ {formattedTime}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="rounded-lg px-2 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              🕒 PRE
                            </span>
                            <span className="rounded-lg px-2 py-0.5 text-[9px] font-black bg-purple-600 text-white shadow-xs">
                              🤖 MCP
                            </span>
                            {pick.pickBadge === "bomba" && (
                              <span className="rounded-lg px-2 py-0.5 text-[9px] font-black bg-rose-500 text-white animate-pulse">
                                💣 BOMBA
                              </span>
                            )}
                            {pick.pickBadge === "valor" && (
                              <span className="rounded-lg px-2 py-0.5 text-[9px] font-black bg-emerald-500 text-slate-950 font-extrabold">
                                💎 VALOR
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Teams */}
                        <div className="mt-2.5 rounded-xl bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80">
                          <div className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                            {pick.homeTeam}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400 my-0.5">vs</div>
                          <div className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                            {pick.awayTeam}
                          </div>
                        </div>

                        {/* Pronóstico Box */}
                        <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase text-purple-700 dark:text-purple-300">
                            <span>🎯 PRONÓSTICO SUGERIDO</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold lowercase">
                              +{pick.edge}% edge
                            </span>
                          </div>

                          <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                            {pick.market} <span className="text-purple-600 dark:text-purple-400 font-bold">({pick.selection})</span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                            <div className="rounded-lg bg-white p-1.5 border border-purple-100 dark:bg-slate-900 dark:border-purple-900/40">
                              <div className="text-[9px] text-slate-400 font-bold">Cuota {pick.bookmaker || "Bet365"}</div>
                              <div className="text-xs font-black text-purple-600 dark:text-purple-400">@{(pick.odds ?? 1.5).toFixed(2)}</div>
                            </div>
                            <div className="rounded-lg bg-white p-1.5 border border-purple-100 dark:bg-slate-900 dark:border-purple-900/40">
                              <div className="text-[9px] text-slate-400 font-bold">Probabilidad</div>
                              <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">{pick.probability}%</div>
                            </div>
                            <div className="rounded-lg bg-white p-1.5 border border-purple-100 dark:bg-slate-900 dark:border-purple-900/40">
                              <div className="text-[9px] text-slate-400 font-bold">SmartScore</div>
                              <div className="text-xs font-black text-sky-600 dark:text-sky-400">{pick.smartScore || 85}/100</div>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Detailed Metrics */}
                        {isExpanded && (
                          <div className="mt-3 space-y-2.5 rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 animate-fadeIn">
                            {pick.explanation && (
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white block text-[11px] mb-0.5">
                                  🧠 Análisis Cuantitativo:
                                </span>
                                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                                  {pick.explanation}
                                </p>
                              </div>
                            )}

                            {/* Home vs Away Form */}
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 dark:border-slate-800 text-[10px]">
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white block truncate">{pick.homeTeam} (Últ. 5):</span>
                                <div className="flex gap-1 mt-0.5">
                                  {(pick.homeLast5 || ["W", "W", "D", "W", "L"]).map((res, i) => {
                                    const r = typeof res === "string" ? res : (res?.result || "W");
                                    return (
                                      <span key={i} className={`w-4 h-4 flex items-center justify-center rounded-sm font-black text-[9px] ${r === "W" ? "bg-emerald-500 text-slate-950" : r === "D" ? "bg-amber-500 text-slate-950" : "bg-rose-500 text-white"}`}>
                                        {r}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white block truncate">{pick.awayTeam} (Últ. 5):</span>
                                <div className="flex gap-1 mt-0.5">
                                  {(pick.awayLast5 || ["W", "D", "L", "W", "D"]).map((res, i) => {
                                    const r = typeof res === "string" ? res : (res?.result || "W");
                                    return (
                                      <span key={i} className={`w-4 h-4 flex items-center justify-center rounded-sm font-black text-[9px] ${r === "W" ? "bg-emerald-500 text-slate-950" : r === "D" ? "bg-amber-500 text-slate-950" : "bg-rose-500 text-white"}`}>
                                        {r}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                        <button
                          onClick={() => setExpandedCardKey(isExpanded ? null : pickKey)}
                          className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition cursor-pointer"
                        >
                          <span>{isExpanded ? "▲ Ocultar Métricas" : "▼ Ver Métricas & H2H"}</span>
                        </button>

                        <button
                          onClick={() => handlePublishSinglePick(pick)}
                          disabled={isAlreadyPublished || publishing}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                            isAlreadyPublished
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-purple-600 hover:bg-purple-500 text-white shadow-xs shadow-purple-600/20"
                          }`}
                        >
                          <span>{isAlreadyPublished ? "✓" : "📤"}</span>
                          <span>{isAlreadyPublished ? "Publicado en Dashboard" : "Publicar Alerta"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : searched ? (
            <div className="py-10 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 p-6 border border-slate-200 dark:border-slate-800">
              <div className="text-3xl mb-2">🔎</div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                No se encontraron partidos pendientes de iniciar para este filtro
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Los encuentros de esta jornada ya iniciaron o finalizaron. Selecciona otra liga en el menú desplegable o consulta la siguiente jornada.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <span className="text-[11px] font-bold text-slate-500">
            SmartBetBot MCP Assistant • 100% Cuotas Reales Bet365/Pinnacle
          </span>
          <div className="flex items-center gap-2">
            {results.length > 0 && !isParlayActive && (
              <button
                onClick={() => handlePublishPicks(results)}
                disabled={publishing}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white hover:bg-purple-500 transition cursor-pointer disabled:opacity-50 shadow-md shadow-purple-600/20"
              >
                {publishing ? "Publicando..." : "Publicar Alertas"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
