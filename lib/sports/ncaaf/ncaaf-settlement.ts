import { SettlementStatus, MultiSportSignal } from '../types';

export interface NCAAFGameResult {
  gameId: string;
  status: 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'IN_PLAY' | 'SCHEDULED';
  homeScore: number;
  awayScore: number;
}

function extractLine(sel: string, defaultVal: number): number {
  const m = sel.match(/(?:\bOVER\b|\bUNDER\b|\bMÁS DE\b|\bMENOS DE\b|\bMAS DE\b)\s+(\d+\.?\d*)/i);
  if (m && m[1]) return parseFloat(m[1]);
  const dec = sel.match(/(\d+\.5)/);
  if (dec && dec[1]) return parseFloat(dec[1]);
  const num = sel.match(/(\d+\.?\d*)/);
  if (num && num[1]) return parseFloat(num[1]);
  return defaultVal;
}

function extractSpreadLine(sel: string): number {
  const plusM = sel.match(/\+\s*(\d+\.?\d*)/);
  const minusM = sel.match(/-\s*(\d+\.?\d*)/);
  if (plusM && plusM[1]) return parseFloat(plusM[1]);
  if (minusM && minusM[1]) return -parseFloat(minusM[1]);
  return 0;
}

export class NCAAFSettlementEngine {
  public static settleSignal(signal: MultiSportSignal, result: NCAAFGameResult): {
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

    // 1. MONEYLINE
    if (marketUpper === 'MONEYLINE' || marketUpper.includes('GANADOR') || marketUpper.includes('WINNER')) {
      const homeName = (signal.game?.homeTeam?.name || '').toUpperCase();
      const isHomePick =
        (homeName && selUpper.includes(homeName)) ||
        selUpper.includes('HOME') ||
        selUpper.includes('LOCAL') ||
        selUpper === '1';

      if (margin > 0) {
        return { status: isHomePick ? 'WON' : 'LOST', homeScore, awayScore, detail: `Final: ${homeScore} - ${awayScore}` };
      } else if (margin < 0) {
        return { status: isHomePick ? 'LOST' : 'WON', homeScore, awayScore, detail: `Final: ${homeScore} - ${awayScore}` };
      } else {
        return { status: 'PUSH', homeScore, awayScore, detail: `Empate: ${homeScore} - ${awayScore}` };
      }
    }

    // 2. SPREAD
    if (marketUpper === 'SPREAD' || marketUpper.includes('SPREAD') || marketUpper.includes('HANDICAP') || /\b[+-]\d+(\.5)?\b/.test(selUpper)) {
      const line = typeof signal.line === 'number' ? signal.line : extractSpreadLine(selUpper);
      const homeName = (signal.game?.homeTeam?.name || '').toUpperCase();
      const isHomeSpread =
        (homeName && selUpper.includes(homeName)) ||
        selUpper.includes('HOME') ||
        selUpper.includes('LOCAL');

      const effectiveMargin = isHomeSpread ? margin : -margin;
      const diffWithSpread = effectiveMargin + line;

      if (diffWithSpread > 0) {
        return { status: 'WON', homeScore, awayScore, detail: `Cubierto: Margen ${effectiveMargin > 0 ? '+' : ''}${effectiveMargin} con línea ${line > 0 ? '+' : ''}${line}` };
      } else if (diffWithSpread === 0) {
        return { status: 'PUSH', homeScore, awayScore, detail: `Push exacto: Margen ${effectiveMargin} con línea ${line}` };
      } else {
        return { status: 'LOST', homeScore, awayScore, detail: `No cubierto: Margen ${effectiveMargin > 0 ? '+' : ''}${effectiveMargin} con línea ${line > 0 ? '+' : ''}${line}` };
      }
    }

    // 3. TOTAL POINTS
    if (marketUpper === 'TOTAL POINTS' || marketUpper === 'TOTAL' || marketUpper.includes('TOTAL')) {
      const line = typeof signal.line === 'number' ? signal.line : extractLine(selUpper, 52.5);
      const isOver = !/\b(UNDER|MENOS)\b/i.test(selUpper);

      if (isOver) {
        if (totalScore > line) return { status: 'WON', homeScore, awayScore, detail: `${totalScore} pts > ${line}` };
        else if (totalScore === line) return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} pts == ${line}` };
        else return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} pts < ${line}` };
      } else {
        if (totalScore < line) return { status: 'WON', homeScore, awayScore, detail: `${totalScore} pts < ${line}` };
        else if (totalScore === line) return { status: 'PUSH', homeScore, awayScore, detail: `${totalScore} pts == ${line}` };
        else return { status: 'LOST', homeScore, awayScore, detail: `${totalScore} pts > ${line}` };
      }
    }

    return { status: 'PENDING', homeScore, awayScore, detail: 'Mercado no reconocido' };
  }
}
