'use client';

import React from 'react';
import Link from 'next/link';
import { SupportedSport } from '@/lib/sports/types';
import { getAllSports } from '@/lib/sports/registry';
import { isSportFeatureEnabled } from '@/lib/sports/config';

interface SportSelectorProps {
  selectedSport?: SupportedSport | 'all';
  onSelectSport?: (sport: SupportedSport | 'all') => void;
  asLinks?: boolean;
}

export const SportSelector: React.FC<SportSelectorProps> = ({
  selectedSport = 'all',
  onSelectSport,
  asLinks = false
}) => {
  const sports = getAllSports();

  return (
    <div className="w-full overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
      <div className="flex items-center space-x-2 min-w-max p-1.5 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800/80 shadow-md">
        {sports.map(s => {
          const isSelected = selectedSport === s.id;
          const isEnabled = isSportFeatureEnabled(s.id);
          const href = s.id === 'football' ? '/dashboard' : `/sports/${s.id}`;

          const content = (
            <div className="flex items-center space-x-2">
              <span className="text-lg">{s.icon}</span>
              <span className="font-black text-xs sm:text-sm tracking-wide">{s.displayName}</span>
              {s.id === 'nhl' && (
                <span className="rounded-full bg-cyan-500 text-slate-950 px-1.5 py-0.2 text-[9px] font-black">
                  NUEVO
                </span>
              )}
              {!isEnabled && (
                <span className="rounded-md bg-slate-800 text-slate-400 px-1.5 py-0.5 text-[9px] font-bold">
                  Pronto
                </span>
              )}
            </div>
          );

          const className = `px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center select-none ${
            isSelected
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg font-black border border-emerald-400/40'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
          }`;

          if (asLinks) {
            return (
              <Link key={s.id} href={href} className={className}>
                {content}
              </Link>
            );
          }

          return (
            <button
              key={s.id}
              onClick={() => onSelectSport && onSelectSport(s.id)}
              className={className}
              type="button"
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
};
