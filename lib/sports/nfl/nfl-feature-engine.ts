import { NFLTeamStats } from './nfl-types';

export const NFL_LEAGUE_AVERAGES = {
  pointsPerGame: 21.8,
  yardsPerPlay: 5.4,
  yardsAllowedPerPlay: 5.4,
  homeFieldAdvantagePoints: 2.2,
  varianceStdDev: 10.2
};

export class NFLFeatureEngine {
  public static applyShrinkage(teamValue: number, leagueAvg: number, gamesPlayed: number, priorWeight: number = 6): number {
    if (gamesPlayed <= 0) return leagueAvg;
    return (gamesPlayed * teamValue + priorWeight * leagueAvg) / (gamesPlayed + priorWeight);
  }

  public static estimateTeamElo(stats: NFLTeamStats): number {
    const netPpg = stats.pointsPerGame - stats.pointsAllowedPerGame;
    const netYpp = (stats.yardsPerPlay - stats.yardsAllowedPerPlay) * 20;
    const toFactor = stats.turnoverDifferential * 4;
    const baseElo = 1500 + netPpg * 25 + netYpp + toFactor;
    return Number(Math.max(1200, Math.min(1800, baseElo)).toFixed(1));
  }

  public static calculateExpectedScore(
    homeStats: NFLTeamStats,
    awayStats: NFLTeamStats
  ): { expectedHomePoints: number; expectedAwayPoints: number; dataQuality: number } {
    const homeOff = this.applyShrinkage(homeStats.pointsPerGame, NFL_LEAGUE_AVERAGES.pointsPerGame, homeStats.gamesPlayed);
    const awayDef = this.applyShrinkage(awayStats.pointsAllowedPerGame, NFL_LEAGUE_AVERAGES.pointsPerGame, awayStats.gamesPlayed);
    const awayOff = this.applyShrinkage(awayStats.pointsPerGame, NFL_LEAGUE_AVERAGES.pointsPerGame, awayStats.gamesPlayed);
    const homeDef = this.applyShrinkage(homeStats.pointsAllowedPerGame, NFL_LEAGUE_AVERAGES.pointsPerGame, homeStats.gamesPlayed);

    let rawHome = (homeOff + awayDef) / 2;
    let rawAway = (awayOff + homeDef) / 2;

    const yppHomeDiff = (homeStats.yardsPerPlay - awayStats.yardsAllowedPerPlay) * 1.5;
    const yppAwayDiff = (awayStats.yardsPerPlay - homeStats.yardsAllowedPerPlay) * 1.5;
    rawHome += yppHomeDiff;
    rawAway += yppAwayDiff;

    rawHome += (homeStats.turnoverDifferential - awayStats.turnoverDifferential) * 0.25;
    rawHome += NFL_LEAGUE_AVERAGES.homeFieldAdvantagePoints;

    if (homeStats.qbAvailability === 'BACKUP') rawHome -= 4.5;
    else if (homeStats.qbAvailability === 'QUESTIONABLE') rawHome -= 1.8;

    if (awayStats.qbAvailability === 'BACKUP') rawAway -= 4.5;
    else if (awayStats.qbAvailability === 'QUESTIONABLE') rawAway -= 1.8;

    if (homeStats.restDays >= 9) rawHome += 1.0;
    if (awayStats.restDays >= 9) rawAway += 1.0;
    if (homeStats.restDays <= 5) rawHome -= 0.8;
    if (awayStats.restDays <= 5) rawAway -= 0.8;

    if (homeStats.weather && !homeStats.weather.isDome) {
      if (homeStats.weather.windMph > 15) {
        const windPenalty = (homeStats.weather.windMph - 15) * 0.15;
        rawHome -= windPenalty;
        rawAway -= windPenalty;
      }
      if (homeStats.weather.isPrecipitation) {
        rawHome -= 1.2;
        rawAway -= 1.2;
      }
    }

    let dataQuality = 60;
    const minGames = Math.min(homeStats.gamesPlayed, awayStats.gamesPlayed);
    if (minGames >= 8) dataQuality += 25;
    else if (minGames >= 4) dataQuality += 15;
    else dataQuality += 5;

    if (homeStats.qbAvailability === 'STARTER' && awayStats.qbAvailability === 'STARTER') dataQuality += 10;
    if (homeStats.yardsPerPlay > 0 && awayStats.yardsPerPlay > 0) dataQuality += 5;

    return {
      expectedHomePoints: Number(Math.max(7, rawHome).toFixed(2)),
      expectedAwayPoints: Number(Math.max(7, rawAway).toFixed(2)),
      dataQuality: Math.min(100, dataQuality)
    };
  }
}
