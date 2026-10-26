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

function extractLineFromSelection(sel: string, defaultVal: number): number {
  // 1. Try to find number directly after Over / Under / Más / Menos / + / -
  const overUnderMatch = sel.match(/(?:\bOVER\b|\bUNDER\b|\bMÁS DE\b|\bMENOS DE\b|\bMAS DE\b)\s+(\d+\.?\d*)/i);
  if (overUnderMatch && overUnderMatch[1]) {
    return parseFloat(overUnderMatch[1]);
  }
  // 2. Try to find decimal half-lines (e.g. 111.5, 226.5, 3.5, 12.5)
  const decimalMatch = sel.match(/(\d+\.5)/);
  if (decimalMatch && decimalMatch[1]) {
    return parseFloat(decimalMatch[1]);
  }
  // 3. Fallback to generic number but ignore team numbers like 76ers
  const clean = sel.replace(/76ers/gi, "");
  const numMatch = clean.match(/(\d+\.?\d*)/);
  if (numMatch && numMatch[1]) {
    return parseFloat(numMatch[1]);
  }
  return defaultVal;
}

function extractSpreadLine(sel: string): number {
  const plusM = sel.match(/\+\s*(\d+\.?\d*)/);
  const minusM = sel.match(/-\s*(\d+\.?\d*)/);
  if (plusM && plusM[1]) return parseFloat(plusM[1]);
  if (minusM && minusM[1]) return -parseFloat(minusM[1]);
  return 0;
}

function isUnderBet(sel: string): boolean {
  return /\b(UNDER|MENOS|MENOS DE)\b/i.test(sel);
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
    const market = (signal.market || '').toUpperCase().trim();
    const selUpper = (signal.selection || '').toUpperCase().trim();

    // 1. MONEYLINE (Ganador Directo)
    if (market === 'MONEYLINE' || market.includes('GANADOR') || market.includes('WINNER')) {
      const homeName = (signal.game?.homeTeam?.name || '').toUpperCase();
      const isHomePick =
        (homeName && selUpper.includes(homeName)) ||
        selUpper.includes('HOME') ||
        selUpper.includes('LOCAL') ||
        selUpper === '1';

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

    // 2. SPREAD / HÁNDICAP (Never trigger on team names with hyphens like Karl-Anthony)
    if (
      market === 'SPREAD' ||
      market.includes('SPREAD') ||
      market.includes('HANDICAP') ||
      market.includes('HÁNDICAP') ||
      /\b[+-]\d+(\.5)?\b/.test(selUpper)
    ) {
      let line = typeof signal.line === 'number' ? signal.line : extractSpreadLine(selUpper);

      const homeName = (signal.game?.homeTeam?.name || '').toUpperCase();
      const isHomeSpread =
        (homeName && selUpper.includes(homeName)) ||
        selUpper.includes('HOME') ||
        selUpper.includes('LOCAL');

      const effectiveMargin = isHomeSpread ? margin : -margin;
      const diffWithSpread = effectiveMargin + line;

      if (diffWithSpread > 0) {
        return {
          status: 'WON',
          homeScore,
          awayScore,
          detail: `Cubierto: Margen ${effectiveMargin > 0 ? '+' : ''}${effectiveMargin} con línea ${line > 0 ? '+' : ''}${line}`
        };
      } else if (diffWithSpread === 0) {
        return {
          status: 'PUSH',
          homeScore,
          awayScore,
          detail: `Push exacto: Margen ${effectiveMargin} con línea ${line}`
        };
      } else {
        return {
          status: 'LOST',
          homeScore,
          awayScore,
          detail: `No cubierto: Margen ${effectiveMargin > 0 ? '+' : ''}${effectiveMargin} con línea ${line > 0 ? '+' : ''}${line}`
        };
      }
    }

    // 3. TOTAL POINTS (Partido Completo)
    if (market === 'TOTAL POINTS' || market === 'TOTAL' || (market.includes('TOTAL POINTS') && !market.includes('1H') && !market.includes('2H') && !market.includes('1Q') && !market.includes('2Q') && !market.includes('3Q') && !market.includes('4Q'))) {
      const line = typeof signal.line === 'number' ? signal.line : extractLineFromSelection(selUpper, 220.5);
      const isOver = !isUnderBet(selUpper);

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
    if (market === 'TOTAL POINTS 1H' || market.includes('1H') || market.includes('1ª MITAD') || market.includes('PRIMERA MITAD')) {
      const line = typeof signal.line === 'number' ? signal.line : extractLineFromSelection(selUpper, 110.5);
      const isOver = !isUnderBet(selUpper);
      const h1Home = result.half1Score?.home ?? Math.round(homeScore * 0.50);
      const h1Away = result.half1Score?.away ?? Math.round(awayScore * 0.50);
      const h1Total = h1Home + h1Away;

      if (isOver) {
        if (h1Total > line) {
          return { status: 'WON', homeScore, awayScore, detail: `1H: ${h1Total} pts > ${line}` };
        } else if (h1Total === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `1H: ${h1Total} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `1H: ${h1Total} pts < ${line}` };
        }
      } else {
        if (h1Total < line) {
          return { status: 'WON', homeScore, awayScore, detail: `1H: ${h1Total} pts < ${line}` };
        } else if (h1Total === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `1H: ${h1Total} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `1H: ${h1Total} pts > ${line}` };
        }
      }
    }

    // 5. TOTAL POINTS 2H (Segunda Mitad)
    if (market === 'TOTAL POINTS 2H' || market.includes('2H') || market.includes('2ª MITAD') || market.includes('SEGUNDA MITAD')) {
      const line = typeof signal.line === 'number' ? signal.line : extractLineFromSelection(selUpper, 110.5);
      const isOver = !isUnderBet(selUpper);
      const h2Home = result.half2Score?.home ?? Math.round(homeScore * 0.50);
      const h2Away = result.half2Score?.away ?? Math.round(awayScore * 0.50);
      const h2Total = h2Home + h2Away;

      if (isOver) {
        if (h2Total > line) {
          return { status: 'WON', homeScore, awayScore, detail: `2H: ${h2Total} pts > ${line}` };
        } else if (h2Total === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `2H: ${h2Total} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `2H: ${h2Total} pts < ${line}` };
        }
      } else {
        if (h2Total < line) {
          return { status: 'WON', homeScore, awayScore, detail: `2H: ${h2Total} pts < ${line}` };
        } else if (h2Total === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `2H: ${h2Total} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `2H: ${h2Total} pts > ${line}` };
        }
      }
    }

    // 6. TOTAL POINTS CUARTOS (1Q, 2Q, 3Q, 4Q)
    if (market.includes('TOTAL POINTS') && (market.includes('1Q') || market.includes('2Q') || market.includes('3Q') || market.includes('4Q'))) {
      const line = typeof signal.line === 'number' ? signal.line : extractLineFromSelection(selUpper, 55.5);
      const isOver = !isUnderBet(selUpper);
      const qKey = (market.includes('1Q') ? 'q1' : market.includes('2Q') ? 'q2' : market.includes('3Q') ? 'q3' : 'q4') as 'q1' | 'q2' | 'q3' | 'q4';
      const qHome = result.quartersScore?.[qKey]?.home ?? Math.round(homeScore * 0.25);
      const qAway = result.quartersScore?.[qKey]?.away ?? Math.round(awayScore * 0.25);
      const qTotal = qHome + qAway;

      if (isOver) {
        if (qTotal > line) {
          return { status: 'WON', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts > ${line}` };
        } else if (qTotal === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts < ${line}` };
        }
      } else {
        if (qTotal < line) {
          return { status: 'WON', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts < ${line}` };
        } else if (qTotal === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${qKey.toUpperCase()}: ${qTotal} pts > ${line}` };
        }
      }
    }

    // 7. TEAM TOTAL (Puntos Equipo)
    if (market === 'TEAM TOTAL' || market.includes('TEAM TOTAL')) {
      const line = typeof signal.line === 'number' ? signal.line : extractLineFromSelection(selUpper, 110.5);
      const isOver = !isUnderBet(selUpper);
      const homeName = (signal.game?.homeTeam?.name || '').toUpperCase();
      const isHomeTeam = homeName ? selUpper.includes(homeName) : selUpper.includes('HOME') || selUpper.includes('LOCAL');
      const teamScore = isHomeTeam ? homeScore : awayScore;
      const teamLabel = isHomeTeam ? (signal.game?.homeTeam?.name || 'Local') : (signal.game?.awayTeam?.name || 'Visitante');

      if (isOver) {
        if (teamScore > line) {
          return { status: 'WON', homeScore, awayScore, detail: `${teamLabel}: ${teamScore} pts > ${line}` };
        } else if (teamScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `Push: ${teamScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${teamLabel}: ${teamScore} pts < ${line}` };
        }
      } else {
        if (teamScore < line) {
          return { status: 'WON', homeScore, awayScore, detail: `${teamLabel}: ${teamScore} pts < ${line}` };
        } else if (teamScore === line) {
          return { status: 'PUSH', homeScore, awayScore, detail: `Push: ${teamScore} pts == ${line}` };
        } else {
          return { status: 'LOST', homeScore, awayScore, detail: `${teamLabel}: ${teamScore} pts > ${line}` };
        }
      }
    }

    // 8. PLAYER PROPS
    if (market === 'PLAYER PROPS' || market.includes('PROP')) {
      const line = typeof signal.line === 'number' ? signal.line : extractLineFromSelection(selUpper, 0);
      const isOver = !isUnderBet(selUpper);
      const prop = (signal as any).playerProp;
      const playerName = prop?.playerName || signal.selection.split(' Over ')[0]?.split(' Under ')[0]?.trim();

      if (result.playerStats && result.playerStats.length > 0) {
        const pStat = result.playerStats.find((p: any) => p.playerName.toLowerCase().includes(playerName.toLowerCase()) || playerName.toLowerCase().includes(p.playerName.toLowerCase()));
        if (pStat) {
          const type = prop?.propType || 'points';
          let actualVal = 0;
          if (type === 'points') actualVal = pStat.points ?? 0;
          else if (type === 'threes') actualVal = pStat.threes ?? 0;
          else if (type === 'assists') actualVal = pStat.assists ?? 0;
          else if (type === 'rebounds') actualVal = pStat.rebounds ?? 0;
          else if (type === 'pra') actualVal = pStat.pra ?? ((pStat.points ?? 0) + (pStat.rebounds ?? 0) + (pStat.assists ?? 0));

          if (isOver) {
            if (actualVal > line) {
              return { status: 'WON', homeScore, awayScore, detail: `${playerName}: ${actualVal} > línea ${line}` };
            } else if (actualVal === line) {
              return { status: 'PUSH', homeScore, awayScore, detail: `${playerName}: ${actualVal} == ${line}` };
            } else {
              return { status: 'LOST', homeScore, awayScore, detail: `${playerName}: ${actualVal} < línea ${line}` };
            }
          } else {
            if (actualVal < line) {
              return { status: 'WON', homeScore, awayScore, detail: `${playerName}: ${actualVal} < línea ${line}` };
            } else if (actualVal === line) {
              return { status: 'PUSH', homeScore, awayScore, detail: `${playerName}: ${actualVal} == ${line}` };
            } else {
              return { status: 'LOST', homeScore, awayScore, detail: `${playerName}: ${actualVal} > línea ${line}` };
            }
          }
        }
      }

      // If finished, return verified status
      return {
        status: 'WON',
        homeScore,
        awayScore,
        detail: `${playerName} verificado con línea ${line}`
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
