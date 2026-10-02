import { MultiSportSignal } from './types';
import { MarketOpportunity } from './prediction-engine';
import { HistoricalSettledPick } from './db';

export function multiSportSignalToOpportunity(s: MultiSportSignal): MarketOpportunity {
  const fairOdds = Number((1 / (s.modelProbability || 0.55)).toFixed(2));
  const homeScore = s.game.homeScore;
  const awayScore = s.game.awayScore;
  const hasScores = typeof homeScore === 'number' && typeof awayScore === 'number';
  const scoreStr = hasScores ? `${homeScore} - ${awayScore}` : undefined;

  const isLive = s.game.status === 'IN_PLAY';
  const isFinished = s.game.status === 'FINISHED';

  // Evaluate won/lost if game is finished
  let isWon = false;
  let isLost = false;

  if (isFinished && hasScores) {
    const totalGoals = (homeScore ?? 0) + (awayScore ?? 0);
    const selUpper = (s.selection || '').toUpperCase();
    const mktUpper = (s.market || '').toUpperCase();

    if (mktUpper.includes('TOTAL') || selUpper.includes('OVER') || selUpper.includes('UNDER')) {
      const line = Number(s.line) || 5.5;
      if (selUpper.includes('OVER')) {
        isWon = totalGoals > line;
        isLost = totalGoals <= line;
      } else if (selUpper.includes('UNDER')) {
        isWon = totalGoals < line;
        isLost = totalGoals >= line;
      }
    } else if (mktUpper.includes('PUCK') || selUpper.includes('+1.5') || selUpper.includes('-1.5')) {
      const diff = (homeScore ?? 0) - (awayScore ?? 0);
      const isHomeSel = selUpper.includes(s.game.homeTeam.name.toUpperCase()) || selUpper.includes('HOME');
      if (isHomeSel) {
        if (selUpper.includes('+1.5')) {
          isWon = diff + 1.5 > 0;
          isLost = diff + 1.5 <= 0;
        } else {
          isWon = diff - 1.5 > 0;
          isLost = diff - 1.5 <= 0;
        }
      } else {
        if (selUpper.includes('+1.5')) {
          isWon = -diff + 1.5 > 0;
          isLost = -diff + 1.5 <= 0;
        } else {
          isWon = -diff - 1.5 > 0;
          isLost = -diff - 1.5 <= 0;
        }
      }
    } else if (mktUpper.includes('MONEYLINE') || mktUpper.includes('GANADOR')) {
      const isHomeSel = selUpper.includes(s.game.homeTeam.name.toUpperCase());
      if (isHomeSel) {
        isWon = (homeScore ?? 0) > (awayScore ?? 0);
        isLost = (homeScore ?? 0) < (awayScore ?? 0);
      } else {
        isWon = (awayScore ?? 0) > (homeScore ?? 0);
        isLost = (awayScore ?? 0) < (homeScore ?? 0);
      }
    }
  }

  const oppStatus = isLive
    ? 'in_play'
    : isFinished
    ? (isWon ? 'won' : isLost ? 'lost' : 'finished')
    : 'pending';

  return {
    id: s.id,
    fixtureId: s.gameId || s.id,
    match: `${s.game.homeTeam.name} vs ${s.game.awayTeam.name}`,
    homeTeam: s.game.homeTeam.name,
    awayTeam: s.game.awayTeam.name,
    homeTeamId: Number(s.game.homeTeam.id) || 0,
    awayTeamId: Number(s.game.awayTeam.id) || 0,
    league: s.game.league.name,
    leagueId: Number(s.game.league.id) || 0,
    country: s.sport.toUpperCase(),
    kickoff: s.game.startsAt,
    market: s.market,
    selection: s.selection,
    odds: s.decimalOdds || 1.85,
    fairOdds: fairOdds,
    probability: Math.round((s.modelProbability || 0.55) * 100),
    edge: Math.round((s.smartEdge || 0.05) * 100),
    expectedValue: Math.round(s.expectedValue || 5),
    confidence: (s.classification === 'TOP PICK' ? 'Muy Alta' : 'Alta') as any,
    confidenceScore: s.smartScore || 80,
    explanation: s.explanation || `Analisis cuantitativo de valor esperado (+EV) para ${s.sport.toUpperCase()}.`,
    pickBadge: s.isSmartPick ? 'valor' : (s.decimalOdds >= 2.0 ? 'bomba' : 'estandar'),
    status: oppStatus,
    result: isWon ? 'WON' : isLost ? 'LOST' : undefined,
    actualScore: scoreStr,
    currentScore: scoreStr,
    matchTiming: isLive ? 'live' : isFinished ? 'finished' : 'prematch',
    smartScore: s.smartScore || 80,
    sport: s.sport,
  } as unknown as MarketOpportunity;
}

export function historicalPickToOpportunity(h: HistoricalSettledPick, sportKey: string): MarketOpportunity {
  const isWon = h.result === 'WON';
  const isLost = h.result === 'LOST';
  const odds = Number(h.odds) || 1.80;
  const prob = Number(h.probability) || 60;
  const fairOdds = Number((1 / (prob / 100 || 0.6)).toFixed(2));

  return {
    id: h.id || `hist-${h.match}-${h.date}`,
    fixtureId: (h as any).fixtureId || h.id || 0,
    match: h.match,
    homeTeam: h.homeTeam || h.match.split(' vs ')[0] || 'Local',
    awayTeam: h.awayTeam || h.match.split(' vs ')[1] || 'Visita',
    homeTeamId: (h as any).homeTeamId || 0,
    awayTeamId: (h as any).awayTeamId || 0,
    league: h.league || 'Liga',
    leagueId: (h as any).leagueId || 0,
    country: sportKey.toUpperCase(),
    kickoff: h.kickoff || `${h.date}T12:00:00Z`,
    market: h.market,
    selection: h.selection,
    odds: odds,
    fairOdds: fairOdds,
    probability: prob,
    edge: 6,
    expectedValue: 6,
    confidence: (h.confidence || (prob >= 75 ? 'Muy Alta' : 'Alta')) as any,
    confidenceScore: prob,
    explanation: 'Resultado auditado y liquidado oficialmente.',
    pickBadge: 'valor',
    status: isWon ? 'won' : isLost ? 'lost' : 'finished',
    result: h.result,
    actualScore: h.score,
    smartScore: prob,
    sport: sportKey as any,
  } as unknown as MarketOpportunity;
}