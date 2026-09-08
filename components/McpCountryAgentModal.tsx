"use client";

import React, { useState, useEffect } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
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

const QUICK_CHIPS = [
  { id: "champions", label: "Champions League", query: "Pronósticos de Champions League hoy", icon: "🏆" },
  { id: "sudamericana", label: "Copa Sudamericana", query: "Pronósticos de Copa Sudamericana hoy", icon: "🌎" },
  { id: "local_value", label: "Ganador Local (+60%)", query: "Pronósticos de Ganador Local con probabilidad superior al 60% y cuota de valor", icon: "🎯" },
  { id: "parlay_top", label: "Parlay del Día", query: "Crea una combinada parlay segura de 2 o 3 partidos con cuota de valor", icon: "🔥" },
  { id: "inglaterra", label: "Inglaterra (League Cup)", query: "Pronósticos de Inglaterra League Cup hoy", icon: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "españa", label: "España", query: "Pronósticos de España La Liga hoy", icon: "🇪🇸" },
  { id: "alemania", label: "Alemania", query: "Pronósticos de Alemania Bundesliga", icon: "🇩🇪" },
  { id: "italia", label: "Italia", query: "Pronósticos de Italia Serie A", icon: "🇮🇹" },
  { id: "francia", label: "Francia", query: "Pronósticos de Francia Ligue 1", icon: "🇫🇷" },
  { id: "saudi", label: "Arabia Saudita", query: "Pronósticos de Saudi Pro League hoy", icon: "🇸🇦" },
  { id: "brasil", label: "Brasil", query: "Pronósticos de Brasil Brasileirão", icon: "🇧🇷" },
  { id: "argentina", label: "Argentina", query: "Pronósticos de Argentina Liga Profesional", icon: "🇦🇷" },
];

export function McpCountryAgentModal({ isOpen, onClose, onSelectPrediction }: McpCountryAgentModalProps) {
  const [query, setQuery] = useState("");
  const [selectedChip, setSelectedChip] = useState<string>("");
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

  useEffect(() => {
    if (isOpen) {
      handleSearch("Pronósticos de Champions League y cuotas de valor hoy", "champions");
    }
  }, [isOpen]);

  const handleSearch = async (customQuery?: string, chipId?: string) => {
    const activeQuery = customQuery !== undefined ? customQuery : query;
    if (chipId) setSelectedChip(chipId);

    setLoading(true);
    setSearched(true);
    setPublishSuccessMessage(null);

    try {
      const res = await fetch("/api/mcp/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: activeQuery,
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

  const handleChipClick = (chip: typeof QUICK_CHIPS[0]) => {
    setSelectedChip(chip.id);
    setQuery(chip.query);
    handleSearch(chip.query, chip.id);
  };

  const handlePublishPicks = async (picksToPublish: MarketOpportunity[], customMsg?: string) => {
    if (picksToPublish.length === 0) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/mcp/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          picks: picksToPublish,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const msg = customMsg || `✓ ¡Se publicaron ${picksToPublish.length} pronóstico(s) exitosamente en el Dashboard y la Sección Parlay!`;
        setPublishSuccessMessage(msg);

        // Mark published IDs
        setPublishedIds((prev) => {
          const next = new Set(prev);
          picksToPublish.forEach((p) => next.add(p.fixtureId || p.id || `${p.homeTeam}-${p.awayTeam}`));
          return next;
        });

        // Notify other components & pages
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("storage"));
          window.dispatchEvent(new CustomEvent("predictions-updated", { detail: { picks: picksToPublish } }));
        }

        setTimeout(() => {
          setPublishSuccessMessage(null);
        }, 5000);
      }
    } catch (err) {
      console.error("Error publishing picks:", err);
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishSinglePick = (prediction: MarketOpportunity) => {
    handlePublishPicks([prediction], `✓ ¡Pronóstico ${prediction.homeTeam} vs ${prediction.awayTeam} publicado en el Dashboard!`);
  };

  if (!isOpen) return null;

  const isParlayActive = Boolean(aiAnalysis?.parlayRecommendation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-xl shadow-lg shadow-emerald-600/30 text-white">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Agente MCP de Inteligencia Cuantitativa
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
                  ⚡ Gemini AI + Cuotas Reales Bet365
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Líneas reales de Bet365/Pinnacle, análisis táctico por IA y modelado cuantitativo
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
              Acceso Rápido • Competiciones y Estrategias:
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
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 scale-105"
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

          {/* Search Bar Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: Ganador local con probabilidad superior al 65% en Champions League..."
                className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-4 pr-10 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
              className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-black text-white hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? "🔄" : "🔍"}</span>
              <span className="hidden sm:inline">{loading ? "Analizando..." : "Buscar"}</span>
            </button>
          </form>

          {/* Summary Metrics Banner */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
              <div className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-500">Partidos Encontrados</div>
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
                <div className="text-[10px] font-bold text-slate-500">Cuota Promedio Real</div>
                <div className="text-base font-black text-sky-600 dark:text-sky-400 mt-0.5">
                  {metrics.averageOdds}
                </div>
              </div>
              <div className="text-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-500">Confianza Muy Alta</div>
                <div className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {metrics.highConfidenceCount}
                </div>
              </div>
            </div>
          )}

          {/* AI Executive Reasoning Card (Powered by Gemini / Quantitative Engine) */}
          {aiAnalysis && (
            <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/70 via-slate-50 to-teal-50/50 p-4 dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-teal-950/30 space-y-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2 dark:border-indigo-900/40">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-black shadow-sm">
                    ✨
                  </span>
                  <span className="text-xs font-black tracking-wide text-indigo-950 dark:text-indigo-200">
                    Dictamen Estratégico Gemini AI
                  </span>
                </div>
                {aiAnalysis.intent && (
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-black text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {aiAnalysis.intent}
                  </span>
                )}
              </div>

              {/* Summary */}
              {aiAnalysis.summary && (
                <p className="text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-300">
                  {aiAnalysis.summary}
                </p>
              )}

              {/* Tactical Insights & Risk Warnings */}
              {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Observaciones Tácticas y Riesgo:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {aiAnalysis.insights.map((insight, idx) => {
                      const isRisk = insight.includes("⚠️") || insight.toLowerCase().includes("riesgo") || insight.toLowerCase().includes("precaución") || insight.toLowerCase().includes("desventaja");
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 rounded-xl p-2.5 text-xs font-medium border ${
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
                <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/10 p-2.5 border border-emerald-500/20 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                  <span className="text-base shrink-0">💡</span>
                  <div>
                    <span className="font-black text-emerald-800 dark:text-emerald-200 uppercase text-[10px] block">
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
                      onClick={() => handlePublishPicks(results, `✓ ¡Combinada Parlay de ${results.length} selecciones (@${aiAnalysis?.parlayRecommendation?.totalOdds}) publicada en el Dashboard y la Sección Parlay!`)}
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
              <p className="text-xs font-bold">El Agente MCP está consultando cuotas reales y ejecutando el modelo matemático...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                <span>Pronósticos descubiertos con cuotas reales Bet365 ({results.length}):</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePublishPicks(results)}
                    disabled={publishing}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600 px-3 py-1.5 text-xs font-black text-emerald-700 hover:text-white dark:text-emerald-300 dark:hover:text-white border border-emerald-500/30 transition cursor-pointer disabled:opacity-50"
                  >
                    <span>📤</span>
                    <span>{publishing ? "Publicando..." : "Publicar Todo al Dashboard"}</span>
                  </button>
                  <span className="text-emerald-600 dark:text-emerald-400 hidden sm:inline">100% Cuotas Reales</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {results.map((pick) => {
                  const pickKey = pick.fixtureId || pick.id || `${pick.homeTeam}-${pick.awayTeam}`;
                  const isAlreadyPublished = publishedIds.has(pickKey);
                  return (
                    <PredictionCard
                      key={pickKey}
                      prediction={pick}
                      onOpenDetail={onSelectPrediction}
                      onPublishAlert={handlePublishSinglePick}
                      isPublished={isAlreadyPublished}
                    />
                  );
                })}
              </div>
            </div>
          ) : searched ? (
            <div className="py-10 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 p-6 border border-slate-200 dark:border-slate-800">
              <div className="text-3xl mb-2">🔎</div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                No se encontraron partidos para el filtro solicitado hoy
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Prueba seleccionando Champions League o cualquiera de las ligas de la barra de acceso rápido.
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
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 transition cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-600/20"
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
