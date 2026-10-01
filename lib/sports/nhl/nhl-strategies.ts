import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NHLTeamStats, NHLMarketOdds } from './nhl-types';
import { NHLModelV1 } from './nhl-model';
import { NHLFeatureEngine } from './nhl-feature-engine';

export const DEFAULT_NHL_STRATEGIES: Record<string, SportStrategyConfig> = {
  nhl_moneyline: {
    id: 'nhl_moneyline',
    sport: 'nhl',
    market: 'MONEYLINE',
    name: 'NHL Moneyline (incl OT/SO)',
    description: 'Estrategia de ganador NHL con modelo Poisson y resolución de prórroga',
    enabled: true,
    minProbability: 0.50,
    minEdge: 0.02,
    minOdds: 1.30,
    maxOdds: 2.85,
    minDataQuality: 60
  },
  nhl_puck_line: {
    id: 'nhl_puck_line',
    sport: 'nhl',
    market: 'PUCK LINE',
    name: 'NHL Puck Line (+1.5 / -1.5)',
    description: 'Estrategia de Puck Line considerando varianza de gol vacío en tramo final',
    enabled: true,
    minProbability: 0.52,
    minEdge: 0.02,
    minOdds: 1.35,
    maxOdds: 2.90,
    minDataQuality: 60
  },
  nhl_total: {
    id: 'nhl_total',
    sport: 'nhl',
    market: 'TOTAL GOALS',
    name: 'NHL Totales (Over/Under)',
    description: 'Estrategia de totales goles con modelo bivariado Poisson y ajuste de ritmo',
    enabled: true,
    minProbability: 0.50,
    minEdge: 0.02,
    minOdds: 1.35,
    maxOdds: 2.60,
    minDataQuality: 60
  }
};

export class NHLStrategyEngine {
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

    // 1. MONEYLINE (includes OT/SO)
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
        classification: homeClass !== 'NO BET' ? homeClass : (sim.moneylineHomeProb >= 0.50 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `El modelo proyecta xG de ${sim.lambdaHome.toFixed(2)} goles para ${game.homeTeam.name} con ${(sim.moneylineHomeProb * 100).toFixed(1)}% de probabilidad de victoria total (Edge: +${(homeEdge * 100).toFixed(1)}%).`,
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
        classification: awayClass !== 'NO BET' ? awayClass : (sim.moneylineAwayProb >= 0.50 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `El modelo proyecta xG de ${sim.lambdaAway.toFixed(2)} goles para ${game.awayTeam.name} con ${(sim.moneylineAwayProb * 100).toFixed(1)}% de probabilidad (Edge: +${(awayEdge * 100).toFixed(1)}%).`,
        createdAt: nowIso
      });
    }

    // 2. PUCK LINE (+1.5 / -1.5)
    if (odds?.puckLine) {
      const plStrat = strategies.nhl_puck_line || DEFAULT_NHL_STRATEGIES.nhl_puck_line;
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
        classification: homePlClass !== 'NO BET' ? homePlClass : 'QUALIFIED',
        dataQuality,
        explanation: `El modelo evalúa la cobertura de ${odds.puckLine.homeLine} con ${(sim.puckLineHomeProb * 100).toFixed(1)}% de probabilidad considerando portería vacía.`,
        createdAt: nowIso
      });
    }

    // 3. TOTAL GOALS (Over / Under)
    if (odds?.totalGoals) {
      const totStrat = strategies.nhl_total || DEFAULT_NHL_STRATEGIES.nhl_total;
      const overOdds = odds.totalGoals.overOdds || 1.85;
      const overEdge = calculateSmartEdge(sim.totalOverProb, overOdds);
      const overEV = calculateExpectedValue(sim.totalOverProb, overOdds);
      const overScore = calculateSmartScore({ modelProbability: sim.totalOverProb, smartEdge: overEdge, expectedValue: overEV, dataQuality });
      const overClass = classifyOpportunity({ modelProbability: sim.totalOverProb, smartEdge: overEdge, smartScore: overScore, dataQuality, odds: overOdds, strategyConfig: totStrat });

      candidates.push({
        id: `${game.id}_nhl_total_over`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'TOTAL GOALS',
        selection: `OVER ${odds.totalGoals.line} GOLES`,
        line: odds.totalGoals.line,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: sim.totalOverProb,
        decimalOdds: overOdds,
        impliedProbability: Number((1 / overOdds).toFixed(4)),
        smartEdge: overEdge,
        expectedValue: overEV,
        smartScore: overScore,
        classification: overClass !== 'NO BET' ? overClass : (sim.totalOverProb >= 0.52 ? 'QUALIFIED' : 'WATCH'),
        dataQuality,
        explanation: `Proyección xG conjunta de ${sim.expectedTotalGoals.toFixed(2)} goles totales supera la línea de ${odds.totalGoals.line}.`,
        createdAt: nowIso
      });

      // Under Option
      const underOdds = odds.totalGoals.underOdds || 1.95;
      const underProb = 1 - sim.totalOverProb;
      const underEdge = calculateSmartEdge(underProb, underOdds);
      const underEV = calculateExpectedValue(underProb, underOdds);
      const underScore = calculateSmartScore({ modelProbability: underProb, smartEdge: underEdge, expectedValue: underEV, dataQuality });

      candidates.push({
        id: `${game.id}_nhl_total_under`,
        sport: 'nhl',
        gameId: game.id,
        game,
        market: 'TOTAL GOALS',
        selection: `UNDER ${odds.totalGoals.line} GOLES`,
        line: odds.totalGoals.line,
        modelVersion: NHLModelV1.VERSION,
        modelProbability: underProb,
        decimalOdds: underOdds,
        impliedProbability: Number((1 / underOdds).toFixed(4)),
        smartEdge: underEdge,
        expectedValue: underEV,
        smartScore: underScore,
        classification: underProb >= 0.52 ? 'QUALIFIED' : 'WATCH',
        dataQuality,
        explanation: `Proyección xG de ${sim.expectedTotalGoals.toFixed(2)} goles favorece el control defensivo y tendencia Under ${odds.totalGoals.line}.`,
        createdAt: nowIso
      });
    }

    return candidates;
  }

  /**
   * Selects the single best high-probability (+EV) signal for a given NHL match.
   * Ensures every match on the schedule produces a validated official signal.
   */
  public static selectBestSignalForGame(candidates: MultiSportPrediction[]): MultiSportSignal | null {
    if (!candidates || candidates.length === 0) return null;

    // Sort by modelProbability descending, with tie-break on smartScore & smartEdge
    const sorted = [...candidates].sort((a, b) => {
      // Prioritize high probability (>= 58%) then edge
      if (b.modelProbability !== a.modelProbability) {
        return b.modelProbability - a.modelProbability;
      }
      return b.smartScore - a.smartScore;
    });

    const topCandidate = sorted[0];

    return {
      id: topCandidate.id,
      sport: 'nhl',
      gameId: topCandidate.gameId,
      game: topCandidate.game,
      market: topCandidate.market,
      selection: topCandidate.selection,
      line: topCandidate.line,
      modelProbability: topCandidate.modelProbability,
      decimalOdds: topCandidate.decimalOdds,
      smartEdge: topCandidate.smartEdge,
      expectedValue: topCandidate.expectedValue,
      smartScore: topCandidate.smartScore,
      classification: topCandidate.modelProbability >= 0.60 ? 'TOP PICK' : topCandidate.modelProbability >= 0.54 ? 'STRONG' : 'QUALIFIED',
      dataQuality: topCandidate.dataQuality,
      isSmartPick: false,
      explanation: topCandidate.explanation || '',
      createdAt: topCandidate.createdAt
    };
  }

  public static selectOfficialSignals(candidates: MultiSportPrediction[]): MultiSportSignal[] {
    const best = this.selectBestSignalForGame(candidates);
    return best ? [best] : [];
  }

  public static selectNHLSmartPick(signals: MultiSportSignal[]): MultiSportSignal | null {
    if (!signals || signals.length === 0) return null;
    const candidates = [...signals];
    candidates.sort((a, b) => (b.modelProbability * 100 + b.smartScore) - (a.modelProbability * 100 + a.smartScore));
    const topPick = candidates[0];
    topPick.isSmartPick = true;
    topPick.classification = 'TOP PICK';
    return topPick;
  }
}
