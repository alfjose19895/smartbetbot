"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  WEEKEND_EXCLUSIVE_MODULE_NAME,
  WEEKEND_EXCLUSIVE_TARGET_COUNT,
  WEEKEND_EXCLUSIVE_RULES,
  WeekendCycleInfo,
  WeekendExclusivePick,
  WeekendSlate,
  getWeekendCycleInfo,
} from "@/lib/sports/weekend-exclusive";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { copyCardImageToClipboard } from "@/lib/sports/card-image-generator";

interface WeekendExclusiveModuleProps {
  initialSlate?: WeekendSlate | null;
  onOpenDetail?: (pick: MarketOpportunity) => void;
  showBackLink?: boolean;
}

export function WeekendExclusiveModule({
  initialSlate,
  onOpenDetail,
  showBackLink = false,
}: WeekendExclusiveModuleProps) {
  const [slate, setSlate] = useState<WeekendSlate | null>(initialSlate || null);
  const [loading, setLoading] = useState(!initialSlate);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<"all" | "friday" | "saturday" | "sunday">("all");
  const [selectedRule, setSelectedRule] = useState<"all" | "corners" | "btts" | "goals" | "local" | "away">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArchive, setSelectedArchive] = useState<string>("");
  const [editions, setEditions] = useState<string[]>([]);
  const [allExpanded, setAllExpanded] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Feedback states
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedSingleId, setCopiedSingleId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);
  const [copyImageSuccessId, setCopyImageSuccessId] = useState<string | null>(null);

  // Live countdown state
  const [liveCycle, setLiveCycle] = useState<WeekendCycleInfo>(
    initialSlate?.cycle || getWeekendCycleInfo()
  );

  // Live countdown ticker every second
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveCycle(getWeekendCycleInfo());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch weekend slate
  const fetchWeekendSlate = async (forceRefresh = false, archive?: string) => {
    try {
      if (forceRefresh) setRefreshing(true);

      const params = new URLSearchParams();
      if (forceRefresh) params.set("refresh", "true");
      if (archive) params.set("archive", archive);
      params.set("_t", Date.now().toString());

      const res = await fetch(`/api/weekend?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (data.success) {
        setSlate({
          cycle: data.cycle,
          picks: data.picks || [],
          targetCount: data.targetCount || WEEKEND_EXCLUSIVE_TARGET_COUNT,
          stats: data.stats,
          generatedAt: data.generatedAt,
        });
        if (Array.isArray(data.editions)) {
          setEditions(data.editions);
        }
      }
    } catch (err) {
      console.error("[WeekendModule] Error cargando pronósticos:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (!initialSlate) {
      const params = new URLSearchParams({ _t: Date.now().toString() });
      fetch(`/api/weekend?${params.toString()}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          if (data.success) {
            setSlate({
              cycle: data.cycle,
              picks: data.picks || [],
              targetCount: data.targetCount || WEEKEND_EXCLUSIVE_TARGET_COUNT,
              stats: data.stats,
              generatedAt: data.generatedAt,
            });
            if (Array.isArray(data.editions)) {
              setEditions(data.editions);
            }
          }
        })
        .catch((err) => {
          console.error("[WeekendModule] Error cargando pronósticos:", err);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [initialSlate]);

  const allPicks = useMemo(() => slate?.picks || [], [slate]);

  // Filtered picks by day, rule, and search
  const filteredPicks = useMemo(() => {
    return allPicks.filter((p) => {
      if (selectedDay !== "all" && p.dayOfWeek !== selectedDay) {
        return false;
      }
      if (selectedRule !== "all" && p.ruleMatch?.ruleId !== selectedRule) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const h = (p.homeTeam || "").toLowerCase();
        const a = (p.awayTeam || "").toLowerCase();
        const l = (p.league || "").toLowerCase();
        const m = (p.market || "").toLowerCase();
        return h.includes(q) || a.includes(q) || l.includes(q) || m.includes(q);
      }
      return true;
    });
  }, [allPicks, selectedDay, selectedRule, searchQuery]);

  // Counts by day
  const dayCounts = useMemo(() => {
    return {
      all: allPicks.length,
      friday: allPicks.filter((p) => p.dayOfWeek === "friday").length,
      saturday: allPicks.filter((p) => p.dayOfWeek === "saturday").length,
      sunday: allPicks.filter((p) => p.dayOfWeek === "sunday").length,
    };
  }, [allPicks]);

  // Counts by rule
  const ruleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allPicks.length,
      corners: 0,
      btts: 0,
      goals: 0,
      local: 0,
      away: 0,
    };
    allPicks.forEach((p) => {
      if (p.ruleMatch?.ruleId && counts[p.ruleMatch.ruleId] !== undefined) {
        counts[p.ruleMatch.ruleId]++;
      }
    });
    return counts;
  }, [allPicks]);

  // Card expand/minimize
  const toggleCard = (key: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [key]: prev[key] !== undefined ? !prev[key] : !allExpanded,
    }));
  };

  const toggleAllCards = () => {
    const next = !allExpanded;
    setAllExpanded(next);
    const updated: Record<string, boolean> = {};
    allPicks.forEach((p) => {
      const key = String(p.id || p.fixtureId || `${p.homeTeam}-${p.awayTeam}-${p.market}`);
      updated[key] = next;
    });
    setExpandedCards(updated);
  };

  // 1-Click Copy Full Weekend Summary
  const handleCopySummary = () => {
    if (filteredPicks.length === 0) return;

    const lines: string[] = [
      "💎⭐⭐⭐⭐⭐ EXCLUSIVAS FIN DE SEMANA — SMARTBETBOT ⭐⭐⭐⭐⭐💎",
      "🏆 Cartelera Oficial de 15 Selecciones de Alta Probabilidad",
      `📅 Ciclo: ${liveCycle.fridayDate} al ${liveCycle.sundayDate}`,
      `📊 Selecciones: ${filteredPicks.length} | Prob. Media: ${slate?.stats.avgProbability || 0}% | Cuota Media: @${(slate?.stats.avgOdds || 1.5).toFixed(2)}`,
      "",
      "---------------------------------------------",
    ];

    // Group picks by day for clear reading
    const days: Array<{ id: "friday" | "saturday" | "sunday"; label: string }> = [
      { id: "friday", label: `🗓️ VIERNES (${liveCycle.fridayDate})` },
      { id: "saturday", label: `🗓️ SÁBADO (${liveCycle.saturdayDate})` },
      { id: "sunday", label: `🗓️ DOMINGO (${liveCycle.sundayDate})` },
    ];

    days.forEach((d) => {
      const picksInDay = filteredPicks.filter((p) => p.dayOfWeek === d.id);
      if (picksInDay.length > 0) {
        lines.push("", d.label, "====================");
        picksInDay.forEach((p) => {
          const ruleLabel = p.ruleMatch ? `[${p.ruleMatch.icon} ${p.ruleMatch.ruleName}]` : "";
          lines.push(
            `#${p.weekendOrder || "⭐"} ${p.homeTeam} vs ${p.awayTeam} (${p.league})`,
            `   🎯 Selección: ${p.market} (${p.selection})`,
            `   📈 Probabilidad: ${p.probability}% | Cuota: @${(p.odds ?? 1.5).toFixed(2)}`,
            `   ✓ Regla Cumplida: ${ruleLabel}`,
            `   🧠 Análisis: "${p.explanation || "Máxima convicción estadística"}"`,
            ""
          );
        });
      }
    });

    lines.push(
      "---------------------------------------------",
      "🔒 Pronóstico Exclusivo Cuantitativo de SmartBetBot AI",
      "🌐 https://smartbetbot.educandotea.com"
    );

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 3000);
    });
  };

  // 1-Click Copy Single Text
  const handleCopySingleText = (pick: WeekendExclusivePick) => {
    const key = String(pick.id || pick.fixtureId || `${pick.homeTeam}-${pick.awayTeam}-${pick.market}`);
    const ruleLabel = pick.ruleMatch ? `[${pick.ruleMatch.icon} ${pick.ruleMatch.ruleName}]` : "";

    const text = [
      "💎 EXCLUSIVA FIN DE SEMANA SMARTBETBOT 💎",
      `📅 Día: ${pick.dayLabel} | 🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `⚽ ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico: ${pick.market} (${pick.selection})`,
      `🏢 Cuota: @${(pick.odds ?? 1.5).toFixed(2)}`,
      `📈 Probabilidad IA: ${pick.probability}% (+${pick.edge || 5}% Valor)`,
      `✓ Regla Fin de Semana: ${ruleLabel}`,
      "",
      `🧠 Análisis: "${pick.explanation || "Máxima certeza cuantitativa"}"`,
      "",
      "🔒 SmartBetBot AI Quantitative Engine",
      "🌐 https://smartbetbot.educandotea.com",
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopiedSingleId(key);
      setTimeout(() => setCopiedSingleId(null), 3000);
    });
  };

  // 1-Click Copy Card Image
  const handleCopyCardImage = async (pick: WeekendExclusivePick) => {
    const key = String(pick.id || pick.fixtureId || `${pick.homeTeam}-${pick.awayTeam}-${pick.market}`);
    try {
      setCopyingImageId(key);
      const ok = await copyCardImageToClipboard(pick);
      if (ok) {
        setCopyImageSuccessId(key);
        setTimeout(() => setCopyImageSuccessId(null), 3000);
      }
    } catch {
      // ignore
    } finally {
      setCopyingImageId(null);
    }
  };

  return (
    <section className="space-y-6">
      {/* 1. Header Banner Exclusivas Fin de Semana */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 sm:p-8 border border-indigo-500/30 shadow-2xl backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black text-xs shadow-md shadow-indigo-500/20">
                <span>💎</span>
                <span>EDICIÓN FIN DE SEMANA</span>
              </span>

              {liveCycle.isUnlocked ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  LIBERADO HASTA DOMINGO
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold text-[11px]">
                  <span>🔒</span>
                  BLOQUEADO HASTA VIERNES 6:00 AM
                </span>
              )}

              {showBackLink && (
                <Link
                  href="/signals"
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition font-medium"
                >
                  ← Ir a Pre-Match
                </Link>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              {WEEKEND_EXCLUSIVE_MODULE_NAME}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              Módulo especial reservado para las 15 selecciones cuantitativas de mayor convicción de
              todo el fin de semana (<span className="text-indigo-300 font-bold">Viernes, Sábado y Domingo</span>).
              Se desbloquea exclusivamente los viernes a las 6:00 AM (hora de Ecuador).
            </p>

            <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                📅 Ciclo: <strong className="text-slate-200">{liveCycle.fridayDate}</strong> al{" "}
                <strong className="text-slate-200">{liveCycle.sundayDate}</strong>
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline text-slate-500">
                Hora Ecuador: {liveCycle.currentEcuadorTime}
              </span>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              onClick={() => fetchWeekendSlate(true, selectedArchive)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-200 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <span className={refreshing ? "animate-spin" : ""}>🔄</span>
              <span>{refreshing ? "Actualizando..." : "Sincronizar Slate"}</span>
            </button>

            <button
              onClick={handleCopySummary}
              disabled={filteredPicks.length === 0}
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black shadow-lg transition cursor-pointer ${
                copiedSummary
                  ? "bg-emerald-600 text-white"
                  : "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:brightness-110"
              }`}
            >
              <span>{copiedSummary ? "✓" : "📋"}</span>
              <span>{copiedSummary ? "¡Resumen Copiado!" : "Copiar Resumen Finde"}</span>
            </button>
          </div>
        </div>

        {/* Countdown Ticker Box if Locked */}
        {!liveCycle.isUnlocked && (
          <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 sm:p-5 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <span>⏳</span>
                  <span>CUENTA REGRESIVA DE DESBLOQUEO</span>
                </div>
                <p className="text-xs text-slate-300">
                  La cartelera de 15 pronósticos de élite se publicará en vivo al completarse el tiempo:
                </p>
              </div>

              {/* Countdown Numbers */}
              <div className="flex items-center gap-2 text-center">
                <div className="flex flex-col rounded-xl bg-slate-900/90 border border-slate-700 px-3 py-2 min-w-[54px]">
                  <span className="text-xl sm:text-2xl font-black text-amber-400">
                    {liveCycle.countdown.days}
                  </span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Días</span>
                </div>
                <span className="text-slate-500 font-bold">:</span>
                <div className="flex flex-col rounded-xl bg-slate-900/90 border border-slate-700 px-3 py-2 min-w-[54px]">
                  <span className="text-xl sm:text-2xl font-black text-white">
                    {String(liveCycle.countdown.hours).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Horas</span>
                </div>
                <span className="text-slate-500 font-bold">:</span>
                <div className="flex flex-col rounded-xl bg-slate-900/90 border border-slate-700 px-3 py-2 min-w-[54px]">
                  <span className="text-xl sm:text-2xl font-black text-white">
                    {String(liveCycle.countdown.minutes).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Min</span>
                </div>
                <span className="text-slate-500 font-bold">:</span>
                <div className="flex flex-col rounded-xl bg-slate-900/90 border border-slate-700 px-3 py-2 min-w-[54px]">
                  <span className="text-xl sm:text-2xl font-black text-emerald-400">
                    {String(liveCycle.countdown.seconds).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] font-bold uppercase text-slate-400">Seg</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Key Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Objetivo Cumplido
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">
              {allPicks.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">/ 15 Pronósticos</span>
          </div>
          <div className="mt-1 text-[11px] text-indigo-400 font-semibold">
            {allPicks.length >= 15 ? "✓ Cartelera Completa" : "En compilación activa"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Probabilidad Media
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-400">
              {slate?.stats.avgProbability || 0}%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-medium">
            Convicción Cuantitativa IA
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Cuota Promedio
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-cyan-400">
              @{(slate?.stats.avgOdds || 1.5).toFixed(2)}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-medium">
            Rango óptimo seguro
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Distribución por Días
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs font-bold text-slate-300">
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-indigo-300">
              Vie: {dayCounts.friday}
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-purple-300">
              Sáb: {dayCounts.saturday}
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-pink-300">
              Dom: {dayCounts.sunday}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-medium">
            3 Fechas de Acción
          </div>
        </div>
      </div>

      {/* 3. Filters Bar: Day selector + Golden Rules + Search + Expand toggle */}
      <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/90 p-4 shadow-sm backdrop-blur-md">
        {/* Top: Day Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
            <span className="text-xs font-extrabold uppercase text-slate-400 mr-1 shrink-0">
              🗓️ Día:
            </span>

            <button
              onClick={() => setSelectedDay("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedDay === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              Todos los Días ({dayCounts.all})
            </button>

            <button
              onClick={() => setSelectedDay("friday")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedDay === "friday"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              Viernes ({dayCounts.friday})
            </button>

            <button
              onClick={() => setSelectedDay("saturday")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedDay === "saturday"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              Sábado ({dayCounts.saturday})
            </button>

            <button
              onClick={() => setSelectedDay("sunday")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedDay === "sunday"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-750"
              }`}
            >
              Domingo ({dayCounts.sunday})
            </button>
          </div>

          {/* Expand/Collapse All and Past Editions Dropdown */}
          <div className="flex items-center gap-2 ml-auto">
            {editions.length > 0 && (
              <select
                value={selectedArchive}
                onChange={(e) => {
                  setSelectedArchive(e.target.value);
                  fetchWeekendSlate(false, e.target.value || undefined);
                }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">Edición Actual ({liveCycle.fridayDate})</option>
                {editions.map((ed) => (
                  <option key={ed} value={ed}>
                    Archivo: {ed}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={toggleAllCards}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-750 transition cursor-pointer"
            >
              {allExpanded ? "⊟ Colapsar Todos" : "⊞ Expandir Todos"}
            </button>
          </div>
        </div>

        {/* Bottom: Golden Rules Filter Pills + Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-extrabold uppercase text-slate-400 mr-1 shrink-0">
              ⭐ Reglas:
            </span>

            <button
              onClick={() => setSelectedRule("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                selectedRule === "all"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Todas ({ruleCounts.all})
            </button>

            {WEEKEND_EXCLUSIVE_RULES.map((rule) => {
              const isSelected = selectedRule === rule.id;
              const count = ruleCounts[rule.id] || 0;
              return (
                <button
                  key={rule.id}
                  onClick={() => setSelectedRule(rule.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <span>{rule.icon}</span>
                  <span>{rule.name}</span>
                  <span className="rounded-full bg-slate-900/70 px-1.5 py-0.2 text-[10px] text-slate-300">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar equipo o liga..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Predictions List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/50 py-16 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mb-4"></div>
          <p className="text-sm font-bold text-slate-300">Compilando pronósticos del fin de semana...</p>
          <p className="text-xs text-slate-500 mt-1">
            Evaluando los fixtures de Viernes, Sábado y Domingo bajo las 5 reglas cuantitativas.
          </p>
        </div>
      ) : filteredPicks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 py-16 text-center px-4">
          <span className="text-4xl mb-3">🗓️</span>
          <h3 className="text-lg font-bold text-white">No hay selecciones que coincidan</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
            No se encontraron pronósticos que cumplan con los filtros de día o regla seleccionados.
          </p>
          <button
            onClick={() => {
              setSelectedDay("all");
              setSelectedRule("all");
              setSearchQuery("");
            }}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition cursor-pointer"
          >
            Restablecer Filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPicks.map((pick) => {
            const cardKey = String(
              pick.id || pick.fixtureId || `${pick.homeTeam}-${pick.awayTeam}-${pick.market}`
            );
            const isExpanded = expandedCards[cardKey] ?? allExpanded;
            const kickoffDate = pick.kickoff ? new Date(pick.kickoff) : null;
            const kickoffFormatted = kickoffDate
              ? kickoffDate.toLocaleTimeString("es-EC", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Guayaquil",
                })
              : "";

            return (
              <div
                key={cardKey}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-4 sm:p-5 shadow-lg transition-all hover:border-indigo-500/40 hover:shadow-indigo-500/5 backdrop-blur-sm"
              >
                {/* Card Top: Day Pill + Rule Badge */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-950/90 border border-indigo-500/40 px-2.5 py-1 text-[11px] font-black text-indigo-300">
                      <span>📅</span>
                      <span>{pick.dayLabel}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      <span>{pick.ruleMatch.icon}</span>
                      <span>{pick.ruleMatch.ruleName}</span>
                    </span>

                    <button
                      onClick={() => toggleCard(cardKey)}
                      className="ml-auto text-slate-500 hover:text-slate-300 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                      title={isExpanded ? "Minimizar tarjeta" : "Expandir tarjeta"}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>

                  {/* League & Kickoff */}
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="truncate max-w-[200px] font-medium">
                      🏆 {pick.league} {pick.country ? `(${pick.country})` : ""}
                    </span>
                    {kickoffFormatted && (
                      <span className="shrink-0 text-[11px] text-slate-400 font-mono">
                        ⏰ {kickoffFormatted}
                      </span>
                    )}
                  </div>

                  {/* Teams Matchup */}
                  <div className="mb-3">
                    <h2 className="text-base font-black text-white group-hover:text-indigo-300 transition-colors">
                      {pick.homeTeam} <span className="text-slate-500 font-normal">vs</span> {pick.awayTeam}
                    </h2>
                  </div>

                  {/* Pick Highlight Box */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          Pronóstico Oficial
                        </div>
                        <div className="text-sm font-black text-emerald-400">
                          {pick.market}: <span className="text-white">{pick.selection}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Cuota
                        </div>
                        <div className="text-base font-black text-cyan-400">
                          @{(pick.odds ?? 1.5).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Probability Progress Bar */}
                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-slate-400">Probabilidad IA</span>
                        <span className="text-emerald-400 font-black">{pick.probability}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
                          style={{ width: `${Math.min(100, pick.probability)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expandable Explanation & Rule details */}
                  {isExpanded && (
                    <div className="space-y-2 text-xs mb-3 text-slate-300 bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                        <span>🧠</span>
                        <span>{pick.explanation || "Alta convicción por patrones matemáticos y tendencia de gol/córners."}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/60 pt-1.5">
                        <span>Orden Fin de Semana: #{pick.weekendOrder}</span>
                        <span>Condición: {pick.ruleMatch.marketDescription}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="flex items-center gap-2 border-t border-slate-800/80 pt-3">
                  <button
                    onClick={() => handleCopySingleText(pick)}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                    title="Copiar texto para WhatsApp"
                  >
                    <span>{copiedSingleId === cardKey ? "✓" : "📋"}</span>
                    <span>{copiedSingleId === cardKey ? "¡Copiado!" : "Copiar"}</span>
                  </button>

                  <button
                    onClick={() => handleCopyCardImage(pick)}
                    disabled={copyingImageId === cardKey}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
                    title="Copiar imagen HD de tarjeta"
                  >
                    <span>{copyImageSuccessId === cardKey ? "✓" : "🖼️"}</span>
                    <span>
                      {copyingImageId === cardKey
                        ? "Generando..."
                        : copyImageSuccessId === cardKey
                        ? "¡Imagen OK!"
                        : "Imagen"}
                    </span>
                  </button>

                  {onOpenDetail && (
                    <button
                      onClick={() => onOpenDetail(pick)}
                      className="inline-flex items-center justify-center rounded-xl bg-indigo-600/30 border border-indigo-500/40 px-3 py-1.5 text-xs font-black text-indigo-300 hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                      title="Ver estadísticas y análisis H2H"
                    >
                      <span>📊</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
