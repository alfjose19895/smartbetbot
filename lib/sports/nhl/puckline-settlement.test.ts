import { describe, it, expect } from 'vitest';
import { NHLSettlementEngine } from './nhl-settlement';
import { evaluateMarketResult } from '../db';

describe('NHL Puck Line Settlement Suite', () => {
  it('correctly settles LA Kings +1.5 as WON when Florida wins 2-1 (NHLSettlementEngine)', () => {
    const signal: any = {
      market: 'PUCK LINE',
      selection: 'Los Angeles Kings +1.5',
      game: {
        homeTeam: { name: 'Florida Panthers' },
        awayTeam: { name: 'Los Angeles Kings' },
      }
    };

    const result = NHLSettlementEngine.settleSignal(signal, {
      gameId: 'nhl_444649',
      status: 'FINISHED',
      homeScore: 2,
      awayScore: 1,
    });

    expect(result.status).toBe('WON');
  });

  it('correctly settles Florida Panthers -1.5 as LOST when Florida wins 2-1', () => {
    const signal: any = {
      market: 'PUCK LINE',
      selection: 'Florida Panthers -1.5',
      game: {
        homeTeam: { name: 'Florida Panthers' },
        awayTeam: { name: 'Los Angeles Kings' },
      }
    };

    const result = NHLSettlementEngine.settleSignal(signal, {
      gameId: 'nhl_444649',
      status: 'FINISHED',
      homeScore: 2,
      awayScore: 1,
    });

    expect(result.status).toBe('LOST');
  });

  it('correctly settles Florida Panthers -1.5 as WON when Florida wins 3-1', () => {
    const signal: any = {
      market: 'PUCK LINE',
      selection: 'Florida Panthers -1.5',
      game: {
        homeTeam: { name: 'Florida Panthers' },
        awayTeam: { name: 'Los Angeles Kings' },
      }
    };

    const result = NHLSettlementEngine.settleSignal(signal, {
      gameId: 'nhl_444649',
      status: 'FINISHED',
      homeScore: 3,
      awayScore: 1,
    });

    expect(result.status).toBe('WON');
  });

  it('evaluateMarketResult evaluates LA Kings +1.5 as WON when score is 2-1 (db.ts)', () => {
    const evaluation = evaluateMarketResult('Puck Line', 2, 1, {
      selection: 'Los Angeles Kings +1.5',
      homeTeam: 'Florida Panthers',
      awayTeam: 'Los Angeles Kings'
    });

    expect(evaluation.isWon).toBe(true);
    expect(evaluation.actualScoreText).toBe('2 - 1');
  });
});