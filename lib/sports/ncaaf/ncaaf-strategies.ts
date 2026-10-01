import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NCAAFTeamStats, NCAAFMarketOdds } from './ncaaf-types';
import { NCAAFModelV1 } from './ncaaf-model';
import { NCAAFFeatureEngine } from './ncaaf-feature-engine';

export const DEFAULT_NCAAF_STRATEGIES: Record<string, SportStrategyConfig> = {
  ncaaf_moneyline: {
    id: 'ncaaf_moneyline',
    sport: 'ncaaf',
    market: 'MONEYLINE',
    name: 'NCAAF Moneyline Value',
    description: 'Estrategia de ganador directo College Football con ajuste de oponente y conferencia',
    enabled: true,
    minProbability: 0.60,
    minEdge: 0.05,
    minOdds: 1.35,
    maxOdds: 2.30,
    minDataQuality: 70
  },
  ncaaf_spread: {
    id: 'ncaaf_spread',
    sport: 'ncaaf',
    market: 'SPREAD',
    name: 'NCAAF Spread Value',
    description: 'Estrategia de hándicap College Football con shrinkage y varianza de college',
    enabled: true,
    minProbability: 0.57,
    minEdge: 0.04,
    minOdds: 1.80,
    maxOdds: 2.10,
    minDataQuality: 70
  },
  ncaaf_total: {
    id: 'ncaaf_total',
    sport: 'ncaaf',
    market: 'TOTAL POINTS',
    name: 'NCAAF Totals Over/Under',
    description: 'Estrategia de puntos totales modelada con varianza alta específica de College Football',
    enabled: true,
    minProbability: 0.57,
    minEdge: 0.04,
    minOdds: 1.80,
    maxOdds: 2.10,
    minDataQuality: 70
  },
  ncaaf_team_total: {
    id: 'ncaaf_team_total',
    sport: 'ncaaf',
    market: 'TEAM TOTAL',
    name: 'NCAAF Team Totals',
    description: 'Estrategia de puntos por equipo en College Football',
    enabled: true,
    minProbability: 0.55,
    minEdge: 0.035,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 65
  }
};

export class NCAAFStrategyEngine {
  public static evaluateGame(params: {
    game: NormalizedGame;
    homeStats: NCAAFTeamStats;
    awayStats: NCAAFTeamStats;
    odds?: NCAAFMarketOdds;
    strategies?: Record<string, SportStrategyConfig>;
  }): MultiSportPrediction[] {
    const { game, homeStats, awayStats, odds, strategies = DEFAULT_NCAAF_STRATEGIES } = params;

    const sim = NCAAFModelV1.simulateGame({ homeStats, awayStats, odds });
    const { dataQuality } = NCAAFFeatureEngine.calculateExpectedScore(homeStats, awayStats);

    const candidates: MultiSportPrediction[] = [];
    const nowIso = new Date().toISOString();

    // 1. MONEYLINE
    if (odds?.moneyline) {
      const mlStrat = strategies.ncaaf_moneyline || DEFAULT_NCAAF_STRATEGIES.ncaaf_moneyline;

      const homeOdds = odds.moneyline.homeOdds;
      const homeEdge = calculateSmartEdge(sim.homeWinProb, homeOdds);
      const homeEV = calculateExpectedValue(sim.homeWinProb, homeOdds);
      const homeScore = calculateSmartScore({ modelProbability: sim.homeWinProb, smartEdge: homeEdge, expectedValue: homeEV, dataQuality });
      const homeClass = classifyOpportunity({ modelProbability: sim.homeWinProb, smartEdge: homeEdge, smartScore: homeScore, dataQuality, odds: homeOdds, strategyConfig: mlStrat });

      if (homeClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_ncaaf_ml_home`,
          sport: 'ncaaf',
          gameId: game.id,
          game,
          market: 'MONEYLINE',
          selection: `${game.homeTeam.name} (Ganador)`,
          modelVersion: NCAAFModelV1.VERSION,
          modelProbability: sim.homeWinProb,
          decimalOdds: homeOdds,
          impliedProbability: Number((1 / homeOdds).toFixed(4)),
          smartEdge: homeEdge,
          expectedValue: homeEV,
          smartScore: homeScore,
          classification: homeClass,
          dataQuality,
          explanation: `El modelo proyecta a ${game.homeTeam.name} (${homeStats.conference}) con ${(sim.homeWinProb * 100).toFixed(1)}% de probabilidad frente a cuota ${homeOdds.toFixed(2)} (Edge: +${(homeEdge * 100).toFixed(1)}%).`,
          createdAt: nowIso
        });
      }
    }

    // 2. SPREAD
    if (odds?.spread) {
      const spreadStrat = strategies.ncaaf_spread || DEFAULT_NCAAF_STRATEGIES.ncaaf_spread;
      const homeSpreadOdds = odds.spread.homeOdds;
      const homeSpreadEdge = calculateSmartEdge(sim.spreadCoverProbHome, homeSpreadOdds);
      const homeSpreadEV = calculateExpectedValue(sim.spreadCoverProbHome, homeSpreadOdds);
      const homeSpreadScore = calculateSmartScore({ modelProbability: sim.spreadCoverProbHome, smartEdge: homeSpreadEdge, expectedValue: homeSpreadEV, dataQuality });
      const homeSpreadClass = classifyOpportunity({ modelProbability: sim.spreadCoverProbHome, smartEdge: homeSpreadEdge, smartScore: homeSpreadScore, dataQuality, odds: homeSpreadOdds, strategyConfig: spreadStrat });

      if (homeSpreadClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_ncaaf_spread_home`,
          sport: 'ncaaf',
          gameId: game.id,
          game,
          market: 'SPREAD',
          selection: `${game.homeTeam.name} ${odds.spread.homeLine > 0 ? '+' : ''}${odds.spread.homeLine}`,
          line: odds.spread.homeLine,
          modelVersion: NCAAFModelV1.VERSION,
          modelProbability: sim.spreadCoverProbHome,
          decimalOdds: homeSpreadOdds,
          impliedProbability: Number((1 / homeSpreadOdds).toFixed(4)),
          smartEdge: homeSpreadEdge,
          expectedValue: homeSpreadEV,
          smartScore: homeSpreadScore,
          classification: homeSpreadClass,
          dataQuality,
          explanation: `Margen proyectado de ${sim.expectedSpreadMargin > 0 ? '+' : ''}${sim.expectedSpreadMargin} pts favorece la cobertura de la línea de ${odds.spread.homeLine}.`,
          createdAt: nowIso
        });
      }
    }

    // 3. TOTAL POINTS
    if (odds?.totalPoints) {
      const totalStrat = strategies.ncaaf_total || DEFAULT_NCAAF_STRATEGIES.ncaaf_total;
      const overOdds = odds.totalPoints.overOdds;
      const overEdge = calculateSmartEdge(sim.totalOverProb, overOdds);
      const overEV = calculateExpectedValue(sim.totalOverProb, overOdds);
      const overScore = calculateSmartScore({ modelProbability: sim.totalOverProb, smartEdge: overEdge, expectedValue: overEV, dataQuality });
      const overClass = classifyOpportunity({ modelProbability: sim.totalOverProb, smartEdge: overEdge, smartScore: overScore, dataQuality, odds: overOdds, strategyConfig: totalStrat });

      if (overClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_ncaaf_total_over`,
          sport: 'ncaaf',
          gameId: game.id,
          game,
          market: 'TOTAL POINTS',
          selection: `OVER ${odds.totalPoints.line}`,
          line: odds.totalPoints.line,
          modelVersion: NCAAFModelV1.VERSION,
          modelProbability: sim.totalOverProb,
          decimalOdds: overOdds,
          impliedProbability: Number((1 / overOdds).toFixed(4)),
          smartEdge: overEdge,
          expectedValue: overEV,
          smartScore: overScore,
          classification: overClass,
          dataQuality,
          explanation: `Proyección ofensiva total de ${sim.expectedTotalPoints} puntos supera la línea de ${odds.totalPoints.line}.`,
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
      sport: 'ncaaf',
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

  public static selectNCAAFSmartPick(signals: MultiSportSignal[]): MultiSportSignal | null {
    if (!signals || signals.length === 0) return null;
    const candidates = [...signals].filter(s => s.smartEdge >= 0.05 && s.dataQuality >= 65);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.smartScore - a.smartScore || b.smartEdge - a.smartEdge);
    const topPick = candidates[0];
    topPick.isSmartPick = true;
    topPick.classification = 'TOP PICK';
    return topPick;
  }
}
