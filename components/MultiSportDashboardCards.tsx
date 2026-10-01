'use client';

import React from 'react';
import Link from 'next/link';
import { getAllSports } from '@/lib/sports/registry';
import { MarketOpportunity } from '@/lib/sports/prediction-engine';

interface MultiSportDashboardCardsProps {
  footballSignalsCount?: number;
  footballSmartPick?: MarketOpportunity | null;
}

export const MultiSportDashboardCards: React.FC<MultiSportDashboardCardsProps> = ({
  footballSignalsCount = 0,
  footballSmartPick = null
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
          href: '/signals'
        };
      case 'nba':
        return {
          signalsCount: 0,
          smartPickText: null,
          href: '/sports/nba'
        };
      case 'nfl':
        return {
          signalsCount: 0,
          smartPickText: null,
          href: '/sports/nfl'
        };
      case 'ncaaf':
        return {
          signalsCount: 0,
          smartPickText: null,
          href: '/sports/ncaaf'
        };
      case 'nhl':
        return {
          signalsCount: 0,
          smartPickText: null,
          href: '/sports/nhl'
        };
      default:
        return { signalsCount: 0, smartPickText: null, href: `/sports/${sportId}` };
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
              Deportes Disponibles
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Explora modelos probabilísticos cuantitativos independientes por deporte
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {sports.map(sport => {
          const { signalsCount, smartPickText, href } = getSportData(sport.id);

          return (
            <div
              key={sport.id}
              className="bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{sport.icon}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${sport.badgeBg}`}>
                    {sport.displayName}
                  </span>
                </div>

                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {sport.displayName}
                </h3>

                <div className="mt-2.5 space-y-1">
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Señales de hoy:{' '}
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {signalsCount > 0 ? `${signalsCount} activas` : '0'}
                    </strong>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {smartPickText ? (
                      <span className="text-amber-500 dark:text-amber-400 font-semibold flex items-center gap-1">
                        <span>⭐</span> {smartPickText}
                      </span>
                    ) : (
                      <span className="italic text-[10px] text-slate-400 dark:text-slate-500">
                        Sin señal calificada por ahora.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3.5 mt-3 border-t border-slate-100 dark:border-slate-800/60">
                <Link
                  href={href}
                  className="w-full py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1 group"
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
