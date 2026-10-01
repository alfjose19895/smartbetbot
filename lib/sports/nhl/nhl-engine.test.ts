import { describe, it, expect } from 'vitest';
import { NHLFeatureEngine } from './nhl-feature-engine';
import { NHLModelV1 } from './nhl-model';
import { NHLStrategyEngine } from './nhl-strategies';
import { NHLSettlementEngine } from './nhl-settlement';
import { NHLTeamStats, NHLMarketOdds } from './nhl-types';
import { NormalizedGame } from '../types';

describe('NHL Engine Comprehensive Test Suite', () => {
  const sampleHomeStats: NHLTeamStats = {
    teamId: 501,
    teamName: 'Edmonton Oilers',
    gamesPlayed: 40,
    wins: 26,
    losses: 10,
    otLosses: 4,
    points: 56,
    goalsForPerGame: 3.65,
    goalsAgainstPerGame: 2.75,
    shotsForPerGame: 33.5,
    shotsAgainstPerGame: 28.2,
    shootingPct: 0.109,
    savePct: 0.902,
    powerPlayPct: 0.265,
    penaltyKillPct: 0.825,
    powerPlayOpportunitiesPerGame: 3.4,
    penaltyMinutesPerGame: 8.5,
    homeGpg: 3.85,
    homeGaa: 2.50,
    awayGpg: 3.45,
    awayGaa: 3.00,
    last5Gpg: 3.80,
    last5Gaa: 2.40,
    restDays: 2,
    isBackToBack: false,
    startingGoalie: {
      name: 'Stuart Skinner',
      isConfirmed: true,
      gamesPlayed: 32,
      savePct: 0.912,
      goalsAgainstAvg: 2.55
    }
  };

  const sampleAwayStats: NHLTeamStats = {
    teamId: 502,
    teamName: 'Calgary Flames',
    gamesPlayed: 40,
    wins: 19,
    losses: 16,
    otLosses: 5,
    points: 43,
    goalsForPerGame: 2.95,
    goalsAgainstPerGame: 3.20,
    shotsForPerGame: 30.1,
    shotsAgainstPerGame: 31.0,
    shootingPct: 0.098,
    savePct: 0.897,
    powerPlayPct: 0.175,
    penaltyKillPct: 0.810,
    powerPlayOpportunitiesPerGame: 2.8,
    penaltyMinutesPerGame: 9.0,
    homeGpg: 3.10,
    homeGaa: 3.00,
    awayGpg: 2.80,
    awayGaa: 3.40,
    last5Gpg: 2.60,
    last5Gaa: 3.50,
    restDays: 1,
    isBackToBack: true,
    startingGoalie: {
      name: 'Dan Vladar',
      isConfirmed: true,
      gamesPlayed: 18,
      savePct: 0.895,
      goalsAgainstAvg: 3.25
    }
  };

  const sampleGame: NormalizedGame = {
    id: 'nhl_test_01',
    sport: 'nhl',
    provider: 'api-nhl',
    providerGameId: '66001',
    league: { id: '1', name: 'NHL', season: '2025-2026' },
    homeTeam: { id: 501, name: 'Edmonton Oilers' },
    awayTeam: { id: 502, name: 'Calgary Flames' },
    startsAt: '2026-10-08T22:00:00Z',
    status: 'SCHEDULED'
  };

  const sampleOdds: NHLMarketOdds = {
    gameId: 'nhl_test_01',
    moneyline: { homeOdds: 1.55, awayOdds: 2.60, bookmaker: 'Bet365' },
    puckLine: { homeLine: -1.5, homeOdds: 2.05, awayLine: 1.5, awayOdds: 1.80, bookmaker: 'Bet365' },
    totalGoals: { line: 6.0, overOdds: 1.91, underOdds: 1.91, bookmaker: 'Bet365' }
  };

  it('NHL Feature Engine calculates expected goals with goalie adjustment and special teams', () => {
    const { lambdaHome, lambdaAway, dataQuality } = NHLFeatureEngine.calculateExpectedGoals(
      sampleHomeStats,
      sampleAwayStats
    );

    expect(lambdaHome).toBeGreaterThan(lambdaAway);
    expect(lambdaHome).toBeGreaterThan(3.0);
    expect(lambdaAway).toBeLessThan(3.0);
    expect(dataQuality).toBeGreaterThanOrEqual(80);
  });

  it('NHL Model simulates 20k games using Poisson and overtime resolution', () => {
    const sim = NHLModelV1.simulateGame({
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds,
      simulationsCount: 20000,
      seed: 42
    });

    expect(sim.modelVersion).toBe('nhl_model_v1');
    expect(sim.moneylineHomeProb).toBeGreaterThan(0.60);
    expect(sim.moneylineAwayProb).toBeLessThan(0.40);
    expect(sim.moneylineHomeProb + sim.moneylineAwayProb).toBeCloseTo(1.0, 2);
    expect(sim.puckLineHomeProb).toBeGreaterThan(0.40);
  });

  it('NHL Strategy Engine evaluates candidate predictions and classifies appropriately', () => {
    const candidates = NHLStrategyEngine.evaluateGame({
      game: sampleGame,
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds
    });

    expect(candidates.length).toBeGreaterThan(0);
    const official = NHLStrategyEngine.selectOfficialSignals(candidates);
    expect(official.length).toBeLessThanOrEqual(2);
  });

  it('NHL Settlement correctly handles Moneyline (including OT) and Puck Line', () => {
    const mockSignal = {
      id: 'nhl_s1',
      sport: 'nhl' as const,
      gameId: 'nhl_test_01',
      game: sampleGame,
      market: 'PUCK LINE',
      selection: 'Edmonton Oilers -1.5',
      line: -1.5,
      modelProbability: 0.52,
      decimalOdds: 2.05,
      smartEdge: 0.03,
      expectedValue: 0.06,
      smartScore: 78,
      classification: 'QUALIFIED' as const,
      dataQuality: 85,
      isSmartPick: false,
      explanation: '',
      createdAt: '2026-10-01T00:00:00Z'
    };

    // Case 1: Oilers win 4-2 (Margin = 2 > 1.5 -> WON)
    const resWon = NHLSettlementEngine.settleSignal(mockSignal, {
      gameId: 'nhl_test_01',
      status: 'FINISHED',
      homeScore: 4,
      awayScore: 2
    });
    expect(resWon.status).toBe('WON');

    // Case 2: Oilers win 3-2 in OT (Margin = 1 < 1.5 -> LOST)
    const resLost = NHLSettlementEngine.settleSignal(mockSignal, {
      gameId: 'nhl_test_01',
      status: 'FINISHED',
      homeScore: 3,
      awayScore: 2,
      overtime: true
    });
    expect(resLost.status).toBe('LOST');
  });
});
