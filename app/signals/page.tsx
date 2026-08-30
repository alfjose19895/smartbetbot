"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

export default function SignalsPage() {
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [historySignals, setHistorySignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [selectedMarket, setSelectedMarket] = useState("all");
  const [minProbability, setMinProbability] = useState<number>(60);
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "tomorrow" | "week" | "history">("all");

  useEffect(() => {
    async function fetchSignals() {
      try {
        setLoading(true);
        const res = await fetch("/api/signals");
        const json = await res.json();
        if (json.signals) {
          setSignals(json.signals);
        }
        if (json.history) {
          setHistorySignals(json.history);
        }
      } catch (err) {
        console.error("Failed to load signals:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSignals();
  }, []);

  const activeBaseList = selectedDate === "history" ? historySignals : signals;

  const leagues = ["all", ...Array.from(new Set(activeBaseList.map((s) => s.league).filter(Boolean)))];
  const markets = ["all", ...Array.from(new Set(activeBaseList.map((s) => s.market).filter(Boolean)))];

  // Precise Local Calendar Day Filtering
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowDay = todayDay + 86400000;
  const weekEndDay = todayDay + 7 * 86400000;

  const filtered = activeBaseList.filter((item) => {
    const matchesSearch =
      search === "" ||
      item.match.toLowerCase().includes(search.toLowerCase()) ||
      item.league.toLowerCase().includes(search.toLowerCase());

    const matchesLeague = selectedLeague === "all" || item.league === selectedLeague;
    const matchesMarket = selectedMarket === "all" || item.market === selectedMarket;
    const matchesProb = item.probability >= minProbability;

    let matchesDate = true;
    if (selectedDate === "today") {
      const d = new Date(item.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      matchesDate = matchDay === todayDay;
    } else if (selectedDate === "tomorrow") {
      const d = new Date(item.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      matchesDate = matchDay === tomorrowDay;
    } else if (selectedDate === "week") {
      const d = new Date(item.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      matchesDate = matchDay >= todayDay && matchDay <= weekEndDay;
    }

    return matchesSearch && matchesLeague && matchesMarket && matchesProb && matchesDate;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base font-black text-slate-950 shadow-md">
              ⚡
            </span>
            <span className="text-lg font-black tracking-tight text-white">
              Smart<span className="text-emerald-400">Bet</span>Bot
            </span>
          </Link>

          <nav className="flex items-center gap-4 text-xs font-semibold sm:gap-6 sm:text-sm">
            <Link href="/dashboard" className="text-slate-300 transition hover:text-white">
              Dashboard
            </Link>
            <Link href="/signals" className="text-emerald-400 font-bold">
              Picks
            </Link>
            <Link href="/history" className="text-slate-300 transition hover:text-white">
              Historial
            </Link>
            <Link href="/admin" className="text-slate-300 transition hover:text-white">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {selectedDate === "history" ? "Histórico de Señales" : "Picks & Señales Estadísticas"}
            </h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              {selectedDate === "history"
                ? "Registro auditable de aciertos y resultados de predicciones anteriores"
                : "Filtrado dinámico por fecha, cuota, probabilidad estimada y ligas principales"}
            </p>
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-2.5">
          <span className="self-center text-xs font-bold text-slate-400 mr-2 ml-1">Vista:</span>
          <button
            onClick={() => {
              setSelectedDate("all");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "all"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            🌟 Todos los Picks ({signals.length})
          </button>
          <button
            onClick={() => {
              setSelectedDate("today");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "today"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            📅 Hoy
          </button>
          <button
            onClick={() => {
              setSelectedDate("tomorrow");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "tomorrow"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            🔥 Mañana
          </button>
          <button
            onClick={() => {
              setSelectedDate("week");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "week"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            🗓️ Esta Semana
          </button>
          <button
            onClick={() => {
              setSelectedDate("history");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "history"
                ? "bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20"
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            📜 Histórico / Jugados ({historySignals.length})
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-4 grid gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:grid-cols-3">
          {/* Search */}
          <div>
            <label className="text-[11px] font-semibold uppercase text-slate-400">Buscar Partido o Liga</label>
            <input
              type="text"
              placeholder="Ej: Liverpool, Real Madrid, Premier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Probability Slider */}
          <div>
            <div className="flex justify-between text-[11px] font-semibold uppercase text-slate-400">
              <span>Probabilidad Mínima</span>
              <span className="text-emerald-400 font-bold">{minProbability}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="85"
              step="1"
              value={minProbability}
              onChange={(e) => setMinProbability(Number(e.target.value))}
              className="mt-2 w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* League Dropdown */}
          <div>
            <label className="text-[11px] font-semibold uppercase text-slate-400">Liga</label>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l === "all" ? "Todas las Ligas" : l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Market Filter Chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {markets.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMarket(m)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                selectedMarket === m
                  ? "bg-sky-500 text-slate-950 font-bold"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {m === "all" ? "Todos los Mercados" : m}
            </button>
          ))}
        </div>

        {/* Grid List */}
        {loading ? (
          <div className="mt-16 text-center text-slate-400">
            <span className="inline-block animate-spin text-3xl">⏳</span>
            <p className="mt-3 text-sm">Cargando picks...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-16 rounded-2xl bg-slate-900/40 p-12 text-center border border-slate-800">
            <p className="text-base text-slate-400">No hay picks que coincidan con estos filtros de búsqueda o fecha.</p>
            <button
              onClick={() => {
                setSelectedDate("all");
                setSelectedLeague("all");
                setSelectedMarket("all");
                setSearch("");
                setMinProbability(60);
              }}
              className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <PredictionCard key={item.id || item.fixtureId} prediction={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
