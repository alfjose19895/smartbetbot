import { describe, it, expect } from 'vitest';
import { SPORTS_REGISTRY, getSportMeta, getAllSports, isValidSport } from './registry';
import {
  calculateSmartEdge,
  calculateExpectedValue,
  calculateSmartScore,
  classifyOpportunity,
  calculateDevig,
  calculateBrierScore,
  calculateLogLoss,
  calculateCalibrationBins
} from './core-metrics';
import { SportProviderRouter } from './provider-router';
import { DEFAULT_NBA_STRATEGIES } from './nba/nba-strategies';

describe('SmartBetBot Multi-Sport Shared Core Test Suite', () => {
  it('Sport Registry accurately registers all 5 sports with correct icons and metadata', () => {
    const sports = getAllSports();
    expect(sports.length).toBe(5);

    const football = getSportMeta('football');
    expect(football.displayName).toBe('Fútbol');
    expect(football.icon).toBe('⚽');

    const nba = getSportMeta('nba');
    expect(nba.displayName).toBe('NBA');
    expect(nba.icon).toBe('🏀');

    const nfl = getSportMeta('nfl');
    expect(nfl.displayName).toBe('NFL');
    expect(nfl.icon).toBe('🏈');

    const ncaaf = getSportMeta('ncaaf');
    expect(ncaaf.displayName).toBe('NCAAF');
    expect(ncaaf.icon).toBe('🏈');

    const nhl = getSportMeta('nhl');
    expect(nhl.displayName).toBe('NHL');
    expect(nhl.icon).toBe('🏒');

    expect(isValidSport('nba')).toBe(true);
    expect(isValidSport('tennis')).toBe(false);
  });

  it('Calculates Smart Edge accurately according to quantitative formula', () => {
    const edge = calculateSmartEdge(0.76, 1.80);
    expect(edge).toBeCloseTo(0.2044, 3);

    const negEdge = calculateSmartEdge(0.50, 1.80);
    expect(negEdge).toBeLessThan(0);
  });

  it('Calculates Expected Value (EV) independently from Smart Edge', () => {
    const ev = calculateExpectedValue(0.76, 1.80);
    expect(ev).toBeCloseTo(0.368, 3);
  });

  it('Calculates Smart Score (0-100) combining prob, edge, EV, and data quality', () => {
    const highQualityScore = calculateSmartScore({
      modelProbability: 0.76,
      smartEdge: 0.15,
      expectedValue: 0.25,
      dataQuality: 90
    });

    expect(highQualityScore).toBeGreaterThanOrEqual(85);
    expect(highQualityScore).toBeLessThanOrEqual(99);

    const lowScore = calculateSmartScore({
      modelProbability: 0.50,
      smartEdge: -0.05,
      expectedValue: -0.10,
      dataQuality: 50
    });

    expect(lowScore).toBeLessThan(30);
  });

  it('Unified Classification assigns TOP PICK, STRONG, QUALIFIED, WATCH, NO BET correctly', () => {
    const strategy = DEFAULT_NBA_STRATEGIES.nba_moneyline;

    const topPick = classifyOpportunity({
      modelProbability: 0.78,
      smartEdge: 0.12,
      smartScore: 92,
      dataQuality: 85,
      odds: 1.80,
      strategyConfig: strategy
    });
    expect(topPick).toBe('TOP PICK');

    const strong = classifyOpportunity({
      modelProbability: 0.65,
      smartEdge: 0.06,
      smartScore: 80,
      dataQuality: 75,
      odds: 1.80,
      strategyConfig: strategy
    });
    expect(strong).toBe('STRONG');

    const qualified = classifyOpportunity({
      modelProbability: 0.59,
      smartEdge: 0.045,
      smartScore: 70,
      dataQuality: 75,
      odds: 1.80,
      strategyConfig: strategy
    });
    expect(qualified).toBe('QUALIFIED');

    const watch = classifyOpportunity({
      modelProbability: 0.55,
      smartEdge: 0.02,
      smartScore: 60,
      dataQuality: 60,
      odds: 1.80,
      strategyConfig: strategy
    });
    expect(watch).toBe('WATCH');

    const noBet = classifyOpportunity({
      modelProbability: 0.40,
      smartEdge: -0.10,
      smartScore: 20,
      dataQuality: 50,
      odds: 1.80,
      strategyConfig: strategy
    });
    expect(noBet).toBe('NO BET');
  });

  it('De-vigging calculates true implied probabilities removing overround', () => {
    const devigged = calculateDevig([1.91, 1.91]);
    expect(devigged.length).toBe(2);
    expect(devigged[0]).toBeCloseTo(0.50, 2);
    expect(devigged[1]).toBeCloseTo(0.50, 2);
    expect(devigged[0] + devigged[1]).toBeCloseTo(1.0, 3);
  });

  it('Calibration, Brier Score, and Log Loss metrics evaluate statistical accuracy', () => {
    const samplePreds = [
      { probability: 0.80, won: true },
      { probability: 0.70, won: true },
      { probability: 0.60, won: false },
      { probability: 0.40, won: false }
    ];

    const brier = calculateBrierScore(samplePreds);
    expect(brier).toBeGreaterThan(0);
    expect(brier).toBeLessThan(0.30);

    const logLoss = calculateLogLoss(samplePreds);
    expect(logLoss).toBeGreaterThan(0);

    const bins = calculateCalibrationBins(samplePreds, 5);
    expect(bins.length).toBe(5);
  });

  it('Provider Router runs diagnostics across all 5 sports', async () => {
    const diagnostics = await SportProviderRouter.runDiagnostics();
    expect(diagnostics.football).toBeDefined();
    expect(diagnostics.nba).toBeDefined();
    expect(diagnostics.nfl).toBeDefined();
    expect(diagnostics.ncaaf).toBeDefined();
    expect(diagnostics.nhl).toBeDefined();
  });
});
