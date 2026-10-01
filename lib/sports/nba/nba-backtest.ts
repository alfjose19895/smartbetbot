import { BacktestResult, MultiSportSignal } from '../types';
import { calculateBrierScore, calculateLogLoss, calculateCalibrationBins } from '../core-metrics';
import { NBASettlementEngine, NBAGameResult } from './nba-settlement';

export interface NBABacktestInput {
  signals: MultiSportSignal[];
  results: Record<string, NBAGameResult>;
  strategyId?: string;
  strategyName?: string;
}

export class NBABacktestEngine {
  /**
   * Runs backtest with strict chronological isolation (No data leakage)
   */
  public static runBacktest(input: NBABacktestInput): BacktestResult {
    const { signals, results, strategyId = 'nba_all', strategyName = 'NBA Unified Strategies' } = input;

    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let netUnits = 0;
    let totalOdds = 0;

    const evaluationItems: { probability: number; won: boolean }[] = [];

    for (const signal of signals) {
      const result = results[signal.gameId];
      if (!result || result.status !== 'FINISHED') continue;

      const settled = NBASettlementEngine.settleSignal(signal, result);

      if (settled.status === 'WON') {
        wins++;
        netUnits += signal.decimalOdds - 1;
        totalOdds += signal.decimalOdds;
        evaluationItems.push({ probability: signal.modelProbability, won: true });
      } else if (settled.status === 'LOST') {
        losses++;
        netUnits -= 1;
        totalOdds += signal.decimalOdds;
        evaluationItems.push({ probability: signal.modelProbability, won: false });
      } else if (settled.status === 'PUSH') {
        pushes++;
      }
    }

    const sampleSize = wins + losses + pushes;
    const resolvedBets = wins + losses;
    const winRate = resolvedBets > 0 ? Number((wins / resolvedBets).toFixed(4)) : 0;
    const avgOdds = resolvedBets > 0 ? Number((totalOdds / resolvedBets).toFixed(2)) : 0;
    const roi = resolvedBets > 0 ? Number((netUnits / resolvedBets).toFixed(4)) : 0;
    const yieldPct = sampleSize > 0 ? Number((netUnits / sampleSize).toFixed(4)) : 0;

    const brierScore = calculateBrierScore(evaluationItems);
    const logLoss = calculateLogLoss(evaluationItems);
    const calibration = calculateCalibrationBins(evaluationItems, 5);

    return {
      sport: 'nba',
      strategyId,
      strategyName,
      sampleSize,
      wins,
      losses,
      pushes,
      winRate,
      avgOdds,
      roi,
      yield: yieldPct,
      netUnits: Number(netUnits.toFixed(2)),
      brierScore,
      logLoss,
      calibration,
      generatedAt: new Date().toISOString()
    };
  }
}
