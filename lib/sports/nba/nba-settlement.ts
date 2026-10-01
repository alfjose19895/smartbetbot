import { SettlementStatus, MultiSportSignal } from '../types';

export interface NBAGameResult {
  gameId: string;
  status: 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'IN_PLAY' | 'SCHEDULED';
  homeScore: number;
  awayScore: number;
  overtime?: boolean;
}

export class NBASettlementEngine {
  /**
   * Evaluates an NBA signal against the finished game score
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

    // 1. MONEYLINE
    if (signal.market === 'MONEYLINE') {
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

    // 2. SPREAD
    if (signal.market === 'SPREAD') {
      const line = signal.line ?? 0;
      const isHomeSpread = signal.selection.includes(signal.game.homeTeam.name);
      // Example: Home -5.5 -> Home needs margin > 5.5
      // Away +5.5 -> Away needs margin > -5.5 (or awayScore + 5.5 > homeScore)
      const effectiveMargin = isHomeSpread ? margin : -margin;
      const targetMargin = -line; // if line is -5.5, targetMargin is 5.5

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

    // 3. TOTAL POINTS
    if (signal.market === 'TOTAL POINTS') {
      const line = signal.line ?? 0;
      const isOver = signal.selection.toUpperCase().includes('OVER');

      if (isOver) {
        if (totalScore > line) {
          return { status: 'WON', homeScore, awayScore, detail: `${totalScore} pts > ${line}` };
        } else if (totalScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} pts < ${line}` };
        }
      } else {
        // Under
        if (totalScore < line) {
          return { status: 'WON', homeScore, awayScore, detail: `${totalScore} pts < ${line}` };
        } else if (totalScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} pts > ${line}` };
        }
      }
    }

    // 4. TEAM TOTAL
    if (signal.market === 'TEAM TOTAL') {
      const line = signal.line ?? 0;
      const isHomeTeam = signal.selection.includes(signal.game.homeTeam.name);
      const teamScore = isHomeTeam ? homeScore : awayScore;
      const isOver = signal.selection.toUpperCase().includes('OVER');

      if (isOver) {
        if (teamScore > line) {
          return { status: 'WON', homeScore, awayScore, detail: `${teamScore} pts > ${line}` };
        } else if (teamScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${teamScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${teamScore} pts < ${line}` };
        }
      } else {
        if (teamScore < line) {
          return { status: 'WON', homeScore, awayScore, detail: `${teamScore} pts < ${line}` };
        } else if (teamScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${teamScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${teamScore} pts > ${line}` };
        }
      }
    }

    return {
      status: 'PENDING',
      homeScore,
      awayScore,
      detail: 'Mercado no reconocido'
    };
  }
}
