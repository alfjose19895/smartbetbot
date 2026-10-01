import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getVerifiedIdentity } from '@/features/auth/lib/session';
import { isValidSport, getSportMeta } from '@/lib/sports/registry';
import { isSportFeatureEnabled } from '@/lib/sports/config';
import { SportSelector } from '@/components/SportSelector';
import { SupportedSport } from '@/lib/sports/types';

interface SportPageProps {
  params: Promise<{ sport: string }>;
}

export default async function DynamicSportPage({ params }: SportPageProps) {
  const identity = await getVerifiedIdentity();
  const { sport } = await params;

  if (!identity) {
    redirect(`/login?next=/sports/${sport}`);
  }

  if (!isValidSport(sport)) {
    notFound();
  }

  const meta = getSportMeta(sport as SupportedSport);
  const isEnabled = isSportFeatureEnabled(sport as SupportedSport);

  return (
    <AppShell identity={identity} currentPath={`/sports/${sport}`}>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <section>
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Seleccionar Deporte
          </div>
          <SportSelector selectedSport={sport as SupportedSport} asLinks={true} />
        </section>

        <header className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-4xl">{meta.icon}</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {meta.displayName}
                </h1>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${meta.badgeBg}`}>
                  Temporada {meta.activeSeason}
                </span>
              </div>
              <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
                {meta.description}
              </p>
            </div>

            <div className="flex flex-col sm:items-end">
              <span className="text-xs font-medium text-zinc-400">Mercados Soportados</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {meta.defaultMarkets.map(m => (
                  <span key={m} className="text-[11px] font-semibold bg-zinc-800/80 text-zinc-300 px-2.5 py-1 rounded-lg border border-zinc-700/60">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </header>

        {!isEnabled ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center">
            <span className="text-2xl">⚠️</span>
            <h3 className="text-base font-bold text-amber-400 mt-2">Módulo en Calibración</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              El módulo de {meta.displayName} está actualmente en fase de calibración matemática y backtesting. Las señales se activarán en cuanto finalice el proceso de validación.
            </p>
          </div>
        ) : (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{meta.icon}</span> Señales y Oportunidades
                </h2>
                <p className="text-xs text-zinc-400">
                  Calculadas mediante modelo cuantitativo Monte Carlo / Poisson con Smart Edge auditado.
                </p>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-8 text-center">
              <div className="text-3xl mb-2">🎯</div>
              <h3 className="text-sm font-semibold text-zinc-200">Sin señales oficiales por ahora</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                No hay apuestas con suficiente valor matemático ({meta.displayName}) en la pizarra de hoy. Priorizamos calidad sobre cantidad.
              </p>
            </div>
          </section>
        )}

        <footer className="pt-6 border-t border-zinc-800/60 text-center">
          <p className="text-[11px] text-zinc-500 max-w-2xl mx-auto leading-relaxed">
            SmartBetBot es una herramienta de análisis cuantitativo y probabilidades para {meta.displayName}. El juego debe ser responsable. Ningún pronóstico cuantitativo garantiza ganancias.
          </p>
        </footer>
      </div>
    </AppShell>
  );
}
