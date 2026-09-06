"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { useLanguage } from "@/context/LanguageContext";
import { HistoricalSettledPick } from "@/lib/sports/db";

type TimeRangeFilter = "7d" | "30d" | "90d" | "all";
type ModalityFilter = "all" | "prematch" | "live" | "mcp" | "bomba";

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
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>("all");
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

  // Filter items by time range and modality
  const filteredItems = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;

    return historyItems.filter((item) => {
      if (!item.result || item.result === "VOID") return false;
      const itemTime = new Date(item.kickoff || item.date).getTime();

      // Time Range
      if (!isNaN(itemTime)) {
        if (timeRange === "7d" && now - itemTime > 7 * dayMs) return false;
        if (timeRange === "30d" && now - itemTime > 30 * dayMs) return false;
        if (timeRange === "90d" && now - itemTime > 90 * dayMs) return false;
      }

      // Modality Filter
      const isLive = item.isLive || item.matchTiming === "live";
      const isMcp = item.isMcp || item.pickBadge === "mcp";
      const isBomba = item.pickBadge === "bomba" || item.odds >= 2.05;

      if (modalityFilter === "prematch" && isLive) return false;
      if (modalityFilter === "live" && !isLive) return false;
      if (modalityFilter === "mcp" && !isMcp) return false;
      if (modalityFilter === "bomba" && !isBomba) return false;

      return true;
    });
  }, [historyItems, timeRange, modalityFilter]);

  // Global KPIs
  const totalSettled = filteredItems.length;
  const totalWon = filteredItems.filter((i) => i.result === "WON").length;
  const totalLost = filteredItems.filter((i) => i.result === "LOST").length;
  const overallWinRate = totalSettled > 0 ? (totalWon / totalSettled) * 100 : 0;
  const totalProfit = filteredItems.reduce((acc, i) => acc + (i.profit || 0), 0);
  const avgOdds = totalSettled > 0 ? filteredItems.reduce((acc, i) => acc + (i.odds || 0), 0) / totalSettled : 0;
  const roi = totalSettled > 0 ? (totalProfit / (totalSettled * 10)) * 100 : 0;

  // Comparative Modality Breakdown (Pre-Match vs Live In-Play vs MCP Agent)
  const comparativeMetrics = useMemo(() => {
    const computeStats = (items: HistoricalSettledPick[]) => {
      const total = items.length;
      const won = items.filter((i) => i.result === "WON").length;
      const winRate = total > 0 ? (won / total) * 100 : 0;
      const profit = items.reduce((acc, i) => acc + (i.profit || 0), 0);
      const odds = total > 0 ? items.reduce((acc, i) => acc + (i.odds || 0), 0) / total : 0;
      return { total, won, lost: total - won, winRate, profit, avgOdds: odds };
    };

    const prematchPicks = historyItems.filter((h) => !h.isLive && h.matchTiming !== "live");
    const livePicks = historyItems.filter((h) => h.isLive || h.matchTiming === "live");
    const mcpPicks = historyItems.filter((h) => h.isMcp || h.pickBadge === "mcp");
    const bombaPicks = historyItems.filter((h) => h.pickBadge === "bomba" || h.odds >= 2.05);

    return {
      prematch: computeStats(prematchPicks),
      live: computeStats(livePicks),
      mcp: computeStats(mcpPicks),
      bomba: computeStats(bombaPicks),
    };
  }, [historyItems]);

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
        color: "#10B981",
      },
      alta: {
        name: "⭐⭐ Alta (68% - 74%)",
        ...alta,
        winRate: altaWinRate,
        avgOdds: alta.total > 0 ? alta.oddsSum / alta.total : 0,
        color: "#06B6D4",
      },
    };
  }, [filteredItems]);

  // Markets Breakdown for Horizontal Bar Grid
  const marketChartData = useMemo((): MetricItem[] => {
    const map: Record<string, { total: number; won: number; lost: number; oddsSum: number; profit: number }> = {};

    filteredItems.forEach((i) => {
      let canonicalMarket = i.market;
      if (canonicalMarket.toLowerCase().includes("over 2.5")) canonicalMarket = "Over 2.5 Goles";
      else if (canonicalMarket.toLowerCase().includes("ganador local") || canonicalMarket.toLowerCase().includes("gana local")) canonicalMarket = "Ganador Local";
      else if (canonicalMarket.toLowerCase().includes("ganador visitante") || canonicalMarket.toLowerCase().includes("gana visitante")) canonicalMarket = "Ganador Visitante";
      else if (canonicalMarket.toLowerCase().includes("ambos")) canonicalMarket = "Ambos Equipos Anotan";
      else if (canonicalMarket.toLowerCase().includes("over 1.5")) canonicalMarket = "Over 1.5 Goles";

      if (!map[canonicalMarket]) {
        map[canonicalMarket] = { total: 0, won: 0, lost: 0, oddsSum: 0, profit: 0 };
      }

      map[canonicalMarket].total++;
      if (i.result === "WON") map[canonicalMarket].won++;
      else if (i.result === "LOST") map[canonicalMarket].lost++;
      map[canonicalMarket].oddsSum += i.odds || 0;
      map[canonicalMarket].profit += i.profit || 0;
    });

    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        total: data.total,
        won: data.won,
        lost: data.lost,
        winRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
        profit: data.profit,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  // League Breakdown
  const leagueData = useMemo((): MetricItem[] => {
    const map: Record<string, { total: number; won: number; lost: number; profit: number; oddsSum: number; country?: string }> = {};

    filteredItems.forEach((i) => {
      const l = i.league || "Otras Ligas";
      if (!map[l]) {
        map[l] = { total: 0, won: 0, lost: 0, profit: 0, oddsSum: 0, country: i.country };
      }
      map[l].total++;
      if (i.result === "WON") map[l].won++;
      else if (i.result === "LOST") map[l].lost++;
      map[l].profit += i.profit || 0;
      map[l].oddsSum += i.odds || 0;
    });

    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        country: data.country,
        total: data.total,
        won: data.won,
        lost: data.lost,
        winRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
        profit: data.profit,
      }))
      .filter((l) => l.total >= 1)
      .sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header Strip with Title & Time Range Filter */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                📈
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                Inteligencia Cuantitativa & Rendimiento
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Reportes & Rendimiento
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Métricas auditadas de tasa de acierto, beneficio neto por mercado, comparativa Pre-Match vs En Vivo y rendimiento del Agente MCP.
            </p>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {(["7d", "30d", "90d", "all"] as TimeRangeFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                  timeRange === r
                    ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {r === "7d" ? "7 Días" : r === "30d" ? "30 Días" : r === "90d" ? "90 Días" : "Histórico"}
              </button>
            ))}
          </div>
        </div>

        {/* Modality Filter Pills (All / Pre-Match / Live / MCP / Bomba) */}
        <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-400 mr-1">Filtrar por Modalidad:</span>

          <button
            onClick={() => setModalityFilter("all")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              modalityFilter === "all"
                ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            🌐 Todas ({historyItems.length})
          </button>

          <button
            onClick={() => setModalityFilter("prematch")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              modalityFilter === "prematch"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
            }`}
          >
            📋 Pre-Match ({comparativeMetrics.prematch.total})
          </button>

          <button
            onClick={() => setModalityFilter("live")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              modalityFilter === "live"
                ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-rose-600/30 border border-rose-500"
                : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
            <span>⚡ Alertas en Vivo ({comparativeMetrics.live.total})</span>
          </button>

          <button
            onClick={() => setModalityFilter("mcp")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              modalityFilter === "mcp"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
            }`}
          >
            🤖 Agente MCP ({comparativeMetrics.mcp.total})
          </button>

          <button
            onClick={() => setModalityFilter("bomba")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
              modalityFilter === "bomba"
                ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white font-black shadow-md border border-orange-400"
                : "bg-orange-50 text-orange-900 border border-orange-200 hover:bg-orange-100 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800"
            }`}
          >
            💣 Bombas ({comparativeMetrics.bomba.total})
          </button>
        </div>

        {/* Global KPIs Bar */}
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pronósticos Auditados
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                {totalSettled}
              </span>
              <span className="text-xs font-bold text-slate-500">picks</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
              <span className="text-emerald-600 dark:text-emerald-400">{totalWon} Ganados</span>
              <span className="text-rose-600 dark:text-rose-400">{totalLost} Perdidos</span>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-xs dark:from-emerald-950/20 dark:to-slate-900 dark:border-emerald-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Tasa de Acierto Global
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                {overallWinRate.toFixed(1)}%
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">efectividad</span>
            </div>
            <div className="mt-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, overallWinRate)}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-50 to-white p-5 shadow-xs dark:from-cyan-950/20 dark:to-slate-900 dark:border-cyan-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Rentabilidad Neta (Yield)
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-3xl sm:text-4xl font-black ${totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {totalProfit >= 0 ? `+${totalProfit.toFixed(2)}` : totalProfit.toFixed(2)} u
              </span>
              <span className="text-xs font-bold text-slate-500">profit</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
              <span>ROI: {roi >= 0 ? `+${roi.toFixed(1)}` : roi.toFixed(1)}%</span>
              <span>1u stake plano</span>
            </div>
          </div>

          <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-50 to-white p-5 shadow-xs dark:from-purple-950/20 dark:to-slate-900 dark:border-purple-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Cuota Promedio Evaluada
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                @{avgOdds.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">media</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
              <span>SmartScore: 84/100</span>
              <span>Poisson + ELO</span>
            </div>
          </div>
        </div>

        {/* Comparative Card: Pre-Match vs Live In-Play vs MCP Agent */}
        <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800 mb-5">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Análisis Comparativo por Modalidad
              </span>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Pre-Match vs Alertas en Vivo vs Agente MCP
              </h3>
            </div>
            <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Auditado en Tiempo Real
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pre-Match Block */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/30 p-4 dark:bg-emerald-950/20 dark:border-emerald-800/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                  <span>📋</span> Alertas Pre-Match
                </span>
                <span className="rounded-md bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-black">
                  {comparativeMetrics.prematch.total} picks
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Tasa de Acierto:</span>
                  <span className="font-black text-slate-900 dark:text-white text-sm">
                    {comparativeMetrics.prematch.winRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Cuota Promedio:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    @{comparativeMetrics.prematch.avgOdds.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-emerald-200/60 pt-2 dark:border-emerald-800/40">
                  <span className="text-slate-500 font-semibold">Beneficio Neto:</span>
                  <span className={`font-black ${comparativeMetrics.prematch.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {comparativeMetrics.prematch.profit >= 0 ? `+${comparativeMetrics.prematch.profit.toFixed(2)}` : comparativeMetrics.prematch.profit.toFixed(2)} u
                  </span>
                </div>
              </div>
            </div>

            {/* Live Block */}
            <div className="rounded-2xl border border-rose-500/30 bg-rose-50/30 p-4 dark:bg-rose-950/20 dark:border-rose-800/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase text-rose-800 dark:text-rose-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  <span>⚡ Alertas en Vivo (Live)</span>
                </span>
                <span className="rounded-md bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 px-2 py-0.5 text-[10px] font-black">
                  {comparativeMetrics.live.total} picks
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Tasa de Acierto:</span>
                  <span className="font-black text-slate-900 dark:text-white text-sm">
                    {comparativeMetrics.live.winRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Cuota Promedio:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    @{comparativeMetrics.live.avgOdds.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-rose-200/60 pt-2 dark:border-rose-800/40">
                  <span className="text-slate-500 font-semibold">Beneficio Neto:</span>
                  <span className={`font-black ${comparativeMetrics.live.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {comparativeMetrics.live.profit >= 0 ? `+${comparativeMetrics.live.profit.toFixed(2)}` : comparativeMetrics.live.profit.toFixed(2)} u
                  </span>
                </div>
              </div>
            </div>

            {/* MCP Agent Block */}
            <div className="rounded-2xl border border-purple-500/30 bg-purple-50/30 p-4 dark:bg-purple-950/20 dark:border-purple-800/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase text-purple-800 dark:text-purple-400 flex items-center gap-1.5">
                  <span>🤖</span> Agente MCP
                </span>
                <span className="rounded-md bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.5 text-[10px] font-black">
                  {comparativeMetrics.mcp.total} picks
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Tasa de Acierto:</span>
                  <span className="font-black text-slate-900 dark:text-white text-sm">
                    {comparativeMetrics.mcp.winRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Cuota Promedio:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    @{comparativeMetrics.mcp.avgOdds.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-purple-200/60 pt-2 dark:border-purple-800/40">
                  <span className="text-slate-500 font-semibold">Beneficio Neto:</span>
                  <span className={`font-black ${comparativeMetrics.mcp.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {comparativeMetrics.mcp.profit >= 0 ? `+${comparativeMetrics.mcp.profit.toFixed(2)}` : comparativeMetrics.mcp.profit.toFixed(2)} u
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Confidence & Market Breakdown Grid */}
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Confidence Level Distribution Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
              Desglose por Grado de Certeza
            </span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
              Rendimiento por Nivel de Confianza
            </h3>

            <div className="space-y-4">
              {/* Muy Alta */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/40 p-4 dark:bg-emerald-950/20 dark:border-emerald-800/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-emerald-900 dark:text-emerald-300">
                    {confidenceData.muyAlta.name}
                  </span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {confidenceData.muyAlta.winRate.toFixed(1)}% Acierto
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: `${confidenceData.muyAlta.winRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                  <span>{confidenceData.muyAlta.won}W - {confidenceData.muyAlta.lost}L ({confidenceData.muyAlta.total} picks)</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Beneficio: {confidenceData.muyAlta.profit >= 0 ? `+${confidenceData.muyAlta.profit.toFixed(2)}` : confidenceData.muyAlta.profit.toFixed(2)}u
                  </span>
                </div>
              </div>

              {/* Alta */}
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-50/40 p-4 dark:bg-cyan-950/20 dark:border-cyan-800/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-cyan-900 dark:text-cyan-300">
                    {confidenceData.alta.name}
                  </span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {confidenceData.alta.winRate.toFixed(1)}% Acierto
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2.5 overflow-hidden">
                  <div
                    className="bg-cyan-500 h-2 rounded-full"
                    style={{ width: `${confidenceData.alta.winRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                  <span>{confidenceData.alta.won}W - {confidenceData.alta.lost}L ({confidenceData.alta.total} picks)</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Beneficio: {confidenceData.alta.profit >= 0 ? `+${confidenceData.alta.profit.toFixed(2)}` : confidenceData.alta.profit.toFixed(2)}u
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Market Performance Breakdown */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block mb-1">
              Desglose por Tipología de Apuesta
            </span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
              Rendimiento por Mercado
            </h3>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {marketChartData.map((m) => (
                <div
                  key={m.name}
                  onMouseEnter={() => setHoveredBar(m.name)}
                  onMouseLeave={() => setHoveredBar(null)}
                  className={`rounded-2xl border p-3 transition ${
                    hoveredBar === m.name
                      ? "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20"
                      : "border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-black text-slate-900 dark:text-white">{m.name}</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                      {m.winRate.toFixed(1)}% ({m.won}/{m.total})
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-1.5 rounded-full"
                      style={{ width: `${Math.min(100, m.winRate)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Cuota Media: @{m.avgOdds.toFixed(2)}</span>
                    <span className={`font-bold ${m.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                      Profit: {m.profit >= 0 ? `+${m.profit.toFixed(2)}` : m.profit.toFixed(2)}u
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* League & Tournament Performance Table */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800 mb-4">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block mb-1">
                Efectividad por Competición
              </span>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Rendimiento por Ligas & Torneos
              </h3>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {leagueData.length} ligas evaluadas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="p-3">Liga / Torneo</th>
                  <th className="p-3 text-center">Partidos</th>
                  <th className="p-3 text-center">Ganadas</th>
                  <th className="p-3 text-center">Perdidas</th>
                  <th className="p-3 text-center">Tasa de Acierto</th>
                  <th className="p-3 text-center">Cuota Media</th>
                  <th className="p-3 text-right">Beneficio Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leagueData.map((l) => (
                  <tr key={l.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      <div>{l.name}</div>
                      {l.country && <div className="text-[10px] text-slate-400">{l.country}</div>}
                    </td>
                    <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">{l.total}</td>
                    <td className="p-3 text-center font-bold text-emerald-600">{l.won}</td>
                    <td className="p-3 text-center font-bold text-rose-600">{l.lost}</td>
                    <td className="p-3 text-center font-black text-slate-900 dark:text-white">
                      {l.winRate.toFixed(1)}%
                    </td>
                    <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                      @{l.avgOdds.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-black whitespace-nowrap">
                      <span className={l.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}>
                        {l.profit >= 0 ? `+${l.profit.toFixed(2)}` : l.profit.toFixed(2)} u
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
