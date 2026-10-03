import { describe, it, expect } from 'vitest';
import { multiSportSignalToOpportunity, historicalPickToOpportunity } from './signal-adapters';
import { MultiSportSignal } from './types';
import { HistoricalSettledPick } from './db';

describe('Sport History Isolation & Settlement Timing', () => {
  it('does NOT settle unstarted or scheduled games into actualScore or result', () => {
    const scheduledSignal: MultiSportSignal = {
      id: 'nhl-scheduled-1',
      sport: 'nhl',
      gameId: '101',
      game: {
        id: '101',
        sport: 'nhl',
        provider: 'api-nhl',
        providerGameId: '101',
        startsAt: '2026-10-02T02:30:00Z',
        status: 'SCHEDULED',
        homeTeam: { id: 1, name: 'Florida Panthers', code: 'FLA' },
        awayTeam: { id: 2, name: 'San Jose Sharks', code: 'SJS' },
        league: { id: 1, name: 'NHL', season: '2026' },
      },
      market: 'Total Goles',
      selection: 'Over 5.5 Goles',
      line: 5.5,
      decimalOdds: 1.85,
      modelProbability: 0.65,
      smartEdge: 0.08,
      expectedValue: 8.5,
      smartScore: 85,
      classification: 'TOP PICK',
      isSmartPick: true,
      explanation: 'Análisis cuantitativo de valor esperado para NHL.',
      dataQuality: 90,
      createdAt: '2026-10-01T20:00:00Z',
    };

    const opp = multiSportSignalToOpportunity(scheduledSignal);

    expect(opp.status).toBe('pending');
    expect(opp.actualScore).toBeUndefined();
    expect(opp.result).toBeUndefined();
    expect(opp.matchTiming).toBe('prematch');
  });

  it('correctly settles finished NHL games with final scores', () => {
    const finishedSignal: MultiSportSignal = {
      id: 'nhl-finished-1',
      sport: 'nhl',
      gameId: '102',
      game: {
        id: '102',
        sport: 'nhl',
        provider: 'api-nhl',
        providerGameId: '102',
        startsAt: '2026-10-01T18:00:00Z',
        status: 'FINISHED',
        homeTeam: { id: 3, name: 'Edmonton Oilers', code: 'EDM' },
        awayTeam: { id: 4, name: 'Calgary Flames', code: 'CGY' },
        homeScore: 4,
        awayScore: 2,
        league: { id: 1, name: 'NHL', season: '2026' },
      },
      market: 'Total Goles',
      selection: 'Over 5.5 Goles',
      line: 5.5,
      decimalOdds: 1.88,
      modelProbability: 0.62,
      smartEdge: 0.07,
      expectedValue: 7.2,
      smartScore: 84,
      classification: 'TOP PICK',
      isSmartPick: true,
      explanation: 'Análisis cuantitativo de valor esperado para NHL.',
      dataQuality: 90,
      createdAt: '2026-10-01T15:00:00Z',
    };

    const opp = multiSportSignalToOpportunity(finishedSignal);

    expect(opp.status).toBe('won');
    expect(opp.result).toBe('WON');
    expect(opp.actualScore).toBe('4 - 2');
    expect(opp.matchTiming).toBe('finished');
  });

  it('maps historical settled picks maintaining sport identity', () => {
    const nhlPick: HistoricalSettledPick = {
      id: 'hist-nhl-1',
      date: '2026-10-01',
      kickoff: '2026-10-01T22:00:00Z',
      match: 'Toronto Maple Leafs vs Montreal Canadiens',
      homeTeam: 'Toronto Maple Leafs',
      awayTeam: 'Montreal Canadiens',
      score: '5 - 3',
      league: 'NHL',
      country: 'NHL',
      market: 'Moneyline',
      selection: 'Toronto Maple Leafs (Ganador)',
      odds: 1.75,
      probability: 68,
      result: 'WON',
      profit: 0.75,
      confidence: 'Alta',
      explanation: 'Resultado auditado y liquidado oficialmente.',
    };

    const opp = historicalPickToOpportunity(nhlPick, 'nhl');

    expect(opp.country).toBe('NHL');
    expect(opp.sport).toBe('nhl');
    expect(opp.result).toBe('WON');
    expect(opp.actualScore).toBe('5 - 3');
  });
});
