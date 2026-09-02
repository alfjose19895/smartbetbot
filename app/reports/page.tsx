"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { useLanguage } from "@/context/LanguageContext";
import { HistoricalSettledPick } from "@/lib/sports/db";

type TimeRangeFilter = "7d" | "30d" | "90d" | "all";

interface MetricItem {
  name: string;
  total: number;
  won: number;
  lost: number;
  winRate: number;
  avgOdds: number;
  profit: number;
  color?: string;
  country?: string;
}

export default function ReportsPage() {
  const { language } = useLanguage();
  const [historyItems, setHistoryItems] = useState<HistoricalSettledPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>("30d");
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

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

  // Filter items by time range
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
  const roi = totalSettled > 0 ? (totalProfit / (totalSettled * 10)) * 100 : 0;

  // Confidence Breakdown
  const confidenceData = useMemo(() => {
    const muyAlta = { total: 0, won: 0, lost: 0, profit: 0, oddsSum: 0 };
    const alta = { total: 0, won: 0, lost: 0, profit: 0, oddsSum: 0 };

    filteredItems.forEach((i) => {
      const isMuyAlta = i.confidence === "Muy Alta" || (i.probability && i.probability >= 75);
      const target = isMuyAlta ? muyAlta : alta;
      target.total++;
      if (i.result === "WON") target.won++;
      else if (i.result === "LOST") target.lost++;
      target.profit += i.profit || 0;
      target.oddsSum += i.odds || 0;
    });

    const muyAltaWinRate = muyAlta.total > 0 ? (muyAlta.won / muyAlta.total) * 100 : 0;
    const altaWinRate = alta.total > 0 ? (alta.won / alta.total) * 100 : 0;

    return {
      muyAlta: {
        name: "⭐⭐⭐ Muy Alta (≥75%)",
        ...muyAlta,
        winRate: muyAltaWinRate,
        avgOdds: muyAlta.total > 0 ? muyAlta.oddsSum / muyAlta.total : 0,
        color: "#10B981", // Emerald
      },
      alta: {
        name: "⭐⭐ Alta (68% - 74%)",
        ...alta,
        winRate: altaWinRate,
        avgOdds: alta.total > 0 ? alta.oddsSum / alta.total : 0,
        color: "#06B6D4", // Cyan
      },
    };
  }, [filteredItems]);

  // Markets Breakdown for Vertical Bar Chart
  const marketChartData = useMemo((): MetricItem[] => {
    const map: Record<string, { total: number; won: number; lost: number; oddsSum: number; profit: number }> = {
      "Gana Local": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      "Gana Visitante": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      "Over 2.5 Goles": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      "Under 2.5 Goles": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      "Ambos Marcan (BTTS)": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      "Over 8.5 Córners": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
      "Over 3.5 Tarjetas": { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 },
    };

    filteredItems.forEach((i) => {
      let key = "Otros";
      if (i.market.includes("Local") || i.market === "1") key = "Gana Local";
      else if (i.market.includes("Visitante") || i.market === "2") key = "Gana Visitante";
      else if (i.market.includes("Over 2.5")) key = "Over 2.5 Goles";
      else if (i.market.includes("Under 2.5")) key = "Under 2.5 Goles";
      else if (i.market.includes("Ambos") || i.market.includes("BTTS")) key = "Ambos Marcan (BTTS)";
      else if (i.market.includes("Córners")) key = "Over 8.5 Córners";
      else if (i.market.includes("Tarjetas")) key = "Over 3.5 Tarjetas";

      if (!map[key]) {
        map[key] = { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 };
      }
      map[key].total++;
      if (i.result === "WON") map[key].won++;
      else if (i.result === "LOST") map[key].lost++;
      map[key].oddsSum += i.odds || 0;
      map[key].profit += i.profit || 0;
    });

    const colors = ["#10B981", "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#14B8A6"];

    return Object.entries(map)
      .map(([name, data], idx): MetricItem => ({
        name,
        total: data.total,
        won: data.won,
        lost: data.lost,
        winRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
        profit: data.profit,
        color: colors[idx % colors.length],
      }))
      .filter((m) => m.total > 0 || !["Otros"].includes(m.name))
      .sort((a, b) => b.winRate - a.winRate || b.total - a.total);
  }, [filteredItems]);

  // Top Leagues Breakdown for Horizontal Ranking Bar Chart
  const leagueChartData = useMemo((): MetricItem[] => {
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
      .map(([name, data]): MetricItem => ({
        name,
        country: data.country,
        total: data.total,
        won: data.won,
        lost: data.lost,
        winRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
        profit: data.profit,
      }))
      .sort((a, b) => b.winRate - a.winRate || b.total - a.total)
      .slice(0, 8); // Top 8 leagues
  }, [filteredItems]);

  // Temporal Progression Points for Trend Line Chart
  const trendPoints = useMemo(() => {
    const sorted = [...filteredItems]
      .filter((i) => i.date || i.kickoff)
      .sort((a, b) => new Date(a.kickoff || a.date).getTime() - new Date(b.kickoff || b.date).getTime());

    if (sorted.length === 0) return [];

    // Group by date
    const dateMap: Record<string, { total: number; won: number }> = {};
    sorted.forEach((item) => {
      const d = (item.date || item.kickoff || "").slice(0, 10);
      if (!dateMap[d]) dateMap[d] = { total: 0, won: 0 };
      dateMap[d].total++;
      if (item.result === "WON") dateMap[d].won++;
    });

    let cumulativeWon = 0;
    let cumulativeTotal = 0;

    return Object.entries(dateMap).map(([dateStr, data]) => {
      cumulativeWon += data.won;
      cumulativeTotal += data.total;
      const rate = cumulativeTotal > 0 ? (cumulativeWon / cumulativeTotal) * 100 : 0;
      const dObj = new Date(dateStr);
      const label = isNaN(dObj.getTime())
        ? dateStr
        : dObj.toLocaleDateString("es-ES", { month: "short", day: "numeric" });
      return {
        date: dateStr,
        label,
        rate,
        dayWon: data.won,
        dayTotal: data.total,
      };
    });
  }, [filteredItems]);

  // Donut SVG circumference calculation
  const donutTotal = confidenceData.muyAlta.total + confidenceData.alta.total;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const muyAltaFraction = donutTotal > 0 ? confidenceData.muyAlta.total / donutTotal : 0.5;
  const muyAltaOffset = circumference * (1 - muyAltaFraction);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-8">
        {/* Header Title & Time Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              <span>📊</span>
              <span>{language === "es" ? "Panel Analítico y Estadístico" : "Analytics & Performance Intelligence"}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {language === "es" ? "Gráficas y Reportes de Rendimiento" : "Visual Reports & Accuracy Charts"}
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
              {language === "es"
                ? "Visualización gráfica interactiva de aciertos por mercado, nivel de confianza, ligas y curva de efectividad temporal."
                : "Interactive charts measuring accuracy by market, confidence tier, top leagues, and time-series performance."}
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
              {language === "es" ? "Generando gráficas y procesando estadísticas..." : "Rendering charts & computing analytics..."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top KPI Stat Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
              {/* Overall Win Rate */}
              <div className="rounded-3xl border border-emerald-300 bg-white p-5 shadow-sm dark:border-emerald-500/30 dark:bg-slate-900/90 relative overflow-hidden">
                <div className="absolute right-3 top-3 text-3xl opacity-15">🏆</div>
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                  {language === "es" ? "Acierto Global" : "Global Win Rate"}
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
                  {language === "es" ? `Muestra en ${timeRange}` : `Sample in ${timeRange}`}
                </div>
              </div>

              {/* Average Odds */}
              <div className="rounded-3xl border border-sky-300 bg-white p-5 shadow-sm dark:border-sky-500/30 dark:bg-slate-900/90 relative overflow-hidden">
                <div className="absolute right-3 top-3 text-3xl opacity-15">📈</div>
                <span className="text-[11px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-400">
                  {language === "es" ? "Cuota Promedio" : "Average Odds"}
                </span>
                <div className="mt-2 text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                  @{avgOdds.toFixed(2)}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {language === "es" ? "Umbral rentable garantizado" : "Profitable odds threshold"}
                </div>
              </div>

              {/* Net Profit & ROI */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 relative overflow-hidden">
                <div className="absolute right-3 top-3 text-3xl opacity-15">💰</div>
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {language === "es" ? "Balance Neto" : "Net Profit"}
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

            {/* CHART 1: VERTICAL BAR CHART - ACCURACY BY MARKET */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>📊</span>
                    <span>{language === "es" ? "Gráfica de Acierto por Mercado" : "Market Accuracy Chart"}</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === "es"
                      ? "Comparativa visual de porcentaje de efectividad entre los mercados principales de alta rentabilidad."
                      : "Visual comparative percentage of winning bets across retained betting markets."}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800">
                  🎯 Meta: &gt;70% Acierto
                </span>
              </div>

              {/* Real SVG Vertical Bar Chart */}
              <div className="w-full overflow-x-auto pt-4">
                <div className="min-w-[650px] h-[320px] relative flex flex-col justify-between">
                  {/* Grid Lines & Y-Axis Scale */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12">
                    {[100, 75, 50, 25, 0].map((val) => (
                      <div key={val} className="flex items-center w-full">
                        <span className="w-10 text-[10px] font-bold text-slate-400 dark:text-slate-500 text-right pr-2">
                          {val}%
                        </span>
                        <div className={`flex-1 border-b ${val === 75 ? "border-emerald-500/40 border-dashed" : "border-slate-100 dark:border-slate-800/80"}`} />
                      </div>
                    ))}
                  </div>

                  {/* Bars Container */}
                  <div className="relative z-10 flex items-end justify-around h-full pl-12 pr-4 pb-12">
                    {marketChartData.map((item) => {
                      const barHeightPercent = Math.min(100, Math.max(8, item.winRate));
                      const isHovered = hoveredBar === item.name;

                      return (
                        <div
                          key={item.name}
                          onMouseEnter={() => setHoveredBar(item.name)}
                          onMouseLeave={() => setHoveredBar(null)}
                          className="flex flex-col items-center flex-1 max-w-[80px] h-full justify-end group cursor-pointer"
                        >
                          {/* Value Tag Above Bar */}
                          <div
                            className={`mb-2 rounded-lg px-2 py-0.5 text-xs font-black transition-all ${
                              isHovered
                                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 scale-110 shadow-md"
                                : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {item.winRate.toFixed(0)}%
                          </div>

                          {/* Graphical Bar */}
                          <div className="w-10 sm:w-12 rounded-t-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 h-full flex items-end">
                            <div
                              className="w-full rounded-t-2xl transition-all duration-700 relative overflow-hidden"
                              style={{
                                height: `${barHeightPercent}%`,
                                backgroundColor: item.color,
                                boxShadow: isHovered ? `0 0 15px ${item.color}80` : "none",
                              }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                            </div>
                          </div>

                          {/* X-Axis Label */}
                          <div className="mt-3 text-center w-full">
                            <div className="text-[11px] font-black text-slate-800 dark:text-slate-200 truncate" title={item.name}>
                              {item.name.replace(" (BTTS)", "").replace(" Goles", "")}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                              {item.won}V - {item.lost}D
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* CHART 2 & 3: DONUT CONFIDENCE CHART + LEAGUES RANKING CHART */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* DONUT CHART: CONFIDENCE ACCURACY & VOLUME */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 flex flex-col justify-between space-y-6">
                <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>🎯</span>
                    <span>{language === "es" ? "Gráfica Circular de Confianza" : "Confidence Distribution Chart"}</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === "es"
                      ? "Distribución y rendimiento comparativo: Muy Alta (≥75%) vs Alta (68% - 74%)."
                      : "Accuracy and ticket volume by model confidence level."}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                  {/* Real SVG Donut Chart */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg className="w-44 h-44 transform -rotate-90" viewBox="0 0 160 160">
                      {/* Background circle */}
                      <circle
                        cx="80"
                        cy="80"
                        r={radius}
                        className="stroke-slate-100 dark:stroke-slate-800"
                        strokeWidth="18"
                        fill="transparent"
                      />
                      {/* Alta Segment (Cyan) */}
                      <circle
                        cx="80"
                        cy="80"
                        r={radius}
                        stroke="#06B6D4"
                        strokeWidth="18"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={0}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                      {/* Muy Alta Segment (Emerald) */}
                      <circle
                        cx="80"
                        cy="80"
                        r={radius}
                        stroke="#10B981"
                        strokeWidth="18"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={muyAltaOffset}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                    </svg>

                    {/* Donut Center Summary */}
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-none">
                        {overallWinRate.toFixed(0)}%
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">
                        Acierto Total
                      </span>
                    </div>
                  </div>

                  {/* Legend & Breakdown Badges */}
                  <div className="flex flex-col gap-4 w-full max-w-[240px]">
                    {/* Muy Alta Card */}
                    <div className="rounded-2xl bg-emerald-50/80 p-3.5 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/80">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
                          <span className="text-xs font-black text-emerald-900 dark:text-emerald-300">
                            Muy Alta (≥75%)
                          </span>
                        </div>
                        <span className="text-xs font-black text-emerald-800 dark:text-emerald-400">
                          {confidenceData.muyAlta.winRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex justify-between">
                        <span>{confidenceData.muyAlta.won}V / {confidenceData.muyAlta.total} totales</span>
                        <span>@{confidenceData.muyAlta.avgOdds.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Alta Card */}
                    <div className="rounded-2xl bg-cyan-50/80 p-3.5 border border-cyan-200 dark:bg-cyan-950/40 dark:border-cyan-800/80">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full bg-cyan-500 shrink-0" />
                          <span className="text-xs font-black text-cyan-900 dark:text-cyan-300">
                            Alta (68% - 74%)
                          </span>
                        </div>
                        <span className="text-xs font-black text-cyan-800 dark:text-cyan-400">
                          {confidenceData.alta.winRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-cyan-700 dark:text-cyan-400 font-semibold flex justify-between">
                        <span>{confidenceData.alta.won}V / {confidenceData.alta.total} totales</span>
                        <span>@{confidenceData.alta.avgOdds.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* HORIZONTAL BAR CHART: TOP LEAGUES ACCURACY */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 flex flex-col justify-between space-y-6">
                <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>🏆</span>
                    <span>{language === "es" ? "Gráfica de Ligas Más Rentables" : "Top Winning Leagues"}</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === "es"
                      ? "Ranking visual de competiciones con mayor efectividad y volumen de aciertos."
                      : "League-by-league accuracy ranking."}
                  </p>
                </div>

                <div className="space-y-3.5">
                  {leagueChartData.map((league, idx) => (
                    <div key={league.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-[280px]">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "⚽"} {league.name}{" "}
                          <span className="text-slate-400 font-normal">({league.country || "Oficial"})</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                            {league.won}/{league.total}
                          </span>
                          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                            {league.winRate.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {/* Horizontal Bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(5, league.winRate))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CHART 4: TEMPORAL EFFECTIVENESS TREND LINE & AREA CHART */}
            {trendPoints.length > 1 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>📈</span>
                      <span>{language === "es" ? "Curva de Efectividad Temporal (Tendencia)" : "Performance Trend Line Chart"}</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {language === "es"
                        ? "Evolución cronológica de la tasa acumulada de acierto del modelo inteligente."
                        : "Cumulative accuracy trajectory curve across settled match days."}
                    </p>
                  </div>
                </div>

                {/* Real SVG Area & Polyline Chart */}
                <div className="w-full overflow-x-auto pt-2">
                  <div className="min-w-[650px] h-[220px] relative">
                    <svg className="w-full h-full" viewBox="0 0 650 180" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      <line x1="40" y1="20" x2="630" y2="20" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                      <line x1="40" y1="70" x2="630" y2="70" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                      <line x1="40" y1="120" x2="630" y2="120" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />

                      {/* 70% Target Dashed Reference Line */}
                      <line x1="40" y1="50" x2="630" y2="50" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />

                      {/* Area Fill */}
                      {(() => {
                        const stepX = (630 - 40) / Math.max(1, trendPoints.length - 1);
                        const pointsStr = trendPoints
                          .map((p, idx) => {
                            const x = 40 + idx * stepX;
                            const y = 140 - (p.rate / 100) * 110;
                            return `${x},${y}`;
                          })
                          .join(" ");

                        const firstX = 40;
                        const lastX = 40 + (trendPoints.length - 1) * stepX;
                        const areaPath = `M ${firstX},140 L ${pointsStr} L ${lastX},140 Z`;

                        return (
                          <>
                            <path d={areaPath} fill="url(#trendGradient)" />
                            <polyline
                              fill="none"
                              stroke="#10B981"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={pointsStr}
                            />
                            {trendPoints.map((p, idx) => {
                              const cx = 40 + idx * stepX;
                              const cy = 140 - (p.rate / 100) * 110;
                              return (
                                <g key={idx}>
                                  <circle cx={cx} cy={cy} r="5" fill="#10B981" stroke="#FFFFFF" strokeWidth="2" />
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>

                    {/* X-Axis Date Labels */}
                    <div className="flex justify-between pl-10 pr-4 mt-2 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {trendPoints.map((p, idx) => (
                        <span key={idx} className="truncate max-w-[60px] text-center">
                          {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
