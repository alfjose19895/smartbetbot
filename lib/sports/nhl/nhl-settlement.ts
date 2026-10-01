import { SettlementStatus, MultiSportSignal } from '../types';

export interface NHLGameResult {
  gameId: string;
  status: 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'IN_PLAY' | 'SCHEDULED';
  homeScore: number;
  awayScore: number;
  regulationHomeScore?: number;
  regulationAwayScore?: number;
  overtime?: boolean;
  shootout?: boolean;
}

export class NHLSettlementEngine {
  public static settleSignal(signal: MultiSportSignal, result: NHLGameResult): {
    status: SettlementStatus;
    homeScore: number;
    awayScore: number;
    detail: string;
  } {
    if (result.status === 'POSTPONED' || result.status === 'CANCELLED') {
      return { status: 'VOID', homeScore: 0, awayScore: 0, detail: `Partido ${result.status.toLowerCase()}` };
    }
    if (result.status !== 'FINISHED') {
      return { status: 'PENDING', homeScore: result.homeScore || 0, awayScore: result.awayScore || 0, detail: 'Partido no finalizado' };
    }

    const { homeScore, awayScore } = result;
    const totalScore = homeScore + awayScore;
    const margin = homeScore - awayScore;

    // 1. MONEYLINE (includes OT/SO)
    if (signal.market === 'MONEYLINE') {
      const isHomePick = signal.selection.includes(signal.game.homeTeam.name);
      if (margin > 0) return { status: isHomePick ? 'WON' : 'LOST', homeScore, awayScore, detail: `Final: ${homeScore} - ${awayScore}` };
      else if (margin < 0) return { status: isHomePick ? 'LOST' : 'WON', homeScore, awayScore, detail: `Final: ${homeScore} - ${awayScore}` };
      else return { status: 'PUSH', homeScore, awayScore, detail: `Empate: ${homeScore} - ${awayScore}` };
    }

    // 2. PUCK LINE
    if (signal.market === 'PUCK LINE') {
      const line = signal.line ?? -1.5;
      const isHomePick = signal.selection.includes(signal.game.homeTeam.name);
      const effectiveMargin = isHomePick ? margin : -margin;
      const targetMargin = -line;

      if (effectiveMargin > targetMargin) return { status: 'WON', homeScore, awayScore, detail: `Cubierto: Margen ${margin > 0 ? '+' : ''}${margin} vs ${line}` };
      else if (effectiveMargin === targetMargin) return { status: 'PUSH', homeScore, awayScore, detail: `Push exacto: Margen ${margin} vs ${line}` };
      else return { status: 'LOST', homeScore, awayScore, detail: `No cubierto: Margen ${margin > 0 ? '+' : ''}${margin} vs ${line}` };
    }

    // 3. TOTAL GOALS
    if (signal.market === 'TOTAL GOALS') {
      const line = signal.line ?? 6.0;
      const isOver = String(signal.selection || '').toUpperCase().includes('OVER');
      if (isOver) {
        if (totalScore > line) return { status: 'WON', homeScore, awayScore, detail: `${totalScore} goles > ${line}` };
        else if (totalScore === line) return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} goles == ${line}` };
        else return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} goles < ${line}` };
      } else {
        if (totalScore < line) return { status: 'WON', homeScore, awayScore, detail: `${totalScore} goles < ${line}` };
        else if (totalScore === line) return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} goles == ${line}` };
        else return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} goles > ${line}` };
      }
    }

    return { status: 'PENDING', homeScore, awayScore, detail: 'Mercado no reconocido' };
  }
}
