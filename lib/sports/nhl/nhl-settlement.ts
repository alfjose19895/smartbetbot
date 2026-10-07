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

    const marketUpper = (signal.market || '').toUpperCase().trim();
    const selUpper = (signal.selection || '').toUpperCase().trim();

    // 1. PUCK LINE / SPREAD / HANDICAP
    if (
      marketUpper === 'PUCK LINE' ||
      marketUpper === 'SPREAD' ||
      marketUpper === 'HANDICAP' ||
      selUpper.includes('+1.5') ||
      selUpper.includes('-1.5') ||
      selUpper.includes('+2.5') ||
      selUpper.includes('-2.5') ||
      selUpper.includes('+0.5') ||
      selUpper.includes('-0.5')
    ) {
      let line = typeof signal.line === 'number' ? signal.line : undefined;
      if (line === undefined) {
        const plusM = selUpper.match(/\+\s*(\d+\.?\d*)/);
        const minusM = selUpper.match(/-\s*(\d+\.?\d*)/);
        if (plusM) line = parseFloat(plusM[1]);
        else if (minusM) line = -parseFloat(minusM[1]);
        else line = 1.5;
      }

      const homeTeamName = (signal.game?.homeTeam?.name || '').toUpperCase();
      const isHomePick =
        (homeTeamName && selUpper.includes(homeTeamName)) ||
        selUpper.includes('HOME') ||
        selUpper.includes('LOCAL') ||
        marketUpper.includes('LOCAL');

      const effectiveMargin = isHomePick ? margin : -margin;
      const diffWithSpread = effectiveMargin + line;

      if (diffWithSpread > 0) {
        return {
          status: 'WON',
          homeScore,
          awayScore,
          detail: `Cubierto: Margen ${effectiveMargin > 0 ? '+' : ''}${effectiveMargin} con línea ${line > 0 ? '+' : ''}${line}`,
        };
      } else if (diffWithSpread === 0) {
        return {
          status: 'PUSH',
          homeScore,
          awayScore,
          detail: `Push exacto: Margen ${effectiveMargin} con línea ${line}`,
        };
      } else {
        return {
          status: 'LOST',
          homeScore,
          awayScore,
          detail: `No cubierto: Margen ${effectiveMargin > 0 ? '+' : ''}${effectiveMargin} con línea ${line > 0 ? '+' : ''}${line}`,
        };
      }
    }

    // 2. TOTAL GOALS
    if (marketUpper === 'TOTAL GOALS' || selUpper.includes('OVER') || selUpper.includes('UNDER')) {
      let line = typeof signal.line === 'number' ? signal.line : undefined;
      if (line === undefined) {
        const lineMatch = selUpper.match(/(\d+\.?\d*)/);
        line = lineMatch ? parseFloat(lineMatch[1]) : 5.5;
      }
      const isOver = selUpper.includes('OVER') || selUpper.includes('MÁS');
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

    // 3. MONEYLINE (includes OT/SO)
    if (marketUpper === 'MONEYLINE' || marketUpper.includes('GANADOR') || marketUpper.includes('WINNER')) {
      const homeTeamName = (signal.game?.homeTeam?.name || '').toUpperCase();
      const isHomePick =
        (homeTeamName && selUpper.includes(homeTeamName)) ||
        selUpper.includes('HOME') ||
        selUpper.includes('LOCAL') ||
        selUpper === '1';

      if (margin > 0) return { status: isHomePick ? 'WON' : 'LOST', homeScore, awayScore, detail: `Final: ${homeScore} - ${awayScore}` };
      else if (margin < 0) return { status: isHomePick ? 'LOST' : 'WON', homeScore, awayScore, detail: `Final: ${homeScore} - ${awayScore}` };
      else return { status: 'PUSH', homeScore, awayScore, detail: `Empate: ${homeScore} - ${awayScore}` };
    }

    return { status: 'PENDING', homeScore, awayScore, detail: 'Mercado no reconocido' };
  }
}
