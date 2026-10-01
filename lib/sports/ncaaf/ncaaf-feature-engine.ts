import { NCAAFTeamStats, NCAAFConference } from './ncaaf-types';

export const NCAAF_LEAGUE_AVERAGES = {
  pointsPerGame: 28.5,
  homeFieldAdvantagePoints: 2.8,
  varianceStdDev: 13.8
};

export const CONFERENCE_TIERS: Record<NCAAFConference, number> = {
  SEC: 1.15,
  BIG_TEN: 1.12,
  BIG_12: 1.06,
  ACC: 1.04,
  INDEPENDENT: 1.00,
  GROUP_OF_5: 0.90,
  FCS: 0.75
};

export class NCAAFFeatureEngine {
  /**
   * Strong shrinkage for college football early season / small samples (K = 12 games)
   */
  public static applyShrinkage(teamValue: number, leagueAvg: number, gamesPlayed: number, priorWeight: number = 12): number {
    if (gamesPlayed <= 0) return leagueAvg;
    return (gamesPlayed * teamValue + priorWeight * leagueAvg) / (gamesPlayed + priorWeight);
  }

  /**
   * Opponent Strength Adjustment (bounded multiplier ~0.70 - 1.30)
   */
  public static calculateOpponentAdjustment(stats: NCAAFTeamStats): number {
    const confTier = CONFERENCE_TIERS[stats.conference] || 1.0;
    const sos = stats.strengthOfSchedule || 50;
    const sosFactor = 1.0 + (sos - 50) / 333.0;
    const multiplier = confTier * sosFactor;
    return Number(Math.max(0.70, Math.min(1.30, multiplier)).toFixed(3));
  }

  /**
   * Calculates Expected Score for College Football
   */
  public static calculateExpectedScore(
    homeStats: NCAAFTeamStats,
    awayStats: NCAAFTeamStats
  ): { expectedHomePoints: number; expectedAwayPoints: number; dataQuality: number } {
    const homeAdj = this.calculateOpponentAdjustment(homeStats);
    const awayAdj = this.calculateOpponentAdjustment(awayStats);

    const homeOff = this.applyShrinkage(homeStats.pointsPerGame * homeAdj, NCAAF_LEAGUE_AVERAGES.pointsPerGame, homeStats.gamesPlayed);
    const homeDef = this.applyShrinkage(homeStats.pointsAllowedPerGame / homeAdj, NCAAF_LEAGUE_AVERAGES.pointsPerGame, homeStats.gamesPlayed);

    const awayOff = this.applyShrinkage(awayStats.pointsPerGame * awayAdj, NCAAF_LEAGUE_AVERAGES.pointsPerGame, awayStats.gamesPlayed);
    const awayDef = this.applyShrinkage(awayStats.pointsAllowedPerGame / awayAdj, NCAAF_LEAGUE_AVERAGES.pointsPerGame, awayStats.gamesPlayed);

    let rawHome = (homeOff + awayDef) / 2;
    let rawAway = (awayOff + homeDef) / 2;

    rawHome += NCAAF_LEAGUE_AVERAGES.homeFieldAdvantagePoints;

    const yppHomeDiff = (homeStats.yardsPerPlay - awayStats.yardsAllowedPerPlay) * 1.5;
    const yppAwayDiff = (awayStats.yardsPerPlay - homeStats.yardsAllowedPerPlay) * 1.5;
    rawHome += yppHomeDiff;
    rawAway += yppAwayDiff;

    if (homeStats.restDays >= 10) rawHome += 1.0;
    if (awayStats.restDays >= 10) rawAway += 1.0;

    let dataQuality = 55;
    const minGames = Math.min(homeStats.gamesPlayed, awayStats.gamesPlayed);
    if (minGames >= 6) dataQuality += 25;
    else if (minGames >= 3) dataQuality += 15;
    else dataQuality += 5;

    if (homeStats.strengthOfSchedule > 0 && awayStats.strengthOfSchedule > 0) dataQuality += 10;
    if (homeStats.yardsPerPlay > 0 && awayStats.yardsPerPlay > 0) dataQuality += 10;

    return {
      expectedHomePoints: Number(Math.max(6, rawHome).toFixed(2)),
      expectedAwayPoints: Number(Math.max(6, rawAway).toFixed(2)),
      dataQuality: Math.min(100, dataQuality)
    };
  }
}
