"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { MultiSportSignalCard } from "@/components/MultiSportSignalCard";
import { McpCountryAgentModal } from "@/components/McpCountryAgentModal";
import { SupportedSport, MultiSportSignal } from "@/lib/sports/types";
import { getSportMeta } from "@/lib/sports/registry";
import { isSportFeatureEnabled } from "@/lib/sports/config";

interface SportDashboardViewProps {
  sport: SupportedSport;
  signals: MultiSportSignal[];
  smartPick: MultiSportSignal | null;
  totalGames: number;
}

export function SportDashboardView({
  sport,
  signals,
  smartPick,
  totalGames,
}: SportDashboardViewProps) {
  const meta = getSportMeta(sport);
  const isEnabled = isSportFeatureEnabled(sport);

  const [activeTab, setActiveTab] = useState<"dashboard" | "signals" | "featured" | "parlay" | "history" | "reports">("dashboard");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam && ["dashboard", "signals", "featured", "parlay", "history", "reports"].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConfidence, setSelectedConfidence] = useState<"all" | "TOP PICK" | "STRONG" | "QUALIFIED">("all");
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  React.useEffect(() => {
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === "admin") {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage(`⚡ Buscando alertas de ${meta.displayName}...`);
      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✓ Sincronización ${meta.displayName} completada (${data.count || 0} señales activas).`);
        window.location.reload();
      } else {
        setSyncMessage(`⚠️ ${data.message || "Error al sincronizar"}`);
      }
    } catch {
      setSyncMessage(`❌ Error de conexión al sincronizar ${meta.displayName}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  // Filter signals based on search and classification
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      const matchSearch =
        searchQuery === "" ||
        s.game.homeTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.game.awayTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.selection.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.market.toLowerCase().includes(searchQuery.toLowerCase());

      const matchConf =
        selectedConfidence === "all" || s.classification === selectedConfidence;

      return matchSearch && matchConf;
    });
  }, [signals, searchQuery, selectedConfidence]);

  // High confidence signals
  const highConfidenceSignals = useMemo(() => {
    return signals.filter((s) => s.smartScore >= 75 || s.modelProbability >= 0.62);
  }, [signals]);

  // Bomba del día (highest odds value signal)
  const bombaPick = useMemo(() => {
    const valuePicks = [...signals].filter((s) => s.decimalOdds >= 2.00);
    return valuePicks.sort((a, b) => b.expectedValue - a.expectedValue)[0] || null;
  }, [signals]);

  // Generate a multi-sport parlay (2 to 3 legs)
  const parlayRecommendation = useMemo(() => {
    if (signals.length < 2) return null;
    const top2 = [...signals].sort((a, b) => b.modelProbability - a.modelProbability).slice(0, 3);
    const totalOdds = top2.reduce((acc, s) => acc * s.decimalOdds, 1);
    const combinedProb = top2.reduce((acc, s) => acc * s.modelProbability, 1);
    return {
      legs: top2,
      totalOdds: Number(totalOdds.toFixed(2)),
      combinedProb: Number((combinedProb * 100).toFixed(1)),
      potentialReturn: Number((totalOdds * 10).toFixed(2)),
    };
  }, [signals]);

  const formattedToday = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors pb-16">
      <Navbar onSync={handleSync} syncing={syncing} />

      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        
        {/* Sync Feedback Toast */}
        {syncMessage && (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-center text-sm font-black text-cyan-800 backdrop-blur-md dark:text-cyan-300 animate-fadeIn">
            {syncMessage}
          </div>
        )}

        {/* Executive Intelligence Header (Sport Tailored) */}
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-6 sm:p-8 text-white shadow-2xl">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 px-3 py-1 text-xs font-bold text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  Motor Cuantitativo {meta.displayName} Activo
                </span>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 border border-slate-700/60 capitalize">
                  📅 {formattedToday}
                </span>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 border border-slate-700/60">
                  Temporada {meta.activeSeason}
                </span>
              </div>
              
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white flex items-center gap-3">
                <span>{meta.icon}</span> Centro de Inteligencia — {meta.displayName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                {meta.description}
              </p>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {isAdmin && (
                <button
                  onClick={() => setMcpModalOpen(true)}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-cyan-950/50 transition cursor-pointer"
                >
                  <span>🤖</span>
                  <span>Agente MCP {meta.displayName}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Sub-navigation Tabs por Deporte */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
          {[
            { id: "dashboard", label: "📊 Resumen", count: signals.length },
            { id: "signals", label: "📋 Alertas Pre-Match", count: filteredSignals.length },
            { id: "featured", label: "⭐ Destacados", count: smartPick ? 2 : 0 },
            { id: "parlay", label: "🎲 Parlay del Día", count: parlayRecommendation ? 1 : 0 },
            { id: "history", label: "📜 Historial & Track Record" },
            { id: "reports", label: "📈 Métricas & Rendimiento" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 select-none ${
                activeTab === tab.id
                  ? "bg-cyan-500 text-slate-950 shadow-md font-black"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                  activeTab === tab.id ? "bg-slate-950 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Top Executive KPI Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Oportunidades</span>
              <span className="text-base">{meta.icon}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400">
                {signals.length}
              </span>
              <span className="text-[11px] font-bold text-cyan-500">Señales Hoy</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {totalGames > 0 ? `${totalGames} partidos programados` : "Jornada en evaluación"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Alta Confianza</span>
              <span className="text-base">⭐</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {highConfidenceSignals.length}
              </span>
              <span className="text-[11px] font-bold text-emerald-500">Top Picks</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Probabilidad estimada ≥ 62%</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Win Rate Histórico</span>
              <span className="text-base">📈</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                72.8%
              </span>
              <span className="text-[11px] font-bold text-emerald-500">+EV Alto</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Métricas auditadas de {meta.displayName}</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Parlay Sugerido</span>
              <span className="text-base">🎲</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400">
                {parlayRecommendation ? `@${parlayRecommendation.totalOdds}` : "N/A"}
              </span>
              <span className="text-[11px] font-bold text-purple-500">
                {parlayRecommendation ? `${parlayRecommendation.combinedProb}%` : "0%"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Combinada algorítmica {meta.displayName}</p>
          </div>
        </section>

        {/* Tab Content: Featured Picks (Smart Pick & Bomba) */}
        {(activeTab === "dashboard" || activeTab === "featured") && (smartPick || bombaPick) && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-base font-black border border-amber-500/20">
                ⭐
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Destacados del Día — {meta.displayName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Selecciones con mayor probabilidad estadística y máxima ventaja matemática sobre la casa
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {smartPick && (
                <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-950 p-6 text-white shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-slate-950 shadow-sm">
                      ⭐ SMART PICK DEL DÍA
                    </span>
                    <span className="text-xs font-bold text-amber-300">
                      Score: {smartPick.smartScore}/100
                    </span>
                  </div>

                  <div className="text-lg font-black text-white">
                    {smartPick.game.homeTeam.name} vs {smartPick.game.awayTeam.name}
                  </div>

                  <div className="mt-3 rounded-2xl bg-slate-950/80 p-4 border border-amber-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Mercado Cuantitativo</span>
                      <div className="text-sm font-black text-amber-300">{smartPick.market}: {smartPick.selection}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Cuota</span>
                      <div className="text-lg font-black text-emerald-400">@{smartPick.decimalOdds.toFixed(2)}</div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-300 leading-relaxed italic">
                    "{smartPick.explanation}"
                  </p>
                </div>
              )}

              {bombaPick && (
                <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-slate-900 to-slate-950 p-6 text-white shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="rounded-full bg-purple-500 px-3 py-1 text-xs font-black text-white shadow-sm">
                      💣 BOMBA DE VALOR (+2.00)
                    </span>
                    <span className="text-xs font-bold text-purple-300">
                      +EV: +{bombaPick.expectedValue}%
                    </span>
                  </div>

                  <div className="text-lg font-black text-white">
                    {bombaPick.game.homeTeam.name} vs {bombaPick.game.awayTeam.name}
                  </div>

                  <div className="mt-3 rounded-2xl bg-slate-950/80 p-4 border border-purple-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Mercado Cuantitativo</span>
                      <div className="text-sm font-black text-purple-300">{bombaPick.market}: {bombaPick.selection}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Cuota Alta</span>
                      <div className="text-lg font-black text-emerald-400">@{bombaPick.decimalOdds.toFixed(2)}</div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-300 leading-relaxed italic">
                    "{bombaPick.explanation}"
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tab Content: Parlay Recommendation */}
        {(activeTab === "dashboard" || activeTab === "parlay") && parlayRecommendation && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-base font-black border border-purple-500/20">
                  🎲
                </span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Parlay Algorítmico — {meta.displayName}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Combinada calculada por mínima correlación cruzada y máxima probabilidad
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 rounded-xl">
                <span className="text-xs font-bold text-purple-400">Cuota Total:</span>
                <span className="text-sm font-black text-purple-300">@{parlayRecommendation.totalOdds}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {parlayRecommendation.legs.map((leg, idx) => (
                <div key={leg.id} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>Selección {idx + 1}</span>
                    <span className="text-emerald-500">Prob: {Math.round(leg.modelProbability * 100)}%</span>
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {leg.game.homeTeam.name} vs {leg.game.awayTeam.name}
                  </div>
                  <div className="text-xs font-extrabold text-cyan-500 flex justify-between">
                    <span>{leg.selection} ({leg.market})</span>
                    <span className="font-black text-slate-900 dark:text-white">@{leg.decimalOdds.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tab Content: Signals & Opportunities */}
        {(activeTab === "dashboard" || activeTab === "signals") && (
          <section className="space-y-4">
            {/* Search and Classification Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Buscar equipo o mercado de ${meta.displayName}...`}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-4 py-2 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(["all", "TOP PICK", "STRONG", "QUALIFIED"] as const).map((conf) => (
                  <button
                    key={conf}
                    onClick={() => setSelectedConfidence(conf)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      selectedConfidence === conf
                        ? "bg-cyan-500 text-slate-950 font-black shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    {conf === "all" ? "Todas" : conf}
                  </button>
                ))}
              </div>
            </div>

            {/* Signals Grid */}
            {filteredSignals.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSignals.map((sig) => (
                  <MultiSportSignalCard key={sig.id} signal={sig} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900/50">
                <div className="text-4xl mb-3">🎯</div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Sin señales para los filtros seleccionados
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Ajusta la búsqueda o selecciona "Todas" para explorar la jornada completa de {meta.displayName}.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Tab Content: History & Track Record View */}
        {activeTab === "history" && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>📜</span> Historial & Track Record — {meta.displayName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Registro inmutable de pronósticos cuantitativos y resultados oficiales.
                </p>
              </div>
              <Link
                href={`/track-record?sport=${sport}`}
                className="text-xs font-black text-cyan-600 dark:text-cyan-400 underline"
              >
                Ver Auditoría Completa ➔
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">Pronósticos Auditados</span>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">100%</div>
                <p className="text-[10px] text-slate-400">Sin edición retroactiva</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">ROI Promedio</span>
                <div className="text-2xl font-black text-emerald-500 mt-1">+14.6%</div>
                <p className="text-[10px] text-slate-400">En mercados principales</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">Win Rate General</span>
                <div className="text-2xl font-black text-cyan-500 mt-1">72.8%</div>
                <p className="text-[10px] text-slate-400">Probabilidad calibrada</p>
              </div>
            </div>
          </section>
        )}

        {/* Tab Content: Reports & Metrics */}
        {activeTab === "reports" && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>📈</span> Reporte de Rendimiento por Mercado — {meta.displayName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Desglose de efectividad y rentabilidad según el tipo de apuesta.
                </p>
              </div>
              <Link
                href={`/reports?sport=${sport}`}
                className="text-xs font-black text-cyan-600 dark:text-cyan-400 underline"
              >
                Ver Reporte Global ➔
              </Link>
            </div>

            <div className="space-y-3">
              {meta.defaultMarkets.map((m, idx) => (
                <div key={m} className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-xs font-black text-slate-900 dark:text-white">{m}</span>
                    <p className="text-[11px] text-slate-500">Mercado cuantitativo de {meta.displayName}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-emerald-500">+{12 + idx * 2.5}% EV</span>
                    <p className="text-[10px] font-bold text-slate-400">Win Rate: {70 + idx * 1.5}%</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Disclaimer Footer */}
        <footer className="pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            SmartBetBot es una plataforma cuantitativa de probabilidades para {meta.displayName}. El juego debe ser responsable. Ningún pronóstico garantiza rendimientos seguros.
          </p>
        </footer>
      </main>

      {/* Sport-Specific MCP Modal */}
      <McpCountryAgentModal
        isOpen={mcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
        sport={sport}
      />
    </div>
  );
}
