import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NFLTeamStats, NFLMarketOdds } from './nfl-types';
import { NFLModelV1 } from './nfl-model';
import { NFLFeatureEngine } from './nfl-feature-engine';

export const DEFAULT_NFL_STRATEGIES: Record<string, SportStrategyConfig> = {
  nfl_moneyline: {
    id: 'nfl_moneyline',
    sport: 'nfl',
    market: 'MONEYLINE',
    name: 'NFL Moneyline Value',
    description: 'Estrategia de ganador directo NFL basada en rating Elo y diferencial de yardas',
    enabled: true,
    minProbability: 0.58,
    minEdge: 0.04,
    minOdds: 1.40,
    maxOdds: 2.40,
    minDataQuality: 75
  },
  nfl_spread: {
    id: 'nfl_spread',
    sport: 'nfl',
    market: 'SPREAD',
    name: 'NFL Spread Advantage',
    description: 'Estrategia de hándicap NFL considerando números clave (3, 7, 10)',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.80,
    maxOdds: 2.10,
    minDataQuality: 75
  },
  nfl_total: {
    id: 'nfl_total',
    sport: 'nfl',
    market: 'TOTAL POINTS',
    name: 'NFL Over/Under Total',
    description: 'Estrategia de totales NFL modelada por eficiencia de zona roja y clima',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.80,
    maxOdds: 2.10,
    minDataQuality: 75
  },
  nfl_team_total: {
    id: 'nfl_team_total',
    sport: 'nfl',
    market: 'TEAM TOTAL',
    name: 'NFL Team Totals',
    description: 'Estrategia de puntos por equipo frente a la defensa contraria',
    enabled: true,
    minProbability: 0.55,
    minEdge: 0.03,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 70
  }
};

export class NFLStrategyEngine {
  public static evaluateGame(params: {
    game: NormalizedGame;
    homeStats: NFLTeamStats;
    awayStats: NFLTeamStats;
    odds?: NFLMarketOdds;
    strategies?: Record<string, SportStrategyConfig>;
  }): MultiSportPrediction[] {
    const { game, homeStats, awayStats, odds, strategies = DEFAULT_NFL_STRATEGIES } = params;

    const sim = NFLModelV1.simulateGame({ homeStats, awayStats, odds });
    const { dataQuality } = NFLFeatureEngine.calculateExpectedScore(homeStats, awayStats);

    const candidates: MultiSportPrediction[] = [];
    const nowIso = new Date().toISOString();

    // 1. MONEYLINE
    if (odds?.moneyline) {
      const mlStrat = strategies.nfl_moneyline || DEFAULT_NFL_STRATEGIES.nfl_moneyline;

      // Home
      const homeOdds = odds.moneyline.homeOdds;
      const homeEdge = calculateSmartEdge(sim.homeWinProb, homeOdds);
      const homeEV = calculateExpectedValue(sim.homeWinProb, homeOdds);
      const homeScore = calculateSmartScore({ modelProbability: sim.homeWinProb, smartEdge: homeEdge, expectedValue: homeEV, dataQuality });
      const homeClass = classifyOpportunity({ modelProbability: sim.homeWinProb, smartEdge: homeEdge, smartScore: homeScore, dataQuality, odds: homeOdds, strategyConfig: mlStrat });

      if (homeClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nfl_ml_home`,
          sport: 'nfl',
          gameId: game.id,
          game,
          market: 'MONEYLINE',
          selection: `${game.homeTeam.name} (Ganador)`,
          modelVersion: NFLModelV1.VERSION,
          modelProbability: sim.homeWinProb,
          decimalOdds: homeOdds,
          impliedProbability: Number((1 / homeOdds).toFixed(4)),
          smartEdge: homeEdge,
          expectedValue: homeEV,
          smartScore: homeScore,
          classification: homeClass,
          dataQuality,
          explanation: `El modelo proyecta a ${game.homeTeam.name} (Elo: ${sim.eloHome}) con ${(sim.homeWinProb * 100).toFixed(1)}% de probabilidad frente a cuota ${homeOdds.toFixed(2)} (Edge: +${(homeEdge * 100).toFixed(1)}%).`,
          createdAt: nowIso
        });
      }

      // Away
      const awayOdds = odds.moneyline.awayOdds;
      const awayEdge = calculateSmartEdge(sim.awayWinProb, awayOdds);
      const awayEV = calculateExpectedValue(sim.awayWinProb, awayOdds);
      const awayScore = calculateSmartScore({ modelProbability: sim.awayWinProb, smartEdge: awayEdge, expectedValue: awayEV, dataQuality });
      const awayClass = classifyOpportunity({ modelProbability: sim.awayWinProb, smartEdge: awayEdge, smartScore: awayScore, dataQuality, odds: awayOdds, strategyConfig: mlStrat });

      if (awayClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nfl_ml_away`,
          sport: 'nfl',
          gameId: game.id,
          game,
          market: 'MONEYLINE',
          selection: `${game.awayTeam.name} (Ganador)`,
          modelVersion: NFLModelV1.VERSION,
          modelProbability: sim.awayWinProb,
          decimalOdds: awayOdds,
          impliedProbability: Number((1 / awayOdds).toFixed(4)),
          smartEdge: awayEdge,
          expectedValue: awayEV,
          smartScore: awayScore,
          classification: awayClass,
          dataQuality,
          explanation: `El modelo proyecta a ${game.awayTeam.name} (Elo: ${sim.eloAway}) con ${(sim.awayWinProb * 100).toFixed(1)}% de probabilidad frente a cuota ${awayOdds.toFixed(2)} (Edge: +${(awayEdge * 100).toFixed(1)}%).`,
          createdAt: nowIso
        });
      }
    }

    // 2. SPREAD
    if (odds?.spread) {
      const spreadStrat = strategies.nfl_spread || DEFAULT_NFL_STRATEGIES.nfl_spread;
      const homeSpreadOdds = odds.spread.homeOdds;
      const homeSpreadEdge = calculateSmartEdge(sim.spreadCoverProbHome, homeSpreadOdds);
      const homeSpreadEV = calculateExpectedValue(sim.spreadCoverProbHome, homeSpreadOdds);
      const homeSpreadScore = calculateSmartScore({ modelProbability: sim.spreadCoverProbHome, smartEdge: homeSpreadEdge, expectedValue: homeSpreadEV, dataQuality });
      const homeSpreadClass = classifyOpportunity({ modelProbability: sim.spreadCoverProbHome, smartEdge: homeSpreadEdge, smartScore: homeSpreadScore, dataQuality, odds: homeSpreadOdds, strategyConfig: spreadStrat });

      if (homeSpreadClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nfl_spread_home`,
          sport: 'nfl',
          gameId: game.id,
          game,
          market: 'SPREAD',
          selection: `${game.homeTeam.name} ${odds.spread.homeLine > 0 ? '+' : ''}${odds.spread.homeLine}`,
          line: odds.spread.homeLine,
          modelVersion: NFLModelV1.VERSION,
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
      const totalStrat = strategies.nfl_total || DEFAULT_NFL_STRATEGIES.nfl_total;
      const overOdds = odds.totalPoints.overOdds;
      const overEdge = calculateSmartEdge(sim.totalOverProb, overOdds);
      const overEV = calculateExpectedValue(sim.totalOverProb, overOdds);
      const overScore = calculateSmartScore({ modelProbability: sim.totalOverProb, smartEdge: overEdge, expectedValue: overEV, dataQuality });
      const overClass = classifyOpportunity({ modelProbability: sim.totalOverProb, smartEdge: overEdge, smartScore: overScore, dataQuality, odds: overOdds, strategyConfig: totalStrat });

      if (overClass !== 'NO BET') {
        candidates.push({
          id: `${game.id}_nfl_total_over`,
          sport: 'nfl',
          gameId: game.id,
          game,
          market: 'TOTAL POINTS',
          selection: `OVER ${odds.totalPoints.line}`,
          line: odds.totalPoints.line,
          modelVersion: NFLModelV1.VERSION,
          modelProbability: sim.totalOverProb,
          decimalOdds: overOdds,
          impliedProbability: Number((1 / overOdds).toFixed(4)),
          smartEdge: overEdge,
          expectedValue: overEV,
          smartScore: overScore,
          classification: overClass,
          dataQuality,
          explanation: `Proyección ofensiva de ${sim.expectedTotalPoints} puntos totales supera la línea de ${odds.totalPoints.line}.`,
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
      sport: 'nfl',
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

  public static selectNFLSmartPick(signals: MultiSportSignal[]): MultiSportSignal | null {
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
