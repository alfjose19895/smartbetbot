import { SportClassification, SportStrategyConfig } from './types';

export function calculateSmartEdge(modelProbability: number, decimalOdds: number): number {
  if (decimalOdds <= 1.0 || modelProbability <= 0) return 0;
  const impliedProb = 1 / decimalOdds;
  return Number((modelProbability - impliedProb).toFixed(4));
}

export function calculateExpectedValue(modelProbability: number, decimalOdds: number): number {
  if (decimalOdds <= 1.0 || modelProbability <= 0) return -1;
  return Number(((modelProbability * decimalOdds) - 1).toFixed(4));
}

export function calculateSmartScore(params: {
  modelProbability: number;
  smartEdge: number;
  expectedValue: number;
  dataQuality: number;
  sampleSize?: number;
  strategyStability?: number;
}): number {
  const { modelProbability, smartEdge, expectedValue, dataQuality, sampleSize = 30, strategyStability = 0.9 } = params;

  const probComponent = Math.min(100, Math.max(0, ((modelProbability - 0.45) / 0.40) * 100));
  const edgeComponent = Math.min(100, Math.max(0, (smartEdge / 0.15) * 100));
  const evComponent = Math.min(100, Math.max(0, (expectedValue / 0.20) * 100));
  const dqComponent = Math.min(100, Math.max(0, dataQuality));
  const sampleFactor = Math.min(1, sampleSize / 20) * (strategyStability || 0.85);

  const rawScore = (
    probComponent * 0.30 +
    edgeComponent * 0.35 +
    evComponent * 0.15 +
    dqComponent * 0.10 +
    (sampleFactor * 100) * 0.10
  );

  if (smartEdge <= 0) {
    return Math.max(0, Math.round(rawScore * 0.3));
  }

  return Math.min(99, Math.max(1, Math.round(rawScore)));
}

export function classifyOpportunity(params: {
  modelProbability: number;
  smartEdge: number;
  smartScore: number;
  dataQuality: number;
  odds: number;
  strategyConfig: SportStrategyConfig;
}): SportClassification {
  const { modelProbability, smartEdge, smartScore, dataQuality, odds, strategyConfig } = params;

  if (!strategyConfig.enabled) {
    return 'NO BET';
  }

  // If edge is negative or probability is well below threshold, it is definitely NO BET
  if (smartEdge <= 0 || modelProbability < 0.45) {
    return 'NO BET';
  }

  // Odds out of bounds -> WATCH
  if (odds < strategyConfig.minOdds || odds > strategyConfig.maxOdds) {
    return 'WATCH';
  }

  // Low data quality -> WATCH
  if (dataQuality < strategyConfig.minDataQuality) {
    return 'WATCH';
  }

  // Edge or prob below strategy thresholds
  if (smartEdge < strategyConfig.minEdge || modelProbability < strategyConfig.minProbability) {
    if (smartEdge > 0 && modelProbability >= 0.50) {
      return 'WATCH';
    }
    return 'NO BET';
  }

  // Top Pick tier
  if (smartScore >= 88 && smartEdge >= 0.08 && modelProbability >= 0.68 && dataQuality >= 75) {
    return 'TOP PICK';
  }

  // Strong tier
  if (smartScore >= 78 && smartEdge >= 0.05 && modelProbability >= 0.60 && dataQuality >= 70) {
    return 'STRONG';
  }

  // Qualified tier
  if (smartScore >= 65 && smartEdge >= strategyConfig.minEdge && modelProbability >= strategyConfig.minProbability) {
    return 'QUALIFIED';
  }

  if (smartEdge > 0) {
    return 'WATCH';
  }

  return 'NO BET';
}

export function calculateDevig(decimalOddsList: number[]): number[] {
  if (!decimalOddsList || decimalOddsList.length === 0) return [];
  const rawImplied = decimalOddsList.map(o => (o > 1.0 ? 1 / o : 0));
  const totalOverround = rawImplied.reduce((acc, val) => acc + val, 0);

  if (totalOverround <= 0) return rawImplied;
  return rawImplied.map(p => Number((p / totalOverround).toFixed(4)));
}

export function calculateBrierScore(predictions: { probability: number; won: boolean }[]): number {
  if (!predictions || predictions.length === 0) return 0;
  const sumSquaredErr = predictions.reduce((acc, p) => {
    const outcome = p.won ? 1 : 0;
    return acc + Math.pow(p.probability - outcome, 2);
  }, 0);
  return Number((sumSquaredErr / predictions.length).toFixed(4));
}

export function calculateLogLoss(predictions: { probability: number; won: boolean }[]): number {
  if (!predictions || predictions.length === 0) return 0;
  const eps = 1e-15;
  const sumLoss = predictions.reduce((acc, p) => {
    const y = p.won ? 1 : 0;
    const prob = Math.max(eps, Math.min(1 - eps, p.probability));
    return acc - (y * Math.log(prob) + (1 - y) * Math.log(1 - prob));
  }, 0);
  return Number((sumLoss / predictions.length).toFixed(4));
}

export function calculateCalibrationBins(
  predictions: { probability: number; won: boolean }[],
  binCount: number = 5
) {
  const bins: { binStart: number; binEnd: number; predictedAvg: number; actualAvg: number; count: number }[] = [];
  const step = 1 / binCount;

  for (let i = 0; i < binCount; i++) {
    const start = i * step;
    const end = (i + 1) * step;
    const items = predictions.filter(p => p.probability >= start && (i === binCount - 1 ? p.probability <= end : p.probability < end));
    
    if (items.length === 0) {
      bins.push({
        binStart: Number(start.toFixed(2)),
        binEnd: Number(end.toFixed(2)),
        predictedAvg: Number(((start + end) / 2).toFixed(2)),
        actualAvg: 0,
        count: 0
      });
    } else {
      const predAvg = items.reduce((a, b) => a + b.probability, 0) / items.length;
      const actAvg = items.filter(x => x.won).length / items.length;
      bins.push({
        binStart: Number(start.toFixed(2)),
        binEnd: Number(end.toFixed(2)),
        predictedAvg: Number(predAvg.toFixed(4)),
        actualAvg: Number(actAvg.toFixed(4)),
        count: items.length
      });
    }
  }

  return bins;
}
