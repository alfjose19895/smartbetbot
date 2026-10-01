import { MultiSportSignal } from '../types';
import { NHLProvider } from './nhl-provider';
import { NHLStrategyEngine } from './nhl-strategies';
import { NHLTeamStats, NHLMarketOdds } from './nhl-types';

export class NHLSyncEngine {
  private static provider = new NHLProvider();

  public static async getTodayNHLSignals(dateIso?: string): Promise<{
    signals: MultiSportSignal[];
    smartPick: MultiSportSignal | null;
    gamesCount: number;
  }> {
    const date = dateIso || new Date().toISOString().split('T')[0];
    const games = await this.provider.getSchedule(date);

    if (!games || games.length === 0) {
      return { signals: [], smartPick: null, gamesCount: 0 };
    }

    const allSignals: MultiSportSignal[] = [];

    for (const game of games) {
      if (game.status === 'FINISHED') continue;

      const oddsList = await this.provider.getOdds(game.id);
      const parsedOdds: NHLMarketOdds = { gameId: game.id };

      for (const o of oddsList) {
        const m = o.market.toUpperCase();
        const sel = o.selection.toUpperCase();

        if (m.includes('WINNER') || m.includes('HOME/AWAY') || m.includes('MONEYLINE') || m === '1X2') {
          if (sel === 'HOME' || sel.includes('1') || sel.includes(game.homeTeam.name.toUpperCase())) {
            parsedOdds.moneyline = {
              homeOdds: o.decimalOdds,
              awayOdds: parsedOdds.moneyline?.awayOdds || 1.95,
              bookmaker: o.bookmaker
            };
          } else if (sel === 'AWAY' || sel.includes('2') || sel.includes(game.awayTeam.name.toUpperCase())) {
            parsedOdds.moneyline = {
              homeOdds: parsedOdds.moneyline?.homeOdds || 1.90,
              awayOdds: o.decimalOdds,
              bookmaker: o.bookmaker
            };
          }
        }

        if (m.includes('TOTAL') || m.includes('OVER/UNDER')) {
          const lineMatch = o.selection.match(/[\d.]+/);
          const line = lineMatch ? parseFloat(lineMatch[0]) : 6.0;
          if (sel.includes('OVER')) {
            parsedOdds.totalGoals = {
              line: line,
              overOdds: o.decimalOdds,
              underOdds: parsedOdds.totalGoals?.underOdds || 1.91,
              bookmaker: o.bookmaker
            };
          } else if (sel.includes('UNDER')) {
            parsedOdds.totalGoals = {
              line: line,
              overOdds: parsedOdds.totalGoals?.overOdds || 1.91,
              underOdds: o.decimalOdds,
              bookmaker: o.bookmaker
            };
          }
        }

        if (m.includes('ASIAN HANDICAP') || m.includes('PUCK LINE')) {
          const isHome = sel.includes('HOME') || sel.includes(game.homeTeam.name.toUpperCase());
          const lineMatch = o.selection.match(/[-+]?[\d.]+/);
          const line = lineMatch ? parseFloat(lineMatch[0]) : (isHome ? -1.5 : 1.5);
          const hLine = isHome ? line : -line;
          const aLine = -hLine;
          parsedOdds.puckLine = {
            homeLine: hLine,
            homeOdds: isHome ? o.decimalOdds : (parsedOdds.puckLine?.homeOdds || 2.80),
            awayLine: aLine,
            awayOdds: !isHome ? o.decimalOdds : (parsedOdds.puckLine?.awayOdds || 1.45),
            bookmaker: o.bookmaker
          };
        }
      }

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
