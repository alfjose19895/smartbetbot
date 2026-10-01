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
    minProbability: 0.57,
    minEdge: 0.04,
    minOdds: 1.45,
    maxOdds: 2.35,
    minDataQuality: 75
  },
  nhl_puck_line: {
    id: 'nhl_puck_line',
    sport: 'nhl',
    market: 'PUCK LINE',
    name: 'NHL Puck Line (-1.5 / +1.5)',
    description: 'Estrategia de Puck Line considerando varianza de gol vacío en tramo final',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.70,
    maxOdds: 2.40,
    minDataQuality: 75
  },
  nhl_total: {
    id: 'nhl_total',
    sport: 'nhl',
    market: 'TOTAL GOALS',
    name: 'NHL Total Goals Over/Under',
    description: 'Estrategia de goles totales dinámicos (5.5, 6.0, 6.5) con Goles Esperados',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 75
  },
  nhl_team_total: {
    id: 'nhl_team_total',
    sport: 'nhl',
    market: 'TEAM TOTAL',
    name: 'NHL Team Goals Total',
    description: 'Estrategia de goles individuales por equipo según efectividad y portero rival',
    enabled: true,
    minProbability: 0.55,
    minEdge: 0.03,
    minOdds: 1.70,
    maxOdds: 2.20,
    minDataQuality: 70
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
      const homeOdds = odds.moneyline.homeOdds;
      const homeEdge = calculateSmartEdge(sim.moneylineHomeProb, homeOdds);
      const homeEV = calculateExpectedValue(sim.moneylineHomeProb, homeOdds);
      const homeScore = calculateSmartScore({ modelProbability: sim.moneylineHomeProb, smartEdge: homeEdge, expectedValue: homeEV, dataQuality });
      const homeClass = classifyOpportunity({ modelProbability: sim.moneylineHomeProb, smartEdge: homeEdge, smartScore: homeScore, dataQuality, odds: homeOdds, strategyConfig: mlStrat });

      if (homeClass !== 'NO BET') {
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
          classification: homeClass,
          dataQuality,
          explanation: `El modelo proyecta xG de ${sim.lambdaHome} goles para ${game.homeTeam.name} con ${(sim.moneylineHomeProb * 100).toFixed(1)}% de probabilidad de victoria total (Edge: +${(homeEdge * 100).toFixed(1)}%).`,
          createdAt: nowIso
        });
      }

      // Away Moneyline
      const awayOdds = odds.moneyline.awayOdds;
      const awayEdge = calculateSmartEdge(sim.moneylineAwayProb, awayOdds);
      const awayEV = calculateExpectedValue(sim.moneylineAwayProb, awayOdds);
      const awayScore = calculateSmartScore({ modelProbability: sim.moneylineAwayProb, smartEdge: awayEdge, expectedValue: awayEV, dataQuality });
      const awayClass = classifyOpportunity({ modelProbability: sim.moneylineAwayProb, smartEdge: awayEdge, smartScore: awayScore, dataQuality, odds: awayOdds, strategyConfig: mlStrat });

      if (awayClass !== 'NO BET') {
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
          classification: awayClass,
          dataQuality,
          explanation: `El modelo proyecta xG de ${sim.lambdaAway} goles para ${game.awayTeam.name} con ${(sim.moneylineAwayProb * 100).toFixed(1)}% de probabilidad (Edge: +${(awayEdge * 100).toFixed(1)}%).`,
          createdAt: nowIso
        });
      }
    }

    // 2. PUCK LINE
    if (odds?.puckLine) {
      const plStrat = strategies.nhl_puck_line || DEFAULT_NHL_STRATEGIES.nhl_puck_line;
      const homePlOdds = odds.puckLine.homeOdds;
      const homePlEdge = calculateSmartEdge(sim.puckLineHomeProb, homePlOdds);
      const homePlEV = calculateExpectedValue(sim.puckLineHomeProb, homePlOdds);
      const homePlScore = calculateSmartScore({ modelProbability: sim.puckLineHomeProb, smartEdge: homePlEdge, expectedValue: homePlEV, dataQuality });
      const homePlClass = classifyOpportunity({ modelProbability: sim.puckLineHomeProb, smartEdge: homePlEdge, smartScore: homePlScore, dataQuality, odds: homePlOdds, strategyConfig: plStrat });

      if (homePlClass !== 'NO BET') {
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
          classification: homePlClass,
          dataQuality,
          explanation: `El modelo evalúa la cobertura de ${odds.puckLine.homeLine} con ${(sim.puckLineHomeProb * 100).toFixed(1)}% de probabilidad considerando portería vacía.`,
          createdAt: nowIso
        });
      }
    }

    // 3. TOTAL GOALS
    if (odds?.totalGoals) {
      const totStrat = strategies.nhl_total || DEFAULT_NHL_STRATEGIES.nhl_total;
      const overOdds = odds.totalGoals.overOdds;
      const overEdge = calculateSmartEdge(sim.totalOverProb, overOdds);
      const overEV = calculateExpectedValue(sim.totalOverProb, overOdds);
      const overScore = calculateSmartScore({ modelProbability: sim.totalOverProb, smartEdge: overEdge, expectedValue: overEV, dataQuality });
      const overClass = classifyOpportunity({ modelProbability: sim.totalOverProb, smartEdge: overEdge, smartScore: overScore, dataQuality, odds: overOdds, strategyConfig: totStrat });

      if (overClass !== 'NO BET') {
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
          classification: overClass,
          dataQuality,
          explanation: `Proyección xG conjunta de ${sim.expectedTotalGoals} goles totales supera la línea de ${odds.totalGoals.line}.`,
          createdAt: nowIso
        });
      }
    }

    return candidates;
  }

  public static selectOfficialSignals(candidates: MultiSportPrediction[]): MultiSportSignal[] {
    const qualified = candidates.filter(c => ['TOP PICK', 'STRONG', 'QUALIFIED'].includes(c.classification));
    qualified.sort((a, b) => b.smartScore - a.smartScore || b.smartEdge - a.smartEdge);
    const selected = qualified.slice(0, 2);

    return selected.map(p => ({
      id: p.id,
      sport: 'nhl',
      gameId: p.gameId,
      game: p.game,
      market: p.market,
      selection: p.selection,
      line: p.line,
      modelProbability: p.modelProbability,
      decimalOdds: p.decimalOdds,
      smartEdge: p.smartEdge,
      expectedValue: p.expectedValue,
      smartScore: p.smartScore,
      classification: p.classification,
      dataQuality: p.dataQuality,
      isSmartPick: false,
      explanation: p.explanation || '',
      createdAt: p.createdAt
    }));
  }

  public static selectNHLSmartPick(signals: MultiSportSignal[]): MultiSportSignal | null {
    if (!signals || signals.length === 0) return null;
    const candidates = [...signals].filter(s => s.smartEdge >= 0.05 && s.dataQuality >= 70);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.smartScore - a.smartScore || b.smartEdge - a.smartEdge);
    const topPick = candidates[0];
    topPick.isSmartPick = true;
    topPick.classification = 'TOP PICK';
    return topPick;
  }
}
