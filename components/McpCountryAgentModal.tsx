"use client";

import React, { useState, useEffect } from "react";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { PredictionCard } from "./PredictionCard";

interface McpCountryAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrediction?: (prediction: MarketOpportunity) => void;
}

const QUICK_COUNTRIES = [
  { id: "españa", label: "España", flag: "🇪🇸" },
  { id: "inglaterra", label: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "alemania", label: "Alemania", flag: "🇩🇪" },
  { id: "italia", label: "Italia", flag: "🇮🇹" },
  { id: "francia", label: "Francia", flag: "🇫🇷" },
  { id: "portugal", label: "Portugal", flag: "🇵🇹" },
  { id: "ecuador", label: "Ecuador", flag: "🇪🇨" },
  { id: "mexico", label: "México", flag: "🇲🇽" },
  { id: "costa rica", label: "Costa Rica", flag: "🇨🇷" },
  { id: "brasil", label: "Brasil", flag: "🇧🇷" },
  { id: "argentina", label: "Argentina", flag: "🇦🇷" },
  { id: "colombia", label: "Colombia", flag: "🇨🇴" },
];

export function McpCountryAgentModal({ isOpen, onClose, onSelectPrediction }: McpCountryAgentModalProps) {
  const [query, setQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MarketOpportunity[]>([]);
  const [metrics, setMetrics] = useState<{
    totalMatches: number;
    averageProbability: string;
    averageOdds: string;
    highConfidenceCount: number;
  } | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Auto-load top picks on open
      handleSearch("España", "españa");
    }
  }, [isOpen]);

  const handleSearch = async (customQuery?: string, countryParam?: string) => {
    const activeQuery = customQuery !== undefined ? customQuery : query;
    const activeCountry = countryParam !== undefined ? countryParam : selectedCountry;

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/mcp/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: activeQuery,
          country: activeCountry,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.predictions || []);
        setMetrics(data.metrics || null);
      }
    } catch (err) {
      console.error("MCP Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCountryChipClick = (countryId: string, countryName: string) => {
    setSelectedCountry(countryId);
    setQuery(`Pronósticos de ${countryName} para hoy`);
    handleSearch(`Pronósticos de ${countryName} para hoy`, countryId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-emerald-500/30 bg-white shadow-2xl dark:border-emerald-500/20 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 bg-gradient-to-r from-emerald-500/10 via-slate-50 to-teal-500/10 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-xl shadow-md shadow-emerald-500/20">
              🤖
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Agente MCP SmartBetBot
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
                  ⚡ Búsqueda por Países
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pide pronósticos por país o liga y el modelo filtrará con máxima precisión matemática
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

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Quick Country Chips Bar */}
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Acceso Rápido por Países / Ligas:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COUNTRIES.map((c) => {
                const isSelected = selectedCountry === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleCountryChipClick(c.id, c.label)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                      isSelected
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 scale-105"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span>{c.flag}</span>
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
                placeholder="Ej: Pronósticos de Inglaterra, España Over 2.5, Alemania..."
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
                <div className="text-[10px] font-bold text-slate-500">Cuota Promedio</div>
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

          {/* Results List */}
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              <div className="text-2xl animate-spin mb-2">🔄</div>
              <p className="text-xs font-bold">El Agente MCP está analizando las mejores cuotas y modelos matemáticos...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Pronósticos recomendados por el Agente ({results.length}):</span>
                <span className="text-emerald-600 dark:text-emerald-400">Ordenados por Probabilidad y Cuota Justa</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {results.map((pick) => (
                  <PredictionCard
                    key={pick.id || pick.fixtureId}
                    prediction={pick}
                    onOpenDetail={onSelectPrediction}
                  />
                ))}
              </div>
            </div>
          ) : searched ? (
            <div className="py-10 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 p-6 border border-slate-200 dark:border-slate-800">
              <div className="text-3xl mb-2">🔎</div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                No se encontraron partidos para la búsqueda seleccionada hoy
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Prueba seleccionando otro país de la lista rápida o escribe el nombre de otra liga europea o americana.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <span className="text-[11px] font-bold text-slate-500">
            SmartBetBot MCP Assistant • Versión Calibrada
          </span>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-emerald-600 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-400 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
