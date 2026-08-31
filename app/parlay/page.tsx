"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";

function formatKickoffTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Hoy";

    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`;

    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow =
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate();

    const dayNum = d.getDate();
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const monthName = months[d.getMonth()];

    if (isToday) return `Hoy • ${timeStr}`;
    if (isTomorrow) return `Mañana • ${timeStr}`;
    return `${dayNum} ${monthName} • ${timeStr}`;
  } catch {
    return "Hoy";
  }
}

export default function DailyParlayPage() {
  const { language } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [parlaySize, setParlaySize] = useState<3 | 4 | 5 | 8 | 10>(3);
  const [stake, setStake] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/signals");
        const json = await res.json();
        if (json.signals) {
          setSignals(json.signals);
        }
      } catch (err) {
        console.error("Error fetching signals:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, []);

  const now = new Date();
  const todayFormatted = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Sort daily picks by highest probability and value
  const sortedDailyPicks = [...signals].sort(
    (a, b) => b.probability - a.probability || (b.smartScore || 0) - (a.smartScore || 0) || b.odds - a.odds
  );

  const selectedPicks = sortedDailyPicks.slice(0, Math.min(parlaySize, sortedDailyPicks.length));

  // Compute accumulated parlay odds and combined probability
  const totalOdds = selectedPicks.reduce((acc, p) => acc * p.odds, 1);
  const combinedProbability =
    selectedPicks.reduce((acc, p) => acc * (p.probability / 100), 1) * 100;
  const potentialProfit = (stake * totalOdds - stake).toFixed(2);
  const potentialTotalReturn = (stake * totalOdds).toFixed(2);

  const handleCopyParlay = () => {
    const lines = [
      `🔥 PARLEY COMBINADO DEL DÍA (${selectedPicks.length} JUGADAS)`,
      `🎯 Cuota Total Acumulada: @${totalOdds.toFixed(2)} | Probabilidad: ${combinedProbability.toFixed(1)}%`,
      `📅 Fecha: ${todayFormatted}`,
      "",
      ...selectedPicks.map(
        (p, idx) =>
          `${idx + 1}. ${p.match}\n   🏆 ${p.league} (${p.country || "Mundial"})\n   🕒 Horario: ${formatKickoffTime(p.kickoff)}\n   🎯 Pronóstico: ${p.market} @${p.odds.toFixed(2)}\n   ⭐ Confianza: ${p.confidence || "Alta"} (${p.probability.toFixed(0)}% prob)`
      ),
      "",
      `💰 Apuesta simulada: $${stake} ➔ Retorno estimado: $${potentialTotalReturn} (+$${potentialProfit})`,
      "🔒 Pronóstico Oficial Diario de SmartBetBot - Inmutable para Trazabilidad",
    ];

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const parlayTierDescriptions: Record<3 | 4 | 5 | 8 | 10, { title: string; desc: string; icon: string }> = {
    3: {
      title: "Trío Élite (3 Jugadas)",
      desc: "Combinación de máxima seguridad y probabilidad matemática para rentabilidad consistente.",
      icon: "🥉",
    },
    4: {
      title: "Cuarteta Pro (4 Jugadas)",
      desc: "Excelente balance entre cuota atractiva y probabilidad sólida de éxito.",
      icon: "🥈",
    },
    5: {
      title: "Quíntuple Estrella (5 Jugadas)",
      desc: "Multiplicador de cuota de alto valor para retornos sustanciales.",
      icon: "🥇",
    },
    8: {
      title: "Mega Parley (8 Jugadas)",
      desc: "Combinada de alto impacto para multiplicar exponencialmente el capital.",
      icon: "💎",
    },
    10: {
      title: "Deca Parley Gigante (10 Jugadas)",
      desc: "La mayor combinación del día para premios extraordinarios con los 10 mejores pronósticos.",
      icon: "👑",
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar />

      <main className="mx-auto max-w-7xl px-3.5 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
        {/* Header & Immutable Notice */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
              <span>🔥</span>
              <span className="capitalize">{todayFormatted} • Módulo Exclusivo</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Parley Recomendado del Día
            </h1>
            <p className="mt-1 text-xs text-slate-700 sm:text-sm dark:text-slate-400">
              Selecciones oficiales inmutables para garantizar trazabilidad y máxima precisión cuantitativa
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-xs font-black text-sky-900 border border-sky-300 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800">
            <span>🔒</span>
            <span>Pronósticos Congelados (Trazabilidad 100%)</span>
          </div>
        </div>

        {/* Parlay Combinations Selector (3, 4, 5, 8, 10 Jugadas) */}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Selecciona el Número de Jugadas:
            </span>
            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              {parlayTierDescriptions[parlaySize].title}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {([3, 4, 5, 8, 10] as const).map((size) => {
              const info = parlayTierDescriptions[size];
              const isSelected = parlaySize === size;
              return (
                <button
                  key={size}
                  onClick={() => setParlaySize(size)}
                  disabled={sortedDailyPicks.length < size}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition text-center cursor-pointer ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-md shadow-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500 font-black"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <span className="text-xl">{info.icon}</span>
                  <span className="text-sm font-black mt-1">{size} Jugadas</span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                    {size === 3 ? "Trío" : size === 4 ? "Cuarteta" : size === 5 ? "Quíntuple" : size === 8 ? "Mega" : "Deca"}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 italic">
            💡 {parlayTierDescriptions[parlaySize].desc}
          </p>
        </div>

        {/* Main Content: Picks List + Floating Slip */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando las mejores combinadas del día...</p>
          </div>
        ) : selectedPicks.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin pronósticos disponibles</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No se encontraron partidos activos para hoy.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Picks List */}
            <div className="lg:col-span-2 space-y-3">
              {selectedPicks.map((pick, idx) => (
                <div
                  key={pick.id || `${pick.fixtureId}-${pick.market}`}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-black text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                      #{idx + 1}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <span>🏆</span>
                          <span>{pick.league}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-black">
                            {pick.country || "Mundial"}
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                          🕒 {formatKickoffTime(pick.kickoff)}
                        </span>
                      </div>

                      <h3 className="mt-1.5 text-base font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                        {pick.match}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2.5 border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0 dark:border-slate-800">
                    <div className="text-right">
                      <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 block">
                        🎯 {pick.market}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
                        {pick.confidence} ({pick.probability}%)
                      </span>
                    </div>

                    <span className="rounded-xl bg-sky-50 px-3 py-1.5 text-sm font-black text-sky-800 border border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800">
                      @{pick.odds.toFixed(2)}
                    </span>

                    <button
                      onClick={() => setActiveModalPick(pick)}
                      className="rounded-xl bg-slate-100 p-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                      title="Ver H2H y últimos 5 partidos"
                    >
                      📊
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Parley Ticket Summary & Payout Calculator */}
            <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-6 text-white shadow-xl lg:sticky lg:top-24">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                    Boleto Combinado Oficial
                  </span>
                  <span className="text-lg font-black text-white">
                    {parlayTierDescriptions[parlaySize].title}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Cuota Total</span>
                  <span className="text-2xl sm:text-3xl font-black text-sky-400">
                    @{totalOdds.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>Probabilidad Combinada:</span>
                <span className="font-extrabold text-emerald-400">
                  {combinedProbability.toFixed(1)}%
                </span>
              </div>

              {/* Stake Simulator */}
              <div className="mt-4 pt-3 border-t border-slate-800">
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                  Simular Apuesta ($):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={stake}
                    onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24 rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white border border-slate-700 focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="flex gap-1 flex-1 justify-end">
                    {[10, 25, 50, 100].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setStake(amt)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          stake === amt
                            ? "bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Potential Return Box */}
              <div className="mt-4 rounded-2xl bg-emerald-950/60 p-4 border border-emerald-500/30">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span>Retorno Total Estimado:</span>
                  <span className="text-base font-black text-emerald-400">${potentialTotalReturn}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                  <span>Ganancia Neta:</span>
                  <span className="font-extrabold text-emerald-300">+${potentialProfit}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 space-y-2">
                <button
                  onClick={handleCopyParlay}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:from-emerald-400 hover:to-teal-400 hover:scale-[1.01] cursor-pointer"
                >
                  <span>{copied ? "✓" : "📋"}</span>
                  <span>{copied ? "¡Parley Copiado al Portapapeles!" : "Copiar para Telegram / WhatsApp"}</span>
                </button>
              </div>

              <div className="mt-4 text-center">
                <span className="text-[10px] text-slate-400 font-medium">
                  🔒 Pronóstico fijado para garantizar trazabilidad durante toda la jornada
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Match Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}
    </div>
  );
}
