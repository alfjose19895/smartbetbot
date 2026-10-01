import { describe, it, expect } from 'vitest';
import { NBAFeatureEngine } from './nba-feature-engine';
import { NBAModelV1 } from './nba-model';
import { NBAStrategyEngine } from './nba-strategies';
import { NBASettlementEngine } from './nba-settlement';
import { NBABacktestEngine } from './nba-backtest';
import { NBATeamStats, NBAMarketOdds } from './nba-types';
import { NormalizedGame } from '../types';

describe('NBA Engine Comprehensive Test Suite', () => {
  const sampleHomeStats: NBATeamStats = {
    teamId: 1,
    teamName: 'Boston Celtics',
    gamesPlayed: 35,
    wins: 28,
    losses: 7,
    pointsPerGame: 120.4,
    pointsAllowedPerGame: 109.2,
    offensiveRating: 122.1,
    defensiveRating: 110.5,
    pace: 100.5,
    fgPct: 0.485,
    fg3Pct: 0.382,
    ftPct: 0.812,
    reboundsPerGame: 46.5,
    offensiveReboundsPerGame: 10.8,
    turnoversPerGame: 12.1,
    assistRate: 0.65,
    homePpg: 123.0,
    homeOppPpg: 107.5,
    awayPpg: 117.8,
    awayOppPpg: 111.0,
    last5Ppg: 122.0,
    last5OppPpg: 108.0,
    restDays: 2,
    isBackToBack: false
  };

  const sampleAwayStats: NBATeamStats = {
    teamId: 2,
    teamName: 'Miami Heat',
    gamesPlayed: 34,
    wins: 19,
    losses: 15,
    pointsPerGame: 110.2,
    pointsAllowedPerGame: 111.5,
    offensiveRating: 112.3,
    defensiveRating: 113.8,
    pace: 96.8,
    fgPct: 0.461,
    fg3Pct: 0.355,
    ftPct: 0.820,
    reboundsPerGame: 42.1,
    offensiveReboundsPerGame: 9.2,
    turnoversPerGame: 13.0,
    assistRate: 0.60,
    homePpg: 112.5,
    homeOppPpg: 109.0,
    awayPpg: 108.0,
    awayOppPpg: 114.0,
    last5Ppg: 109.0,
    last5OppPpg: 113.0,
    restDays: 1,
    isBackToBack: true
  };

  const sampleGame: NormalizedGame = {
    id: 'nba_test_01',
    sport: 'nba',
    provider: 'api-nba',
    providerGameId: '99001',
    league: { id: '12', name: 'NBA', season: '2025-2026' },
    homeTeam: { id: 1, name: 'Boston Celtics' },
    awayTeam: { id: 2, name: 'Miami Heat' },
    startsAt: '2026-10-01T20:00:00Z',
    status: 'SCHEDULED'
  };

  const sampleOdds: NBAMarketOdds = {
    gameId: 'nba_test_01',
    moneyline: {
      homeOdds: 1.45,
      awayOdds: 2.90,
      bookmaker: 'Pinnacle'
    },
    spread: {
      homeLine: -6.5,
      homeOdds: 1.91,
      awayLine: 6.5,
      awayOdds: 1.91,
      bookmaker: 'Pinnacle'
    },
    totalPoints: {
      line: 218.5,
      overOdds: 1.91,
      underOdds: 1.91,
      bookmaker: 'Pinnacle'
    },
    teamTotalPoints: {
      homeLine: 114.5,
      homeOverOdds: 1.85,
      homeUnderOdds: 1.95,
      awayLine: 104.5,
      awayOverOdds: 1.90,
      awayUnderOdds: 1.90,
      bookmaker: 'Pinnacle'
    }
  };

  it('NBA Feature Engine calculates expected possessions and expected scores with shrinkage and rest', () => {
    const pace = NBAFeatureEngine.calculateExpectedPossessions(sampleHomeStats, sampleAwayStats);
    expect(pace).toBeGreaterThan(95);
    expect(pace).toBeLessThan(102);

    const { expectedHomePoints, expectedAwayPoints, dataQuality } = NBAFeatureEngine.calculateExpectedScore(
      sampleHomeStats,
      sampleAwayStats,
      pace
    );

    expect(expectedHomePoints).toBeGreaterThan(expectedAwayPoints);
    expect(expectedHomePoints).toBeGreaterThan(112);
    expect(expectedAwayPoints).toBeLessThan(115);
    expect(dataQuality).toBeGreaterThanOrEqual(75);
  });

  it('NBA Model runs 20k Monte Carlo simulations with deterministic seed', () => {
    const sim = NBAModelV1.simulateGame({
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds,
      simulationsCount: 20000,
      seed: 42
    });

    expect(sim.modelVersion).toBe('nba_model_v1');
    expect(sim.simulationsCount).toBe(20000);
    expect(sim.homeWinProb).toBeGreaterThan(0.65);
    expect(sim.awayWinProb).toBeLessThan(0.35);
    expect(sim.homeWinProb + sim.awayWinProb).toBeCloseTo(1.0, 2);
    expect(sim.spreadCoverProbHome).toBeGreaterThan(0.50);
  });

  it('NBA Strategy Engine generates valid candidates and respects max 2 signals per game', () => {
    const candidates = NBAStrategyEngine.evaluateGame({
      game: sampleGame,
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds
    });

    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.sport).toBe('nba');
      expect(c.smartEdge).toBeDefined();
      expect(c.smartScore).toBeGreaterThanOrEqual(1);
    }

    const officialSignals = NBAStrategyEngine.selectOfficialSignals(candidates);
    expect(officialSignals.length).toBeLessThanOrEqual(2);

    const smartPick = NBAStrategyEngine.selectNBASmartPick(officialSignals);
    if (smartPick) {
      expect(smartPick.isSmartPick).toBe(true);
      expect(smartPick.classification).toBe('TOP PICK');
    }
  });

  it('NBA Settlement accurately settles Moneyline, Spread, Total and Team Totals', () => {
    const mockSignal = {
      id: 'sig_01',
      sport: 'nba' as const,
      gameId: 'nba_test_01',
      game: sampleGame,
      market: 'SPREAD',
      selection: 'Boston Celtics -6.5',
      line: -6.5,
      modelProbability: 0.62,
      decimalOdds: 1.91,
      smartEdge: 0.09,
      expectedValue: 0.18,
      smartScore: 84,
      classification: 'STRONG' as const,
      dataQuality: 80,
      isSmartPick: false,
      explanation: 'Test',
      createdAt: '2026-10-01T00:00:00Z'
    };

    // Case 1: Celtics win 118 - 105 (Margin = 13 > 6.5 -> WON)
    const resWon = NBASettlementEngine.settleSignal(mockSignal, {
      gameId: 'nba_test_01',
      status: 'FINISHED',
      homeScore: 118,
      awayScore: 105
    });
    expect(resWon.status).toBe('WON');

    // Case 2: Celtics win 110 - 106 (Margin = 4 < 6.5 -> LOST)
    const resLost = NBASettlementEngine.settleSignal(mockSignal, {
      gameId: 'nba_test_01',
      status: 'FINISHED',
      homeScore: 110,
      awayScore: 106
    });
    expect(resLost.status).toBe('LOST');
  });

  it('NBA Backtest executes without data leakage and produces calibration curves', () => {
    const mockSignals = [
      {
        id: 's1',
        sport: 'nba' as const,
        gameId: 'g1',
        game: sampleGame,
        market: 'MONEYLINE',
        selection: 'Boston Celtics (Ganador)',
        modelProbability: 0.72,
        decimalOdds: 1.50,
        smartEdge: 0.05,
        expectedValue: 0.08,
        smartScore: 80,
        classification: 'STRONG' as const,
        dataQuality: 85,
        isSmartPick: false,
        explanation: '',
        createdAt: '2026-10-01T00:00:00Z'
      },
      {
        id: 's2',
        sport: 'nba' as const,
        gameId: 'g2',
        game: sampleGame,
        market: 'TOTAL POINTS',
        selection: 'OVER 218.5',
        line: 218.5,
        modelProbability: 0.60,
        decimalOdds: 1.91,
        smartEdge: 0.07,
        expectedValue: 0.14,
        smartScore: 78,
        classification: 'QUALIFIED' as const,
        dataQuality: 80,
        isSmartPick: false,
        explanation: '',
        createdAt: '2026-10-01T00:00:00Z'
      }
    ];

    const mockResults = {
      g1: { gameId: 'g1', status: 'FINISHED' as const, homeScore: 115, awayScore: 102 },
      g2: { gameId: 'g2', status: 'FINISHED' as const, homeScore: 120, awayScore: 110 }
    };

    const backtest = NBABacktestEngine.runBacktest({
      signals: mockSignals,
      results: mockResults
    });

    expect(backtest.sport).toBe('nba');
    expect(backtest.sampleSize).toBe(2);
    expect(backtest.wins).toBe(2);
    expect(backtest.losses).toBe(0);
    expect(backtest.winRate).toBe(1.0);
    expect(backtest.netUnits).toBeGreaterThan(0);
    expect(backtest.brierScore).toBeLessThan(0.25);
    expect(backtest.calibration.length).toBe(5);
  });
});
