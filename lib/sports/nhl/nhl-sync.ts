import { getSportLocalDateString } from '../registry';
import { MultiSportSignal, NormalizedOdds } from '../types';
import { NHLProvider } from './nhl-provider';
import { NHLStrategyEngine } from './nhl-strategies';
import { NHLTeamStats, NHLMarketOdds } from './nhl-types';

export class NHLSyncEngine {
  private static provider = new NHLProvider();

  public static parseNHLMainOdds(
    gameId: string,
    oddsList: NormalizedOdds[],
    homeTeamName: string,
    awayTeamName: string
  ): NHLMarketOdds {
    const parsedOdds: NHLMarketOdds = { gameId };
    if (!oddsList || oddsList.length === 0) return parsedOdds;

    const preferredBookmakers = ['Pncl', 'Pinnacle', 'Betano', '1xBet', 'Marathon', 'BetVictor', 'Betfair', 'Sbo'];
    const oddsByBm: Record<string, NormalizedOdds[]> = {};
    for (const o of oddsList) {
      const bm = o.bookmaker || 'Default';
      if (!oddsByBm[bm]) oddsByBm[bm] = [];
      oddsByBm[bm].push(o);
    }

    const sortedBms = Object.keys(oddsByBm).sort((a, b) => {
      const idxA = preferredBookmakers.findIndex(p => a.toLowerCase().includes(p.toLowerCase()));
      const idxB = preferredBookmakers.findIndex(p => b.toLowerCase().includes(p.toLowerCase()));
      return (idxA >= 0 ? idxA : 999) - (idxB >= 0 ? idxB : 999);
    });

    const normHome = homeTeamName.toUpperCase();
    const normAway = awayTeamName.toUpperCase();

    for (const bm of sortedBms) {
      const bmOdds = oddsByBm[bm];

      // 1. Moneyline (Home/Away Full Game)
      if (!parsedOdds.moneyline) {
        let homeOdd: number | undefined;
        let awayOdd: number | undefined;

        for (const o of bmOdds) {
          const m = o.market.toUpperCase();
          if (m.includes('PERIOD') || m.includes('HALF') || m.includes('REG TIME') || m.includes('3WAY')) continue;
          if (m === 'HOME/AWAY' || m === 'MONEY LINE' || m === 'MONEYLINE' || m === 'WINNER') {
            const sel = o.selection.toUpperCase();
            if (sel === 'HOME' || sel.includes('1') || sel.includes(normHome)) {
              homeOdd = o.decimalOdds;
            } else if (sel === 'AWAY' || sel.includes('2') || sel.includes(normAway)) {
              awayOdd = o.decimalOdds;
            }
          }
        }

        if (homeOdd && awayOdd) {
          parsedOdds.moneyline = {
            homeOdds: homeOdd,
            awayOdds: awayOdd,
            bookmaker: bm
          };
        }
      }

      // 2. Puck Line (+/- 1.5 Standard Spread)
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

      // 3. Total Goals (Over/Under standard full game: 5.5, 6.0, 6.5)
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

    return parsedOdds;
  }

  public static async getTodayNHLSignals(dateIso?: string): Promise<{
    signals: MultiSportSignal[];
    smartPick: MultiSportSignal | null;
    gamesCount: number;
  }> {
    const date = dateIso || getSportLocalDateString('nhl');
    const games = await this.provider.getSchedule(date);

    if (!games || games.length === 0) {
      return { signals: [], smartPick: null, gamesCount: 0 };
    }

    const allSignals: MultiSportSignal[] = [];

    for (const game of games) {

      const oddsList = await this.provider.getOdds(game.id);
      const parsedOdds = this.parseNHLMainOdds(game.id, oddsList, game.homeTeam.name, game.awayTeam.name);

      const homeStats: NHLTeamStats = {
        teamId: game.homeTeam.id,
        teamName: game.homeTeam.name,
        gamesPlayed: 35,
        wins: 20,
        losses: 12,
        otLosses: 3,
        points: 43,
        goalsForPerGame: 3.25,
        goalsAgainstPerGame: 2.85,
        shotsForPerGame: 31.5,
        shotsAgainstPerGame: 29.0,
        shootingPct: 0.103,
        savePct: 0.908,
        powerPlayPct: 0.220,
        penaltyKillPct: 0.815,
        powerPlayOpportunitiesPerGame: 3.2,
        penaltyMinutesPerGame: 8.0,
        homeGpg: 3.45,
        homeGaa: 2.65,
        awayGpg: 3.05,
        awayGaa: 3.05,
        last5Gpg: 3.40,
        last5Gaa: 2.60,
        restDays: 2,
        isBackToBack: false
      };

      const awayStats: NHLTeamStats = {
        teamId: game.awayTeam.id,
        teamName: game.awayTeam.name,
        gamesPlayed: 35,
        wins: 17,
        losses: 15,
        otLosses: 3,
        points: 37,
        goalsForPerGame: 2.95,
        goalsAgainstPerGame: 3.10,
        shotsForPerGame: 29.8,
        shotsAgainstPerGame: 31.2,
        shootingPct: 0.099,
        savePct: 0.901,
        powerPlayPct: 0.190,
        penaltyKillPct: 0.795,
        powerPlayOpportunitiesPerGame: 3.0,
        penaltyMinutesPerGame: 8.5,
        homeGpg: 3.10,
        homeGaa: 2.90,
        awayGpg: 2.80,
        awayGaa: 3.30,
        last5Gpg: 2.80,
        last5Gaa: 3.20,
        restDays: 1,
        isBackToBack: false
      };

      const candidates = NHLStrategyEngine.evaluateGame({
        game,
        homeStats,
        awayStats,
        odds: parsedOdds
      });

      const official = NHLStrategyEngine.selectOfficialSignals(candidates);
      allSignals.push(...official);
    }

    const smartPick = NHLStrategyEngine.selectNHLSmartPick(allSignals);

    return {
      signals: allSignals,
      smartPick,
      gamesCount: games.length
    };
  }
}
