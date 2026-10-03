import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NHLTeamStats, NHLMarketOdds } from './nhl-types';
import { NHLModelV1 } from './nhl-model';
import { NHLFeatureEngine } from './nhl-feature-engine';

export const DEFAULT_NHL_STRATEGIES: Record<string, SportStrategyConfig> = {
  nhl_total: {
    id: 'nhl_total',
    sport: 'nhl',
    market: 'TOTAL GOALS',
    name: 'Total Goles (Over/Under)',
    description: 'Estrategia de total de goles con modelo bivariado Poisson y balance xG',
    enabled: true,
    minProbability: 0.54,
    minEdge: 0.02,
    minOdds: 1.35,
    maxOdds: 2.60,
    minDataQuality: 60
  },
  nhl_moneyline: {
    id: 'nhl_moneyline',
    sport: 'nhl',
    market: 'MONEYLINE',
    name: 'Ganador (incl. Prórroga)',
    description: 'Estrategia de ganador NHL con resolución de tiempo reglamentario y prórroga/penaltis',
    enabled: true,
    minProbability: 0.52,
    minEdge: 0.02,
    minOdds: 1.30,
    maxOdds: 2.85,
    minDataQuality: 60
  },
  nhl_puck_line: {
    id: 'nhl_puck_line',
    sport: 'nhl',
    market: 'PUCK LINE',
    name: 'Handicap o Puck Line (+1.5 / -1.5)',
    description: 'Estrategia de Puck Line considerando diferencial de goles y portería vacía',
    enabled: true,
    minProbability: 0.55,
    minEdge: 0.02,
    minOdds: 1.35,
    maxOdds: 2.90,
    minDataQuality: 60
  }
};

export class NHLStrategyEngine {
  /**
   * Evaluates ONLY the 3 allowed NHL markets in strict order:
   * 1. TOTAL GOALS (Total Goles)
   * 2. MONEYLINE (Ganador)
   * 3. PUCK LINE (Handicap o Puck Line)
   */
  public static evaluateGame(params: {
    game: NormalizedGame;
    homeStats: NHLTeamStats;
    awayStats: NHLTeamStats;
    odds?: NHLMarketOdds;
    strategies?: Record<string, SportStrategyConfig>;
  }): MultiSportPrediction[] {
    const { game, homeStats, awayStats, odds, strategies = DEFAULT_NHL_STRATEGIES } = params;

    const sim = NHLModelV1.simulateGame({ homeStats, awayStats, odds });
    const { dataQuality } = NHLFeatureEngine.calculateExpectedGoals(homeStats, awayStats);

    const candidates: MultiSportPrediction[] = [];
    const nowIso = new Date().toISOString();

    // ==========================================
    // 1. TOTAL GOLES (Over / Under) - Priority 1
    // ==========================================
    if (odds?.totalGoals) {
      const totStrat = strategies.nhl_total || DEFAULT_NHL_STRATEGIES.nhl_total;
      const targetLine = odds.totalGoals.line || 5.5;

      // Over Option
      const overOdds = odds.totalGoals.overOdds || 1.85;
      const overProb = sim.totalOverProb;
      const overEdge = calculateSmartEdge(overProb, overOdds);
      const overEV = calculateExpectedValue(overProb, overOdds);
      const overScore = calculateSmartScore({ modelProbability: overProb, smartEdge: overEdge, expectedValue: overEV, dataQuality });
      const overClass = classifyOpportunity({ modelProbability: overProb, smartEdge: overEdge, smartScore: overScore, dataQuality, odds: overOdds, strategyConfig: totStrat });

      candidates.push({
        id: `${game.id}_nhl_total_over`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'TOTAL GOALS',
        selection: `OVER ${targetLine} GOLES`,
        line: targetLine,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: overProb,
        decimalOdds: overOdds,
        impliedProbability: Number((1 / overOdds).toFixed(4)),
        smartEdge: overEdge,
        expectedValue: overEV,
        smartScore: overScore,
        classification: overClass !== 'NO BET' ? overClass : (overProb >= 0.54 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `Proyección xG de ${sim.expectedTotalGoals.toFixed(2)} goles totales supera la línea de ${targetLine} (${(overProb * 100).toFixed(1)}% prob).`,
        createdAt: nowIso
      });

      // Under Option
      const underOdds = odds.totalGoals.underOdds || 1.95;
      const underProb = sim.totalUnderProb;
      const underEdge = calculateSmartEdge(underProb, underOdds);
      const underEV = calculateExpectedValue(underProb, underOdds);
      const underScore = calculateSmartScore({ modelProbability: underProb, smartEdge: underEdge, expectedValue: underEV, dataQuality });
      const underClass = classifyOpportunity({ modelProbability: underProb, smartEdge: underEdge, smartScore: underScore, dataQuality, odds: underOdds, strategyConfig: totStrat });

      candidates.push({
        id: `${game.id}_nhl_total_under`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'TOTAL GOALS',
        selection: `UNDER ${targetLine} GOLES`,
        line: targetLine,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: underProb,
        decimalOdds: underOdds,
        impliedProbability: Number((1 / underOdds).toFixed(4)),
        smartEdge: underEdge,
        expectedValue: underEV,
        smartScore: underScore,
        classification: underClass !== 'NO BET' ? underClass : (underProb >= 0.54 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `Proyección xG de ${sim.expectedTotalGoals.toFixed(2)} goles favorece el control defensivo y tendencia Under ${targetLine} (${(underProb * 100).toFixed(1)}% prob).`,
        createdAt: nowIso
      });
    }

    // ==========================================
    // 2. GANADOR (Moneyline incl. OT) - Priority 2
    // ==========================================
    if (odds?.moneyline) {
      const mlStrat = strategies.nhl_moneyline || DEFAULT_NHL_STRATEGIES.nhl_moneyline;

      // Home Moneyline
      const homeOdds = odds.moneyline.homeOdds || 1.90;
      const homeEdge = calculateSmartEdge(sim.moneylineHomeProb, homeOdds);
      const homeEV = calculateExpectedValue(sim.moneylineHomeProb, homeOdds);
      const homeScore = calculateSmartScore({ modelProbability: sim.moneylineHomeProb, smartEdge: homeEdge, expectedValue: homeEV, dataQuality });
      const homeClass = classifyOpportunity({ modelProbability: sim.moneylineHomeProb, smartEdge: homeEdge, smartScore: homeScore, dataQuality, odds: homeOdds, strategyConfig: mlStrat });

      candidates.push({
        id: `${game.id}_nhl_ml_home`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'MONEYLINE',
        selection: `${game.homeTeam.name} (Ganador incl. Prórroga)`,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: sim.moneylineHomeProb,
        decimalOdds: homeOdds,
        impliedProbability: Number((1 / homeOdds).toFixed(4)),
        smartEdge: homeEdge,
        expectedValue: homeEV,
        smartScore: homeScore,
        classification: homeClass !== 'NO BET' ? homeClass : (sim.moneylineHomeProb >= 0.52 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `El modelo proyecta xG de ${sim.lambdaHome.toFixed(2)} vs ${sim.lambdaAway.toFixed(2)} dando a ${game.homeTeam.name} ${(sim.moneylineHomeProb * 100).toFixed(1)}% de probabilidad de victoria total.`,
        createdAt: nowIso
      });

      // Away Moneyline
      const awayOdds = odds.moneyline.awayOdds || 1.95;
      const awayEdge = calculateSmartEdge(sim.moneylineAwayProb, awayOdds);
      const awayEV = calculateExpectedValue(sim.moneylineAwayProb, awayOdds);
      const awayScore = calculateSmartScore({ modelProbability: sim.moneylineAwayProb, smartEdge: awayEdge, expectedValue: awayEV, dataQuality });
      const awayClass = classifyOpportunity({ modelProbability: sim.moneylineAwayProb, smartEdge: awayEdge, smartScore: awayScore, dataQuality, odds: awayOdds, strategyConfig: mlStrat });

      candidates.push({
        id: `${game.id}_nhl_ml_away`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'MONEYLINE',
        selection: `${game.awayTeam.name} (Ganador incl. Prórroga)`,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: sim.moneylineAwayProb,
        decimalOdds: awayOdds,
        impliedProbability: Number((1 / awayOdds).toFixed(4)),
        smartEdge: awayEdge,
        expectedValue: awayEV,
        smartScore: awayScore,
        classification: awayClass !== 'NO BET' ? awayClass : (sim.moneylineAwayProb >= 0.52 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `El modelo proyecta xG de ${sim.lambdaAway.toFixed(2)} vs ${sim.lambdaHome.toFixed(2)} dando a ${game.awayTeam.name} ${(sim.moneylineAwayProb * 100).toFixed(1)}% de probabilidad de victoria como visitante.`,
        createdAt: nowIso
      });
    }

    // ==========================================
    // 3. HANDICAP O PUCK LINE (+1.5 / -1.5) - Priority 3
    // ==========================================
    if (odds?.puckLine) {
      const plStrat = strategies.nhl_puck_line || DEFAULT_NHL_STRATEGIES.nhl_puck_line;

      // Home Puck Line
      const homePlOdds = odds.puckLine.homeOdds || 1.55;
      const homePlEdge = calculateSmartEdge(sim.puckLineHomeProb, homePlOdds);
      const homePlEV = calculateExpectedValue(sim.puckLineHomeProb, homePlOdds);
      const homePlScore = calculateSmartScore({ modelProbability: sim.puckLineHomeProb, smartEdge: homePlEdge, expectedValue: homePlEV, dataQuality });
      const homePlClass = classifyOpportunity({ modelProbability: sim.puckLineHomeProb, smartEdge: homePlEdge, smartScore: homePlScore, dataQuality, odds: homePlOdds, strategyConfig: plStrat });

      candidates.push({
        id: `${game.id}_nhl_pl_home`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'PUCK LINE',
        selection: `${game.homeTeam.name} ${odds.puckLine.homeLine > 0 ? '+' : ''}${odds.puckLine.homeLine}`,
        line: odds.puckLine.homeLine,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: sim.puckLineHomeProb,
        decimalOdds: homePlOdds,
        impliedProbability: Number((1 / homePlOdds).toFixed(4)),
        smartEdge: homePlEdge,
        expectedValue: homePlEV,
        smartScore: homePlScore,
        classification: homePlClass !== 'NO BET' ? homePlClass : (sim.puckLineHomeProb >= 0.55 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `El modelo evalúa la cobertura de ${odds.puckLine.homeLine > 0 ? '+' : ''}${odds.puckLine.homeLine} con ${(sim.puckLineHomeProb * 100).toFixed(1)}% de probabilidad considerando margen proyectado.`,
        createdAt: nowIso
      });

      // Away Puck Line
      const awayPlOdds = odds.puckLine.awayOdds || 2.45;
      const awayPlEdge = calculateSmartEdge(sim.puckLineAwayProb, awayPlOdds);
      const awayPlEV = calculateExpectedValue(sim.puckLineAwayProb, awayPlOdds);
      const awayPlScore = calculateSmartScore({ modelProbability: sim.puckLineAwayProb, smartEdge: awayPlEdge, expectedValue: awayPlEV, dataQuality });
      const awayPlClass = classifyOpportunity({ modelProbability: sim.puckLineAwayProb, smartEdge: awayPlEdge, smartScore: awayPlScore, dataQuality, odds: awayPlOdds, strategyConfig: plStrat });

      candidates.push({
        id: `${game.id}_nhl_pl_away`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'PUCK LINE',
        selection: `${game.awayTeam.name} ${odds.puckLine.awayLine > 0 ? '+' : ''}${odds.puckLine.awayLine}`,
        line: odds.puckLine.awayLine,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: sim.puckLineAwayProb,
        decimalOdds: awayPlOdds,
        impliedProbability: Number((1 / awayPlOdds).toFixed(4)),
        smartEdge: awayPlEdge,
        expectedValue: awayPlEV,
        smartScore: awayPlScore,
        classification: awayPlClass !== 'NO BET' ? awayPlClass : (sim.puckLineAwayProb >= 0.55 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `El modelo evalúa la cobertura de ${odds.puckLine.awayLine > 0 ? '+' : ''}${odds.puckLine.awayLine} con ${(sim.puckLineAwayProb * 100).toFixed(1)}% de probabilidad considerando margen proyectado.`,
        createdAt: nowIso
      });
    }

    return candidates;
  }

  /**
   * Strict Hierarchical Search Order:
   * 1. Total Goles (Over / Under)
   * 2. Ganador (Moneyline)
   * 3. Handicap o Puck Line (+1.5 / -1.5)
   */
  public static selectBestSignalForGame(candidates: MultiSportPrediction[]): MultiSportSignal | null {
    if (!candidates || candidates.length === 0) return null;

    // Filter by allowed 3 markets only
    const valid = candidates.filter(c => ['TOTAL GOALS', 'MONEYLINE', 'PUCK LINE'].includes(c.market));
    if (valid.length === 0) return null;

    // 1. STEP 1: Search TOTAL GOLES (Over / Under)
    const totals = valid.filter(c => c.market === 'TOTAL GOALS');
    // Strong Total Goles: probability >= 57% and edge >= 0.02 and expectedValue > 0
    const qualifiedTotals = totals
      .filter(c => c.modelProbability >= 0.57 && c.smartEdge >= 0.02 && c.expectedValue >= 0)
      .sort((a, b) => b.modelProbability - a.modelProbability);

    if (qualifiedTotals.length > 0) {
      return this.toSignal(qualifiedTotals[0]);
    }

    // 2. STEP 2: Search GANADOR (Moneyline)
    const moneylines = valid.filter(c => c.market === 'MONEYLINE');
    // Strong Moneyline: probability >= 53% and edge >= 0.01 and expectedValue > 0
    const qualifiedML = moneylines
      .filter(c => c.modelProbability >= 0.53 && c.smartEdge >= 0.01 && c.expectedValue >= 0)
      .sort((a, b) => b.modelProbability - a.modelProbability);

    if (qualifiedML.length > 0) {
      return this.toSignal(qualifiedML[0]);
    }

    // 3. STEP 3: Search HANDICAP O PUCK LINE
    const pucklines = valid.filter(c => c.market === 'PUCK LINE');
    const qualifiedPL = pucklines
      .filter(c => c.modelProbability >= 0.60 && c.smartEdge >= 0.01)
      .sort((a, b) => b.modelProbability - a.modelProbability);

    if (qualifiedPL.length > 0) {
      return this.toSignal(qualifiedPL[0]);
    }

    // Fallback: Pick highest quality candidate in strict market priority order [TOTAL GOALS > MONEYLINE > PUCK LINE]
    for (const mkt of ['TOTAL GOALS', 'MONEYLINE', 'PUCK LINE']) {
      const group = valid.filter(c => c.market === mkt && c.modelProbability >= 0.50);
      if (group.length > 0) {
        group.sort((a, b) => b.modelProbability - a.modelProbability);
        return this.toSignal(group[0]);
      }
    }

    // Absolute fallback: highest probability
    const sorted = [...valid].sort((a, b) => b.modelProbability - a.modelProbability);
    return this.toSignal(sorted[0]);
  }

  private static toSignal(c: MultiSportPrediction): MultiSportSignal {
    return {
      id: c.id,
      sport: 'nhl',
      gameId: c.gameId,
      game: c.game,
      market: c.market,
      selection: c.selection,
      line: c.line,
      modelProbability: c.modelProbability,
      decimalOdds: c.decimalOdds,
      smartEdge: c.smartEdge,
      expectedValue: c.expectedValue,
      smartScore: c.smartScore,
      classification: c.modelProbability >= 0.65 ? 'TOP PICK' : c.modelProbability >= 0.55 ? 'STRONG' : 'QUALIFIED',
      dataQuality: c.dataQuality,
      isSmartPick: false,
      explanation: c.explanation || '',
      createdAt: c.createdAt
    };
  }

  public static selectOfficialSignals(candidates: MultiSportPrediction[]): MultiSportSignal[] {
    const best = this.selectBestSignalForGame(candidates);
    return best ? [best] : [];
  }

  public static selectNHLSmartPick(signals: MultiSportSignal[]): MultiSportSignal | null {
    if (!signals || signals.length === 0) return null;
    const candidates = [...signals];
    // Filter out Gemini-vetoed signals if non-vetoed candidates exist
    const nonVetoed = candidates.filter(s => !(s as any).aiVetoed);
    const pool = nonVetoed.length > 0 ? nonVetoed : candidates;

    pool.sort((a, b) => {
      const aRisk = (a as any).aiRiskScore || 20;
      const bRisk = (b as any).aiRiskScore || 20;
      const aScore = (a.modelProbability * 100) + a.smartScore - (aRisk * 0.4);
      const bScore = (b.modelProbability * 100) + b.smartScore - (bRisk * 0.4);
      return bScore - aScore;
    });

    const topPick = pool[0];
    topPick.isSmartPick = true;
    topPick.classification = 'TOP PICK';
    return topPick;
  }
}
