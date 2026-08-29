"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    "Sistema SmartBetBot inicializado en Vercel.",
    "Listo para sincronización bajo demanda con API-Football.",
  ]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 30)]);
  };

  const handleSyncLeagues = async () => {
    try {
      setLoadingAction("leagues");
      addLog("Iniciando sincronización de Ligas y Equipos (Premier League 39, La Liga 140)...");
      const res = await fetch("/api/admin/sync/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueIds: [39, 140] }),
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
    try {
      setLoadingAction("fixtures");
      addLog("Consultando próximos partidos de API-Football (próximos 7 días)...");
      const res = await fetch("/api/admin/sync/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueIds: [39, 140], lookaheadDays: 7 }),
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
            <Link href="/signals" className="text-slate-300 transition hover:text-white">
              Picks de Hoy
            </Link>
            <Link href="/history" className="text-slate-300 transition hover:text-white">
              Historial
            </Link>
            <Link href="/admin" className="text-emerald-400 font-bold">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-400 border border-slate-800 mb-3">
            <span>⚙️ Panel de Control & Sincronización</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Administración Simplificada
          </h1>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            Controla las sincronizaciones con API-Football y la generación de análisis sin servidores externos
          </p>
        </div>

        {/* 1-Click Sync Cards Grid */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {/* Card 1: Leagues & Teams */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
            <div>
              <span className="text-2xl">🏆</span>
              <h3 className="mt-3 text-base font-bold text-white">Ligas y Equipos</h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Descarga y actualiza Premier League (39), La Liga (140) y sus 40 planteles en Supabase.
              </p>
            </div>
            <button
              onClick={handleSyncLeagues}
              disabled={!!loadingAction}
              className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white border border-slate-700 disabled:opacity-50"
            >
              {loadingAction === "leagues" ? "⏳ Sincronizando..." : "🔄 Sincronizar Ligas"}
            </button>
          </div>

          {/* Card 2: Upcoming Fixtures */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
            <div>
              <span className="text-2xl">⚽</span>
              <h3 className="mt-3 text-base font-bold text-white">Partidos de Hoy / Próximos</h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Consulta los fixtures programados para los próximos 7 días y guarda sus horarios y cuotas.
              </p>
            </div>
            <button
              onClick={handleSyncFixtures}
              disabled={!!loadingAction}
              className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white border border-slate-700 disabled:opacity-50"
            >
              {loadingAction === "fixtures" ? "⏳ Sincronizando..." : "🔄 Sincronizar Partidos"}
            </button>
          </div>

          {/* Card 3: Generate Predictions */}
          <div className="flex flex-col justify-between rounded-2xl border border-emerald-900/60 bg-gradient-to-b from-slate-900 to-emerald-950/40 p-5 shadow-lg">
            <div>
              <span className="text-2xl">⚡</span>
              <h3 className="mt-3 text-base font-bold text-emerald-400">Generar Pronósticos</h3>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Ejecuta el modelo Poisson sobre los partidos próximos y calcula las probabilidades, cuotas de valor y explicaciones.
              </p>
            </div>
            <button
              onClick={handleGeneratePredictions}
              disabled={!!loadingAction}
              className="mt-5 w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              {loadingAction === "predictions" ? "⏳ Calculando..." : "🚀 Generar Picks de Hoy"}
            </button>
          </div>
        </div>

        {/* Live Terminal Log */}
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-855 pb-3">
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
