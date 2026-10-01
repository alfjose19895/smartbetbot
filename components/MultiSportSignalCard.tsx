import React from 'react';
import { MultiSportSignal } from '@/lib/sports/types';
import { getSportMeta } from '@/lib/sports/registry';

interface MultiSportSignalCardProps {
  signal: MultiSportSignal;
}

export const MultiSportSignalCard: React.FC<MultiSportSignalCardProps> = ({ signal }) => {
  const sportMeta = getSportMeta(signal.sport);

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'TOP PICK':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'STRONG':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'QUALIFIED':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-zinc-700/30 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-xl">{sportMeta.icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            {sportMeta.displayName} · PRE-MATCH
          </span>
        </div>
        <span className={`text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${getClassificationBadge(signal.classification)}`}>
          {signal.classification === 'TOP PICK' ? '⭐ TOP PICK' : signal.classification}
        </span>
      </div>

      <div className="mb-4">
        <div className="text-sm font-semibold text-zinc-100">{signal.game.homeTeam.name}</div>
        <div className="text-xs text-zinc-400 font-medium my-0.5">vs</div>
        <div className="text-sm font-semibold text-zinc-100">{signal.game.awayTeam.name}</div>
      </div>

      <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/60 mb-4">
        <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
          {signal.market}
        </div>
        <div className="text-base font-extrabold text-emerald-400 mt-0.5">
          {signal.selection}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center py-2 border-t border-zinc-800/80 mb-3">
        <div>
          <div className="text-[10px] text-zinc-400 font-medium">Prob IA</div>
          <div className="text-sm font-bold text-zinc-100">
            {Math.round(signal.modelProbability * 100)}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400 font-medium">Cuota</div>
          <div className="text-sm font-bold text-zinc-100">
            {signal.decimalOdds.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400 font-medium">Smart Edge</div>
          <div className={`text-sm font-bold ${signal.smartEdge >= 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {signal.smartEdge >= 0 ? `+${(signal.smartEdge * 100).toFixed(1)}%` : `${(signal.smartEdge * 100).toFixed(1)}%`}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400 font-medium">Smart Score</div>
          <div className="text-sm font-bold text-amber-400">
            {signal.smartScore}
          </div>
        </div>
      </div>

      {signal.explanation && (
        <p className="text-xs text-zinc-400 leading-relaxed italic border-t border-zinc-800/60 pt-2">
          {signal.explanation}
        </p>
      )}
    </div>
  );
};
