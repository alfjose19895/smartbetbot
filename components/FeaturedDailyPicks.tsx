'use client';

import React, { useState } from 'react';
import { MarketOpportunity } from '@/lib/sports/prediction-engine';
import { shareCardAsImage, copyCardImageToClipboard } from '@/lib/sports/card-image-generator';

interface FeaturedDailyPicksProps {
  smartPick: MarketOpportunity | null;
  bombaPick: MarketOpportunity | null;
  nhlSmartPick?: MarketOpportunity | null;
  onOpenDetail?: (prediction: MarketOpportunity) => void;
}

export function FeaturedDailyPicks({ smartPick, bombaPick, nhlSmartPick, onOpenDetail }: FeaturedDailyPicksProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);
  const [copyImageSuccessId, setCopyImageSuccessId] = useState<string | null>(null);

  if (!smartPick && !bombaPick && !nhlSmartPick) return null;

  const handleCopyText = (pick: MarketOpportunity, type: 'smart' | 'bomba' | 'nhl') => {
    const title = type === 'bomba'
      ? '💎 SELECCIÓN DE VALOR DEL DÍA (+EV)'
      : type === 'nhl'
      ? '🏒 SMARTPICK NHL DEL DÍA (+EV)'
      : '👑 SMARTPICK FÚTBOL DEL DÍA (MÁXIMA SEGURIDAD)';

    const sportIcon = (pick as any).sport === 'nhl' ? '🏒' : '⚽';

    const text = [
      `⭐ ${title} ⭐`,
      `🏆 ${pick.league} ${pick.country ? `(${pick.country})` : ''}`,
      `${sportIcon} ${pick.homeTeam} vs ${pick.awayTeam}`,
      `🎯 Pronóstico Oficial: ${pick.market} (${pick.selection})`,
      `🏢 Cuota Casa de Apuestas: @${(pick.odds ?? 1.5).toFixed(2)}`,
      `🤖 Cuota Modelo SmartBetBot: @${(pick.fairOdds ?? pick.odds ?? 1.5).toFixed(2)}`,
      `📈 Probabilidad Estimada: ${pick.probability}% (+${pick.edge}% Valor)`,
      `⭐ Confianza: ${pick.confidence || 'Muy Alta'}`,
      '',
      `🧠 Análisis: "${pick.explanation}"`,
      '',
      '🔒 Pronóstico Oficial Cuantitativo de SmartBetBot AI',
      '🌐 https://smartbetbot.educandotea.com',
    ].join('\n');

    const key = pick.id || pick.match;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 3000);
    });
  };

  const handleCopyImage = async (pick: MarketOpportunity) => {
    const key = pick.id || pick.match;
    try {
      setCopyingImageId(key);
      const ok = await copyCardImageToClipboard(pick);
      if (ok) {
        setCopyImageSuccessId(key);
        setTimeout(() => setCopyImageSuccessId(null), 3000);
      }
    } finally {
      setCopyingImageId(null);
    }
  };

  const renderFeaturedCard = (pick: MarketOpportunity, type: 'smart' | 'bomba' | 'nhl') => {
    const isBomba = type === 'bomba';
    const isNhl = type === 'nhl';
    const cardKey = pick.id || `${pick.fixtureId}-${pick.market}`;

    const borderColor = isNhl
      ? 'border-cyan-500/40 hover:border-cyan-400'
      : isBomba
      ? 'border-purple-500/40 hover:border-purple-400'
      : 'border-amber-500/40 hover:border-amber-400';

    const badgeBg = isNhl
      ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-cyan-900/30'
      : isBomba
      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-900/30'
      : 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-amber-900/30';

    const glowColor = isNhl
      ? 'from-cyan-500/10 via-transparent to-transparent'
      : isBomba
      ? 'from-purple-500/10 via-transparent to-transparent'
      : 'from-amber-500/10 via-transparent to-transparent';

    return (
      <div
        key={cardKey}
        className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-slate-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-xl transition-all hover:scale-[1.01] hover:shadow-2xl ${borderColor}`}
      >
        {/* Subtle Background Glow */}
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${glowColor} opacity-70`} />

        <div>
          {/* Top Header Badge & Kickoff */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase shadow-sm ${badgeBg}`}>
              <span>{isNhl ? '🏒' : isBomba ? '💎' : '👑'}</span>
              <span>
                {isNhl
                  ? 'SMARTPICK NHL'
                  : isBomba
                  ? 'VALOR DEL DÍA (+EV)'
                  : 'SMARTPICK FÚTBOL'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
              <span>⏰</span>
              <span>
                {new Date(pick.kickoff).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} hrs
              </span>
            </div>
          </div>

          {/* League & Country */}
          <div className="text-[11px] font-bold text-slate-400 truncate mb-1">
            🏆 {pick.league} {pick.country ? `(${pick.country})` : ''}
          </div>

          {/* Match Title */}
          <h3 className="text-base sm:text-lg font-black text-white leading-snug mb-3">
            {pick.homeTeam} <span className="text-slate-400 font-normal">vs</span> {pick.awayTeam}
          </h3>

          {/* Official Selection Display */}
          <div className="rounded-2xl bg-slate-950/80 p-3.5 border border-slate-800/80 mb-3.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold mb-1">
              <span>Mercado Cuantitativo:</span>
              <span className="text-emerald-400 font-black">{pick.market}</span>
            </div>
            <div className="text-sm sm:text-base font-black text-white flex items-center justify-between">
              <span>{pick.selection}</span>
              <span className="text-base sm:text-lg font-black text-emerald-400">@{(pick.odds ?? 1.5).toFixed(2)}</span>
            </div>
          </div>

          {/* Odds & Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-xl bg-slate-950/60 p-2 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 block font-semibold">Probabilidad IA</span>
              <span className="text-sm font-black text-white mt-0.5 block">{pick.probability}%</span>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-2 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 block font-semibold">Ventaja (+EV)</span>
              <span className="text-sm font-black text-emerald-400 mt-0.5 block">+{pick.edge || 5}%</span>
            </div>
          </div>

          {/* Analysis Explanation */}
          {pick.explanation && (
            <p className="mt-3 text-[11px] text-slate-300 italic leading-relaxed line-clamp-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40">
              "{pick.explanation}"
            </p>
          )}
        </div>

        {/* Action Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={() => onOpenDetail?.(pick)}
            className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition text-center cursor-pointer"
          >
            Ver H2H y Métricas
          </button>
          <button
            onClick={() => handleCopyText(pick, type)}
            className="p-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer text-xs"
            title="Copiar pronóstico"
          >
            {copiedId === cardKey ? '✓' : '📋'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 text-base font-black border border-purple-500/20">
            👑
          </span>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white">
              Picks Destacados Multi-Deporte del Día
            </h2>
            <p className="text-xs text-slate-400">
              Las mejores oportunidades cuantitativas seleccionadas con mayor índice de valor (+EV) por disciplina
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {smartPick && renderFeaturedCard(smartPick, 'smart')}
        {nhlSmartPick && renderFeaturedCard(nhlSmartPick, 'nhl')}
        {bombaPick && renderFeaturedCard(bombaPick, 'bomba')}
      </div>
    </section>
  );
}
