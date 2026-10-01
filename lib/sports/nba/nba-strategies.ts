import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NBATeamStats, NBAMarketOdds } from './nba-types';
import { NBAModelV1 } from './nba-model';
import { NBAFeatureEngine } from './nba-feature-engine';

export const DEFAULT_NBA_STRATEGIES: Record<string, SportStrategyConfig> = {
  nba_moneyline: {
    id: 'nba_moneyline',
    sport: 'nba',
    market: 'MONEYLINE',
    name: 'NBA Moneyline',
    description: 'Estrategia de ganador directo NBA con valor cuantitativo Monte Carlo',
    enabled: true,
    minProbability: 0.58,
    minEdge: 0.04,
    minOdds: 1.40,
    maxOdds: 2.40,
    minDataQuality: 75
  },
  nba_spread: {
    id: 'nba_spread',
    sport: 'nba',
    market: 'SPREAD',
    name: 'NBA Spread',
    description: 'Estrategia de hándicap de puntos basada en posesiones y ratings netos',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.80,
    maxOdds: 2.10,
    minDataQuality: 75
  },
  nba_total: {
    id: 'nba_total',
    sport: 'nba',
    market: 'TOTAL POINTS',
    name: 'NBA Total Points',
    description: 'Estrategia de Over/Under puntos totales modelada por ritmo y varianza',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.80,
    maxOdds: 2.10,
    minDataQuality: 75
  },
  nba_team_total: {
    id: 'nba_team_total',
    sport: 'nba',
    market: 'TEAM TOTAL',
    name: 'NBA Team Total',
    description: 'Estrategia de puntos por equipo frente a la defensa oponente',
    enabled: true,
    minProbability: 0.55,
    minEdge: 0.03,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 70
  }
};

export class NBAStrategyEngine {
  /**
   * Generates candidate predictions for an NBA game across all 4 markets
   */
  public static evaluateGame(params: {
    game: NormalizedGame;
    homeStats: NBATeamStats;
    awayStats: NBATeamStats;
    odds?: NBAMarketOdds;
    strategies?: Record<string, SportStrategyConfig>;
  }): MultiSportPrediction[] {
    const { game, homeStats, awayStats, odds, strategies = DEFAULT_NBA_STRATEGIES } = params;

    const sim = NBAModelV1.simulateGame({ homeStats, awayStats, odds });
    const { dataQuality } = NBAFeatureEngine.calculateExpectedScore(
      homeStats,
      awayStats,
      sim.expectedPossessions
    );

    const candidates: MultiSportPrediction[] = [];
    const nowIso = new Date().toISOString();

    // 1. MONEYLINE
    if (odds?.moneyline) {
      const mlStrat = strategies.nba_moneyline || DEFAULT_NBA_STRATEGIES.nba_moneyline;
      // Home Moneyline
      const homeOdds = odds.moneyline.homeOdds;
      const homeEdge = calculateSmartEdge(sim.homeWinProb, homeOdds);
      const homeEV = calculateExpectedValue(sim.homeWinProb, homeOdds);
      const homeScore = calculateSmartScore({
        modelProbability: sim.homeWinProb,
        smartEdge: homeEdge,
        expectedValue: homeEV,
        dataQuality
      });
      const homeClass = classifyOpportunity({
        modelProbability: sim.homeWinProb,
        smartEdge: homeEdge,
        smartScore: homeScore,
        dataQuality,
        odds: homeOdds,
        strategyConfig: mlStrat
      });

      if (homeClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nba_ml_home`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'MONEYLINE',
          selection: `${game.homeTeam.name} (Ganador)`,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: sim.homeWinProb,
          decimalOdds: homeOdds,
          impliedProbability: Number((1 / homeOdds).toFixed(4)),
          smartEdge: homeEdge,
          expectedValue: homeEV,
          smartScore: homeScore,
          classification: homeClass,
          dataQuality,
          explanation: `El modelo proyecta a ${game.homeTeam.name} con ${(sim.homeWinProb * 100).toFixed(1)}% de probabilidad de victoria frente a cuota ${homeOdds.toFixed(2)} (Edge: +${(homeEdge * 100).toFixed(1)}%).`,
          createdAt: nowIso
        });
      }

      // Away Moneyline
      const awayOdds = odds.moneyline.awayOdds;
      const awayEdge = calculateSmartEdge(sim.awayWinProb, awayOdds);
      const awayEV = calculateExpectedValue(sim.awayWinProb, awayOdds);
      const awayScore = calculateSmartScore({
        modelProbability: sim.awayWinProb,
        smartEdge: awayEdge,
        expectedValue: awayEV,
        dataQuality
      });
      const awayClass = classifyOpportunity({
        modelProbability: sim.awayWinProb,
        smartEdge: awayEdge,
        smartScore: awayScore,
        dataQuality,
        odds: awayOdds,
        strategyConfig: mlStrat
      });

      if (awayClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nba_ml_away`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'MONEYLINE',
          selection: `${game.awayTeam.name} (Ganador)`,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: sim.awayWinProb,
          decimalOdds: awayOdds,
          impliedProbability: Number((1 / awayOdds).toFixed(4)),
          smartEdge: awayEdge,
          expectedValue: awayEV,
          smartScore: awayScore,
          classification: awayClass,
          dataQuality,
          explanation: `El modelo proyecta a ${game.awayTeam.name} con ${(sim.awayWinProb * 100).toFixed(1)}% de probabilidad frente a cuota ${awayOdds.toFixed(2)} (Edge: +${(awayEdge * 100).toFixed(1)}%).`,
          createdAt: nowIso
        });
      }
    }

    // 2. SPREAD
    if (odds?.spread) {
      const spreadStrat = strategies.nba_spread || DEFAULT_NBA_STRATEGIES.nba_spread;
      const homeSpreadOdds = odds.spread.homeOdds;
      const homeSpreadEdge = calculateSmartEdge(sim.spreadCoverProbHome, homeSpreadOdds);
      const homeSpreadEV = calculateExpectedValue(sim.spreadCoverProbHome, homeSpreadOdds);
      const homeSpreadScore = calculateSmartScore({
        modelProbability: sim.spreadCoverProbHome,
        smartEdge: homeSpreadEdge,
        expectedValue: homeSpreadEV,
        dataQuality
      });
      const homeSpreadClass = classifyOpportunity({
        modelProbability: sim.spreadCoverProbHome,
        smartEdge: homeSpreadEdge,
        smartScore: homeSpreadScore,
        dataQuality,
        odds: homeSpreadOdds,
        strategyConfig: spreadStrat
      });

      if (homeSpreadClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nba_spread_home`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'SPREAD',
          selection: `${game.homeTeam.name} ${odds.spread.homeLine > 0 ? '+' : ''}${odds.spread.homeLine}`,
          line: odds.spread.homeLine,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: sim.spreadCoverProbHome,
          decimalOdds: homeSpreadOdds,
          impliedProbability: Number((1 / homeSpreadOdds).toFixed(4)),
          smartEdge: homeSpreadEdge,
          expectedValue: homeSpreadEV,
          smartScore: homeSpreadScore,
          classification: homeSpreadClass,
          dataQuality,
          explanation: `Margen proyectado de ${sim.expectedSpreadMargin > 0 ? '+' : ''}${sim.expectedSpreadMargin} pts favorece la cobertura de la línea de ${odds.spread.homeLine} con ${(sim.spreadCoverProbHome * 100).toFixed(1)}% de probabilidad.`,
          createdAt: nowIso
        });
      }
    }

    // 3. TOTAL POINTS
    if (odds?.totalPoints) {
      const totalStrat = strategies.nba_total || DEFAULT_NBA_STRATEGIES.nba_total;
      // Over
      const overOdds = odds.totalPoints.overOdds;
      const overEdge = calculateSmartEdge(sim.totalOverProb, overOdds);
      const overEV = calculateExpectedValue(sim.totalOverProb, overOdds);
      const overScore = calculateSmartScore({
        modelProbability: sim.totalOverProb,
        smartEdge: overEdge,
        expectedValue: overEV,
        dataQuality
      });
      const overClass = classifyOpportunity({
        modelProbability: sim.totalOverProb,
        smartEdge: overEdge,
        smartScore: overScore,
        dataQuality,
        odds: overOdds,
        strategyConfig: totalStrat
      });

      if (overClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nba_total_over`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'TOTAL POINTS',
          selection: `OVER ${odds.totalPoints.line}`,
          line: odds.totalPoints.line,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: sim.totalOverProb,
          decimalOdds: overOdds,
          impliedProbability: Number((1 / overOdds).toFixed(4)),
          smartEdge: overEdge,
          expectedValue: overEV,
          smartScore: overScore,
          classification: overClass,
          dataQuality,
          explanation: `El ritmo proyectado (${sim.expectedPossessions} posesiones) y ratings netos estiman ${sim.expectedTotalPoints} puntos totales, superando la línea de ${odds.totalPoints.line}.`,
          createdAt: nowIso
        });
      }

      // Under
      const underOdds = odds.totalPoints.underOdds;
      const underEdge = calculateSmartEdge(sim.totalUnderProb, underOdds);
      const underEV = calculateExpectedValue(sim.totalUnderProb, underOdds);
      const underScore = calculateSmartScore({
        modelProbability: sim.totalUnderProb,
        smartEdge: underEdge,
        expectedValue: underEV,
        dataQuality
      });
      const underClass = classifyOpportunity({
        modelProbability: sim.totalUnderProb,
        smartEdge: underEdge,
        smartScore: underScore,
        dataQuality,
        odds: underOdds,
        strategyConfig: totalStrat
      });

      if (underClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nba_total_under`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'TOTAL POINTS',
          selection: `UNDER ${odds.totalPoints.line}`,
          line: odds.totalPoints.line,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: sim.totalUnderProb,
          decimalOdds: underOdds,
          impliedProbability: Number((1 / underOdds).toFixed(4)),
          smartEdge: underEdge,
          expectedValue: underEV,
          smartScore: underScore,
          classification: underClass,
          dataQuality,
          explanation: `El ritmo proyectado (${sim.expectedPossessions} posesiones) proyecta ${sim.expectedTotalPoints} puntos totales, por debajo de la línea de ${odds.totalPoints.line}.`,
          createdAt: nowIso
        });
      }
    }

    return candidates;
  }

  /**
   * Filters and limits candidates to max 2 official signals per NBA game
   */
  public static selectBestSignalForGame(candidates: MultiSportPrediction[]): MultiSportSignal | null {
    if (!candidates || candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => {
      if (b.modelProbability !== a.modelProbability) return b.modelProbability - a.modelProbability;
      return b.smartScore - a.smartScore;
    });
    const topCandidate = sorted[0];
    return {
      id: topCandidate.id,
      sport: 'nba',
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

  /**
   * Selects max 1 NBA Smart Pick per day
   */
  public static selectNBASmartPick(signals: MultiSportSignal[]): MultiSportSignal | null {
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
