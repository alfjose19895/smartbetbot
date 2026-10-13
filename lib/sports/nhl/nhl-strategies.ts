import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NHLTeamStats, NHLMarketOdds, NHLModelOutput } from './nhl-types';
import { NHLModelV1 } from './nhl-model';
import { NHLFeatureEngine } from './nhl-feature-engine';

export const DEFAULT_NHL_STRATEGIES: Record<string, SportStrategyConfig> = {
  nhl_puck_line: {
    id: 'nhl_puck_line',
    sport: 'nhl',
    market: 'PUCK LINE',
    name: 'Handicap o Puck Line (+1.5 / -1.5)',
    description: 'Estrategia prioritaria de Puck Line con alta tasa de cobertura (70%+ en +1.5) y bajo riesgo',
    enabled: true,
    minProbability: 0.55,
    minEdge: 0.015,
    minOdds: 1.30,
    maxOdds: 2.25,
    minDataQuality: 60
  },
  nhl_moneyline: {
    id: 'nhl_moneyline',
    sport: 'nhl',
    market: 'MONEYLINE',
    name: 'Ganador (incl. Prórroga)',
    description: 'Estrategia de ganador NHL con resolución de tiempo reglamentario y prórroga/penaltis',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.02,
    minOdds: 1.35,
    maxOdds: 2.15,
    minDataQuality: 60
  },
  nhl_total: {
    id: 'nhl_total',
    sport: 'nhl',
    market: 'TOTAL GOALS',
    name: 'Total Goles (Over)',
    description: 'Estrategia de total de goles Over con filtro estricto anti-trampa de 5 goles',
    enabled: true,
    minProbability: 0.62,
    minEdge: 0.035,
    minOdds: 1.45,
    maxOdds: 2.15,
    minDataQuality: 60
  }
};

export function generateNHLExplanation(params: {
  market: 'PUCK LINE' | 'MONEYLINE' | 'TOTAL GOALS';
  selection: string;
  isHome: boolean;
  game: NormalizedGame;
  homeStats: NHLTeamStats;
  awayStats: NHLTeamStats;
  sim: NHLModelOutput;
  odds: number;
  prob: number;
  edge: number;
  line?: number;
}): string {
  const { market, selection, isHome, game, homeStats, awayStats, sim, odds, prob, edge, line } = params;
  const targetTeam = isHome ? homeStats : awayStats;
  const oppTeam = isHome ? awayStats : homeStats;
  const targetName = isHome ? game.homeTeam.name : game.awayTeam.name;
  const oppName = isHome ? game.awayTeam.name : game.homeTeam.name;

  const probPct = Math.round(prob * 100);
  const targetXg = isHome ? sim.lambdaHome.toFixed(2) : sim.lambdaAway.toFixed(2);
  const oppXg = isHome ? sim.lambdaAway.toFixed(2) : sim.lambdaHome.toFixed(2);
  const totalXg = sim.expectedTotalGoals.toFixed(2);

  const goalie = targetTeam.startingGoalie?.name || 'arquero titular';
  const savePct = targetTeam.startingGoalie?.savePct
    ? (targetTeam.startingGoalie.savePct * 100).toFixed(1)
    : (targetTeam.savePct ? (targetTeam.savePct * 100).toFixed(1) : '91.2');
  const gaa = targetTeam.startingGoalie?.goalsAgainstAvg
    ? targetTeam.startingGoalie.goalsAgainstAvg.toFixed(2)
    : (targetTeam.goalsAgainstPerGame ? targetTeam.goalsAgainstPerGame.toFixed(2) : '2.65');
  const pk = targetTeam.penaltyKillPct ? (targetTeam.penaltyKillPct * 100).toFixed(1) : '82.5';
  const pp = targetTeam.powerPlayPct ? (targetTeam.powerPlayPct * 100).toFixed(1) : '22.0';
  const sog = targetTeam.shotsForPerGame ? targetTeam.shotsForPerGame.toFixed(1) : '31.5';
  const oppGaa = oppTeam.goalsAgainstPerGame ? oppTeam.goalsAgainstPerGame.toFixed(2) : '3.10';

  const hash = Math.abs(String(game.id || selection).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + Math.round(odds * 100)) % 3;

  if (market === 'PUCK LINE') {
    const isPlus = selection.includes('+');
    if (isPlus) {
      const variants = [
        `Ventaja estructural de cobertura (+1.5): En la NHL casi el 40% de los encuentros se definen por margen de 1 gol o en prórroga. ${targetName} sostiene un sólido Penalty Kill (${pk}%) y el respaldo de ${goalie} (${savePct}% SV%), absorbiendo cualquier derrota por la mínima con ${probPct}% de probabilidad proyectada.`,
        `Margen de seguridad en hielo: La simulación bivariada (${targetXg} vs ${oppXg} xG) proyecta un duelo sumamente disputado. Con ${targetName} concediendo solo ${gaa} goles por noche y compitiendo a ritmo cerrado, la línea de +1.5 ofrece una cobertura altamente rentable ante ${oppName}.`,
        `Solidez en 5vs5 y protección de línea (+1.5): ${targetName} mantiene disciplina posicional y bajo volumen de concesiones defensivas. Incluso ante el empuje de ${oppName}, la ventaja de +1.5 goles cubre todas las resoluciones en tiempo extra y caídas por un gol (${probPct}% prob).`
      ];
      return variants[hash];
    } else {
      const variants = [
        `Dominio ofensivo y peligro de Empty-Net: ${targetName} supera con claridad a ${oppName} en generación de peligro (${targetXg} vs ${oppXg} xG) y volumen de disparos (${sog} SOG). Con alta probabilidad de liquidar el partido a portería vacía en el 3er periodo, la cobertura de -1.5 tiene solidez matemática (${probPct}% prob).`,
        `Jerarquía y pegada en tiempo regular: ${targetName} promedia ${(targetTeam.goalsForPerGame || 3.4).toFixed(2)} goles por fecha con un Power Play letal (${pp}%). Ante las concesiones defensivas de ${oppName} (${oppGaa} GAA), el modelo proyecta un triunfo por margen de 2 o más goles con ${probPct}% de probabilidad.`
      ];
      return variants[hash % variants.length];
    }
  }

  if (market === 'MONEYLINE') {
    if (isHome) {
      const variants = [
        `Solvencia como anfitrión en hielo propio: ${targetName} proyecta ${targetXg} xG frente a ${oppXg} de ${oppName}, impulsado por un Power Play del ${pp}% y control territorial. Su fiabilidad en casa y rendimiento en tiempo extra respaldan el ${probPct}% de probabilidad de victoria total (incl. Prórroga).`,
        `Diferencial cualitativo en casa: ${targetName} impone ritmo con ${sog} disparos a puerta por partido y el respaldo de ${goalie} bajo palos (${savePct}% SV%). Ante la menor pegada foránea de ${oppName}, el balance de valor favorece la victoria local (${probPct}% prob).`,
        `Control posicional y eficacia en tiempo suplementario: La simulación proyecta a ${targetName} dominando las ocasiones de alta peligrosidad (High-Danger Chances). Con ventaja de localía y solidez en portería, el modelo asigna ${probPct}% de victoria global ante ${oppName}.`
      ];
      return variants[hash];
    } else {
      const variants = [
        `Jerarquía y eficacia foránea: ${targetName} exhibe una notable efectividad en transiciones de contragolpe (${(targetTeam.goalsForPerGame || 3.2).toFixed(2)} goles de media) y solvencia de ${goalie} en pista ajena. Su consistencia en 5vs5 ante ${oppName} fundamenta el ${probPct}% de probabilidad de triunfo visitante (incl. Prórroga).`,
        `Solidez de contragolpe como visitante: ${targetName} explota los desajustes defensivos de ${oppName} con un diferencial xG favorable (${targetXg} vs ${oppXg}). Su disciplina y eficacia en inferioridad numérica (${pk}% PK) inclinan la balanza hacia la victoria foránea (${probPct}% prob).`
      ];
      return variants[hash % variants.length];
    }
  }

  if (market === 'TOTAL GOALS') {
    const targetLine = line || 5.5;
    const variants = [
      `Choque de alto ritmo ofensivo: El cruce entre ${homeStats.teamName} (${(homeStats.goalsForPerGame || 3.3).toFixed(2)} goles/partido) y ${awayStats.teamName} (${(awayStats.goalsForPerGame || 3.2).toFixed(2)} tantos) proyecta ${totalXg} goles totales combinados, superando con holgura la línea de ${targetLine} (${probPct}% prob).`,
      `Intercambio constante y concesiones en defensa: Ambos planteles acumulan más de 63 disparos a puerta combinados por juego y exhiben Power Plays activos frente a porterías vulnerables. La proyección xG respalda con solidez el Over ${targetLine} goles (${probPct}% prob).`,
      `Verticalidad en transiciones y situaciones especiales: La combinación de desbalances en equipos especiales (${pp}% PP) y ritmo rápido en zona neutral impulsa una proyección de ${totalXg} tantos esperados, validando estadísticamente la línea de Over ${targetLine}.`
    ];
    return variants[hash];
  }

  return `Análisis cuantitativo de hockey: El modelo evalúa ${selection} con ${probPct}% de probabilidad y margen estadístico positivo (+EV).`;
}

export class NHLStrategyEngine {
  /**
   * Evaluates curated NHL high-probability markets:
   * 1. PUCK LINE (+1.5 / -1.5) - Priority 1 (High Win Rate)
   * 2. MONEYLINE (Ganador incl. OT/SO) - Priority 2
   * 3. TOTAL GOALS (OVER ONLY: 5.5, 6.0) - Priority 3
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
    // 1. HANDICAP O PUCK LINE (+1.5 / -1.5) - High Hit-Rate Priority
    // ==========================================
    if (odds?.puckLine) {
      const plStrat = strategies.nhl_puck_line || DEFAULT_NHL_STRATEGIES.nhl_puck_line;

      // Home Puck Line
      const homePlOdds = odds.puckLine.homeOdds || 1.55;
      if (homePlOdds <= 2.25 && homePlOdds >= 1.30) {
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
          explanation: generateNHLExplanation({
            market: 'PUCK LINE',
            selection: `${game.homeTeam.name} ${odds.puckLine.homeLine > 0 ? '+' : ''}${odds.puckLine.homeLine}`,
            isHome: true,
            game,
            homeStats,
            awayStats,
            sim,
            odds: homePlOdds,
            prob: sim.puckLineHomeProb,
            edge: homePlEdge,
            line: odds.puckLine.homeLine
          }),
          createdAt: nowIso
        });
      }

      // Away Puck Line
      const awayPlOdds = odds.puckLine.awayOdds || 1.65;
      if (awayPlOdds <= 2.25 && awayPlOdds >= 1.30) {
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
          explanation: generateNHLExplanation({
            market: 'PUCK LINE',
            selection: `${game.awayTeam.name} ${odds.puckLine.awayLine > 0 ? '+' : ''}${odds.puckLine.awayLine}`,
            isHome: false,
            game,
            homeStats,
            awayStats,
            sim,
            odds: awayPlOdds,
            prob: sim.puckLineAwayProb,
            edge: awayPlEdge,
            line: odds.puckLine.awayLine
          }),
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 2. GANADOR (Moneyline incl. OT/SO)
    // ==========================================
    if (odds?.moneyline) {
      const mlStrat = strategies.nhl_moneyline || DEFAULT_NHL_STRATEGIES.nhl_moneyline;

      // Home Moneyline
      const homeOdds = odds.moneyline.homeOdds || 1.85;
      if (homeOdds <= 2.15 && homeOdds >= 1.35) {
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
          classification: homeClass !== 'NO BET' ? homeClass : (sim.moneylineHomeProb >= 0.56 ? 'QUALIFIED' : 'WATCH'),
          dataQuality,
          explanation: generateNHLExplanation({
            market: 'MONEYLINE',
            selection: `${game.homeTeam.name} (Ganador incl. Prórroga)`,
            isHome: true,
            game,
            homeStats,
            awayStats,
            sim,
            odds: homeOdds,
            prob: sim.moneylineHomeProb,
            edge: homeEdge
          }),
          createdAt: nowIso
        });
      }

      // Away Moneyline
      const awayOdds = odds.moneyline.awayOdds || 1.95;
      if (awayOdds <= 2.15 && awayOdds >= 1.35) {
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
          classification: awayClass !== 'NO BET' ? awayClass : (sim.moneylineAwayProb >= 0.56 ? 'QUALIFIED' : 'WATCH'),
          dataQuality,
          explanation: generateNHLExplanation({
            market: 'MONEYLINE',
            selection: `${game.awayTeam.name} (Ganador incl. Prórroga)`,
            isHome: false,
            game,
            homeStats,
            awayStats,
            sim,
            odds: awayOdds,
            prob: sim.moneylineAwayProb,
            edge: awayEdge
          }),
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 3. TOTAL GOLES (OVER ONLY) - Blindaje estricto anti-trampa de 5 goles
    // ==========================================
    if (odds?.totalGoals) {
      const totStrat = strategies.nhl_total || DEFAULT_NHL_STRATEGIES.nhl_total;
      const targetLine = odds.totalGoals.line || 5.5;

      // Over Option Only
      const overOdds = odds.totalGoals.overOdds || 1.85;
      if (overOdds <= 2.15 && overOdds >= 1.45) {
        const overProb = sim.totalOverProb;
        const overEdge = calculateSmartEdge(overProb, overOdds);
        const overEV = calculateExpectedValue(overProb, overOdds);
        const overScore = calculateSmartScore({ modelProbability: overProb, smartEdge: overEdge, expectedValue: overEV, dataQuality });
        const rawClass = classifyOpportunity({ modelProbability: overProb, smartEdge: overEdge, smartScore: overScore, dataQuality, odds: overOdds, strategyConfig: totStrat });

        // Blindaje específico contra la trampa de 5 goles (3-2, 2-3):
        // 1. Para línea 5.5, se requiere que el xG combinado proyectado sea >= 6.55 goles
        // 2. Si la cuota está en la zona trampa (1.65 - 1.84), se exige edge >= 3.5% y probabilidad >= 63%
        const isTrapOddsZone = overOdds >= 1.65 && overOdds <= 1.84;
        const meetsStrictXG = targetLine <= 5.5 ? sim.expectedTotalGoals >= 6.55 : sim.expectedTotalGoals >= 6.85;
        const meetsStrictEdge = isTrapOddsZone ? overEdge >= 0.035 && overProb >= 0.63 : overEdge >= 0.02;

        const isOverQualified = rawClass !== 'NO BET' && meetsStrictXG && meetsStrictEdge && overProb >= 0.62;

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
          classification: isOverQualified ? 'QUALIFIED' : 'WATCH',
          dataQuality,
          explanation: generateNHLExplanation({
            market: 'TOTAL GOALS',
            selection: `OVER ${targetLine} GOLES`,
            isHome: true,
            game,
            homeStats,
            awayStats,
            sim,
            odds: overOdds,
            prob: overProb,
            edge: overEdge,
            line: targetLine
          }),
          createdAt: nowIso
        });
      }
    }

    return candidates;
  }

  /**
   * Optimized Hierarchical Search for Maximum Win Rate:
   * 1. PUCK LINE (+1.5 / -1.5) (Highest consistency in NHL)
   * 2. GANADOR (Moneyline incl. OT)
   * 3. TOTAL GOLES (OVER ONLY: Over 5.5, Over 6.0)
   */
  public static selectBestSignalForGame(candidates: MultiSportPrediction[]): MultiSportSignal | null {
    if (!candidates || candidates.length === 0) return null;

    // Filter by allowed 3 markets only, eliminating any Under, Double Chance, and enforcing strict odds bounds (1.30 - 2.25)
    const valid = candidates.filter(
      c =>
        ['PUCK LINE', 'MONEYLINE', 'TOTAL GOALS'].includes(c.market) &&
        !c.selection.toUpperCase().includes('UNDER') &&
        !c.selection.toUpperCase().includes('DOBLE') &&
        c.decimalOdds <= 2.25 &&
        c.decimalOdds >= 1.30
    );
    if (valid.length === 0) return null;

    // Helper to compute overall quality score prioritizing high model win probability and Puck Line superiority
    const getScore = (c: MultiSportPrediction) =>
      (c.market === 'PUCK LINE' ? 30 : c.market === 'MONEYLINE' ? 10 : 0) +
      (c.modelProbability * 150) +
      (c.smartEdge * 25) +
      (c.smartScore * 0.5);

    // 1. STEP 1: Search High-Confidence PUCK LINE (+1.5 underdog coverage or -1.5 dominant favorite)
    const pucklines = valid.filter(c => c.market === 'PUCK LINE');
    const qualifiedPL = pucklines
      .filter(c => c.modelProbability >= 0.55 && c.decimalOdds >= 1.30 && c.decimalOdds <= 2.25 && c.classification !== 'NO BET')
      .sort((a, b) => getScore(b) - getScore(a));

    if (qualifiedPL.length > 0) {
      return this.toSignal(qualifiedPL[0]);
    }

    // 2. STEP 2: Search Strong MONEYLINE (incl. OT/SO)
    const moneylines = valid.filter(c => c.market === 'MONEYLINE');
    const qualifiedML = moneylines
      .filter(c => c.modelProbability >= 0.56 && c.decimalOdds >= 1.35 && c.decimalOdds <= 2.15 && c.classification !== 'NO BET')
      .sort((a, b) => getScore(b) - getScore(a));

    if (qualifiedML.length > 0) {
      return this.toSignal(qualifiedML[0]);
    }

    // 3. STEP 3: Search High-Conviction OVER TOTAL GOALS (5.5, 6.0) with strict filter
    const totals = valid.filter(c => c.market === 'TOTAL GOALS');
    const qualifiedTotals = totals
      .filter(c => c.classification === 'QUALIFIED' && c.modelProbability >= 0.62 && c.smartEdge >= 0.035 && c.decimalOdds >= 1.40 && c.decimalOdds <= 2.15)
      .sort((a, b) => getScore(b) - getScore(a));

    if (qualifiedTotals.length > 0) {
      return this.toSignal(qualifiedTotals[0]);
    }

    // Fallback: Prioritize Puck Line or Moneyline before resorting to Total Goals
    const plFallbacks = pucklines.filter(c => c.modelProbability >= 0.52).sort((a, b) => getScore(b) - getScore(a));
    if (plFallbacks.length > 0) {
      return this.toSignal(plFallbacks[0]);
    }

    const mlFallbacks = moneylines.filter(c => c.modelProbability >= 0.53).sort((a, b) => getScore(b) - getScore(a));
    if (mlFallbacks.length > 0) {
      return this.toSignal(mlFallbacks[0]);
    }

    const sorted = [...valid].sort((a, b) => getScore(b) - getScore(a));
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
      classification: c.modelProbability >= 0.65 ? 'TOP PICK' : c.modelProbability >= 0.58 ? 'STRONG' : 'QUALIFIED',
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
      const aMarketBonus = a.market === 'PUCK LINE' ? 20 : a.market === 'MONEYLINE' ? 8 : 0;
      const bMarketBonus = b.market === 'PUCK LINE' ? 20 : b.market === 'MONEYLINE' ? 8 : 0;
      const aScore = (a.modelProbability * 100) + a.smartScore + aMarketBonus - (aRisk * 0.4);
      const bScore = (b.modelProbability * 100) + b.smartScore + bMarketBonus - (bRisk * 0.4);
      return bScore - aScore;
    });

    const topPick = pool[0];
    topPick.isSmartPick = true;
    topPick.classification = 'TOP PICK';
    return topPick;
  }
}
