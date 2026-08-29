"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { getFallbackFeaturedPredictions } from "@/lib/sports/db";

export default function SignalsPage() {
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [search, setSearch] = useState("");
  const [minProbability, setMinProbability] = useState(60);

  useEffect(() => {
    fetch("/api/signals")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.signals && data.signals.length > 0) {
          setPredictions(data.signals);
        } else {
          setPredictions(getFallbackFeaturedPredictions());
        }
      })
      .catch(() => setPredictions(getFallbackFeaturedPredictions()));
  }, []);

  const filtered = predictions.filter((p) => {
    const matchSearch =
      p.match.toLowerCase().includes(search.toLowerCase()) ||
      p.league.toLowerCase().includes(search.toLowerCase()) ||
      p.market.toLowerCase().includes(search.toLowerCase());
    const matchProb = p.probability >= minProbability;
    return matchSearch && matchProb;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base font-black text-slate-950">
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
              Picks de Hoy
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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Feed de Picks & Señales
            </h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Lista completa de oportunidades estadísticas disponibles hoy
            </p>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Buscar equipo o liga..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none sm:text-sm"
            />
          </div>
        </div>

        {/* Probability Slider Filter */}
        <div className="mt-6 flex items-center gap-4 rounded-xl border border-slate-850 bg-slate-900/60 p-3.5">
          <span className="text-xs font-bold text-slate-300">Probabilidad mínima:</span>
          <input
            type="range"
            min="50"
            max="80"
            step="5"
            value={minProbability}
            onChange={(e) => setMinProbability(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500"
          />
          <span className="rounded-lg bg-emerald-950 px-2.5 py-1 text-xs font-extrabold text-emerald-400 border border-emerald-800/40">
            {minProbability}%+
          </span>
        </div>

        {/* Grid of Prediction Cards */}
        {filtered.length === 0 ? (
          <div className="mt-12 rounded-2xl bg-slate-900/40 p-12 text-center border border-slate-800">
            <p className="text-slate-400">No se encontraron pronósticos con los criterios actuales.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((prediction) => (
              <PredictionCard key={prediction.id || prediction.fixtureId} prediction={prediction} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
