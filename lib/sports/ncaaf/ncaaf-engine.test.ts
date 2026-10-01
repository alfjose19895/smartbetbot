import { describe, it, expect } from 'vitest';
import { NCAAFFeatureEngine, CONFERENCE_TIERS } from './ncaaf-feature-engine';
import { NCAAFModelV1 } from './ncaaf-model';
import { NCAAFStrategyEngine } from './ncaaf-strategies';
import { NCAAFSettlementEngine } from './ncaaf-settlement';
import { NCAAFTeamStats, NCAAFMarketOdds } from './ncaaf-types';
import { NormalizedGame } from '../types';

describe('NCAAF Engine Comprehensive Test Suite', () => {
  const sampleHomeStats: NCAAFTeamStats = {
    teamId: 101,
    teamName: 'Georgia Bulldogs',
    conference: 'SEC',
    gamesPlayed: 10,
    wins: 9,
    losses: 1,
    pointsPerGame: 36.4,
    pointsAllowedPerGame: 16.2,
    yardsPerGame: 440.0,
    yardsAllowedPerGame: 290.0,
    yardsPerPlay: 6.8,
    yardsAllowedPerPlay: 4.8,
    turnoversPerGame: 0.9,
    strengthOfSchedule: 85,
    homePpg: 40.0,
    homeOppPpg: 14.0,
    awayPpg: 32.0,
    awayOppPpg: 18.0,
    last5Ppg: 37.0,
    last5OppPpg: 15.0,
    restDays: 7
  };

  const sampleAwayStats: NCAAFTeamStats = {
    teamId: 102,
    teamName: 'Kentucky Wildcats',
    conference: 'SEC',
    gamesPlayed: 10,
    wins: 5,
    losses: 5,
    pointsPerGame: 22.1,
    pointsAllowedPerGame: 26.5,
    yardsPerGame: 330.0,
    yardsAllowedPerGame: 380.0,
    yardsPerPlay: 5.2,
    yardsAllowedPerPlay: 5.9,
    turnoversPerGame: 1.4,
    strengthOfSchedule: 75,
    homePpg: 25.0,
    homeOppPpg: 23.0,
    awayPpg: 19.0,
    awayOppPpg: 30.0,
    last5Ppg: 21.0,
    last5OppPpg: 28.0,
    restDays: 7
  };

  const sampleGame: NormalizedGame = {
    id: 'ncaaf_test_01',
    sport: 'ncaaf',
    provider: 'api-ncaaf',
    providerGameId: '77001',
    league: { id: '1', name: 'NCAAF', season: '2026', conference: 'SEC' },
    homeTeam: { id: 101, name: 'Georgia Bulldogs' },
    awayTeam: { id: 102, name: 'Kentucky Wildcats' },
    startsAt: '2026-10-10T19:30:00Z',
    status: 'SCHEDULED'
  };

  const sampleOdds: NCAAFMarketOdds = {
    gameId: 'ncaaf_test_01',
    moneyline: { homeOdds: 1.15, awayOdds: 6.00, bookmaker: 'BetMGM' },
    spread: { homeLine: -14.5, homeOdds: 1.91, awayLine: 14.5, awayOdds: 1.91, bookmaker: 'BetMGM' },
    totalPoints: { line: 51.5, overOdds: 1.91, underOdds: 1.91, bookmaker: 'BetMGM' }
  };

  it('NCAAF Feature Engine correctly applies opponent strength adjustment and conference weights', () => {
    expect(CONFERENCE_TIERS.SEC).toBeGreaterThan(CONFERENCE_TIERS.GROUP_OF_5);
    expect(CONFERENCE_TIERS.SEC).toBeGreaterThan(CONFERENCE_TIERS.FCS);

    const homeAdj = NCAAFFeatureEngine.calculateOpponentAdjustment(sampleHomeStats);
    expect(homeAdj).toBeGreaterThan(1.1);

    const { expectedHomePoints, expectedAwayPoints, dataQuality } = NCAAFFeatureEngine.calculateExpectedScore(
      sampleHomeStats,
      sampleAwayStats
    );

    expect(expectedHomePoints).toBeGreaterThan(30);
    expect(expectedHomePoints).toBeGreaterThan(expectedAwayPoints);
    expect(dataQuality).toBeGreaterThanOrEqual(70);
  });

  it('NCAAF Model simulates 20k games with high college football variance', () => {
    const sim = NCAAFModelV1.simulateGame({
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds,
      simulationsCount: 20000,
      seed: 42
    });

    expect(sim.modelVersion).toBe('ncaaf_model_v1');
    expect(sim.homeWinProb).toBeGreaterThan(0.65);
    expect(sim.expectedSpreadMargin).toBeGreaterThan(5);
  });

  it('NCAAF Strategy Engine evaluates candidate predictions', () => {
    const candidates = NCAAFStrategyEngine.evaluateGame({
      game: sampleGame,
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds
    });

    expect(candidates.length).toBeGreaterThan(0);
    const official = NCAAFStrategyEngine.selectOfficialSignals(candidates);
    expect(official.length).toBeLessThanOrEqual(2);
  });

  it('NCAAF Settlement evaluates college game outcomes', () => {
    const mockSignal = {
      id: 'ncaaf_s1',
      sport: 'ncaaf' as const,
      gameId: 'ncaaf_test_01',
      game: sampleGame,
      market: 'SPREAD',
      selection: 'Georgia Bulldogs -14.5',
      line: -14.5,
      modelProbability: 0.63,
      decimalOdds: 1.91,
      smartEdge: 0.10,
      expectedValue: 0.20,
      smartScore: 86,
      classification: 'STRONG' as const,
      dataQuality: 80,
      isSmartPick: false,
      explanation: '',
      createdAt: '2026-10-01T00:00:00Z'
    };

    const res = NCAAFSettlementEngine.settleSignal(mockSignal, {
      gameId: 'ncaaf_test_01',
      status: 'FINISHED',
      homeScore: 38,
      awayScore: 13
    });

    expect(res.status).toBe('WON');
  });
});
