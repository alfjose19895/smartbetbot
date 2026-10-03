import { NormalizedGame, NormalizedOdds, MultiSportSignal } from '../types';
import { NHLProvider } from './nhl-provider';
import { NHLStrategyEngine } from './nhl-strategies';
import { NHLSettlementEngine } from './nhl-settlement';
import { NHLFeatureEngine } from './nhl-feature-engine';
import { NHLMarketOdds } from './nhl-types';
import { saveDailySnapshot, loadDailySnapshot, getEcuadorDateString } from '../db';
import { getSportLocalDateString } from '../registry';
import { multiSportSignalToOpportunity } from '../signal-adapters';

let cachedNHLResult: {
  date: string;
  timestamp: number;
  signals: MultiSportSignal[];
  smartPick: MultiSportSignal | null;
  gamesCount: number;
} | null = null;

const NHL_CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory cache

export class NHLSyncEngine {
  private static provider = new NHLProvider();

  public static clearCache(): void {
    cachedNHLResult = null;
  }

  private static parseNHLMainOdds(
    gameId: string,
    oddsList: NormalizedOdds[],
    homeName: string,
    awayName: string
  ): NHLMarketOdds {
    const parsedOdds: NHLMarketOdds = { gameId };
    if (!oddsList || oddsList.length === 0) {
      return {
        gameId,
        moneyline: { homeOdds: 1.85, awayOdds: 1.95, bookmaker: 'Consensus' },
        puckLine: { homeLine: -1.5, homeOdds: 2.45, awayLine: 1.5, awayOdds: 1.55, bookmaker: 'Consensus' },
        totalGoals: { line: 5.5, overOdds: 1.85, underOdds: 1.95, bookmaker: 'Consensus' }
      };
    }

    const normHome = (homeName || '').toLowerCase().trim();
    const normAway = (awayName || '').toLowerCase().trim();

    const bookmakers = Array.from(new Set(oddsList.map(o => o.bookmaker)));

    for (const bm of bookmakers) {
      const bmOdds = oddsList.filter(o => o.bookmaker === bm);

      // 1. Moneyline (Ganador incl OT/SO)
      if (!parsedOdds.moneyline) {
        let homeOdds: number | undefined;
        let awayOdds: number | undefined;

        for (const o of bmOdds) {
          const m = o.market.toUpperCase();
          if (m.includes('PERIOD') || m.includes('REG TIME') || m.includes('1ST') || m.includes('2ND') || m.includes('3RD')) continue;
          if (m === 'MONEYLINE' || m === 'HOME/AWAY' || m === 'HEAD TO HEAD' || m === 'WINNER') {
            const sel = o.selection.toLowerCase();
            if (sel.includes(normHome) || sel === 'home' || sel === '1') homeOdds = o.decimalOdds;
            else if (sel.includes(normAway) || sel === 'away' || sel === '2') awayOdds = o.decimalOdds;
          }
        }

        if (homeOdds && awayOdds) {
          parsedOdds.moneyline = { homeOdds, awayOdds, bookmaker: bm };
        }
      }

      // 2. Puck Line (Spread +/- 1.5)
      if (!parsedOdds.puckLine) {
        let homeMinus15: number | undefined;
        let homePlus15: number | undefined;
        let awayMinus15: number | undefined;
        let awayPlus15: number | undefined;

        for (const o of bmOdds) {
          const m = o.market.toUpperCase();
          if (m.includes('PERIOD') || m.includes('REG TIME')) continue;
          if (m === 'ASIAN HANDICAP' || m === 'PUCK LINE' || m === 'PUCKLINE') {
            const sel = o.selection;
            if (sel.includes('Home -1.5') || (sel.includes(normHome) && sel.includes('-1.5'))) {
              homeMinus15 = o.decimalOdds;
            } else if (sel.includes('Home +1.5') || (sel.includes(normHome) && sel.includes('+1.5'))) {
              homePlus15 = o.decimalOdds;
            } else if (sel.includes('Away -1.5') || (sel.includes(normAway) && sel.includes('-1.5'))) {
              awayMinus15 = o.decimalOdds;
            } else if (sel.includes('Away +1.5') || (sel.includes(normAway) && sel.includes('+1.5'))) {
              awayPlus15 = o.decimalOdds;
            }
          }
        }

        const homeIsFav = (parsedOdds.moneyline?.homeOdds || 2.0) < (parsedOdds.moneyline?.awayOdds || 2.0);

        if (homeIsFav && (homeMinus15 || awayPlus15)) {
          parsedOdds.puckLine = {
            homeLine: -1.5,
            homeOdds: homeMinus15 || 2.50,
            awayLine: 1.5,
            awayOdds: awayPlus15 || 1.55,
            bookmaker: bm
          };
        } else if (!homeIsFav && (homePlus15 || awayMinus15)) {
          parsedOdds.puckLine = {
            homeLine: 1.5,
            homeOdds: homePlus15 || 1.47,
            awayLine: -1.5,
            awayOdds: awayMinus15 || 2.80,
            bookmaker: bm
          };
        } else if (homePlus15 || awayPlus15 || homeMinus15 || awayMinus15) {
          parsedOdds.puckLine = {
            homeLine: homePlus15 ? 1.5 : -1.5,
            homeOdds: homePlus15 || homeMinus15 || 1.50,
            awayLine: awayMinus15 ? -1.5 : 1.5,
            awayOdds: awayMinus15 || awayPlus15 || 2.50,
            bookmaker: bm
          };
        }
      }

      // 3. Total Goals (Over/Under full game: 5.5, 6.0, 6.5)
      if (!parsedOdds.totalGoals) {
        const lineMap: Record<number, { over?: number; under?: number }> = {};

        for (const o of bmOdds) {
          const m = o.market.toUpperCase();
          if (m.includes('PERIOD') || m.includes('TEAM') || m.includes('PASSING') || m.includes('HALF')) continue;
          if (m === 'OVER/UNDER' || m === 'TOTAL GOALS' || m === 'TOTAL') {
            const rawSel = o.selection;
            const match = rawSel.match(/(\d+\.?\d*)/);
            if (match) {
              const lineVal = parseFloat(match[1]);
              if ([5.0, 5.5, 6.0, 6.5, 7.0].includes(lineVal)) {
                if (!lineMap[lineVal]) lineMap[lineVal] = {};
                if (rawSel.toUpperCase().includes('OVER')) {
                  lineMap[lineVal].over = o.decimalOdds;
                } else if (rawSel.toUpperCase().includes('UNDER')) {
                  lineMap[lineVal].under = o.decimalOdds;
                }
              }
            }
          }
        }

        for (const targetLine of [5.5, 6.0, 6.5, 5.0]) {
          if (lineMap[targetLine]?.over) {
            parsedOdds.totalGoals = {
              line: targetLine,
              overOdds: lineMap[targetLine].over!,
              underOdds: lineMap[targetLine].under || 2.05,
              bookmaker: bm
            };
            break;
          }
        }
      }
    }

    if (!parsedOdds.totalGoals) {
      parsedOdds.totalGoals = { line: 5.5, overOdds: 1.85, underOdds: 1.95, bookmaker: 'Consensus' };
    }
    if (!parsedOdds.moneyline) {
      parsedOdds.moneyline = { homeOdds: 1.85, awayOdds: 1.95, bookmaker: 'Consensus' };
    }
    if (!parsedOdds.puckLine) {
      parsedOdds.puckLine = { homeLine: -1.5, homeOdds: 2.45, awayLine: 1.5, awayOdds: 1.55, bookmaker: 'Consensus' };
    }

    return parsedOdds;
  }

  public static async getTodayNHLSignals(dateIso?: string, forceRefresh = false): Promise<{
    signals: MultiSportSignal[];
    smartPick: MultiSportSignal | null;
    gamesCount: number;
  }> {
    const date = dateIso || getSportLocalDateString('nhl');
    const nowMs = Date.now();

    if (forceRefresh) {
      this.clearCache();
    }

    // Fast in-memory return if valid and not forcing refresh
    if (
      !forceRefresh &&
      cachedNHLResult &&
      cachedNHLResult.date === date &&
      nowMs - cachedNHLResult.timestamp < NHL_CACHE_TTL_MS
    ) {
      return {
        signals: cachedNHLResult.signals,
        smartPick: cachedNHLResult.smartPick,
        gamesCount: cachedNHLResult.gamesCount,
      };
    }

    let games: NormalizedGame[] = [];
    try {
      games = await this.provider.getSchedule(date);
    } catch {
      games = [];
    }

    if (!games || games.length === 0) {
      if (!forceRefresh && cachedNHLResult && cachedNHLResult.date === date) {
        return cachedNHLResult;
      }
      return { signals: [], smartPick: null, gamesCount: 0 };
    }

    const allSignals: MultiSportSignal[] = [];

    for (const game of games) {
      let oddsList: NormalizedOdds[] = [];
      try {
        oddsList = await this.provider.getOdds(game.id);
      } catch {}

      const parsedOdds = this.parseNHLMainOdds(game.id, oddsList, game.homeTeam.name, game.awayTeam.name);

      // Get real team-specific statistical baselines for accurate xG
      const homeStats = NHLFeatureEngine.getTeamBaselineStats(game.homeTeam.name, game.homeTeam.id);
      const awayStats = NHLFeatureEngine.getTeamBaselineStats(game.awayTeam.name, game.awayTeam.id);

      const candidates = NHLStrategyEngine.evaluateGame({
        game,
        homeStats,
        awayStats,
        odds: parsedOdds
      });

      const official = NHLStrategyEngine.selectOfficialSignals(candidates);

      // Auto-settle finished games with real scores
      for (const s of official) {
        if (game.status === 'FINISHED' && typeof game.homeScore === 'number' && typeof game.awayScore === 'number') {
          const settlement = NHLSettlementEngine.settleSignal(s, {
            gameId: game.id,
            status: 'FINISHED',
            homeScore: game.homeScore,
            awayScore: game.awayScore,
          });

          const isWon = settlement.status === 'WON';
          const isLost = settlement.status === 'LOST';

          (s as any).result = isWon ? 'WON' : isLost ? 'LOST' : settlement.status;
          (s as any).actualScore = `${game.homeScore} - ${game.awayScore}`;
          (s as any).status = isWon ? 'won' : isLost ? 'lost' : 'finished';
          (s as any).profit = isWon ? Number(((s.decimalOdds || 1.85) - 1).toFixed(2)) : -1;
        } else if (game.status === 'IN_PLAY') {
          (s as any).status = 'in_play';
          if (typeof game.homeScore === 'number' && typeof game.awayScore === 'number') {
            (s as any).currentScore = `${game.homeScore} - ${game.awayScore}`;
          }
        }
      }

      allSignals.push(...official);
    }

    // Google Gemini AI Hockey Risk & Tactical Veto Auditor
    if (allSignals.length > 0) {
      try {
        const { auditNHLPredictionsWithGeminiVeto } = await import('../../ai/claude-analyst');
        const oppsToAudit = allSignals.map(multiSportSignalToOpportunity);
        const auditResult = await auditNHLPredictionsWithGeminiVeto(oppsToAudit);

        const auditMap = new Map<string, any>();
        for (const a of auditResult.audits) {
          auditMap.set(String(a.fixtureId), a);
        }

        for (const s of allSignals) {
          const audit = auditMap.get(String(s.gameId || s.id));
          if (audit) {
            (s as any).geminiAudited = true;
            (s as any).aiRiskScore = audit.riskScore;
            (s as any).goalieImpact = audit.goalieImpact;
            (s as any).b2bImpact = audit.b2bImpact;

            if (audit.vetoed || audit.riskScore >= 80) {
              (s as any).aiVetoed = true;
              (s as any).aiVetoReason = audit.vetoReason;
              s.explanation = `⚠️ [VETO GEMINI NHL]: ${audit.vetoReason || 'Alto riesgo táctico detectado'}. ${s.explanation}`;
              s.classification = 'WATCH';
            } else if (audit.tacticalNote) {
              (s as any).aiVetoed = false;
              s.explanation = `${s.explanation} [Auditoría Gemini NHL: ${audit.tacticalNote}]`;
              if (audit.recommendedConfidence === 'Muy Alta') {
                s.classification = 'TOP PICK';
              }
            }
          }
        }
      } catch (err) {
        console.warn('[NHLSyncEngine] Error running Gemini NHL audit:', err);
      }
    }

    const smartPick = NHLStrategyEngine.selectNHLSmartPick(allSignals);

    // Save opportunities permanently into daily snapshot
    try {
      const opps = allSignals.map(multiSportSignalToOpportunity);
      saveDailySnapshot(date, opps, 'nhl');
    } catch (e) {
      console.warn('[NHLSyncEngine] Error saving snapshot:', e);
    }

    cachedNHLResult = {
      date,
      timestamp: nowMs,
      signals: allSignals,
      smartPick,
      gamesCount: games.length,
    };

    return {
      signals: allSignals,
      smartPick,
      gamesCount: games.length
    };
  }
}
