'use client';

import React from 'react';
import Link from 'next/link';
import { SupportedSport } from '@/lib/sports/types';
import { getAllSports } from '@/lib/sports/registry';

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

  const items = [
    { id: 'all' as const, displayName: 'Todos', icon: '🌐', color: '#10b981' },
    ...sports.map(s => ({ id: s.id, displayName: s.displayName, icon: s.icon, color: s.accentColor }))
  ];

  return (
    <div className="w-full overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-700">
      <div className="flex items-center space-x-2 min-w-max p-1 bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-zinc-800/80">
        {items.map(item => {
          const isSelected = selectedSport === item.id;
          const content = (
            <div className="flex items-center space-x-2">
              <span className="text-lg">{item.icon}</span>
              <span className="font-semibold text-sm tracking-wide">{item.displayName}</span>
            </div>
          );

          const className = `px-4 py-2.5 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center select-none ${
            isSelected
              ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`;

          if (asLinks && item.id !== 'all') {
            return (
              <Link key={item.id} href={`/sports/${item.id}`} className={className}>
                {content}
              </Link>
            );
          }

          if (asLinks && item.id === 'all') {
            return (
              <Link key={item.id} href="/" className={className}>
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onSelectSport && onSelectSport(item.id)}
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
