"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  MarketOpportunity,
  DESTACADOS_5_STARS_RULES,
  getDestacadoRuleMatch,
  isDestacadoPick,
  sortByKickoff,
} from "@/lib/sports/prediction-engine";
import {
  copyCardImageToClipboard,
  shareCardAsImage,
} from "@/lib/sports/card-image-generator";

interface DestacadosModuleProps {
  predictions?: MarketOpportunity[];
  loading?: boolean;
  onOpenDetail?: (pick: MarketOpportunity) => void;
  onRefresh?: () => void;
  showBackLink?: boolean;
  titleSuffix?: string;
}

export function DestacadosModule({
  predictions = [],
  loading = false,
  onOpenDetail,
  onRefresh,
  showBackLink = false,
  titleSuffix,
}: DestacadosModuleProps) {
  const [selectedRuleFilter, setSelectedRuleFilter] = useState<
    "ALL" | "corners" | "btts" | "goals" | "local" | "away" | "cards" | "shots"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedSingleId, setCopiedSingleId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);
  const [copyImageSuccessId, setCopyImageSuccessId] = useState<string | null>(null);
  const [allExpanded, setAllExpanded] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Filter only football predictions that meet the 5 strict rules
  const allDestacados = useMemo(() => {
    const list = predictions.filter((p) => {
      // Must be football
      const sp = ((p as any).sport || "").toLowerCase();
      const c = (p.country || "").toUpperCase();
      const l = (p.league || "").toUpperCase();
      if (
        sp === "nhl" ||
        sp === "nba" ||
        sp === "nfl" ||
        sp === "ncaaf" ||
        c === "NHL" ||
        c === "NBA" ||
        c === "NFL" ||
        l.includes("NHL") ||
        l.includes("NBA") ||
        l.includes("NFL")
      ) {
        return false;
      }
      return isDestacadoPick(p);
    });
    return sortByKickoff(list, "asc");
  }, [predictions]);

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
    allDestacados.forEach((p) => {
      const key = String(p.id || p.fixtureId || `${p.homeTeam}-${p.awayTeam}-${p.market}`);
      updated[key] = next;
    });
    setExpandedCards(updated);
  };

  // Counts per rule
  const ruleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      corners: 0,
      btts: 0,
      goals: 0,
      local: 0,
      away: 0,
      cards: 0,
      shots: 0,
    };
    allDestacados.forEach((p) => {
      const match = getDestacadoRuleMatch(p);
      if (match && counts[match.ruleId] !== undefined) {
        counts[match.ruleId]++;
      }
    });
    return counts;
  }, [allDestacados]);

  // Filtered by selected rule and search query
  const filteredDestacados = useMemo(() => {
    const list = allDestacados.filter((p) => {
      const match = getDestacadoRuleMatch(p);
      if (selectedRuleFilter !== "ALL" && match?.ruleId !== selectedRuleFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const h = (p.homeTeam || "").toLowerCase();
        const a = (p.awayTeam || "").toLowerCase();
        const l = (p.league || "").toLowerCase();
        const m = (p.market || "").toLowerCase();
        return (
          h.includes(q) ||
          a.includes(q) ||
          l.includes(q) ||
          m.includes(q)
        );
      }
      return true;
    });
    return sortByKickoff(list, "asc");
  }, [allDestacados, selectedRuleFilter, searchQuery]);

  // Metrics
  const avgProb = useMemo(() => {
    if (allDestacados.length === 0) return 0;
    const sum = allDestacados.reduce((acc, p) => acc + (p.probability || 0), 0);
    return Math.round((sum / allDestacados.length) * 10) / 10;
  }, [allDestacados]);

  const avgOdds = useMemo(() => {
    if (allDestacados.length === 0) return 0;
    const sum = allDestacados.reduce((acc, p) => acc + (p.odds || 0), 0);
    return Math.round((sum / allDestacados.length) * 100) / 100;
  }, [allDestacados]);

  const wonCount = useMemo(() => {
    return allDestacados.filter(
      (p) =>
        p.status === "won" ||
        (p as any).result === "WON" ||
        (p.status as string) === "WON"
    ).length;
  }, [allDestacados]);

  const lostCount = useMemo(() => {
    return allDestacados.filter(
      (p) =>
        p.status === "lost" ||
        (p as any).result === "LOST" ||
        (p.status as string) === "LOST"
    ).length;
  }, [allDestacados]);

  const pendingCount = useMemo(() => {
    return allDestacados.filter(
      (p) =>
        p.status !== "won" &&
        p.status !== "lost" &&
        (p as any).result !== "WON" &&
        (p as any).result !== "LOST"
    ).length;
  }, [allDestacados]);

  const settledCount = wonCount + lostCount;
  const winRate = settledCount > 0 ? Math.round((wonCount / settledCount) * 1000) / 10 : 0;

  const handleCopySummary = () => {
    if (filteredDestacados.length === 0) return;

    const lines: string[] = [
      "⭐⭐⭐⭐⭐ PRONÓSTICOS DESTACADOS — SMARTBETBOT ⭐⭐⭐⭐⭐",
      "🏆 Filtro Cuantitativo de Alta Convicción (Fútbol)",
      `📅 Fecha: ${new Intl.DateTimeFormat("es-ES", { dateStyle: "full" }).format(new Date())}`,
      `📊 Selecciones: ${filteredDestacados.length} | Ganadas: ${wonCount} | Perdidas: ${lostCount} | Acierto: ${settledCount > 0 ? `${winRate}%` : "En juego"}`,
      `📈 Prob. Media: ${avgProb}% | Cuota Media: @${avgOdds.toFixed(2)}`,
      "",
      "---------------------------------------------",
    ];

    filteredDestacados.forEach((p, idx) => {
      const match = getDestacadoRuleMatch(p);
      const ruleLabel = match ? `[${match.icon} ${match.marketDescription}]` : "";
      const statusText =
        p.status === "won" || (p as any).result === "WON"
          ? `✓ GANADA ${p.actualScore ? `(${p.actualScore})` : ""}`
          : p.status === "lost" || (p as any).result === "LOST"
          ? `✗ PERDIDA ${p.actualScore ? `(${p.actualScore})` : ""}`
          : "⏳ Pendiente";

      lines.push(
        `${idx + 1}. ⭐ ${p.homeTeam} vs ${p.awayTeam} (${p.league})`,
        `   🎯 Mercado: ${p.market} (${p.selection})`,
        `   📈 Probabilidad: ${p.probability}% | Cuota: @${(p.odds ?? 1.5).toFixed(2)}`,
        `   📊 Estado: ${statusText}`,
        `   ✓ Regla Cumplida: ${ruleLabel}`,
        `   🧠 Análisis: "${p.explanation || "Máxima convicción estadística"}"`,
        ""
      );
    });

    lines.push(
      "---------------------------------------------",
      "🔒 Pronósticos Oficiales Cuantitativos de SmartBetBot AI",
      "🌐 https://smartbetbot.educandotea.com"
    );

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 3000);
    });
  };

  const handleCopySingleText = (pick: MarketOpportunity) => {
    const key = String(pick.id || pick.fixtureId || `${pick.homeTeam}-${pick.awayTeam}-${pick.market}`);
    const match = getDestacadoRuleMatch(pick);
    const ruleLabel = match ? `[${match.icon} ${match.marketDescription}]` : "";
    const statusText =
      pick.status === "won" || (pick as any).result === "WON"
        ? `✓ GANADA ${pick.actualScore ? `(${pick.actualScore})` : ""}`
        : pick.status === "lost" || (pick as any).result === "LOST"
        ? `✗ PERDIDA ${pick.actualScore ? `(${pick.actualScore})` : ""}`
        : "⏳ Pendiente";

    const text = [
      "⭐⭐⭐⭐⭐ PRONÓSTICO DESTACADO ⭐⭐⭐⭐⭐",
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `⚽ ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico: ${pick.market} (${pick.selection})`,
      `🏢 Cuota: @${(pick.odds ?? 1.5).toFixed(2)}`,
      `📈 Probabilidad IA: ${pick.probability}% (+${pick.edge || 5}% Valor)`,
      `📊 Estado: ${statusText}`,
      `✓ Regla Destacados: ${ruleLabel}`,
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

  const handleCopyCardImage = async (pick: MarketOpportunity) => {
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
      {/* 1. Header Banner 5 Stars Flagship */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-950 p-6 sm:p-8 border border-amber-500/40 shadow-2xl backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-64 w-64 rounded-full bg-yellow-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20">
                <span className="tracking-tighter">⭐⭐⭐⭐⭐</span>
                <span>DESTACADOS DE FÚTBOL</span>
              </span>
              <span className="text-[11px] font-bold text-amber-300/90 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                Solo 5 Reglas Estrictas
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight flex items-center gap-2.5 flex-wrap">
              <span>Pronósticos Destacados 5 Estrellas</span>
              {titleSuffix && (
                <span className="text-amber-400 font-bold text-lg sm:text-2xl">
                  {titleSuffix}
                </span>
              )}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Módulo automatizado exclusivo para <strong>fútbol</strong>. Filtra únicamente
              las apuestas que cumplen a rajatabla los 5 umbrales estadísticos de alta convicción:
              <span className="block mt-1 text-[11px] text-amber-200/90 font-medium">
                Alta de Córners (≥70%) · Ambos Anotan (≥58%) · Alta de Goles (≥60%) ·
                Ganador Local (≥58%) · Ganador Visitante (≥60%).
              </span>
            </p>
          </div>

          {/* Quick Actions Header */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 self-start md:self-auto">
            {showBackLink && (
              <Link
                href="/signals"
                className="px-4 py-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-750 text-slate-200 text-xs font-bold transition border border-slate-700/80 flex items-center justify-center gap-1.5"
              >
                <span>←</span>
                <span>Ver Pre-Match</span>
              </Link>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-4 py-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-750 text-slate-200 text-xs font-bold transition border border-slate-700/80 flex items-center justify-center gap-1.5 cursor-pointer"
                title="Actualizar datos en vivo"
              >
                <span>🔄</span>
                <span>Refrescar</span>
              </button>
            )}

            <button
              onClick={handleCopySummary}
              disabled={filteredDestacados.length === 0}
              className={`px-5 py-2.5 rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                copiedSummary
                  ? "bg-emerald-500 text-slate-950 shadow-emerald-500/30"
                  : "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 hover:brightness-105 shadow-amber-500/30"
              }`}
            >
              <span>{copiedSummary ? "✓" : "📋"}</span>
              <span>{copiedSummary ? "¡Copiado al Portapapeles!" : "Copiar Todo el Módulo"}</span>
            </button>
          </div>
        </div>

        {/* 2. Top Metrics Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Total Destacadas
            </span>
            <div className="text-2xl font-black text-amber-400 mt-0.5">
              {allDestacados.length}
            </div>
          </div>

          <div className="rounded-2xl bg-emerald-950/20 p-3.5 border border-emerald-900/40 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
              Ganadas
            </span>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">
              ✓ {wonCount}
            </div>
          </div>

          <div className="rounded-2xl bg-rose-950/20 p-3.5 border border-rose-900/40 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block">
              Perdidas
            </span>
            <div className="text-2xl font-black text-rose-400 mt-0.5">
              ✗ {lostCount}
            </div>
          </div>

          <div className="rounded-2xl bg-amber-950/30 p-3.5 border border-amber-500/40 text-center shadow-sm shadow-amber-500/10">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
              Tasa de Acierto
            </span>
            <div className={`text-2xl font-black mt-0.5 ${
              settledCount === 0
                ? "text-slate-400"
                : winRate >= 70
                ? "text-emerald-400"
                : winRate >= 50
                ? "text-yellow-400"
                : "text-rose-400"
            }`}>
              {settledCount > 0 ? `${winRate}%` : "—"}
            </div>
            <span className="text-[9px] text-slate-500 font-bold block mt-0.5">
              {settledCount > 0 ? `(${wonCount}/${settledCount} fin.)` : "Sin finalizar"}
            </span>
          </div>

          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
              Pendientes
            </span>
            <div className="text-2xl font-black text-blue-400 mt-0.5">
              ⏳ {pendingCount}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Probabilidad Media
            </span>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">
              {avgProb > 0 ? `${avgProb}%` : "—"}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Cuota Promedio
            </span>
            <div className="text-2xl font-black text-white mt-0.5">
              {avgOdds > 0 ? `@${avgOdds.toFixed(2)}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* 3. The 5 Rules Interactive Selection Bar */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-sm">⭐</span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-300">
              Reglas Oficiales del Módulo Destacados (Filtra por Regla):
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            Mostrando {filteredDestacados.length} de {allDestacados.length} apuestas
          </span>
        </div>

        {/* Rule Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedRuleFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              selectedRuleFilter === "ALL"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-750 border border-slate-700/80"
            }`}
          >
            <span>⭐⭐⭐⭐⭐</span>
            <span>Todas las Destacadas ({allDestacados.length})</span>
          </button>

          {DESTACADOS_5_STARS_RULES.map((rule) => {
            const count = ruleCounts[rule.id] || 0;
            const isSelected = selectedRuleFilter === rule.id;
            return (
              <button
                key={rule.id}
                onClick={() => setSelectedRuleFilter(rule.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/20"
                    : count > 0
                    ? "bg-slate-950 text-slate-200 border-slate-700 hover:border-amber-500/50 hover:bg-slate-900"
                    : "bg-slate-950/50 text-slate-500 border-slate-800/80 opacity-60 cursor-not-allowed"
                }`}
              >
                <span>{rule.icon}</span>
                <span>{rule.name}</span>
                <span
                  className={`text-[10px] font-extrabold rounded-md px-1.5 py-0.2 ${
                    isSelected
                      ? "bg-slate-950/30 text-slate-950"
                      : "bg-slate-800 text-amber-400"
                  }`}
                >
                  {rule.description.replace("Probabilidad ", "")}
                </span>
                <span className="text-[11px] font-black">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search Input for Quick Filtering */}
        <div className="pt-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔎 Buscar por equipo, liga o mercado en Destacados..."
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none transition"
          />
        </div>
      </div>

      {/* 4. Predictions Display Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent shadow-lg" />
          <p className="text-xs font-bold text-slate-400">
            Analizando y filtrando pronósticos destacados de fútbol...
          </p>
        </div>
      ) : filteredDestacados.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/60 p-8 sm:p-12 text-center space-y-4">
          <div className="text-4xl">⭐⭐⭐⭐⭐</div>
          <h3 className="text-lg font-black text-white">
            No hay apuestas que cumplan los 5 criterios destacados en este momento
          </h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
            Las reglas del módulo Destacados son de alta exigencia cuantitativa:
            <br />
            <strong>Alta Córners (≥70%)</strong> · <strong>Ambos Anotan (≥58%)</strong> ·{" "}
            <strong>Alta Goles (≥60%)</strong> · <strong>Ganador Local (≥58%)</strong> ·{" "}
            <strong>Ganador Visitante (≥60%)</strong>.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black hover:bg-amber-400 transition cursor-pointer"
              >
                🔄 Actualizar Cartelera
              </button>
            )}
            <Link
              href="/signals"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700"
            >
              📋 Ver Toda la Cartelera Pre-Match
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header over cards: Count + Master Expand/Minimize Toggle */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 flex-wrap gap-2">
            <span className="font-bold flex items-center gap-1.5">
              <span>👑</span>
              <span>
                {filteredDestacados.length}{" "}
                {filteredDestacados.length === 1 ? "Apuesta Destacada" : "Apuestas Destacadas"}{" "}
                {selectedRuleFilter !== "ALL" ? "bajo este criterio" : "hoy"}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleAllCards}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 text-xs font-bold transition cursor-pointer shadow-xs"
                title={allExpanded ? "Minimizar todas las tarjetas" : "Expandir todas las tarjetas"}
              >
                <span>{allExpanded ? "⤡" : "⤢"}</span>
                <span>{allExpanded ? "Minimizar Todas" : "Expandir Todas"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDestacados.map((pick) => {
              const cardKey = String(
                pick.id || pick.fixtureId || `${pick.homeTeam}-${pick.awayTeam}-${pick.market}`
              );
              const ruleMatch = getDestacadoRuleMatch(pick);
              const isWon =
                pick.status === "won" ||
                (pick as any).result === "WON" ||
                (pick.status as string) === "WON";
              const isLost =
                pick.status === "lost" ||
                (pick as any).result === "LOST" ||
                (pick.status as string) === "LOST";

              const finalScore =
                pick.actualScore || (pick as any).score || (pick as any).currentScore || "";

              const kickoffDate = new Date(pick.kickoff);
              const formattedTime = !isNaN(kickoffDate.getTime())
                ? kickoffDate.toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Hoy";

              const isCardExpanded =
                expandedCards[cardKey] !== undefined ? expandedCards[cardKey] : allExpanded;

              return (
                <div
                  key={cardKey}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl p-4.5 sm:p-5 shadow-xl backdrop-blur-xl transition-all duration-200 ${
                    isWon
                      ? "border-2 border-emerald-500 bg-gradient-to-b from-emerald-950/30 via-slate-900/95 to-slate-950 shadow-emerald-500/10"
                      : isLost
                      ? "border-2 border-rose-500 bg-gradient-to-b from-rose-950/30 via-slate-900/95 to-slate-950 shadow-rose-500/10"
                      : "border border-amber-500/40 bg-slate-900/95 hover:border-amber-400 hover:shadow-2xl"
                  } ${!isCardExpanded ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (!isCardExpanded) {
                      toggleCard(cardKey);
                    }
                  }}
                >
                  {/* Subtle Top Amber Glow */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-transparent opacity-80" />

                  <div className="relative z-10">
                    {/* Header Row: 5 Stars Badge + Kickoff Time / Status + Toggle Button */}
                    <div className="flex items-center justify-between gap-2 mb-2.5 min-w-0">
                      <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-2.5 py-0.5 text-[10px] font-black text-slate-950 shadow-xs shrink-0">
                        <span className="tracking-tighter">⭐⭐⭐⭐⭐</span>
                        <span>DESTACADO</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isWon ? (
                          <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-0.5 text-[10px] font-black bg-emerald-500 text-slate-950 shadow-xs border border-emerald-400 shrink-0">
                            ✓ GANADA {finalScore ? `• ${finalScore}` : ""}
                          </span>
                        ) : isLost ? (
                          <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-0.5 text-[10px] font-black bg-rose-600 text-white shadow-xs border border-rose-400 shrink-0">
                            ✗ PERDIDA {finalScore ? `• ${finalScore}` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-xl bg-slate-950/80 border border-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 shrink-0">
                            ⏰ {formattedTime} hrs
                          </span>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCard(cardKey);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-2.5 py-0.5 text-[10px] font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
                          title={isCardExpanded ? "Minimizar tarjeta" : "Ampliar tarjeta"}
                        >
                          <span>{isCardExpanded ? "▲" : "▼"}</span>
                          <span className="hidden sm:inline">
                            {isCardExpanded ? "Minimizar" : "Ampliar"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Integrated Qualifying Rule Banner (Never wraps awkwardly) */}
                    {ruleMatch && (
                      <div className="mb-2.5 flex items-center justify-between gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs text-amber-300">
                        <div className="flex items-center gap-1.5 truncate">
                          <span>{ruleMatch.icon}</span>
                          <span className="font-extrabold truncate text-[11px]">
                            {ruleMatch.ruleName}
                          </span>
                        </div>
                        <span className="rounded-md bg-amber-500/25 px-1.5 py-0.2 text-[10px] font-black text-amber-200 shrink-0">
                          {pick.probability}% (≥ {ruleMatch.minProbability}%)
                        </span>
                      </div>
                    )}

                    {/* League & Country */}
                    <div className="text-[11px] font-bold text-slate-400 truncate mb-1">
                      🏆 {pick.league} {pick.country ? `(${pick.country})` : ""}
                    </div>

                    {/* Match Teams Title */}
                    <h3
                      className="text-base sm:text-lg font-black text-white leading-snug mb-3 truncate"
                      title={`${pick.homeTeam} vs ${pick.awayTeam}`}
                    >
                      {pick.homeTeam} <span className="text-slate-400 font-normal text-sm">vs</span> {pick.awayTeam}
                    </h3>

                    {/* Official Quantitative Selection Box */}
                    <div className="rounded-2xl bg-slate-950/90 p-3 border border-slate-800/90 mb-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold mb-1">
                        <span>Mercado Cuantitativo:</span>
                        <span className="text-emerald-400 font-black truncate ml-2">
                          {pick.market}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-white truncate">
                          {pick.selection}
                        </span>
                        <span className="text-base font-black text-emerald-400 shrink-0">
                          @{(pick.odds ?? 1.5).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* EXPANDED SECTION: Metrics Grid & AI Analysis */}
                    {isCardExpanded && (
                      <>
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-2 text-center text-xs mb-3">
                          <div className="rounded-xl bg-slate-950/60 p-2 border border-slate-800/60">
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              Probabilidad IA
                            </span>
                            <span className="text-sm font-black text-white mt-0.5 block">
                              {pick.probability}%
                            </span>
                          </div>
                          <div className="rounded-xl bg-slate-950/60 p-2 border border-slate-800/60">
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              Ventaja (+EV)
                            </span>
                            <span className="text-sm font-black text-emerald-400 mt-0.5 block">
                              +{pick.edge || 5}%
                            </span>
                          </div>
                        </div>

                        {/* Analysis Explanation */}
                        <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800/60 mb-3">
                          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-400 mb-0.5">
                            <span>🧠</span>
                            <span>Análisis Cuantitativo</span>
                          </div>
                          <p className="text-xs text-slate-300 italic line-clamp-3 leading-relaxed">
                            "{pick.explanation || `Pronóstico con alta probabilidad (${pick.probability}%) y convicción estadística.`}"
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="relative z-10 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-1.5">
                    <button
                      onClick={() => onOpenDetail?.(pick)}
                      className="flex-1 py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition text-center cursor-pointer truncate"
                    >
                      H2H y Stats →
                    </button>
                    <button
                      onClick={() => handleCopySingleText(pick)}
                      className="p-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer text-xs shrink-0"
                      title="Copiar pronóstico"
                    >
                      {copiedSingleId === cardKey ? "✓" : "📋"}
                    </button>
                    <button
                      onClick={() => handleCopyCardImage(pick)}
                      disabled={copyingImageId === cardKey}
                      className="p-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer text-xs shrink-0 disabled:opacity-50"
                      title="Copiar imagen de la tarjeta"
                    >
                      {copyImageSuccessId === cardKey ? "✓" : copyingImageId === cardKey ? "..." : "📸"}
                    </button>
                    <button
                      onClick={() => shareCardAsImage(pick, "whatsapp")}
                      className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer text-xs shrink-0"
                      title="Compartir por WhatsApp"
                    >
                      💬
                    </button>

                    {!isCardExpanded ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCard(cardKey);
                        }}
                        className="py-2 px-2.5 rounded-xl bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-black transition cursor-pointer shrink-0"
                        title="Ampliar detalles"
                      >
                        ▼
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCard(cardKey);
                        }}
                        className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer shrink-0"
                        title="Minimizar detalles"
                      >
                        ▲
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
