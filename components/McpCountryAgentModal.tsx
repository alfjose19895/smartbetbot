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
import { SupportedSport } from "@/lib/sports/types";
import { getSportMeta } from "@/lib/sports/registry";

interface McpCountryAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrediction?: (prediction: MarketOpportunity) => void;
  sport?: SupportedSport;
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

const FOOTBALL_QUICK_CHIPS: QuickChip[] = [
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
  { id: "local_value", label: "Ganador Local (+60%)", icon: "🎯", query: "Pronósticos de Ganador Local con probabilidad superior al 60% y cuota de valor" },
  { id: "parlay_top", label: "Parlay del Día", icon: "🔥", query: "Crea una combinada parlay segura de 2 o 3 selecciones de alto valor" },
];

const NHL_QUICK_CHIPS: QuickChip[] = [
  { id: "nhl_all", label: "NHL Jornada Hoy", icon: "🏒", query: "Pronósticos de la jornada completa de NHL Hoy" },
  { id: "nhl_moneyline", label: "Moneyline / Ganador", icon: "🎯", query: "Pronósticos de Moneyline NHL incluyendo prórroga OT/SO" },
  { id: "nhl_puck_line", label: "Puck Line (-1.5)", icon: "🥅", query: "Pronósticos de Puck Line con margen de gol vacío y ventaja de tiro" },
  { id: "nhl_over", label: "Over 5.5 / 6.0 Goles", icon: "🚨", query: "Partidos de NHL con alta expectativa de goles xG y Power Play eficiente" },
  { id: "nhl_goalie", label: "Porteros Titulares (GSAx)", icon: "🧤", query: "Partidos con ventaja determinante de portero titular y porcentaje de salvadas" },
  { id: "nhl_parlay", label: "Parlay NHL del Día", icon: "🔥", query: "Crea una combinada parlay NHL de 2 o 3 selecciones de alta probabilidad" },
];

const NBA_QUICK_CHIPS: QuickChip[] = [
  { id: "nba_all", label: "NBA Jornada Hoy", icon: "🏀", query: "Pronósticos de la jornada NBA de Hoy" },
  { id: "nba_spread", label: "Spreads de Valor", icon: "📊", query: "Spreads NBA basados en ritmo de posesiones Pace y rating ofensivo" },
  { id: "nba_totals", label: "Over/Under Puntos", icon: "🎯", query: "Totales de puntos Over/Under en NBA con simulación Monte Carlo" },
  { id: "nba_parlay", label: "Parlay NBA", icon: "🔥", query: "Combinada parlay NBA de alta confianza" },
];

const NFL_QUICK_CHIPS: QuickChip[] = [
  { id: "nfl_all", label: "NFL Jornada", icon: "🏈", query: "Pronósticos de la jornada NFL" },
  { id: "nfl_spread", label: "Spreads Elo NFL", icon: "📈", query: "Spreads NFL basados en Elo ajustado y yardas por jugada" },
  { id: "nfl_totals", label: "Over/Under Puntos", icon: "🎯", query: "Totales de puntos NFL" },
  { id: "nfl_parlay", label: "Parlay NFL", icon: "🔥", query: "Combinada parlay NFL del día" },
];

export function McpCountryAgentModal({ isOpen, onClose, onSelectPrediction, sport = "football" }: McpCountryAgentModalProps) {
  const sportMeta = getSportMeta(sport);
  const quickChips = sport === "nhl" 
    ? NHL_QUICK_CHIPS 
    : sport === "nba" 
    ? NBA_QUICK_CHIPS 
    : (sport === "nfl" || sport === "ncaaf") 
    ? NFL_QUICK_CHIPS 
    : FOOTBALL_QUICK_CHIPS;

  const [query, setQuery] = useState("");
  const [selectedChip, setSelectedChip] = useState<string>(quickChips[0].id);
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
        customQuery: quickChips[0].query,
        chipId: quickChips[0].id,
      });
    }
  }, [isOpen, sport]);

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

    if (!effectiveLeagueId && selectedLeagueId && selectedLeagueId !== "all" && sport === "football") {
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
          sport,
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
      } else {
        setResults([]);
        setMetrics(null);
        setAiAnalysis(null);
      }
    } catch {
      setResults([]);
      setMetrics(null);
      setAiAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePublishPicks = async (picksToPublish: MarketOpportunity[], successMsg?: string, isParlay = false) => {
    if (!picksToPublish || picksToPublish.length === 0) return;
    setPublishing(true);
    setPublishSuccessMessage(null);

    try {
      const taggedPicks = picksToPublish.map((p) => ({
        ...p,
        explanation: `${p.explanation} [Agente MCP: ${aiAnalysis?.intent || "Análisis IA"}]`,
      }));

      const res = await fetch("/api/cron/daily-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          predictions: taggedPicks,
          targetDate: getEcuadorDateString(),
          forceOverwrite: true,
          includeInParlay: isParlay,
        }),
      });

      const data = await res.json();
      if (res.ok && (data.success || data.addedCount !== undefined)) {
        const newPublished = new Set(publishedIds);
        picksToPublish.forEach((p) => { if (p.id) newPublished.add(p.id); });
        setPublishedIds(newPublished);
        setPublishSuccessMessage(successMsg || data.message || `✓ ¡${taggedPicks.length} pronósticos publicados con éxito en el Dashboard!`);
      } else {
        setPublishSuccessMessage(data.error || "No se pudo guardar la publicación");
      }
    } catch {
      setPublishSuccessMessage("Error de conexión al publicar pronósticos.");
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xl font-black text-slate-950 shadow-md">
              🤖
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Agente MCP — {sportMeta.displayName}
                </h2>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  IA Cuantitativa
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Búsquedas en lenguaje natural y filtrado cuantitativo para {sportMeta.displayName}.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Search Bar & Quick Chips */}
        <div className="border-b border-slate-200 p-4 sm:p-6 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Ej: ${quickChips[0].query}...`}
              className="flex-1 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <span>{loading ? "..." : "🔍 Buscar"}</span>
            </button>
          </form>

          {/* Quick Chips */}
          <div className="flex flex-wrap gap-2">
            {quickChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setQuery(chip.query);
                  handleSearch({
                    customQuery: chip.query,
                    chipId: chip.id,
                    leagueId: chip.leagueId,
                    league: chip.league,
                    country: chip.country,
                  });
                }}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  selectedChip === chip.id
                    ? "bg-emerald-500 text-slate-950 shadow-xs font-black"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
                }`}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {publishSuccessMessage && (
            <div className="rounded-2xl bg-emerald-50 p-4 text-xs font-bold text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800">
              {publishSuccessMessage}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[250px] flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Analizando probabilidades y valor cuantitativo para {sportMeta.displayName}...
              </p>
            </div>
          ) : searched && results.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center text-center p-8">
              <span className="text-3xl mb-2">🎯</span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                No se encontraron pronósticos de alto valor para esta consulta
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Prueba seleccionando otro chip de búsqueda rápida o ajusta los términos de búsqueda.
              </p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-4">
              {/* AI Summary Banner */}
              {aiAnalysis && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-slate-700 dark:text-slate-300">
                  <div className="font-bold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                    <span>💡</span>
                    <span>Análisis del Agente Cuantitativo</span>
                  </div>
                  <p className="leading-relaxed">{aiAnalysis.summary}</p>
                </div>
              )}

              {/* Header Action: Publish All */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {results.length} oportunidades encontradas
                </span>
                <button
                  onClick={() => handlePublishPicks(results, `✓ ¡${results.length} pronósticos publicados en el Dashboard!`)}
                  disabled={publishing}
                  className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-black text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                >
                  {publishing ? "Publicando..." : `Publicar Todo (${results.length}) en Dashboard`}
                </button>
              </div>

              {/* Cards Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {results.map((pred) => (
                  <div key={pred.id} className="relative">
                    <PredictionCard
                      prediction={pred}
                      onOpenDetail={() => onSelectPrediction && onSelectPrediction(pred)}
                      defaultExpanded={expandedCardKey === String(pred.id)}
                      onPublishAlert={() => handlePublishPicks([pred], `✓ ¡Pronóstico ${pred.homeTeam} vs ${pred.awayTeam} publicado!`)}
                      isPublished={Boolean(pred.id && publishedIds.has(pred.id))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
