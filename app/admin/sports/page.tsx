import React from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getVerifiedIdentity } from '@/features/auth/lib/session';
import { getAllSports } from '@/lib/sports/registry';
import { SportProviderRouter } from '@/lib/sports/provider-router';
import { DEFAULT_NBA_STRATEGIES } from '@/lib/sports/nba/nba-strategies';
import { DEFAULT_NFL_STRATEGIES } from '@/lib/sports/nfl/nfl-strategies';
import { DEFAULT_NCAAF_STRATEGIES } from '@/lib/sports/ncaaf/ncaaf-strategies';
import { DEFAULT_NHL_STRATEGIES } from '@/lib/sports/nhl/nhl-strategies';
import { SportStrategyConfig, SupportedSport } from '@/lib/sports/types';

export const dynamic = 'force-dynamic';

export default async function AdminSportsPage() {
  const identity = await getVerifiedIdentity();
  if (!identity || identity.role !== 'admin') {
    redirect('/dashboard');
  }

  const sports = getAllSports();
  const diagnostics = await SportProviderRouter.runDiagnostics();

  const strategyMap: Record<SupportedSport, Record<string, SportStrategyConfig>> = {
    football: {},
    nba: DEFAULT_NBA_STRATEGIES,
    nfl: DEFAULT_NFL_STRATEGIES,
    ncaaf: DEFAULT_NCAAF_STRATEGIES,
    nhl: DEFAULT_NHL_STRATEGIES
  };

  return (
    <AppShell identity={identity} currentPath="/admin/sports">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
            Panel de Administración
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Gestión Multi-Sport & Estrategias
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Supervisión técnica de APIs, estado de providers y configuración cuantitativa de umbrales por deporte.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-base font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <span>📡</span> Diagnóstico de Proveedores de Datos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sports.map(sport => {
              const diag = diagnostics[sport.id];
              const isOk = diag?.status === 'OK';
              const isDisabled = diag?.status === 'DISABLED';

              return (
                <div key={sport.id} className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl">{sport.icon}</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">{sport.displayName}</h3>
                        <p className="text-[11px] text-zinc-400">{diag?.name || sport.name}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                      isOk
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : isDisabled
                        ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    }`}>
                      {diag?.status || 'UNKNOWN'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 border-t border-zinc-800/80 pt-3 mt-1">
                    {diag?.message || 'Sin información de diagnóstico.'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-base font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <span>⚙️</span> Parámetros y Umbrales Cuantitativos
          </h2>

          {(['nba', 'nfl', 'ncaaf', 'nhl'] as SupportedSport[]).map(sportId => {
            const sport = sports.find(s => s.id === sportId)!;
            const strats = Object.values(strategyMap[sportId]);

            return (
              <div key={sportId} className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{sport.icon}</span>
                  <h3 className="text-base font-bold text-white">{sport.displayName} Estrategias</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {strats.map(st => (
                    <div key={st.id} className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-200">{st.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {st.enabled ? 'HABILITADA' : 'DESHABILITADA'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">{st.description}</p>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center text-[10px] bg-zinc-900/80 rounded-lg p-2 border border-zinc-800/60">
                        <div>
                          <div className="text-zinc-500">Min Prob</div>
                          <div className="font-bold text-zinc-200">{Math.round(st.minProbability * 100)}%</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Min Edge</div>
                          <div className="font-bold text-emerald-400">+{(st.minEdge * 100).toFixed(1)}%</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Cuotas</div>
                          <div className="font-bold text-zinc-200">{st.minOdds} - {st.maxOdds}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Min Calidad</div>
                          <div className="font-bold text-zinc-200">{st.minDataQuality}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
