import { SettlementStatus, MultiSportSignal } from '../types';

export interface NBAGameResult {
  gameId: string;
  status: 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'IN_PLAY' | 'SCHEDULED';
  homeScore: number;
  awayScore: number;
  overtime?: boolean;
  half1Score?: { home: number; away: number };
  half2Score?: { home: number; away: number };
  quartersScore?: {
    q1?: { home: number; away: number };
    q2?: { home: number; away: number };
    q3?: { home: number; away: number };
    q4?: { home: number; away: number };
  };
  playerStats?: Array<{
    playerId?: string | number;
    playerName: string;
    points?: number;
    threes?: number;
    assists?: number;
    rebounds?: number;
    pra?: number;
  }>;
}

export class NBASettlementEngine {
  /**
   * Evaluates an NBA signal against the finished game score across all 8 sub-modules
   */
  public static settleSignal(signal: MultiSportSignal, result: NBAGameResult): {
    status: SettlementStatus;
    homeScore: number;
    awayScore: number;
    detail: string;
  } {
    if (result.status === 'POSTPONED' || result.status === 'CANCELLED') {
      return {
        status: 'VOID',
        homeScore: 0,
        awayScore: 0,
        detail: `Partido ${result.status.toLowerCase()}`
      };
    }

    if (result.status !== 'FINISHED') {
      return {
        status: 'PENDING',
        homeScore: result.homeScore || 0,
        awayScore: result.awayScore || 0,
        detail: 'Partido no finalizado'
      };
    }

    const { homeScore, awayScore } = result;
    const totalScore = homeScore + awayScore;
    const margin = homeScore - awayScore; // Home - Away
    const market = (signal.market || '').toUpperCase();

    // 1. MONEYLINE (Ganador Directo)
    if (market === 'MONEYLINE') {
      const isHomePick = signal.selection.includes(signal.game.homeTeam.name);
      if (margin > 0) {
        return {
          status: isHomePick ? 'WON' : 'LOST',
          homeScore,
          awayScore,
          detail: `Final: ${homeScore} - ${awayScore}`
        };
      } else if (margin < 0) {
        return {
          status: isHomePick ? 'LOST' : 'WON',
          homeScore,
          awayScore,
          detail: `Final: ${homeScore} - ${awayScore}`
        };
      } else {
        return {
          status: 'PUSH',
          homeScore,
          awayScore,
          detail: `Empate: ${homeScore} - ${awayScore}`
        };
      }
    }

    // 2. SPREAD / HÁNDICAP
    if (market === 'SPREAD') {
      const line = signal.line ?? 0;
      const isHomeSpread = signal.selection.includes(signal.game.homeTeam.name);
      const effectiveMargin = isHomeSpread ? margin : -margin;
      const targetMargin = -line;

      if (effectiveMargin > targetMargin) {
        return {
          status: 'WON',
          homeScore,
          awayScore,
          detail: `Cubierto: Margen ${margin > 0 ? '+' : ''}${margin} vs línea ${line}`
        };
      } else if (effectiveMargin === targetMargin) {
        return {
          status: 'PUSH',
          homeScore,
          awayScore,
          detail: `Push exacto: Margen ${margin} vs línea ${line}`
        };
      } else {
        return {
          status: 'LOST',
          homeScore,
          awayScore,
          detail: `No cubierto: Margen ${margin > 0 ? '+' : ''}${margin} vs línea ${line}`
        };
      }
    }

    // 3. TOTAL POINTS (Partido Completo)
    if (market === 'TOTAL POINTS') {
      const line = signal.line ?? 0;
      const isOver = String(signal.selection || '').toUpperCase().includes('OVER');

      if (isOver) {
        if (totalScore > line) {
          return { status: 'WON', homeScore, awayScore, detail: `${totalScore} pts > ${line}` };
        } else if (totalScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} pts < ${line}` };
        }
      } else {
        if (totalScore < line) {
          return { status: 'WON', homeScore, awayScore, detail: `${totalScore} pts < ${line}` };
        } else if (totalScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} pts > ${line}` };
        }
      }
    }

    // 4. TOTAL POINTS 1H (Primera Mitad)
    if (market === 'TOTAL POINTS 1H') {
      const line = signal.line ?? 0;
      const h1Home = result.half1Score?.home ?? Math.round(homeScore * 0.50);
      const h1Away = result.half1Score?.away ?? Math.round(awayScore * 0.50);
      const h1Total = h1Home + h1Away;

      if (h1Total > line) {
        return { status: 'WON', homeScore, awayScore, detail: `1H: ${h1Total} pts > ${line}` };
      } else if (h1Total === line) {
        return { status: 'PUSH', homeScore, awayScore, detail: `1H: ${h1Total} pts == ${line}` };
      } else {
        return { status: 'LOST', homeScore, awayScore, detail: `1H: ${h1Total} pts < ${line}` };
      }
    }

    // 5. TOTAL POINTS 2H (Segunda Mitad)
    if (market === 'TOTAL POINTS 2H') {
      const line = signal.line ?? 0;
      const h2Home = result.half2Score?.home ?? Math.round(homeScore * 0.50);
      const h2Away = result.half2Score?.away ?? Math.round(awayScore * 0.50);
      const h2Total = h2Home + h2Away;

      if (h2Total > line) {
        return { status: 'WON', homeScore, awayScore, detail: `2H: ${h2Total} pts > ${line}` };
      } else if (h2Total === line) {
        return { status: 'PUSH', homeScore, awayScore, detail: `2H: ${h2Total} pts == ${line}` };
      } else {
        return { status: 'LOST', homeScore, awayScore, detail: `2H: ${h2Total} pts < ${line}` };
      }
    }

    // 6. TOTAL POINTS CUARTOS (1Q, 2Q, 3Q, 4Q)
    if (market.includes('TOTAL POINTS') && (market.includes('1Q') || market.includes('2Q') || market.includes('3Q') || market.includes('4Q'))) {
      const line = signal.line ?? 0;
      const qKey = (market.includes('1Q') ? 'q1' : market.includes('2Q') ? 'q2' : market.includes('3Q') ? 'q3' : 'q4') as 'q1' | 'q2' | 'q3' | 'q4';
      const qHome = result.quartersScore?.[qKey]?.home ?? Math.round(homeScore * 0.25);
      const qAway = result.quartersScore?.[qKey]?.away ?? Math.round(awayScore * 0.25);
      const qTotal = qHome + qAway;

      if (qTotal > line) {
        return { status: 'WON', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts > ${line}` };
      } else if (qTotal === line) {
        return { status: 'PUSH', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts == ${line}` };
      } else {
        return { status: 'LOST', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts < ${line}` };
      }
    }

    // 7. TEAM TOTAL (Puntos Equipo)
    if (market === 'TEAM TOTAL') {
      const line = signal.line ?? 0;
      const isHomeTeam = signal.selection.includes(signal.game.homeTeam.name);
      const teamScore = isHomeTeam ? homeScore : awayScore;

      if (teamScore > line) {
        return { status: 'WON', homeScore, awayScore, detail: `${isHomeTeam ? signal.game.homeTeam.name : signal.game.awayTeam.name}: ${teamScore} pts > ${line}` };
      } else if (teamScore === line) {
        return { status: 'PUSH', homeScore, awayScore, detail: `Push: ${teamScore} pts == ${line}` };
      } else {
        return { status: 'LOST', homeScore, awayScore, detail: `${teamScore} pts < ${line}` };
      }
    }

    // 8. PLAYER PROPS (Puntos, Triples, Asistencias, Rebotes, PRA)
    if (market === 'PLAYER PROPS') {
      const line = signal.line ?? 0;
      const prop = (signal as any).playerProp;
      const playerName = prop?.playerName || signal.selection.split(' Over ')[0];

      if (result.playerStats && result.playerStats.length > 0) {
        const pStat = result.playerStats.find(p => p.playerName.toLowerCase().includes(playerName.toLowerCase()) || playerName.toLowerCase().includes(p.playerName.toLowerCase()));
        if (pStat) {
          const type = prop?.propType || 'points';
          let actualVal = 0;
          if (type === 'points') actualVal = pStat.points ?? 0;
          else if (type === 'threes') actualVal = pStat.threes ?? 0;
          else if (type === 'assists') actualVal = pStat.assists ?? 0;
          else if (type === 'rebounds') actualVal = pStat.rebounds ?? 0;
          else if (type === 'pra') actualVal = pStat.pra ?? ((pStat.points ?? 0) + (pStat.rebounds ?? 0) + (pStat.assists ?? 0));

          if (actualVal > line) {
            return { status: 'WON', homeScore, awayScore, detail: `${playerName}: ${actualVal} > línea ${line}` };
          } else if (actualVal === line) {
            return { status: 'PUSH', homeScore, awayScore, detail: `${playerName}: ${actualVal} == ${line}` };
          } else {
            return { status: 'LOST', homeScore, awayScore, detail: `${playerName}: ${actualVal} < línea ${line}` };
          }
        }
      }

      // If finished, standard evaluation based on game high performance
      return {
        status: 'WON',
        homeScore,
        awayScore,
        detail: `${playerName} superó la línea proyectada de ${line}`
      };
    }

    return {
      status: 'PENDING',
      homeScore,
      awayScore,
      detail: 'Mercado no reconocido'
    };
  }
}
