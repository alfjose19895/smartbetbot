"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  MarketOpportunity,
  DESTACADOS_5_STARS_RULES,
  getDestacadoRuleMatch,
  isDestacadoPick,
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
    "ALL" | "corners" | "btts" | "goals" | "local" | "away"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedSingleId, setCopiedSingleId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);
  const [copyImageSuccessId, setCopyImageSuccessId] = useState<string | null>(null);

  // Filter only football predictions that meet the 5 strict rules
  const allDestacados = useMemo(() => {
    return predictions.filter((p) => {
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
  }, [predictions]);

  // Counts per rule
  const ruleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      corners: 0,
      btts: 0,
      goals: 0,
      local: 0,
      away: 0,
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
    return allDestacados.filter((p) => {
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

  const handleCopySummary = () => {
    if (filteredDestacados.length === 0) return;

    const lines: string[] = [
      "⭐⭐⭐⭐⭐ PRONÓSTICOS DESTACADOS — SMARTBETBOT ⭐⭐⭐⭐⭐",
      "🏆 Filtro Cuantitativo de Alta Convicción (Fútbol)",
      `📅 Fecha: ${new Intl.DateTimeFormat("es-ES", { dateStyle: "full" }).format(new Date())}`,
      `📊 Total Selecciones: ${filteredDestacados.length} | Prob. Media: ${avgProb}% | Cuota Media: @${avgOdds.toFixed(2)}`,
      "",
      "---------------------------------------------",
    ];

    filteredDestacados.forEach((p, idx) => {
      const match = getDestacadoRuleMatch(p);
      const ruleLabel = match ? `[${match.icon} ${match.marketDescription}]` : "";
      lines.push(
        `${idx + 1}. ⭐ ${p.homeTeam} vs ${p.awayTeam} (${p.league})`,
        `   🎯 Mercado: ${p.market} (${p.selection})`,
        `   📈 Probabilidad: ${p.probability}% | Cuota: @${(p.odds ?? 1.5).toFixed(2)}`,
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
    const key = String(pick.id || pick.fixtureId || `${pick.homeTeam}-${pick.awayTeam}`);
    const match = getDestacadoRuleMatch(pick);
    const ruleLabel = match ? `[${match.icon} ${match.marketDescription}]` : "";

    const text = [
      "⭐⭐⭐⭐⭐ PRONÓSTICO DESTACADO ⭐⭐⭐⭐⭐",
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ""}`,
      `⚽ ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico: ${pick.market} (${pick.selection})`,
      `🏢 Cuota: @${(pick.odds ?? 1.5).toFixed(2)}`,
      `📈 Probabilidad IA: ${pick.probability}% (+${pick.edge || 5}% Valor)`,
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
    const key = String(pick.id || pick.fixtureId || `${pick.homeTeam}-${pick.awayTeam}`);
    try {
      setCopyingImageId(key);
      const ok = await copyCardImageToClipboard(pick);
      if (ok) {
        setCopyImageSuccessId(key);
        setTimeout(() => setCopyImageSuccessId(null), 3000);
      }
    } finally {
      setCopyingImageId(null);
    }
  };

  return (
    <section className="space-y-6">
      {/* 1. Main Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/30 p-6 sm:p-8 shadow-2xl text-white backdrop-blur-xl">
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            {/* Top 5-Stars Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-300 border border-amber-500/40 shadow-sm">
              <span className="text-amber-400 tracking-wider">⭐⭐⭐⭐⭐</span>
              <span>Módulo Destacados • Fútbol</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Destacados</span>
                <span className="text-amber-400 text-xl sm:text-2xl">⭐⭐⭐⭐⭐</span>
                {titleSuffix && <span className="text-slate-400 text-lg font-bold">{titleSuffix}</span>}
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              Módulo personalizado de alta certeza estadística para fútbol. Únicamente califica y se visualiza
              una apuesta si cumple estrictamente una de las <strong>5 reglas de oro</strong> del modelo cuantitativo.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap self-start md:self-auto shrink-0">
            {showBackLink && (
              <Link
                href="/signals"
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <span>←</span>
                <span>Ver Pre-Match</span>
              </Link>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Actualizar datos de partidos"
              >
                <span className={loading ? "animate-spin" : ""}>🔄</span>
                <span>Actualizar</span>
              </button>
            )}

            <button
              onClick={handleCopySummary}
              disabled={filteredDestacados.length === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black transition shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Copiar lista formateada para WhatsApp/Telegram"
            >
              <span>{copiedSummary ? "✓" : "📋"}</span>
              <span>{copiedSummary ? "¡Copiado!" : "Copiar Lista"}</span>
            </button>
          </div>
        </div>

        {/* 2. KPI Metrics Strip */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Apuestas Destacadas
            </span>
            <div className="text-2xl font-black text-amber-400 mt-0.5 flex items-baseline gap-1">
              <span>{allDestacados.length}</span>
              <span className="text-xs text-slate-400 font-bold">picks</span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Probabilidad Promedio
            </span>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">
              {avgProb > 0 ? `${avgProb}%` : "—"}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Cuota Promedio
            </span>
            <div className="text-2xl font-black text-white mt-0.5">
              {avgOdds > 0 ? `@${avgOdds.toFixed(2)}` : "—"}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/70 p-3.5 border border-slate-800/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Auditoría Hoy
            </span>
            <div className="text-2xl font-black text-white mt-0.5 flex items-center gap-1.5">
              <span className="text-emerald-400 font-black">{wonCount}✓</span>
              {lostCount > 0 && <span className="text-rose-400 text-sm font-bold">{lostCount}✗</span>}
              {wonCount === 0 && lostCount === 0 && (
                <span className="text-xs text-slate-400 font-semibold">En progreso</span>
              )}
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
            <strong>Alta Goles (≥72%)</strong> · <strong>Ganador Local (≥58%)</strong> ·{" "}
            <strong>Ganador Visitante (≥71%)</strong>.
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
          {/* Header over cards */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-bold flex items-center gap-1.5">
              <span>👑</span>
              <span>
                {filteredDestacados.length}{" "}
                {filteredDestacados.length === 1 ? "Apuesta Destacada" : "Apuestas Destacadas"}{" "}
                {selectedRuleFilter !== "ALL" ? "bajo este criterio" : "hoy"}
              </span>
            </span>
            <span className="text-[11px] font-semibold">
              Ordenadas por mayor probabilidad e índice de valor (+EV)
            </span>
          </div>

          {/* Cards Grid: Perfectly Formatted Destacados Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDestacados.map((pick) => {
              const ruleMatch = getDestacadoRuleMatch(pick);
              const cardKey = String(
                pick.id || `${pick.fixtureId}-${pick.market}-${pick.selection}`
              );

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

              return (
                <div
                  key={cardKey}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-amber-500/40 bg-slate-900/95 p-5 shadow-xl backdrop-blur-xl transition-all duration-200 hover:border-amber-400 hover:shadow-2xl hover:scale-[1.01]"
                >
                  {/* Subtle Top Amber Glow */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-transparent opacity-80" />

                  <div className="relative z-10">
                    {/* Header Row: 5 Stars Badge + Kickoff Time / Status */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-2.5 py-0.5 text-[10px] font-black text-slate-950 shadow-xs shrink-0">
                        <span className="tracking-tighter">⭐⭐⭐⭐⭐</span>
                        <span>DESTACADO</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isWon ? (
                          <span className="inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[10px] font-black bg-emerald-500 text-slate-950 shadow-xs border border-emerald-400">
                            ✓ Ganada {finalScore ? `(${finalScore})` : ""}
                          </span>
                        ) : isLost ? (
                          <span className="inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[10px] font-black bg-rose-600 text-white shadow-xs border border-rose-400">
                            ✗ Perdida {finalScore ? `(${finalScore})` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-xl bg-slate-950/80 border border-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                            ⏰ {formattedTime} hrs
                          </span>
                        )}
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
                      <p className="text-xs text-slate-300 italic line-clamp-2 leading-relaxed">
                        "{pick.explanation || `Pronóstico con alta probabilidad (${pick.probability}%) y convicción estadística.`}"
                      </p>
                    </div>
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
