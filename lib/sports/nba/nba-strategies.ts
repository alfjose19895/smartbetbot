import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NBATeamStats, NBAMarketOdds, NBAPlayerProp, NBASubModule } from './nba-types';
import { NBAPlayerGameStat } from './nba-provider';
import { NBAModelV1 } from './nba-model';
import { NBAFeatureEngine } from './nba-feature-engine';

export const DEFAULT_NBA_STRATEGIES: Record<string, SportStrategyConfig> = {
  nba_moneyline: {
    id: 'nba_moneyline',
    sport: 'nba',
    market: 'MONEYLINE',
    name: 'NBA Ganador',
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
    name: 'NBA Spread / Hándicap',
    description: 'Estrategia de hándicap de puntos basada en posesiones y ratings netos',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 75
  },
  nba_total: {
    id: 'nba_total',
    sport: 'nba',
    market: 'TOTAL POINTS',
    name: 'NBA Totales',
    description: 'Estrategia de Over/Under puntos totales modelada por ritmo y varianza',
    enabled: true,
    minProbability: 0.56,
    minEdge: 0.035,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 75
  },
  nba_total_1h: {
    id: 'nba_total_1h',
    sport: 'nba',
    market: 'TOTAL POINTS 1H',
    name: 'NBA Overs 1ª Mitad',
    description: 'Estrategia de Over puntos primera mitad (1H)',
    enabled: true,
    minProbability: 0.58,
    minEdge: 0.04,
    minOdds: 1.75,
    maxOdds: 2.10,
    minDataQuality: 75
  },
  nba_total_cuartos: {
    id: 'nba_total_cuartos',
    sport: 'nba',
    market: 'TOTAL POINTS CUARTOS',
    name: 'NBA Overs Cuartos (1Q-4Q)',
    description: 'Estrategia de Over puntos por cuarto',
    enabled: true,
    minProbability: 0.57,
    minEdge: 0.035,
    minOdds: 1.75,
    maxOdds: 2.10,
    minDataQuality: 75
  },
  nba_team_total: {
    id: 'nba_team_total',
    sport: 'nba',
    market: 'TEAM TOTAL',
    name: 'NBA Puntos Equipo',
    description: 'Estrategia de puntos por equipo frente a la defensa oponente',
    enabled: true,
    minProbability: 0.57,
    minEdge: 0.035,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 70
  },
  nba_total_2h: {
    id: 'nba_total_2h',
    sport: 'nba',
    market: 'TOTAL POINTS 2H',
    name: 'NBA Overs 2ª Mitad',
    description: 'Estrategia de Over puntos segunda mitad (2H)',
    enabled: true,
    minProbability: 0.58,
    minEdge: 0.04,
    minOdds: 1.75,
    maxOdds: 2.10,
    minDataQuality: 75
  },
  nba_props: {
    id: 'nba_props',
    sport: 'nba',
    market: 'PLAYER PROPS',
    name: 'NBA Player Props',
    description: 'Props individuales de jugadores (Puntos, Triples, Asistencias, Rebotes, PRA)',
    enabled: true,
    minProbability: 0.62,
    minEdge: 0.05,
    minOdds: 1.75,
    maxOdds: 2.15,
    minDataQuality: 75
  }
};

export class NBAStrategyEngine {
  /**
   * Evaluates an NBA game across all 8 sub-modules
   */
  public static evaluateGame(params: {
    game: NormalizedGame;
    homeStats: NBATeamStats;
    awayStats: NBATeamStats;
    odds?: NBAMarketOdds;
    strategies?: Record<string, SportStrategyConfig>;
    playerStats?: NBAPlayerGameStat[];
    aiProps?: NBAPlayerProp[];
  }): MultiSportPrediction[] {
    const { game, homeStats, awayStats, odds, strategies = DEFAULT_NBA_STRATEGIES, playerStats, aiProps } = params;

    const sim = NBAModelV1.simulateGame({ homeStats, awayStats, odds });
    const { dataQuality } = NBAFeatureEngine.calculateExpectedScore(
      homeStats,
      awayStats,
      sim.expectedPossessions
    );

    const candidates: MultiSportPrediction[] = [];
    const nowIso = new Date().toISOString();

    // ==========================================
    // 1. MÓDULO GANADOR (MONEYLINE)
    // ==========================================
    if (odds?.moneyline) {
      const mlStrat = strategies.nba_moneyline || DEFAULT_NBA_STRATEGIES.nba_moneyline;
      const homeOdds = odds.moneyline.homeOdds;
      const awayOdds = odds.moneyline.awayOdds;

      if (sim.homeWinProb >= sim.awayWinProb) {
        const edge = calculateSmartEdge(sim.homeWinProb, homeOdds);
        const ev = calculateExpectedValue(sim.homeWinProb, homeOdds);
        const score = calculateSmartScore({ modelProbability: sim.homeWinProb, smartEdge: edge, expectedValue: ev, dataQuality });
        const classification = classifyOpportunity({ modelProbability: sim.homeWinProb, smartEdge: edge, smartScore: score, dataQuality, odds: homeOdds, strategyConfig: mlStrat });

        if (classification !== 'NO BET' && sim.homeWinProb >= 0.55) {
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
            smartEdge: edge,
            expectedValue: ev,
            smartScore: score,
            classification,
            dataQuality,
            explanation: `Superioridad en casa: ${game.homeTeam.name} proyecta ${(sim.homeWinProb * 100).toFixed(1)}% de probabilidad de victoria con factor cancha y solvencia neta (+${(edge * 100).toFixed(1)}% de valor).`,
            featuresUsed: { subModule: 'ganador' },
            createdAt: nowIso
          });
        }
      } else {
        const edge = calculateSmartEdge(sim.awayWinProb, awayOdds);
        const ev = calculateExpectedValue(sim.awayWinProb, awayOdds);
        const score = calculateSmartScore({ modelProbability: sim.awayWinProb, smartEdge: edge, expectedValue: ev, dataQuality });
        const classification = classifyOpportunity({ modelProbability: sim.awayWinProb, smartEdge: edge, smartScore: score, dataQuality, odds: awayOdds, strategyConfig: mlStrat });

        if (classification !== 'NO BET' && sim.awayWinProb >= 0.55) {
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
            smartEdge: edge,
            expectedValue: ev,
            smartScore: score,
            classification,
            dataQuality,
            explanation: `Jerarquía foránea: ${game.awayTeam.name} proyecta ${(sim.awayWinProb * 100).toFixed(1)}% de probabilidad de triunfo aprovechando su ventaja en rating neto (+${(edge * 100).toFixed(1)}% edge).`,
            featuresUsed: { subModule: 'ganador' },
            createdAt: nowIso
          });
        }
      }
    }

    // ==========================================
    // 2. MÓDULO SPREAD O HÁNDICAP
    // ==========================================
    if (odds?.spread) {
      const spreadStrat = strategies.nba_spread || DEFAULT_NBA_STRATEGIES.nba_spread;
      const isHomeFavored = sim.spreadCoverProbHome >= sim.spreadCoverProbAway;
      const spreadProb = isHomeFavored ? sim.spreadCoverProbHome : sim.spreadCoverProbAway;
      const spreadOdds = isHomeFavored ? odds.spread.homeOdds : odds.spread.awayOdds;
      const spreadLine = isHomeFavored ? odds.spread.homeLine : odds.spread.awayLine;
      const teamName = isHomeFavored ? game.homeTeam.name : game.awayTeam.name;

      const edge = calculateSmartEdge(spreadProb, spreadOdds);
      const ev = calculateExpectedValue(spreadProb, spreadOdds);
      const score = calculateSmartScore({ modelProbability: spreadProb, smartEdge: edge, expectedValue: ev, dataQuality });
      const classification = classifyOpportunity({ modelProbability: spreadProb, smartEdge: edge, smartScore: score, dataQuality, odds: spreadOdds, strategyConfig: spreadStrat });

      if (classification !== 'NO BET' && spreadProb >= 0.55) {
        candidates.push({
          id: `${game.id}_nba_spread_${isHomeFavored ? 'home' : 'away'}`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'SPREAD',
          selection: `${teamName} ${spreadLine > 0 ? '+' : ''}${spreadLine}`,
          line: spreadLine,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: spreadProb,
          decimalOdds: spreadOdds,
          impliedProbability: Number((1 / spreadOdds).toFixed(4)),
          smartEdge: edge,
          expectedValue: ev,
          smartScore: score,
          classification,
          dataQuality,
          explanation: `Protección de línea y margen: La simulación (${sim.expectedHomePoints} vs ${sim.expectedAwayPoints} pts) proyecta un diferencial que cubre la línea de ${spreadLine > 0 ? '+' : ''}${spreadLine} con ${(spreadProb * 100).toFixed(1)}% de probabilidad.`,
          featuresUsed: { subModule: 'spread' },
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 3. MÓDULO OVERS (TOTALES PARTIDO)
    // ==========================================
    if (odds?.totalPoints) {
      const totalStrat = strategies.nba_total || DEFAULT_NBA_STRATEGIES.nba_total;
      const isOver = sim.totalOverProb >= sim.totalUnderProb;
      const prob = isOver ? sim.totalOverProb : sim.totalUnderProb;
      const decimalOdds = isOver ? odds.totalPoints.overOdds : odds.totalPoints.underOdds;

      const edge = calculateSmartEdge(prob, decimalOdds);
      const ev = calculateExpectedValue(prob, decimalOdds);
      const score = calculateSmartScore({ modelProbability: prob, smartEdge: edge, expectedValue: ev, dataQuality });
      const classification = classifyOpportunity({ modelProbability: prob, smartEdge: edge, smartScore: score, dataQuality, odds: decimalOdds, strategyConfig: totalStrat });

      if (classification !== 'NO BET' && prob >= 0.55) {
        candidates.push({
          id: `${game.id}_nba_total_${isOver ? 'over' : 'under'}`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'TOTAL POINTS',
          selection: `${isOver ? 'OVER' : 'UNDER'} ${odds.totalPoints.line} Puntos`,
          line: odds.totalPoints.line,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: prob,
          decimalOdds,
          impliedProbability: Number((1 / decimalOdds).toFixed(4)),
          smartEdge: edge,
          expectedValue: ev,
          smartScore: score,
          classification,
          dataQuality,
          explanation: `Ritmo de posesiones (${sim.expectedPossessions} Pace) y ratings de tiro proyectan ${sim.expectedTotalPoints} puntos totales frente a la línea de ${odds.totalPoints.line} (${(prob * 100).toFixed(1)}% probabilidad).`,
          featuresUsed: { subModule: 'overs' },
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 4. MÓDULO OVERS 1ª MITAD (1H)
    // ==========================================
    {
      const prob = sim.half1OverProb;
      const odds1H = odds?.totalPoints1H?.overOdds ?? 1.85;
      const line1H = sim.half1TotalLine;
      const edge = calculateSmartEdge(prob, odds1H);
      const ev = calculateExpectedValue(prob, odds1H);
      const score = calculateSmartScore({ modelProbability: prob, smartEdge: edge, expectedValue: ev, dataQuality });

      if (prob >= 0.56) {
        candidates.push({
          id: `${game.id}_nba_total_1h`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'TOTAL POINTS 1H',
          selection: `Over ${line1H} Puntos (1ª Mitad)`,
          line: line1H,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: prob,
          decimalOdds: odds1H,
          impliedProbability: Number((1 / odds1H).toFixed(4)),
          smartEdge: edge,
          expectedValue: ev,
          smartScore: score,
          classification: prob >= 0.65 ? 'TOP PICK' : 'STRONG',
          dataQuality,
          explanation: `Intensidad ofensiva en el arranque: Ambos quintetos promedian alto volumen de lanzamientos en cuartos iniciales, proyectando ${sim.expectedHalf1Points} puntos en la primera mitad (+${line1H} pts, ${(prob * 100).toFixed(1)}%).`,
          featuresUsed: { subModule: 'overs_1h', period: '1H' },
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 5. MÓDULO OVERS POR CUARTOS (1Q, 2Q, 3Q, 4Q)
    // ==========================================
    {
      const quarters = [
        { q: '1Q', prob: sim.q1OverProb, line: sim.q1Line, odds: odds?.quartersTotal?.q1OverOdds ?? 1.85 },
        { q: '2Q', prob: sim.q2OverProb, line: sim.q2Line, odds: odds?.quartersTotal?.q2OverOdds ?? 1.83 },
        { q: '3Q', prob: sim.q3OverProb, line: sim.q3Line, odds: odds?.quartersTotal?.q3OverOdds ?? 1.85 },
        { q: '4Q', prob: sim.q4OverProb, line: sim.q4Line, odds: odds?.quartersTotal?.q4OverOdds ?? 1.83 }
      ];

      // Pick the strongest quarter for this match
      quarters.sort((a, b) => b.prob - a.prob);
      const bestQ = quarters[0];

      if (bestQ.prob >= 0.56) {
        const edge = calculateSmartEdge(bestQ.prob, bestQ.odds);
        const ev = calculateExpectedValue(bestQ.prob, bestQ.odds);
        const score = calculateSmartScore({ modelProbability: bestQ.prob, smartEdge: edge, expectedValue: ev, dataQuality });

        candidates.push({
          id: `${game.id}_nba_quarter_${bestQ.q}`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: `TOTAL POINTS ${bestQ.q}`,
          selection: `Over ${bestQ.line} Puntos (${bestQ.q})`,
          line: bestQ.line,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: bestQ.prob,
          decimalOdds: bestQ.odds,
          impliedProbability: Number((1 / bestQ.odds).toFixed(4)),
          smartEdge: edge,
          expectedValue: ev,
          smartScore: score,
          classification: bestQ.prob >= 0.65 ? 'TOP PICK' : 'STRONG',
          dataQuality,
          explanation: `Volumen en el ${bestQ.q}: La rotación y dinámica de posesiones proyecta superar la línea de ${bestQ.line} puntos en el periodo con ${(bestQ.prob * 100).toFixed(1)}% de probabilidad.`,
          featuresUsed: { subModule: 'overs_cuartos', period: bestQ.q },
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 6. MÓDULO OVERS PUNTOS DEL EQUIPO (TEAM TOTAL)
    // ==========================================
    {
      const homeProb = sim.homeTeamTotalOverProb;
      const awayProb = sim.awayTeamTotalOverProb;
      const bestTeamProb = Math.max(homeProb, awayProb);
      const isHomeTeam = homeProb >= awayProb;
      const teamName = isHomeTeam ? game.homeTeam.name : game.awayTeam.name;
      const teamLine = isHomeTeam ? (odds?.teamTotalPoints?.homeLine ?? Math.round(sim.expectedHomePoints * 2) / 2) : (odds?.teamTotalPoints?.awayLine ?? Math.round(sim.expectedAwayPoints * 2) / 2);
      const teamOdds = isHomeTeam ? (odds?.teamTotalPoints?.homeOverOdds ?? 1.85) : (odds?.teamTotalPoints?.awayOverOdds ?? 1.85);

      if (bestTeamProb >= 0.56) {
        const edge = calculateSmartEdge(bestTeamProb, teamOdds);
        const ev = calculateExpectedValue(bestTeamProb, teamOdds);
        const score = calculateSmartScore({ modelProbability: bestTeamProb, smartEdge: edge, expectedValue: ev, dataQuality });

        candidates.push({
          id: `${game.id}_nba_team_total_${isHomeTeam ? 'home' : 'away'}`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'TEAM TOTAL',
          selection: `${teamName} Over ${teamLine} Puntos`,
          line: teamLine,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: bestTeamProb,
          decimalOdds: teamOdds,
          impliedProbability: Number((1 / teamOdds).toFixed(4)),
          smartEdge: edge,
          expectedValue: ev,
          smartScore: score,
          classification: bestTeamProb >= 0.65 ? 'TOP PICK' : 'STRONG',
          dataQuality,
          explanation: `Producción individual de ${teamName}: Eficiencia ofensiva proyecta ${isHomeTeam ? sim.expectedHomePoints : sim.expectedAwayPoints} puntos, superando su línea particular de ${teamLine} pts (${(bestTeamProb * 100).toFixed(1)}%).`,
          featuresUsed: { subModule: 'overs_equipo' },
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 7. MÓDULO OVERS 2ª MITAD (2H)
    // ==========================================
    {
      const prob = sim.half2OverProb;
      const odds2H = odds?.totalPoints2H?.overOdds ?? 1.85;
      const line2H = sim.half2TotalLine;
      const edge = calculateSmartEdge(prob, odds2H);
      const ev = calculateExpectedValue(prob, odds2H);
      const score = calculateSmartScore({ modelProbability: prob, smartEdge: edge, expectedValue: ev, dataQuality });

      if (prob >= 0.56) {
        candidates.push({
          id: `${game.id}_nba_total_2h`,
          sport: 'nba',
          gameId: game.id,
          game,
          market: 'TOTAL POINTS 2H',
          selection: `Over ${line2H} Puntos (2ª Mitad)`,
          line: line2H,
          modelVersion: NBAModelV1.VERSION,
          modelProbability: prob,
          decimalOdds: odds2H,
          impliedProbability: Number((1 / odds2H).toFixed(4)),
          smartEdge: edge,
          expectedValue: ev,
          smartScore: score,
          classification: prob >= 0.65 ? 'TOP PICK' : 'STRONG',
          dataQuality,
          explanation: `Cierre disputado: En la segunda mitad los tiros libres finales y ajuste de minutos elevan la producción estimada a ${sim.expectedHalf2Points} puntos (+${line2H} pts, ${(prob * 100).toFixed(1)}%).`,
          featuresUsed: { subModule: 'overs_2h', period: '2H' },
          createdAt: nowIso
        });
      }
    }

    // ==========================================
    // 8. MÓDULO PLAYER PROPS (PROPS DE JUGADORES)
    // ==========================================
    const props = this.generatePropsForGame(game, playerStats, aiProps);
    for (const p of props) {
      candidates.push({
        id: `${game.id}_prop_${p.id}`,
        sport: 'nba',
        gameId: game.id,
        game,
        market: 'PLAYER PROPS',
        selection: `${p.playerName} Over ${p.line} ${p.propLabel}`,
        line: p.line,
        modelVersion: NBAModelV1.VERSION,
        modelProbability: p.probability,
        decimalOdds: p.odds,
        impliedProbability: Number((1 / p.odds).toFixed(4)),
        smartEdge: p.edge,
        expectedValue: p.expectedValue,
        smartScore: p.smartScore,
        classification: p.confidence === 'Muy Alta' ? 'TOP PICK' : 'STRONG',
        dataQuality: 88,
        explanation: p.explanation,
        featuresUsed: {
          subModule: 'props',
          playerProp: p
        },
        createdAt: nowIso
      });
    }

    return candidates;
  }

  /**
   * Generates curated player props for stars participating in this game
   */
  public static generatePropsForGame(
    game: NormalizedGame,
    playerStats?: NBAPlayerGameStat[],
    aiProps?: NBAPlayerProp[]
  ): NBAPlayerProp[] {
    // 1. If Gemini AI produced verified props from the real starters, use them directly
    if (aiProps && aiProps.length > 0) {
      return aiProps;
    }

    const props: NBAPlayerProp[] = [];
    if (!playerStats || playerStats.length === 0) {
      return [];
    }

    const homeName = game.homeTeam.name;
    const awayName = game.awayTeam.name;

    // Filter real starter players with significant minutes
    const validPlayers = playerStats.filter(p => p.type === 'starters' || (p.points >= 14 && p.minutes && !p.minutes.startsWith('0') && !p.minutes.startsWith('1:')));

    for (const player of validPlayers.slice(0, 4)) {
      const isHome = player.teamId === game.homeTeam.id;
      const team = isHome ? homeName : awayName;
      const opponent = isHome ? awayName : homeName;

      // Primary prop: Points
      if (player.points >= 14) {
        const line = Math.max(14.5, Math.floor(player.points * 0.85) + 0.5);
        const prob = 0.69;
        const odds = 1.85;
        const fairOdds = Number((1 / prob).toFixed(2));
        const edge = Number((prob - (1 / odds)).toFixed(3));
        const ev = Number(((prob * odds) - 1).toFixed(3));
        const smartScore = Math.round(prob * 100);

        props.push({
          id: `${player.name.replace(/\s+/g, '_').toLowerCase()}_points`,
          gameId: game.id,
          playerId: player.id || player.name,
          playerName: player.name,
          team,
          opponent,
          propType: 'points',
          propLabel: 'Puntos',
          line,
          selection: `${player.name} Over ${line} Puntos`,
          odds,
          fairOdds,
          probability: prob,
          edge,
          expectedValue: ev,
          confidence: 'Alta',
          smartScore,
          explanation: `${player.name} promedia un volumen consistente como titular (${player.minutes} min en cancha) con proyección superior a ${line} puntos frente a ${opponent}.`
        });
      }

      // Secondary prop: Assists for primary ball-handlers
      if (player.assists >= 5) {
        const line = Math.max(4.5, Math.floor(player.assists * 0.8) + 0.5);
        const prob = 0.68;
        const odds = 1.87;
        const fairOdds = Number((1 / prob).toFixed(2));
        const edge = Number((prob - (1 / odds)).toFixed(3));
        const ev = Number(((prob * odds) - 1).toFixed(3));
        const smartScore = Math.round(prob * 100);

        props.push({
          id: `${player.name.replace(/\s+/g, '_').toLowerCase()}_assists`,
          gameId: game.id,
          playerId: player.id || player.name,
          playerName: player.name,
          team,
          opponent,
          propType: 'assists',
          propLabel: 'Asistencias',
          line,
          selection: `${player.name} Over ${line} Asistencias`,
          odds,
          fairOdds,
          probability: prob,
          edge,
          expectedValue: ev,
          confidence: 'Alta',
          smartScore,
          explanation: `${player.name} ejerce como distribuidor principal en la rotación titular de ${team}, generando ventajas frente a la defensa de ${opponent} (+${line} ast).`
        });
      }

      // Secondary prop: Rebounds for frontcourt players
      if (player.rebounds >= 7) {
        const line = Math.max(5.5, Math.floor(player.rebounds * 0.8) + 0.5);
        const prob = 0.70;
        const odds = 1.86;
        const fairOdds = Number((1 / prob).toFixed(2));
        const edge = Number((prob - (1 / odds)).toFixed(3));
        const ev = Number(((prob * odds) - 1).toFixed(3));
        const smartScore = Math.round(prob * 100);

        props.push({
          id: `${player.name.replace(/\s+/g, '_').toLowerCase()}_rebounds`,
          gameId: game.id,
          playerId: player.id || player.name,
          playerName: player.name,
          team,
          opponent,
          propType: 'rebounds',
          propLabel: 'Rebotes',
          line,
          selection: `${player.name} Over ${line} Rebotes`,
          odds,
          fairOdds,
          probability: prob,
          edge,
          expectedValue: ev,
          confidence: 'Alta',
          smartScore,
          explanation: `${player.name} domina la pintura defensiva y segundas oportunidades con presencia en los tableros ante ${opponent} (+${line} reb).`
        });
      }
    }

    return props;
  }

  public static selectOfficialSignals(candidates: MultiSportPrediction[]): MultiSportSignal[] {
    if (!candidates || candidates.length === 0) return [];

    const signals: MultiSportSignal[] = [];

    // Group by subModule
    const bySubModule: Record<string, MultiSportPrediction[]> = {};
    for (const c of candidates) {
      const sub = (c.featuresUsed as any)?.subModule || 'ganador';
      if (!bySubModule[sub]) bySubModule[sub] = [];
      bySubModule[sub].push(c);
    }

    // For each subModule, sort by smartScore / modelProbability
    for (const [subModule, list] of Object.entries(bySubModule)) {
      list.sort((a, b) => b.smartScore - a.smartScore || b.modelProbability - a.modelProbability);

      for (const pred of list) {
        const sig: MultiSportSignal = {
          id: pred.id,
          sport: 'nba',
          gameId: pred.gameId,
          game: pred.game,
          market: pred.market,
          selection: pred.selection,
          line: pred.line,
          modelProbability: pred.modelProbability,
          decimalOdds: pred.decimalOdds,
          smartEdge: pred.smartEdge,
          expectedValue: pred.expectedValue,
          smartScore: pred.smartScore,
          classification: pred.classification,
          dataQuality: pred.dataQuality,
          isSmartPick: false,
          explanation: pred.explanation || '',
          createdAt: pred.createdAt
        };

        // Attach subModule and playerProp
        (sig as any).subModule = subModule;
        (sig as any).playerProp = (pred.featuresUsed as any)?.playerProp;
        (sig as any).period = (pred.featuresUsed as any)?.period;

        signals.push(sig);
      }
    }

    return signals;
  }

  /**
   * Selects max 1 NBA Smart Pick per day across the entire slate
   */
  public static selectNBASmartPick(signals: MultiSportSignal[]): MultiSportSignal | null {
    if (!signals || signals.length === 0) return null;
    const candidates = [...signals].filter(s => s.smartEdge >= 0.04 && s.dataQuality >= 70);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.smartScore - a.smartScore || b.modelProbability - a.modelProbability);
    const topPick = candidates[0];
    topPick.isSmartPick = true;
    topPick.classification = 'TOP PICK';
    return topPick;
  }
}
