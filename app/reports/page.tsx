"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { useLanguage } from "@/context/LanguageContext";
import { HistoricalSettledPick } from "@/lib/sports/db";

type TimeRangeFilter = "7d" | "30d" | "90d" | "all";

interface MetricBreakdown {
  key: string;
  label: string;
  total: number;
  won: number;
  lost: number;
  winRate: number;
  avgOdds: number;
  profit: number;
}

export default function ReportsPage() {
  const { language } = useLanguage();
  const [historyItems, setHistoryItems] = useState<HistoricalSettledPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>("30d");
  const [selectedTab, setSelectedTab] = useState<"overview" | "markets" | "confidence" | "leagues">("overview");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/history");
        const data = await res.json();
        if (data.history) {
          setHistoryItems(data.history);
        }
      } catch (err) {
        console.error("Error fetching history for reports:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  // Filter items by selected time range
  const filteredItems = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;

    return historyItems.filter((item) => {
      if (!item.result || item.result === "VOID") return false;
      const itemTime = new Date(item.kickoff || item.date).getTime();
      if (isNaN(itemTime)) return true;

      if (timeRange === "7d") return now - itemTime <= 7 * dayMs;
      if (timeRange === "30d") return now - itemTime <= 30 * dayMs;
      if (timeRange === "90d") return now - itemTime <= 90 * dayMs;
      return true;
    });
  }, [historyItems, timeRange]);

  // Global KPIs
  const totalSettled = filteredItems.length;
  const totalWon = filteredItems.filter((i) => i.result === "WON").length;
  const totalLost = filteredItems.filter((i) => i.result === "LOST").length;
  const overallWinRate = totalSettled > 0 ? (totalWon / totalSettled) * 100 : 0;
  const totalProfit = filteredItems.reduce((acc, i) => acc + (i.profit || 0), 0);
  const avgOdds = totalSettled > 0 ? filteredItems.reduce((acc, i) => acc + (i.odds || 0), 0) / totalSettled : 0;
  const roi = totalSettled > 0 ? (totalProfit / (totalSettled * 10)) * 100 : 0; // standard $10 stake unit

  // Breakdown by Confidence (Muy Alta vs Alta)
  const confidenceBreakdown = useMemo(() => {
    const map: Record<string, { total: number; won: number; lost: number; oddsSum: number; profit: number }> = {
      "Muy Alta": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      "Alta": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
    };

    filteredItems.forEach((i) => {
      const conf = i.confidence === "Muy Alta" || (i.probability && i.probability >= 75) ? "Muy Alta" : "Alta";
      if (!map[conf]) {
        map[conf] = { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 };
      }
      map[conf].total++;
      if (i.result === "WON") map[conf].won++;
      else if (i.result === "LOST") map[conf].lost++;
      map[conf].oddsSum += i.odds || 0;
      map[conf].profit += i.profit || 0;
    });

    return Object.entries(map).map(([key, data]): MetricBreakdown => ({
      key,
      label: key === "Muy Alta" ? "⭐⭐⭐ Muy Alta (≥75%)" : "⭐⭐ Alta (68% - 74%)",
      total: data.total,
      won: data.won,
      lost: data.lost,
      winRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
      avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
      profit: data.profit,
    }));
  }, [filteredItems]);

  // Breakdown by Market
  const marketBreakdown = useMemo(() => {
    const map: Record<string, { total: number; won: number; lost: number; oddsSum: number; profit: number }> = {};

    filteredItems.forEach((i) => {
      const m = i.market || "Otros";
      if (!map[m]) {
        map[m] = { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 };
      }
      map[m].total++;
      if (i.result === "WON") map[m].won++;
      else if (i.result === "LOST") map[m].lost++;
      map[m].oddsSum += i.odds || 0;
      map[m].profit += i.profit || 0;
    });

    return Object.entries(map)
      .map(([key, data]): MetricBreakdown => ({
        key,
        label: key,
        total: data.total,
        won: data.won,
        lost: data.lost,
        winRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
        profit: data.profit,
      }))
      .sort((a, b) => b.winRate - a.winRate || b.total - a.total);
  }, [filteredItems]);

  // Breakdown by League
  const leagueBreakdown = useMemo(() => {
    const map: Record<string, { total: number; won: number; lost: number; oddsSum: number; profit: number; country?: string }> = {};

    filteredItems.forEach((i) => {
      const l = i.league || "Competición Oficial";
      if (!map[l]) {
        map[l] = { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0, country: i.country };
      }
      map[l].total++;
      if (i.result === "WON") map[l].won++;
      else if (i.result === "LOST") map[l].lost++;
      map[l].oddsSum += i.odds || 0;
      map[l].profit += i.profit || 0;
    });

    return Object.entries(map)
      .map(([key, data]): MetricBreakdown & { country?: string } => ({
        key,
        label: key,
        country: data.country,
        total: data.total,
        won: data.won,
        lost: data.lost,
        winRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
        profit: data.profit,
      }))
      .filter((l) => l.total >= 1)
      .sort((a, b) => b.winRate - a.winRate || b.total - a.total);
  }, [filteredItems]);

  // Breakdown by Badge (Valor vs Bomba vs Estandar)
  const badgeBreakdown = useMemo(() => {
    const map: Record<string, { total: number; won: number; lost: number; oddsSum: number; profit: number }> = {
      valor: { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      bomba: { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      estandar: { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
    };

    filteredItems.forEach((i) => {
      const b = i.pickBadge || (i.odds >= 2.05 ? "bomba" : i.probability >= 76 ? "valor" : "estandar");
      if (map[b]) {
        map[b].total++;
        if (i.result === "WON") map[b].won++;
        else if (i.result === "LOST") map[b].lost++;
        map[b].oddsSum += i.odds || 0;
        map[b].profit += i.profit || 0;
      }
    });

    return [
      {
        key: "valor",
        label: "💎 Pronósticos de Valor (Alta Certeza)",
        color: "from-emerald-500 to-teal-500",
        badge: "💎 VALOR",
        ...map.valor,
        winRate: map.valor.total > 0 ? (map.valor.won / map.valor.total) * 100 : 0,
      },
      {
        key: "bomba",
        label: "💣 Pronósticos Bomba (Cuota Elevada ≥ 2.05)",
        color: "from-orange-500 to-rose-500",
        badge: "💣 BOMBA",
        ...map.bomba,
        winRate: map.bomba.total > 0 ? (map.bomba.won / map.bomba.total) * 100 : 0,
      },
    ];
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Header Title & Time Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              <span>📈</span>
              <span>{language === "es" ? "Módulo de Inteligencia y Rendimiento" : "Analytics & Performance Intelligence"}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {language === "es" ? "Reportes y Métricas de Acierto" : "Reports & Accuracy Metrics"}
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
              {language === "es"
                ? "Análisis cuantitativo de efectividad por nivel de confianza, mercados más ganadores y ligas de mayor rendimiento."
                : "Quantitative performance analysis across confidence levels, top-winning markets, and highest-yielding leagues."}
            </p>
          </div>

          {/* Time Range Filter Buttons */}
          <div className="flex items-center gap-1.5 rounded-2xl bg-white p-1.5 border border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900 self-start md:self-auto">
            {(
              [
                { id: "7d", label: language === "es" ? "7 Días" : "7 Days" },
                { id: "30d", label: language === "es" ? "30 Días" : "30 Days" },
                { id: "90d", label: language === "es" ? "90 Días" : "90 Days" },
                { id: "all", label: language === "es" ? "Histórico Total" : "All Time" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setTimeRange(item.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                  timeRange === item.id
                    ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-24 text-center">
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-sm font-semibold text-slate-600 dark:text-slate-400">
              {language === "es" ? "Calculando métricas estadísticas y gráficas..." : "Computing statistical analytics & charts..."}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {/* Top KPI Stat Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
              {/* Overall Win Rate */}
              <div className="rounded-3xl border border-emerald-300 bg-white p-5 shadow-sm dark:border-emerald-500/30 dark:bg-slate-900/90 relative overflow-hidden">
                <div className="absolute right-3 top-3 text-3xl opacity-15">🏆</div>
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                  {language === "es" ? "Tasa Global de Acierto" : "Global Win Rate"}
                </span>
                <div className="mt-2 text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                  {overallWinRate.toFixed(1)}%
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">{totalWon} Ganadas</span>
                  <span>•</span>
                  <span className="text-rose-600 dark:text-rose-400">{totalLost} Perdidas</span>
                </div>
              </div>

              {/* Total Settled Volume */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 relative overflow-hidden">
                <div className="absolute right-3 top-3 text-3xl opacity-15">🎯</div>
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {language === "es" ? "Pronósticos Evaluados" : "Settled Picks"}
                </span>
                <div className="mt-2 text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                  {totalSettled}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {language === "es" ? `Muestra en ${timeRange === "all" ? "histórico" : timeRange}` : `Sample in ${timeRange}`}
                </div>
              </div>

              {/* Average Odds */}
              <div className="rounded-3xl border border-sky-300 bg-white p-5 shadow-sm dark:border-sky-500/30 dark:bg-slate-900/90 relative overflow-hidden">
                <div className="absolute right-3 top-3 text-3xl opacity-15">📊</div>
                <span className="text-[11px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-400">
                  {language === "es" ? "Cuota Promedio" : "Average Odds"}
                </span>
                <div className="mt-2 text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                  @{avgOdds.toFixed(2)}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {language === "es" ? "Cuotas rentables evaluadas" : "Profitable odds threshold"}
                </div>
              </div>

              {/* Estimated Profit & ROI */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 relative overflow-hidden">
                <div className="absolute right-3 top-3 text-3xl opacity-15">💰</div>
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {language === "es" ? "Balance Neto Estimado" : "Estimated Net Yield"}
                </span>
                <div
                  className={`mt-2 text-3xl sm:text-4xl font-black ${
                    totalProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {totalProfit >= 0 ? `+$${totalProfit.toFixed(1)}` : `-$${Math.abs(totalProfit).toFixed(1)}`}
                </div>
                <div className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                  ROI: <span className="font-extrabold text-emerald-700 dark:text-emerald-400">{roi > 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`}</span>
                </div>
              </div>
            </div>

            {/* Special Highlights: Valor & Bomba Performance */}
            <div className="grid gap-4 sm:grid-cols-2">
              {badgeBreakdown.map((badge) => (
                <div
                  key={badge.key}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      {badge.label}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-xl px-2.5 py-0.5 text-xs font-black text-white bg-gradient-to-r ${badge.color}`}
                    >
                      {badge.badge}
                    </span>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <div className="text-3xl font-black text-slate-900 dark:text-white">
                        {badge.winRate.toFixed(1)}%
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {badge.won} aciertos de {badge.total} pronósticos
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        {badge.key === "bomba" ? "Cuota Promedio" : "Certeza Promedio"}
                      </div>
                      <div className="text-base font-black text-slate-900 dark:text-white">
                        {badge.key === "bomba" ? `@${(badge.oddsSum / (badge.total || 1)).toFixed(2)}` : "≥76% Prob"}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${badge.color}`}
                      style={{ width: `${Math.min(100, Math.max(5, badge.winRate))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Visual Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800 overflow-x-auto">
              {(
                [
                  { id: "overview", label: "🌟 Visión General", icon: "📊" },
                  { id: "confidence", label: "⭐⭐ Confianza (Muy Alta vs Alta)", icon: "🎯" },
                  { id: "markets", label: "⚽ Mercados más Acertados", icon: "🔥" },
                  { id: "leagues", label: "🏆 Ligas con Mayor Acierto", icon: "🥇" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs sm:text-sm font-black transition whitespace-nowrap cursor-pointer ${
                    selectedTab === tab.id
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-md"
                      : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* SECTION 1: CONFIDENCE ANALYSIS */}
            {(selectedTab === "overview" || selectedTab === "confidence") && (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>🎯</span>
                      <span>Efectividad por Nivel de Confianza</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Comparativa del modelo cuantitativo: Confianza Muy Alta (≥75%) frente a Confianza Alta (68% - 74%).
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  {confidenceBreakdown.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {item.label}
                        </span>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {item.total} pronósticos
                        </span>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between">
                        <div className="text-3xl font-black text-emerald-700 dark:text-emerald-400">
                          {item.winRate.toFixed(1)}%
                        </div>
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                          <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">{item.won} Ganadas</span> •{" "}
                          <span className="text-rose-600 dark:text-rose-400">{item.lost} Perdidas</span>
                        </div>
                      </div>

                      {/* Bar Visualization */}
                      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            item.key === "Muy Alta" ? "bg-emerald-500" : "bg-cyan-500"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, item.winRate))}%` }}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <span>Cuota Media: @{item.avgOdds.toFixed(2)}</span>
                        <span>Balance: <strong className={item.profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{item.profit >= 0 ? `+$${item.profit.toFixed(1)}` : `-$${Math.abs(item.profit).toFixed(1)}`}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 2: MARKETS RANKING CHART */}
            {(selectedTab === "overview" || selectedTab === "markets") && (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>⚽</span>
                      <span>Mercados con Mayor Tasa de Acierto</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Ranking de efectividad por mercado (Over 2.5, Under 2.5, Gana Local, Gana Visitante, Ambos Marcan, Córners, Tarjetas).
                    </p>
                  </div>
                </div>

                {marketBreakdown.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">No hay datos de mercados en este periodo.</p>
                ) : (
                  <div className="space-y-4">
                    {marketBreakdown.map((m, idx) => (
                      <div
                        key={m.key}
                        className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-950/80"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs font-black text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                              #{idx + 1}
                            </span>
                            <span className="text-sm font-black text-slate-900 dark:text-white">{m.label}</span>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-bold">
                            <span className="text-slate-500 dark:text-slate-400">{m.total} jugadas</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">{m.won}V</span>
                            <span className="text-rose-600 dark:text-rose-400">{m.lost}D</span>
                            <span className="rounded-xl bg-slate-900 px-2.5 py-0.5 text-xs font-black text-white dark:bg-emerald-500 dark:text-slate-950">
                              {m.winRate.toFixed(1)}% Acierto
                            </span>
                          </div>
                        </div>

                        {/* Visual SVG Progress Bar */}
                        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(5, m.winRate))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: TOP LEAGUES ACCURACY */}
            {(selectedTab === "overview" || selectedTab === "leagues") && (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>🏆</span>
                      <span>Ligas y Competiciones Más Rentables</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Medición de acierto estadístico en ligas de primer nivel (Premier League, La Liga, Serie A, Ecuador Liga Pro, etc.).
                    </p>
                  </div>
                </div>

                {leagueBreakdown.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">No hay datos de ligas en este periodo.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {leagueBreakdown.map((l, idx) => (
                      <div
                        key={l.key}
                        className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "⚽"} {l.label}
                          </span>
                          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                            {l.winRate.toFixed(0)}%
                          </span>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          <span>{l.country || "Competición"}</span>
                          <span>{l.won} ganadas de {l.total}</span>
                        </div>

                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(100, Math.max(5, l.winRate))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
