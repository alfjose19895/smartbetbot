import { describe, it, expect } from 'vitest';
import { NFLFeatureEngine } from './nfl-feature-engine';
import { NFLModelV1 } from './nfl-model';
import { NFLStrategyEngine } from './nfl-strategies';
import { NFLSettlementEngine } from './nfl-settlement';
import { NFLBacktestEngine } from './nfl-backtest';
import { NFLTeamStats, NFLMarketOdds } from './nfl-types';
import { NormalizedGame } from '../types';

describe('NFL Engine Comprehensive Test Suite', () => {
  const sampleHomeStats: NFLTeamStats = {
    teamId: 1,
    teamName: 'Kansas City Chiefs',
    gamesPlayed: 14,
    wins: 11,
    losses: 3,
    ties: 0,
    pointsPerGame: 26.5,
    pointsAllowedPerGame: 17.8,
    yardsPerGame: 375.0,
    yardsAllowedPerGame: 305.0,
    passYardsPerGame: 260.0,
    rushYardsPerGame: 115.0,
    yardsPerPlay: 5.9,
    yardsAllowedPerPlay: 4.9,
    turnoverDifferential: 6,
    thirdDownPct: 0.48,
    redZonePct: 0.64,
    sacks: 38,
    qbRating: 104.2,
    qbAvailability: 'STARTER',
    homePpg: 28.0,
    homeOppPpg: 16.5,
    awayPpg: 25.0,
    awayOppPpg: 19.1,
    last5Ppg: 27.5,
    last5OppPpg: 17.0,
    restDays: 7
  };

  const sampleAwayStats: NFLTeamStats = {
    teamId: 2,
    teamName: 'Buffalo Bills',
    gamesPlayed: 14,
    wins: 10,
    losses: 4,
    ties: 0,
    pointsPerGame: 27.8,
    pointsAllowedPerGame: 21.0,
    yardsPerGame: 380.0,
    yardsAllowedPerGame: 330.0,
    passYardsPerGame: 250.0,
    rushYardsPerGame: 130.0,
    yardsPerPlay: 5.8,
    yardsAllowedPerPlay: 5.3,
    turnoverDifferential: 4,
    thirdDownPct: 0.45,
    redZonePct: 0.62,
    sacks: 34,
    qbRating: 101.5,
    qbAvailability: 'STARTER',
    homePpg: 30.0,
    homeOppPpg: 19.0,
    awayPpg: 25.6,
    awayOppPpg: 23.0,
    last5Ppg: 28.0,
    last5OppPpg: 20.0,
    restDays: 7
  };

  const sampleGame: NormalizedGame = {
    id: 'nfl_test_01',
    sport: 'nfl',
    provider: 'api-nfl',
    providerGameId: '88001',
    league: { id: '1', name: 'NFL', season: '2026' },
    homeTeam: { id: 1, name: 'Kansas City Chiefs' },
    awayTeam: { id: 2, name: 'Buffalo Bills' },
    startsAt: '2026-10-04T20:20:00Z',
    status: 'SCHEDULED'
  };

  const sampleOdds: NFLMarketOdds = {
    gameId: 'nfl_test_01',
    moneyline: { homeOdds: 1.68, awayOdds: 2.25, bookmaker: 'Circa' },
    spread: { homeLine: -2.5, homeOdds: 1.91, awayLine: 2.5, awayOdds: 1.91, bookmaker: 'Circa' },
    totalPoints: { line: 47.5, overOdds: 1.91, underOdds: 1.91, bookmaker: 'Circa' }
  };

  it('NFL Feature Engine calculates Elo and expected points with home field advantage', () => {
    const eloHome = NFLFeatureEngine.estimateTeamElo(sampleHomeStats);
    const eloAway = NFLFeatureEngine.estimateTeamElo(sampleAwayStats);

    expect(eloHome).toBeGreaterThan(1600);
    expect(eloAway).toBeGreaterThan(1580);

    const { expectedHomePoints, expectedAwayPoints, dataQuality } = NFLFeatureEngine.calculateExpectedScore(
      sampleHomeStats,
      sampleAwayStats
    );

    expect(expectedHomePoints).toBeGreaterThan(expectedAwayPoints);
    expect(expectedHomePoints).toBeGreaterThan(22);
    expect(dataQuality).toBeGreaterThanOrEqual(80);
  });

  it('NFL Model simulates 20k games with key football scoring variance', () => {
    const sim = NFLModelV1.simulateGame({
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds,
      simulationsCount: 20000,
      seed: 42
    });

    expect(sim.modelVersion).toBe('nfl_model_v1');
    expect(sim.homeWinProb).toBeGreaterThan(0.55);
    expect(sim.awayWinProb).toBeLessThan(0.45);
    expect(sim.expectedTotalPoints).toBeGreaterThan(40);
  });

  it('NFL Strategy Engine evaluates opportunities and selects signals', () => {
    const candidates = NFLStrategyEngine.evaluateGame({
      game: sampleGame,
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds
    });

    expect(candidates.length).toBeGreaterThan(0);
    const officialSignals = NFLStrategyEngine.selectOfficialSignals(candidates);
    expect(officialSignals.length).toBeLessThanOrEqual(2);
  });

  it('NFL Settlement correctly handles Spread and Total and Backtest runs cleanly', () => {
    const mockSignal = {
      id: 'nfl_s1',
      sport: 'nfl' as const,
      gameId: 'nfl_test_01',
      game: sampleGame,
      market: 'SPREAD',
      selection: 'Kansas City Chiefs -2.5',
      line: -2.5,
      modelProbability: 0.60,
      decimalOdds: 1.91,
      smartEdge: 0.07,
      expectedValue: 0.14,
      smartScore: 82,
      classification: 'STRONG' as const,
      dataQuality: 85,
      isSmartPick: false,
      explanation: '',
      createdAt: '2026-10-01T00:00:00Z'
    };

    const res = NFLSettlementEngine.settleSignal(mockSignal, {
      gameId: 'nfl_test_01',
      status: 'FINISHED',
      homeScore: 27,
      awayScore: 24
    });

    expect(res.status).toBe('WON');

    const backtest = NFLBacktestEngine.runBacktest({
      signals: [mockSignal],
      results: { nfl_test_01: { gameId: 'nfl_test_01', status: 'FINISHED', homeScore: 27, awayScore: 24 } }
    });
    expect(backtest.wins).toBe(1);
  });
});
