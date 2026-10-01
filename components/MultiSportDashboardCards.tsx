'use client';

import React from 'react';
import Link from 'next/link';
import { getAllSports } from '@/lib/sports/registry';
import { MarketOpportunity } from '@/lib/sports/prediction-engine';
import { MultiSportSignal } from '@/lib/sports/types';

interface MultiSportDashboardCardsProps {
  footballSignalsCount?: number;
  footballSmartPick?: MarketOpportunity | null;
  nhlSignalsCount?: number;
  nhlSmartPick?: MultiSportSignal | null;
}

export const MultiSportDashboardCards: React.FC<MultiSportDashboardCardsProps> = ({
  footballSignalsCount = 0,
  footballSmartPick = null,
  nhlSignalsCount = 0,
  nhlSmartPick = null,
}) => {
  const sports = getAllSports();

  const getSportData = (sportId: string) => {
    switch (sportId) {
      case 'football':
        return {
          signalsCount: footballSignalsCount,
          smartPickText: footballSmartPick
            ? `${footballSmartPick.homeTeam} (${footballSmartPick.market})`
            : null,
          href: '/signals',
          statusBadge: 'ACTIVO',
          statusColor: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        };
      case 'nhl':
        return {
          signalsCount: nhlSignalsCount,
          smartPickText: nhlSmartPick
            ? `${nhlSmartPick.game.homeTeam.name} (${nhlSmartPick.market})`
            : null,
          href: '/sports/nhl',
          statusBadge: 'ACTIVO',
          statusColor: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
        };
      case 'nba':
        return {
          signalsCount: 0,
          smartPickText: null,
          href: '/sports/nba',
          statusBadge: 'EN VIVO',
          statusColor: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
        };
      case 'nfl':
        return {
          signalsCount: 0,
          smartPickText: null,
          href: '/sports/nfl',
          statusBadge: 'PRONTO',
          statusColor: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
        };
      case 'ncaaf':
        return {
          signalsCount: 0,
          smartPickText: null,
          href: '/sports/ncaaf',
          statusBadge: 'PRONTO',
          statusColor: 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
        };
      default:
        return {
          signalsCount: 0,
          smartPickText: null,
          href: `/sports/${sportId}`,
          statusBadge: 'ACTIVO',
          statusColor: 'bg-slate-500/20 text-slate-700 dark:text-slate-400 border-slate-500/30',
        };
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-base font-black border border-emerald-500/20">
            🏆
          </span>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Deportes Disponibles & Cobertura IA
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Modelos cuantitativos e inteligencia artificial aplicada por disciplina deportiva
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {sports.map((sport) => {
          const { signalsCount, smartPickText, href, statusBadge, statusColor } = getSportData(sport.id);

          return (
            <div
              key={sport.id}
              className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-emerald-500/40 dark:hover:border-emerald-500/30 transition group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{sport.icon}</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${statusColor}`}>
                    {statusBadge}
                  </span>
                </div>

                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {sport.displayName}
                </h3>

                <div className="mt-2.5 space-y-1">
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Señales de hoy:{' '}
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {signalsCount > 0 ? `${signalsCount} activas` : '0 disponibles'}
                    </strong>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 min-h-[1.5rem]">
                    {smartPickText ? (
                      <span className="text-amber-500 dark:text-amber-400 font-semibold flex items-center gap-1 truncate">
                        <span>⭐</span> <span className="truncate">{smartPickText}</span>
                      </span>
                    ) : (
                      <span className="italic text-[10px] text-slate-400 dark:text-slate-500">
                        {sport.id === 'football' || sport.id === 'nhl'
                          ? 'Calculando señales de valor...'
                          : 'Próxima jornada en proceso.'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3.5 mt-3 border-t border-slate-100 dark:border-slate-800/60">
                <Link
                  href={href}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-emerald-500 hover:text-slate-950 text-slate-800 dark:bg-slate-800 dark:hover:bg-emerald-500 dark:hover:text-slate-950 dark:text-slate-200 text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>EXPLORAR</span>
                  <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
