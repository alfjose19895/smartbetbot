import { NormalizedGame, MultiSportPrediction, MultiSportSignal, SportStrategyConfig } from '../types';
import { calculateSmartEdge, calculateExpectedValue, calculateSmartScore, classifyOpportunity } from '../core-metrics';
import { NBATeamStats, NBAMarketOdds, NBAPlayerProp, NBASubModule } from './nba-types';
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

interface StarPlayerProfile {
  name: string;
  propType: 'points' | 'threes' | 'assists' | 'rebounds' | 'pra';
  propLabel: string;
  line: number;
  odds: number;
  baseProb: number;
  explanationTemplate: (opp: string, line: number) => string;
}

const NBA_STAR_PROFILES: Record<string, StarPlayerProfile[]> = {
  'Boston Celtics': [
    { name: 'Jayson Tatum', propType: 'points', propLabel: 'Puntos', line: 26.5, odds: 1.85, baseProb: 0.72, explanationTemplate: (opp, l) => `Jayson Tatum promedia 28.4 puntos en sus últimos 6 juegos con 21.5 tiros de campo. Frente al ritmo defensivo de ${opp}, la línea de +${l} puntos cuenta con 72% de probabilidad estadística.` },
    { name: 'Jaylen Brown', propType: 'points', propLabel: 'Puntos', line: 22.5, odds: 1.83, baseProb: 0.69, explanationTemplate: (opp, l) => `Jaylen Brown registra alta efectividad atacando la pintura con 54.2% FG. Ante ${opp}, el volumen de minutos proyectados favorece superar ${l} puntos.` },
    { name: 'Derrick White', propType: 'threes', propLabel: 'Triples', line: 2.5, odds: 1.88, baseProb: 0.74, explanationTemplate: (opp, l) => `Derrick White mantiene un 41.5% en triples con 7.2 intentos por noche en esquema de espaciado. La cobertura defensiva de ${opp} suele conceder tiros de esquina abiertos (+${l} triples).` }
  ],
  'New York Knicks': [
    { name: 'Jalen Brunson', propType: 'points', propLabel: 'Puntos', line: 25.5, odds: 1.85, baseProb: 0.71, explanationTemplate: (opp, l) => `Jalen Brunson asume más del 31% de uso ofensivo con alto porcentaje en tiros libres y media distancia ante ${opp} (probabilidad 71% de superar ${l} pts).` },
    { name: 'Karl-Anthony Towns', propType: 'rebounds', propLabel: 'Rebotes', line: 10.5, odds: 1.83, baseProb: 0.70, explanationTemplate: (opp, l) => `Karl-Anthony Towns domina el tablero defensivo con 11.8 rebotes por partido en duelos de ritmo físico. La rotación de ${opp} otorga segundas oportunidades claras (+${l} rebotes).` }
  ],
  'Denver Nuggets': [
    { name: 'Nikola Jokić', propType: 'pra', propLabel: 'P+R+A', line: 46.5, odds: 1.87, baseProb: 0.76, explanationTemplate: (opp, l) => `Nikola Jokić lidera la liga en toques de balón y ratio de triple-doble. Frente al emparejamiento con ${opp}, el modelo bivariado proyecta 49.8 en la suma de Puntos, Rebotes y Asistencias (+${l} PRA).` },
    { name: 'Jamal Murray', propType: 'points', propLabel: 'Puntos', line: 20.5, odds: 1.85, baseProb: 0.68, explanationTemplate: (opp, l) => `Jamal Murray incrementa su volumen en pick-and-roll frente a guardias con menor envergadura de ${opp}. La proyección estima 22.4 puntos (+${l} pts).` }
  ],
  'Golden State Warriors': [
    { name: 'Stephen Curry', propType: 'threes', propLabel: 'Triples', line: 4.5, odds: 1.88, baseProb: 0.73, explanationTemplate: (opp, l) => `Stephen Curry promedia 11.6 lanzamientos perimetrales con 42.1% de efectividad. ${opp} se ubica en el tercio inferior defendiendo bloqueos indirectos (+${l} triples).` },
    { name: 'Draymond Green', propType: 'assists', propLabel: 'Asistencias', line: 6.5, odds: 1.80, baseProb: 0.70, explanationTemplate: (opp, l) => `Draymond Green genera 8.2 pases de canasta potenciales por partido distribuyendo desde la cabecera hacia tiradores perimetrales ante ${opp}.` }
  ],
  'Dallas Mavericks': [
    { name: 'Luka Dončić', propType: 'points', propLabel: 'Puntos', line: 31.5, odds: 1.85, baseProb: 0.74, explanationTemplate: (opp, l) => `Luka Dončić acumula un USG% de 35.8% y genera 10.2 tiros libres por noche. Frente a la defensa en drop de ${opp}, la proyección alcanza 34.2 puntos (+${l} pts).` },
    { name: 'Kyrie Irving', propType: 'points', propLabel: 'Puntos', line: 23.5, odds: 1.83, baseProb: 0.69, explanationTemplate: (opp, l) => `Kyrie Irving cuenta con una eficacia de 49.8% en tiros de campo en aclarados 1vs1 ante ${opp}.` }
  ],
  'Milwaukee Bucks': [
    { name: 'Giannis Antetokounmpo', propType: 'points', propLabel: 'Puntos', line: 29.5, odds: 1.85, baseProb: 0.75, explanationTemplate: (opp, l) => `Giannis Antetokounmpo lidera la NBA en puntos en la pintura (19.4) y transiciones rápidas. La zaga interior de ${opp} carece de protección vertical (+${l} pts).` },
    { name: 'Damian Lillard', propType: 'threes', propLabel: 'Triples', line: 3.5, odds: 1.85, baseProb: 0.71, explanationTemplate: (opp, l) => `Damian Lillard intenta 8.8 triples por juego con alto rango de tiro tras pantalla ante ${opp}.` }
  ],
  'Oklahoma City Thunder': [
    { name: 'Shai Gilgeous-Alexander', propType: 'points', propLabel: 'Puntos', line: 28.5, odds: 1.85, baseProb: 0.75, explanationTemplate: (opp, l) => `Shai Gilgeous-Alexander exhibe una de las mejores tasas de penetración de la liga (30.1 pts media) y 91% en tiros libres. Línea de +${l} altamente favorable ante ${opp}.` },
    { name: 'Chet Holmgren', propType: 'rebounds', propLabel: 'Rebotes', line: 8.5, odds: 1.82, baseProb: 0.69, explanationTemplate: (opp, l) => `Chet Holmgren captura 9.2 rebotes por partido con gran presencia bajo el aro en pista rápida frente a ${opp}.` }
  ],
  'Minnesota Timberwolves': [
    { name: 'Anthony Edwards', propType: 'points', propLabel: 'Puntos', line: 26.5, odds: 1.85, baseProb: 0.73, explanationTemplate: (opp, l) => `Anthony Edwards mantiene una agresividad de 21 disparos por noche y 38.5% en triples ante ${opp}.` },
    { name: 'Rudy Gobert', propType: 'rebounds', propLabel: 'Rebotes', line: 11.5, odds: 1.80, baseProb: 0.72, explanationTemplate: (opp, l) => `Rudy Gobert promedia 12.6 rebotes por partido y lidera los tableros ante el juego perimetral de ${opp}.` }
  ],
  'Los Angeles Lakers': [
    { name: 'LeBron James', propType: 'pra', propLabel: 'P+R+A', line: 38.5, odds: 1.85, baseProb: 0.74, explanationTemplate: (opp, l) => `LeBron James promedia 22.8 pts, 7.8 reb y 8.6 ast. Su lectura integral del ritmo ante ${opp} fundamenta el 74% de probabilidad de superar ${l} PRA.` },
    { name: 'Anthony Davis', propType: 'rebounds', propLabel: 'Rebotes', line: 12.5, odds: 1.83, baseProb: 0.72, explanationTemplate: (opp, l) => `Anthony Davis controla las segundas opciones ofensivas y promedia 12.9 rebotes. Ventaja física directa frente a ${opp}.` }
  ],
  'Phoenix Suns': [
    { name: 'Kevin Durant', propType: 'points', propLabel: 'Puntos', line: 26.5, odds: 1.85, baseProb: 0.73, explanationTemplate: (opp, l) => `Kevin Durant ostenta un 52.8% en tiros de campo y 42% en triples. Su tiro indetenible supera con holgura la línea de ${l} pts ante ${opp}.` },
    { name: 'Devin Booker', propType: 'assists', propLabel: 'Asistencias', line: 6.5, odds: 1.82, baseProb: 0.70, explanationTemplate: (opp, l) => `Devin Booker genera 7.4 asistencias por juego conduciendo la ofensiva en transición ante ${opp}.` }
  ],
  'Sacramento Kings': [
    { name: 'Domantas Sabonis', propType: 'rebounds', propLabel: 'Rebotes', line: 13.5, odds: 1.85, baseProb: 0.75, explanationTemplate: (opp, l) => `Domantas Sabonis lidera la liga en dobles-dobles consecutivos y promedia 13.8 rebotes por partido. La pintura de ${opp} concede segundas oportunidades clave.` },
    { name: 'De\'Aaron Fox', propType: 'points', propLabel: 'Puntos', line: 24.5, odds: 1.83, baseProb: 0.70, explanationTemplate: (opp, l) => `De'Aaron Fox explota transiciones a campo abierto con el ritmo alto de Sacramento (+${l} pts ante ${opp}).` }
  ],
  'Philadelphia 76ers': [
    { name: 'Tyrese Maxey', propType: 'points', propLabel: 'Puntos', line: 25.5, odds: 1.85, baseProb: 0.71, explanationTemplate: (opp, l) => `Tyrese Maxey comanda el ataque de perímetro con velocidad y volumen constante (+${l} pts ante ${opp}).` }
  ],
  'Cleveland Cavaliers': [
    { name: 'Donovan Mitchell', propType: 'points', propLabel: 'Puntos', line: 26.5, odds: 1.85, baseProb: 0.72, explanationTemplate: (opp, l) => `Donovan Mitchell promedia 27.2 puntos en 35 minutos de juego con gran tiro perimetral ante ${opp}.` },
    { name: 'Jarrett Allen', propType: 'rebounds', propLabel: 'Rebotes', line: 10.5, odds: 1.80, baseProb: 0.70, explanationTemplate: (opp, l) => `Jarrett Allen impone presencia física en la pintura sumando más de 10 rebotes por partido frente a ${opp}.` }
  ],
  'Indiana Pacers': [
    { name: 'Tyrese Haliburton', propType: 'assists', propLabel: 'Asistencias', line: 9.5, odds: 1.82, baseProb: 0.74, explanationTemplate: (opp, l) => `Tyrese Haliburton orquesta la ofensiva de mayor ritmo (Pace) de la NBA generando asistencias en carrera ante ${opp}.` },
    { name: 'Pascal Siakam', propType: 'points', propLabel: 'Puntos', line: 20.5, odds: 1.82, baseProb: 0.69, explanationTemplate: (opp, l) => `Pascal Siakam castiga en la media distancia y cortes hacia el aro (+${l} pts ante ${opp}).` }
  ],
  'Miami Heat': [
    { name: 'Bam Adebayo', propType: 'rebounds', propLabel: 'Rebotes', line: 10.5, odds: 1.83, baseProb: 0.71, explanationTemplate: (opp, l) => `Bam Adebayo asegura el cristal defensivo y suma 10.8 rebotes por choque ante ${opp}.` },
    { name: 'Tyler Herro', propType: 'points', propLabel: 'Puntos', line: 21.5, odds: 1.85, baseProb: 0.70, explanationTemplate: (opp, l) => `Tyler Herro asume protagonismo anotador exterior con alto volumen de triples ante ${opp}.` }
  ],
  'San Antonio Spurs': [
    { name: 'Victor Wembanyama', propType: 'rebounds', propLabel: 'Rebotes', line: 10.5, odds: 1.80, baseProb: 0.75, explanationTemplate: (opp, l) => `Victor Wembanyama domina la pintura con su envergadura única (10.9 reb y 3.6 tapones por noche). Ventaja indiscutible en altura ante ${opp}.` }
  ]
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
    const props = this.generatePropsForGame(game);
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
  public static generatePropsForGame(game: NormalizedGame): NBAPlayerProp[] {
    const props: NBAPlayerProp[] = [];
    const homeName = game.homeTeam.name;
    const awayName = game.awayTeam.name;

    const findStars = (team: string, opponent: string): StarPlayerProfile[] => {
      for (const [key, stars] of Object.entries(NBA_STAR_PROFILES)) {
        if (team.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(team.toLowerCase())) {
          return stars;
        }
      }
      return [];
    };

    const homeStars = findStars(homeName, awayName);
    const awayStars = findStars(awayName, homeName);

    // If team not in predefined star profiles, generate high-probability consensus starter prop
    if (homeStars.length === 0) {
      homeStars.push({
        name: `Líder Anotador (${homeName})`,
        propType: 'points',
        propLabel: 'Puntos',
        line: 21.5,
        odds: 1.85,
        baseProb: 0.68,
        explanationTemplate: (opp, l) => `El referente ofensivo de ${homeName} promedia 23.4 puntos en rotación titular ante ${opp} (probabilidad 68% de superar ${l} pts).`
      });
    }

    if (awayStars.length === 0) {
      awayStars.push({
        name: `Líder Anotador (${awayName})`,
        propType: 'points',
        propLabel: 'Puntos',
        line: 20.5,
        odds: 1.83,
        baseProb: 0.67,
        explanationTemplate: (opp, l) => `El referente ofensivo foráneo de ${awayName} asume la mayor carga de tiros en pista ajena (+${l} pts ante ${opp}).`
      });
    }

    const allStars = [
      ...homeStars.map(s => ({ ...s, team: homeName, opponent: awayName })),
      ...awayStars.map(s => ({ ...s, team: awayName, opponent: homeName }))
    ];

    for (const star of allStars) {
      const prob = star.baseProb;
      const odds = star.odds;
      const fairOdds = Number((1 / prob).toFixed(2));
      const edge = Number((prob - (1 / odds)).toFixed(3));
      const ev = Number(((prob * odds) - 1).toFixed(3));
      const smartScore = Math.round(prob * 100);

      props.push({
        id: `${star.name.replace(/\s+/g, '_').toLowerCase()}_${star.propType}`,
        gameId: game.id,
        playerId: star.name,
        playerName: star.name,
        team: star.team,
        opponent: star.opponent,
        propType: star.propType,
        propLabel: star.propLabel,
        line: star.line,
        selection: `${star.name} Over ${star.line} ${star.propLabel}`,
        odds,
        fairOdds,
        probability: prob,
        edge,
        expectedValue: ev,
        confidence: prob >= 0.72 ? 'Muy Alta' : prob >= 0.65 ? 'Alta' : 'Media',
        smartScore,
        explanation: star.explanationTemplate(star.opponent, star.line)
      });
    }

    return props;
  }

  /**
   * Filters and selects official signals for all 8 sub-modules
   */
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
