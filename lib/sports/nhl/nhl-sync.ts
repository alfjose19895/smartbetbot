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
        if (o.market.includes('WINNER') || o.market.includes('HOME/AWAY') || o.market.includes('MONEYLINE')) {
          if (o.selection.toLowerCase().includes('home') || o.selection.includes(game.homeTeam.name)) {
            parsedOdds.moneyline = {
              homeOdds: o.decimalOdds,
              awayOdds: parsedOdds.moneyline?.awayOdds || 2.10,
              bookmaker: o.bookmaker
            };
          } else if (o.selection.toLowerCase().includes('away') || o.selection.includes(game.awayTeam.name)) {
            parsedOdds.moneyline = {
              homeOdds: parsedOdds.moneyline?.homeOdds || 1.80,
              awayOdds: o.decimalOdds,
              bookmaker: o.bookmaker
            };
          }
        }
        if (o.market.includes('TOTAL') || o.market.includes('OVER/UNDER')) {
          if (o.selection.toUpperCase().includes('OVER')) {
            parsedOdds.totalGoals = {
              line: 6.0,
              overOdds: o.decimalOdds,
              underOdds: parsedOdds.totalGoals?.underOdds || 1.91,
              bookmaker: o.bookmaker
            };
          }
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
