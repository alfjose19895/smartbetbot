"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { SportSelector } from "@/components/SportSelector";
import { useLanguage } from "@/context/LanguageContext";
import { HistoricalSettledPick } from "@/lib/sports/db";
import { matchesMarketFilter, getAllSports, getSportMeta } from "@/lib/sports/registry";
import { SupportedSport } from "@/lib/sports/types";

type DateFilterMode = "all" | "today" | "yesterday" | "7d" | "30d" | "specific" | "range";
type ProbFilterMode = "all" | "muy_alta" | "alta" | "media" | "baja" | "custom";
type ModalityFilter = "all" | "prematch" | "finde_vip" | "mcp" | "bomba";

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
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    }>
      <ReportsContent />
    </Suspense>
  );
}

function ReportsContent() {
  const { language, t } = useLanguage();

  // Helper date formatter
  const getLocalDateStr = (d: Date | string) => {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateStr(d);
  }, []);

  // 1. Strict Sport Isolation State
  const [selectedSport, setSelectedSport] = useState<SupportedSport>("football");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === "admin" || (data?.user?.email || "").toLowerCase().includes("ajhs1589")) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      })
      .catch(() => setIsAdmin(false));
  }, []);

  // Read URL query param on mount if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sportParam = params.get("sport") as SupportedSport | null;
      if (sportParam && ["football", "nhl", "nba", "nfl", "ncaaf"].includes(sportParam)) {
        setSelectedSport(sportParam);
      }
    }
  }, []);

  // 2. Data State
  const [historyItems, setHistoryItems] = useState<HistoricalSettledPick[]>([]);
  const [loading, setLoading] = useState(true);

  // 3. Date Filter State
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("30d");
  const [specificDate, setSpecificDate] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // 4. Probability Filter State
  const [probFilter, setProbFilter] = useState<ProbFilterMode>("all");
  const [minProbability, setMinProbability] = useState<number>(65);

  // 5. Modality & Market Filter State
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  // Handle Sport Switching: Strict segregation
  const handleSelectSport = (sport: SupportedSport | "all") => {
    const nextSport = sport === "all" ? "football" : sport;
    setSelectedSport(nextSport);
    setMarketFilter("all");
    setModalityFilter("all");
    // Update URL query cleanly without reload
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("sport", nextSport);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Fetch history strictly isolated by sport
  const fetchHistory = async (sport: SupportedSport) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/history?sport=${encodeURIComponent(sport)}`, { cache: "no-store" });
      const data = await res.json();
      if (data && Array.isArray(data.history)) {
        setHistoryItems(data.history);
      } else {
        setHistoryItems([]);
      }
    } catch (err) {
      console.error("Error fetching history for reports:", err);
      setHistoryItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(selectedSport);
  }, [selectedSport]);

  const sportMeta = useMemo(() => {
    return getSportMeta(selectedSport) || { displayName: "Fútbol", icon: "⚽" };
  }, [selectedSport]);

  // Extract canonical match date (YYYY-MM-DD)
  const getItemDateStr = (item: HistoricalSettledPick) => {
    if (item.date && item.date.length === 10 && item.date.includes("-")) {
      return item.date;
    }
    if (item.kickoff) {
      return item.kickoff.split("T")[0].split(" ")[0];
    }
    return "";
  };

  // Step specific day backward or forward
  const handleStepDay = (deltaDays: number) => {
    const cur = specificDate ? new Date(`${specificDate}T12:00:00`) : new Date();
    cur.setDate(cur.getDate() + deltaDays);
    setSpecificDate(getLocalDateStr(cur));
    setDateFilterMode("specific");
  };

  // Filter items strictly by: Sport, Date, Probability, Modality, Market
  const filteredItems = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;

    return historyItems.filter((item) => {
      if (!item.result || item.result === "VOID") return false;

      // 1. Date Filter
      const itemDate = getItemDateStr(item);
      const itemTime = new Date(item.kickoff || item.date).getTime();

      if (dateFilterMode === "today") {
        if (itemDate !== todayStr) return false;
      } else if (dateFilterMode === "yesterday") {
        if (itemDate !== yesterdayStr) return false;
      } else if (dateFilterMode === "7d") {
        if (!isNaN(itemTime) && now - itemTime > 7 * dayMs) return false;
      } else if (dateFilterMode === "30d") {
        if (!isNaN(itemTime) && now - itemTime > 30 * dayMs) return false;
      } else if (dateFilterMode === "specific") {
        if (specificDate && itemDate !== specificDate) return false;
      } else if (dateFilterMode === "range") {
        if (startDate && itemDate < startDate) return false;
        if (endDate && itemDate > endDate) return false;
      }

      // 2. Probability Filter
      const prob = typeof item.probability === "number"
        ? item.probability
        : (item.confidence === "Muy Alta" ? 75 : item.confidence === "Alta" ? 62 : item.confidence === "Media" ? 54 : 45);

      if (probFilter === "muy_alta") {
        if (prob < 70) return false;
      } else if (probFilter === "alta") {
        if (prob < 58 || prob >= 70) return false;
      } else if (probFilter === "media") {
        if (prob < 50 || prob >= 58) return false;
      } else if (probFilter === "baja") {
        if (prob >= 50) return false;
      } else if (probFilter === "custom") {
        if (prob < minProbability) return false;
      }

      // 3. Modality Filter
      const isLive = Boolean(item.isLive || item.matchTiming === "live");
      const isMcp = Boolean(item.isMcp || item.source === "mcp" || item.pickBadge === "mcp" || (item.explanation && item.explanation.includes("MCP")));
      const isBomba = Boolean(item.pickBadge === "bomba" || (item.odds && item.odds >= 2.05));
      const isCornersVip = Boolean(item.isCornersVip || item.source === "corners_vip" || item.pickBadge === "corners_vip" || item.vipBadge === "Corners VIP");
      const isCardsVip = Boolean(item.isCardsVip || item.source === "cards_vip" || item.pickBadge === "cards_vip" || item.vipBadge === "Tarjetas VIP");
      const isShotsVip = Boolean(item.isShotsVip || item.source === "shots_vip" || item.pickBadge === "shots_vip" || item.vipBadge === "Disparos VIP");
      const isOver25Vip = Boolean(item.isOver25Vip || item.source === "over25_vip" || item.pickBadge === "over25_vip" || item.vipBadge === "Over 2.5 VIP");
      const isBttsVip = Boolean(item.isBttsVip || item.source === "btts_vip" || item.pickBadge === "btts_vip" || item.vipBadge === "Ambos Anotan VIP");
      const isFindeVip = Boolean(item.isFindeVip || item.isWeekend || item.isDestacado || item.vipBadge === "Finde VIP" || (item as any).destacadoRule);

      if (modalityFilter === "prematch" && isLive) return false;
      if (modalityFilter === "finde_vip" && !isFindeVip) return false;
      if (modalityFilter === "mcp" && !isMcp) return false;
      if (modalityFilter === "bomba" && !isBomba) return false;

      // Restrict VIP picks in reports strictly to administrators
      if (!isAdmin && (isCornersVip || isCardsVip || isShotsVip || isOver25Vip || isBttsVip)) {
        return false;
      }

      // 4. Market Filter
      if (marketFilter !== "all") {
        if (!matchesMarketFilter(marketFilter, item.market, item.selection, item)) {
          return false;
        }
      }

      return true;
    });
  }, [
    historyItems,
    dateFilterMode,
    specificDate,
    startDate,
    endDate,
    probFilter,
    minProbability,
    modalityFilter,
    marketFilter,
    todayStr,
    yesterdayStr,
  ]);

  // Global KPIs derived strictly from filtered items
  const totalSettled = filteredItems.length;
  const totalWon = filteredItems.filter((i) => i.result === "WON").length;
  const totalLost = filteredItems.filter((i) => i.result === "LOST").length;
  const overallWinRate = totalSettled > 0 ? (totalWon / totalSettled) * 100 : 0;
  const totalProfit = filteredItems.reduce((acc, i) => acc + (i.profit || 0), 0);
  const avgOdds = totalSettled > 0 ? filteredItems.reduce((acc, i) => acc + (i.odds || 0), 0) / totalSettled : 0;
  const roi = totalSettled > 0 ? (totalProfit / (totalSettled * 10)) * 100 : 0;

  // Comparative Modality Breakdown (Strictly derived from filteredItems)
  const comparativeMetrics = useMemo(() => {
    const computeStats = (items: HistoricalSettledPick[]) => {
      const total = items.length;
      const won = items.filter((i) => i.result === "WON").length;
      const winRate = total > 0 ? (won / total) * 100 : 0;
      const profit = items.reduce((acc, i) => acc + (i.profit || 0), 0);
      const odds = total > 0 ? items.reduce((acc, i) => acc + (i.odds || 0), 0) / total : 0;
      return { total, won, lost: total - won, winRate, profit, avgOdds: odds };
    };

    const prematchPicks = filteredItems.filter((h) => !h.isLive && h.matchTiming !== "live");
    const findeVipPicks = filteredItems.filter((h) => h.isFindeVip || h.isWeekend || h.isDestacado || h.vipBadge === "Finde VIP" || (h as any).destacadoRule);
    const mcpPicks = filteredItems.filter((h) => h.isMcp || h.pickBadge === "mcp");
    const bombaPicks = filteredItems.filter((h) => h.pickBadge === "bomba" || h.odds >= 2.05);

    return {
      prematch: computeStats(prematchPicks),
      finde_vip: computeStats(findeVipPicks),
      mcp: computeStats(mcpPicks),
      bomba: computeStats(bombaPicks),
    };
  }, [filteredItems]);

  // Confidence Breakdown
  const confidenceData = useMemo(() => {
    const muyAlta = { total: 0, won: 0, lost: 0, profit: 0, oddsSum: 0 };
    const alta = { total: 0, won: 0, lost: 0, profit: 0, oddsSum: 0 };
    const media = { total: 0, won: 0, lost: 0, profit: 0, oddsSum: 0 };

    filteredItems.forEach((i) => {
      const prob = i.probability ?? (i.confidence === "Muy Alta" ? 75 : i.confidence === "Alta" ? 62 : i.confidence === "Media" ? 54 : 45);
      let target = media;
      if (prob >= 70 || i.confidence === "Muy Alta") target = muyAlta;
      else if (prob >= 58 || i.confidence === "Alta") target = alta;

      target.total++;
      if (i.result === "WON") target.won++;
      else if (i.result === "LOST") target.lost++;
      target.profit += i.profit || 0;
      target.oddsSum += i.odds || 0;
    });

    return {
      muyAlta: {
        name: "⭐⭐⭐ Muy Alta (≥70%)",
        ...muyAlta,
        winRate: muyAlta.total > 0 ? (muyAlta.won / muyAlta.total) * 100 : 0,
        avgOdds: muyAlta.total > 0 ? muyAlta.oddsSum / muyAlta.total : 0,
        color: "#10B981",
      },
      alta: {
        name: "⭐⭐ Alta (58% - 69%)",
        ...alta,
        winRate: alta.total > 0 ? (alta.won / alta.total) * 100 : 0,
        avgOdds: alta.total > 0 ? alta.oddsSum / alta.total : 0,
        color: "#06B6D4",
      },
      media: {
        name: "⭐ Media (50% - 57%)",
        ...media,
        winRate: media.total > 0 ? (media.won / media.total) * 100 : 0,
        avgOdds: media.total > 0 ? media.oddsSum / media.total : 0,
        color: "#8B5CF6",
      },
    };
  }, [filteredItems]);

  // Markets Breakdown for Grid
  const marketChartData = useMemo((): MetricItem[] => {
    const map: Record<string, { total: number; won: number; lost: number; oddsSum: number; profit: number }> = {};

    filteredItems.forEach((i) => {
      let canonicalMarket = i.market || "General";
      const mLower = canonicalMarket.toLowerCase();

      if (selectedSport === "football") {
        if (i.isCornersVip || i.source === "corners_vip" || i.vipBadge === "Corners VIP" || mLower.includes("córner") || mLower.includes("corner")) {
          canonicalMarket = "🚩 Corners VIP (≥70%)";
        } else if (i.isOver25Vip || i.source === "over25_vip" || i.vipBadge === "Over 2.5 VIP" || mLower.includes("over 2.5")) {
          canonicalMarket = "⚽ Over 2.5 VIP (≥60%)";
        } else if (i.isBttsVip || i.source === "btts_vip" || i.vipBadge === "Ambos Anotan VIP" || mLower.includes("ambos") || mLower.includes("btts")) {
          canonicalMarket = "🥅 Ambos Anotan VIP (≥58%)";
        } else if (i.isHomeWinVip || i.source === "home_win_vip" || i.vipBadge === "Ganador Local VIP" || mLower.includes("ganador local") || mLower.includes("gana local")) {
          canonicalMarket = "🏠 Gana Local VIP (≥58%)";
        } else if (i.isAwayWinVip || i.source === "away_win_vip" || i.vipBadge === "Ganador Visitante VIP" || mLower.includes("ganador visitante") || mLower.includes("gana visitante")) {
          canonicalMarket = "✈️ Gana Visitante VIP (≥65%)";
        } else if (i.isCardsVip || i.source === "cards_vip" || i.vipBadge === "Tarjetas VIP" || mLower.includes("tarjeta") || mLower.includes("card")) {
          canonicalMarket = "🟨 Tarjetas VIP";
        } else if (i.isShotsVip || i.source === "shots_vip" || i.vipBadge === "Disparos VIP" || mLower.includes("disparo") || mLower.includes("shot") || mLower.includes("remate")) {
          canonicalMarket = "🎯 Disparos VIP";
        } else if (mLower.includes("over 1.5")) {
          canonicalMarket = "Over 1.5 Goles";
        }
      } else if (selectedSport === "nhl") {
        if (mLower.includes("puck")) canonicalMarket = "Puck Line (-1.5 / +1.5)";
        else if (mLower.includes("total") || mLower.includes("over") || mLower.includes("under")) canonicalMarket = "Total Goles (Over/Under)";
        else canonicalMarket = "Moneyline Directo";
      } else if (selectedSport === "nba") {
        if (mLower.includes("spread")) canonicalMarket = "Spread (Hándicap)";
        else if (mLower.includes("total")) canonicalMarket = "Total Puntos (Over/Under)";
        else canonicalMarket = "Moneyline Directo";
      }

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
  }, [filteredItems, selectedSport]);

  // League Breakdown
  const leagueData = useMemo((): MetricItem[] => {
    const map: Record<string, { total: number; won: number; lost: number; profit: number; oddsSum: number; country?: string }> = {};

    filteredItems.forEach((i) => {
      const l = i.league || (selectedSport === "nhl" ? "NHL" : "Otras Competiciones");
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
  }, [filteredItems, selectedSport]);

  // Sport-specific market filter buttons
  const availableSportMarkets = useMemo(() => {
    if (selectedSport === "football") {
      return [
        { id: "all", label: "🌐 Todos los Mercados" },
        { id: "corners_vip", label: "🚩 Corners VIP (Córners +EV ≥ 70%)" },
        { id: "over25_vip", label: "⚽ Over 2.5 VIP (Goles Totales ≥ 60%)" },
        { id: "btts_vip", label: "🥅 Ambos Anotan VIP (BTTS ≥ 58%)" },
        { id: "home_win_vip", label: "🏠 Gana Local VIP (Local ≥ 58%)" },
        { id: "away_win_vip", label: "✈️ Gana Visitante VIP (Visitante ≥ 65%)" },
        { id: "cards_vip", label: "🟨 Tarjetas VIP (Cuantitativo)" },
        { id: "shots_vip", label: "🎯 Disparos VIP (Cuantitativo)" },
      ];
    }
    if (selectedSport === "nhl") {
      return [
        { id: "all", label: "🌐 Todos los Mercados" },
        { id: "Moneyline", label: "🏒 Moneyline Directo" },
        { id: "Puck Line", label: "🛡️ Puck Line (-1.5 / +1.5)" },
        { id: "Total Goals", label: "🎯 Total Goles Over/Under" },
      ];
    }
    return [
      { id: "all", label: "🌐 Todos los Mercados" },
      { id: "Moneyline", label: "🎯 Moneyline" },
      { id: "Spread", label: "⚖️ Spread / Hándicap" },
      { id: "Total Points", label: "🔢 Total Puntos" },
    ];
  }, [selectedSport]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        
        {/* Header Strip with Title & Sport Badge */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                📈
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                Reportes Cuantitativos & Rendimiento Oficial
              </span>
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {sportMeta.icon} {sportMeta.displayName}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Reportes & Rendimiento: {sportMeta.displayName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
              Auditoría independiente y métricas matemáticas exclusivas de <strong>{sportMeta.displayName}</strong>. Cada deporte cuenta con su propio registro aislado sin unificación ni mezcla de resultados.
            </p>
          </div>
        </div>

        {/* 1. SELECCIÓN DE DEPORTE ESTRICTA (Sin botón "Todos los Deportes" unificado) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span>🏆</span> Deporte Activo (Historial & Reporte Independiente):
            </span>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {historyItems.length} pronósticos auditados en {sportMeta.displayName}
            </span>
          </div>
          <SportSelector
            selectedSport={selectedSport}
            onSelectSport={handleSelectSport}
            showAll={false}
          />
        </div>

        {/* 2. FILTRO DE FECHA (Día Específico, Días Específicos / Rango, Presets) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>📅</span> Filtro de Fecha:
            </span>
            <span className="text-xs font-bold text-slate-500">
              {dateFilterMode === "specific" && specificDate && `Día Seleccionado: ${specificDate}`}
              {dateFilterMode === "range" && (startDate || endDate) && `Rango: ${startDate || "Inicio"} al ${endDate || "Hoy"}`}
              {dateFilterMode === "today" && `Hoy (${todayStr})`}
              {dateFilterMode === "yesterday" && `Ayer (${yesterdayStr})`}
              {dateFilterMode === "7d" && "Últimos 7 Días"}
              {dateFilterMode === "30d" && "Últimos 30 Días"}
              {dateFilterMode === "all" && "Histórico Completo"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "🌐 Histórico Completo" },
              { id: "today", label: "📅 Solo Hoy" },
              { id: "yesterday", label: "⏪ Ayer" },
              { id: "7d", label: "⏱️ 7 Días" },
              { id: "30d", label: "📆 30 Días" },
              { id: "specific", label: "🎯 Día Específico" },
              { id: "range", label: "🗓️ Rango de Fechas" },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setDateFilterMode(btn.id as DateFilterMode)}
                className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                  dateFilterMode === btn.id
                    ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Selector de Día Específico */}
          {dateFilterMode === "specific" && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 p-2.5 rounded-xl dark:bg-slate-950/40">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Seleccione el día exacto:
              </span>
              <button
                onClick={() => handleStepDay(-1)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                title="Día anterior"
              >
                ◀ Anterior
              </button>
              <input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-black text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => handleStepDay(1)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                title="Día siguiente"
              >
                Siguiente ▶
              </button>
              <button
                onClick={() => setSpecificDate(todayStr)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 cursor-pointer"
              >
                Hoy
              </button>
            </div>
          )}

          {/* Selector de Rango de Fechas */}
          {dateFilterMode === "range" && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 p-2.5 rounded-xl dark:bg-slate-950/40">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Desde:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-black text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Hasta:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-black text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 3. FILTRO DE PORCENTAJE DE PROBABILIDAD */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>🎯</span> Filtro de Probabilidad del Modelo:
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {filteredItems.length} pronósticos cumplen este rango
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "🎲 Todas (0% - 100%)" },
              { id: "muy_alta", label: "⭐⭐⭐ Muy Alta (≥70%)" },
              { id: "alta", label: "⭐⭐ Alta (58% - 69%)" },
              { id: "media", label: "⭐ Media (50% - 57%)" },
              { id: "baja", label: "⚠️ Moderada (<50%)" },
              { id: "custom", label: `🎚️ Umbral (≥${minProbability}%)` },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setProbFilter(btn.id as ProbFilterMode)}
                className={`rounded-xl px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                  probFilter === btn.id
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Slider de Umbral Personalizado */}
          {probFilter === "custom" && (
            <div className="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 p-2.5 rounded-xl dark:bg-slate-950/40">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Probabilidad Mínima:
              </span>
              <input
                type="range"
                min="45"
                max="85"
                step="1"
                value={minProbability}
                onChange={(e) => setMinProbability(parseInt(e.target.value, 10))}
                className="w-48 cursor-pointer accent-emerald-500"
              />
              <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
                ≥ {minProbability}%
              </span>
            </div>
          )}
        </div>

        {/* 4. MODALIDAD & MERCADO */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          {/* Modalidad */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 mr-1">Modalidad:</span>
            <button
              onClick={() => setModalityFilter("all")}
              className={`rounded-xl px-3 py-1 text-xs font-black transition cursor-pointer ${
                modalityFilter === "all"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Todas ({filteredItems.length})
            </button>
            <button
              onClick={() => setModalityFilter("prematch")}
              className={`rounded-xl px-3 py-1 text-xs font-black transition cursor-pointer ${
                modalityFilter === "prematch"
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
              }`}
            >
              📋 Pre-Match ({comparativeMetrics.prematch.total})
            </button>
            <button
              onClick={() => setModalityFilter("finde_vip")}
              className={`rounded-xl px-3 py-1 text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                modalityFilter === "finde_vip"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:text-cyan-300"
              }`}
            >
              <span>💎 Finde VIP ({comparativeMetrics.finde_vip.total})</span>
            </button>
            {isAdmin && selectedSport === "football" && (
              <button
                onClick={() => setModalityFilter("mcp")}
                className={`rounded-xl px-3 py-1 text-xs font-black transition cursor-pointer ${
                  modalityFilter === "mcp"
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 text-purple-800 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300"
                }`}
              >
                🤖 Agente MCP ({comparativeMetrics.mcp.total})
              </button>
            )}
          </div>

          {/* Mercados */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 mr-1">Mercado:</span>
            {availableSportMarkets.map((m) => (
              <button
                key={m.id}
                onClick={() => setMarketFilter(m.id)}
                className={`rounded-xl px-2.5 py-1 text-xs font-black transition cursor-pointer ${
                  marketFilter === m.id
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Global KPIs Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pronósticos Auditados
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                {totalSettled}
              </span>
              <span className="text-xs font-bold text-slate-500">{sportMeta.displayName}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
              <span className="text-emerald-600 dark:text-emerald-400">{totalWon} Ganados</span>
              <span className="text-rose-600 dark:text-rose-400">{totalLost} Perdidos</span>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-xs dark:from-emerald-950/20 dark:to-slate-900 dark:border-emerald-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Tasa de Acierto (Win Rate)
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                {overallWinRate.toFixed(1)}%
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">efectividad</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
              <span>{totalWon} de {totalSettled} aciertos</span>
              <span className="text-emerald-600">Verificado</span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-50 to-white p-5 shadow-xs dark:from-cyan-950/20 dark:to-slate-900 dark:border-cyan-900/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Beneficio Neto (Yield)
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-3xl sm:text-4xl font-black ${totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {totalProfit >= 0 ? `+${totalProfit.toFixed(2)}` : totalProfit.toFixed(2)} u
              </span>
              <span className="text-xs font-bold text-slate-500">unidades</span>
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
              <span>Modelo Cuantitativo</span>
              <span>Auditado Real</span>
            </div>
          </div>
        </div>

        {/* Empty State if no picks found */}
        {totalSettled === 0 && !loading && (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center bg-white dark:bg-slate-900/50">
            <span className="text-4xl mb-3 block">🔍</span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              No hay pronósticos auditados para los filtros seleccionados
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              No se encontraron pronósticos de {sportMeta.displayName} para el período de fecha o porcentaje de probabilidad actual. Intente seleccionar otro día o ampliar el rango.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  setDateFilterMode("all");
                  setProbFilter("all");
                  setMarketFilter("all");
                  setModalityFilter("all");
                }}
                className="rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 px-4 py-2 text-xs font-black cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          </div>
        )}

        {totalSettled > 0 && (
          <>
            {/* Grids: Desglose por Convicción & Mercados */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Confidence Breakdown Card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
                  Distribución por Convicción Matemática
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
                  Efectividad por Rango de Probabilidad
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

                  {/* Media */}
                  <div className="rounded-2xl border border-purple-500/20 bg-purple-50/40 p-4 dark:bg-purple-950/20 dark:border-purple-800/40">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-purple-900 dark:text-purple-300">
                        {confidenceData.media.name}
                      </span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {confidenceData.media.winRate.toFixed(1)}% Acierto
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2.5 overflow-hidden">
                      <div
                        className="bg-purple-500 h-2 rounded-full"
                        style={{ width: `${confidenceData.media.winRate}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                      <span>{confidenceData.media.won}W - {confidenceData.media.lost}L ({confidenceData.media.total} picks)</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        Beneficio: {confidenceData.media.profit >= 0 ? `+${confidenceData.media.profit.toFixed(2)}` : confidenceData.media.profit.toFixed(2)}u
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Market Performance Breakdown */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block mb-1">
                  Desglose por Tipología en {sportMeta.displayName}
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
                  Rendimiento por Mercado
                </h3>

                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
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
                    Efectividad por Competición en {sportMeta.displayName}
                  </span>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Rendimiento por Ligas / Divisiones
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {leagueData.length} torneos / divisiones auditadas
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="p-3">Liga / División</th>
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

            {/* Listado de Partidos Auditados Bajo Este Filtro */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800 mb-4">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-0.5">
                    Detalle de Pronósticos Auditados
                  </span>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Registro de Partidos ({filteredItems.length} evaluados)
                  </h3>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Partido</th>
                      <th className="p-2.5">Mercado & Selección</th>
                      <th className="p-2.5 text-center">Probabilidad</th>
                      <th className="p-2.5 text-center">Cuota</th>
                      <th className="p-2.5 text-center">Marcador</th>
                      <th className="p-2.5 text-center">Resultado</th>
                      <th className="p-2.5 text-right">Beneficio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredItems.slice(0, 50).map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2.5 whitespace-nowrap text-slate-500 font-bold">
                          {getItemDateStr(item)}
                        </td>
                        <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                          <div>{item.match}</div>
                          <div className="text-[10px] text-slate-400">{item.league}</div>
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{item.market}</span>
                            {(item.isCornersVip || item.source === "corners_vip" || item.pickBadge === "corners_vip" || item.vipBadge === "Corners VIP") && (
                              <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-black text-amber-400">
                                🚩 Corners VIP
                              </span>
                            )}
                            {(item.isCardsVip || item.source === "cards_vip" || item.pickBadge === "cards_vip" || item.vipBadge === "Tarjetas VIP") && (
                              <span className="rounded bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 text-[9px] font-black text-yellow-400">
                                🟨 Tarjetas VIP
                              </span>
                            )}
                            {(item.isShotsVip || item.source === "shots_vip" || item.pickBadge === "shots_vip" || item.vipBadge === "Disparos VIP") && (
                              <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 text-[9px] font-black text-cyan-400">
                                🎯 Disparos VIP
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black">{item.selection}</span>
                        </td>
                        <td className="p-2.5 text-center font-black text-slate-900 dark:text-white">
                          {item.probability ? `${item.probability}%` : "—"}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-700 dark:text-slate-300">
                          @{item.odds ? item.odds.toFixed(2) : "1.80"}
                        </td>
                        <td className="p-2.5 text-center font-black text-slate-800 dark:text-slate-200">
                          {item.score || "—"}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black ${
                            item.result === "WON"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          }`}>
                            {item.result === "WON" ? "✓ GANADA" : "✗ PERDIDA"}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-black whitespace-nowrap">
                          <span className={item.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}>
                            {item.profit >= 0 ? `+${item.profit.toFixed(2)}` : item.profit.toFixed(2)} u
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
