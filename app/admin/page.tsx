"use client";

import { Navbar } from "@/components/Navbar";
import React, { useState } from "react";
import Link from "next/link";
import {
  SUPPORTED_LEAGUES,
  TOP_5_LEAGUE_IDS,
  CUPS_LEAGUE_IDS,
  AMERICAS_LEAGUE_IDS,
  ALL_LEAGUE_IDS,
} from "@/lib/sports/api-football";

export default function AdminPage() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<"top5" | "cups" | "americas" | "all">("all");
  const [logs, setLogs] = useState<string[]>([
    "Sistema SmartBetBot listo.",
    `Catálogo cargado con ${SUPPORTED_LEAGUES.length} ligas y competiciones mundiales.`,
  ]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 40)]);
  };

  const getTargetLeagueIds = () => {
    switch (selectedGroup) {
      case "top5":
        return TOP_5_LEAGUE_IDS;
      case "cups":
        return CUPS_LEAGUE_IDS;
      case "americas":
        return AMERICAS_LEAGUE_IDS;
      case "all":
      default:
        return ALL_LEAGUE_IDS;
    }
  };

  const handleSyncLeagues = async () => {
    const leagueIds = getTargetLeagueIds();
    try {
      setLoadingAction("leagues");
      addLog(`Sincronizando ${leagueIds.length} ligas y planteles con API-Football...`);
      const res = await fetch("/api/admin/sync/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueIds }),
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✓ ${data.message}`);
      } else {
        addLog(`✗ Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      addLog(`✗ Error de conexión: ${message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSyncFixtures = async () => {
    const leagueIds = getTargetLeagueIds();
    try {
      setLoadingAction("fixtures");
      addLog(`Consultando próximos partidos de ${leagueIds.length} ligas (próximos 7 días)...`);
      const res = await fetch("/api/admin/sync/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueIds, lookaheadDays: 7 }),
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✓ ${data.message}`);
      } else {
        addLog(`✗ Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      addLog(`✗ Error de conexión: ${message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGeneratePredictions = async () => {
    try {
      setLoadingAction("predictions");
      addLog("Ejecutando motor estadístico Poisson & cálculo de Smart Edge...");
      const res = await fetch("/api/admin/sync/predictions", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        addLog(`✓ ${data.message}`);
      } else {
        addLog(`✗ Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      addLog(`✗ Error de conexión: ${message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      {/* Header */}
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-400 border border-slate-800 mb-3">
            <span>⚙️ Panel de Control & Sincronización Global</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Catálogo Completo de Ligas ({SUPPORTED_LEAGUES.length} Ligas)
          </h1>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            Sincroniza y genera análisis para las principales ligas de Europa, América y torneos internacionales
          </p>
        </div>

        {/* Group Selector */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
            Seleccionar Conjunto de Ligas a Sincronizar:
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              onClick={() => setSelectedGroup("all")}
              className={`rounded-xl p-3 text-left transition border ${
                selectedGroup === "all"
                  ? "bg-emerald-950/80 border-emerald-500 text-white font-bold"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="text-base">⚡ Todas las Ligas</div>
              <div className="text-[11px] text-slate-400 mt-1">{ALL_LEAGUE_IDS.length} ligas activas</div>
            </button>

            <button
              onClick={() => setSelectedGroup("top5")}
              className={`rounded-xl p-3 text-left transition border ${
                selectedGroup === "top5"
                  ? "bg-emerald-950/80 border-emerald-500 text-white font-bold"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="text-base">🏆 Top 5 Europa</div>
              <div className="text-[11px] text-slate-400 mt-1">Premier, LaLiga, Serie A, etc.</div>
            </button>

            <button
              onClick={() => setSelectedGroup("cups")}
              className={`rounded-xl p-3 text-left transition border ${
                selectedGroup === "cups"
                  ? "bg-emerald-950/80 border-emerald-500 text-white font-bold"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="text-base">⭐ Copas & UEFA</div>
              <div className="text-[11px] text-slate-400 mt-1">Champions, Europa, Libertadores</div>
            </button>

            <button
              onClick={() => setSelectedGroup("americas")}
              className={`rounded-xl p-3 text-left transition border ${
                selectedGroup === "americas"
                  ? "bg-emerald-950/80 border-emerald-500 text-white font-bold"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="text-base">🌎 Américas & Más</div>
              <div className="text-[11px] text-slate-400 mt-1">Brasil, Argentina, MX, MLS</div>
            </button>
          </div>
        </div>

        {/* 1-Click Sync Cards Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* Card 1: Leagues & Teams */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
            <div>
              <span className="text-2xl">🏆</span>
              <h3 className="mt-3 text-base font-bold text-white">Sincronizar Ligas</h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Descarga y actualiza los metadatos de las {getTargetLeagueIds().length} ligas seleccionadas y sus planteles.
              </p>
            </div>
            <button
              onClick={handleSyncLeagues}
              disabled={!!loadingAction}
              className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white border border-slate-700 disabled:opacity-50"
            >
              {loadingAction === "leagues" ? "⏳ Sincronizando..." : `🔄 Sincronizar (${getTargetLeagueIds().length})`}
            </button>
          </div>

          {/* Card 2: Upcoming Fixtures */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
            <div>
              <span className="text-2xl">⚽</span>
              <h3 className="mt-3 text-base font-bold text-white">Partidos Próximos</h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Consulta los fixtures programados para los próximos 7 días en las ligas seleccionadas y guarda horarios y cuotas.
              </p>
            </div>
            <button
              onClick={handleSyncFixtures}
              disabled={!!loadingAction}
              className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white border border-slate-700 disabled:opacity-50"
            >
              {loadingAction === "fixtures" ? "⏳ Sincronizando..." : "🔄 Sincronizar Fixtures"}
            </button>
          </div>

          {/* Card 3: Generate Predictions */}
          <div className="flex flex-col justify-between rounded-2xl border border-emerald-900/60 bg-gradient-to-b from-slate-900 to-emerald-950/40 p-5 shadow-lg">
            <div>
              <span className="text-2xl">⚡</span>
              <h3 className="mt-3 text-base font-bold text-emerald-400">Generar Pronósticos</h3>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Ejecuta el modelo Poisson y cálculo de valor sobre todos los partidos próximos y genera los análisis visuales.
              </p>
            </div>
            <button
              onClick={handleGeneratePredictions}
              disabled={!!loadingAction}
              className="mt-5 w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              {loadingAction === "predictions" ? "⏳ Calculando..." : "🚀 Generar Todos los Picks"}
            </button>
          </div>
        </div>

        {/* Supported Leagues List Preview */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Ligas Incluidas en el Catálogo ({SUPPORTED_LEAGUES.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_LEAGUES.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-800"
              >
                <span>{l.name}</span>
                <span className="text-[10px] text-slate-500 font-normal">({l.country})</span>
              </span>
            ))}
          </div>
        </div>

        {/* Live Terminal Log */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Consola de Ejecución en Tiempo Real
              </h4>
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              Limpiar consola
            </button>
          </div>

          <div className="mt-4 flex max-h-56 flex-col gap-1.5 overflow-y-auto font-mono text-xs text-slate-300">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`py-0.5 ${
                  log.includes("✓")
                    ? "text-emerald-400"
                    : log.includes("✗")
                    ? "text-red-400"
                    : "text-slate-300"
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
