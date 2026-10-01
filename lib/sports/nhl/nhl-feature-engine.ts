import { NHLTeamStats } from './nhl-types';

export const NHL_LEAGUE_AVERAGES = {
  goalsPerGame: 3.08, // Average per team per game (~6.16 total)
  savePct: 0.903,
  shootingPct: 0.100,
  powerPlayPct: 0.205,
  penaltyKillPct: 0.795,
  homeIceAdvantageFactor: 1.065 // ~53.5% Home Win baseline
};

export class NHLFeatureEngine {
  public static applyShrinkage(teamValue: number, leagueAvg: number, gamesPlayed: number, priorWeight: number = 10): number {
    if (gamesPlayed <= 0) return leagueAvg;
    return (gamesPlayed * teamValue + priorWeight * leagueAvg) / (gamesPlayed + priorWeight);
  }

  /**
   * Calculates goalie impact on expected goals against
   */
  public static calculateGoalieAdjustment(stats: NHLTeamStats): { goalieFactor: number; goalieQualityScore: number } {
    if (!stats.startingGoalie) {
      // Unconfirmed goalie: assume slight downgrade and penalize data quality
      return { goalieFactor: 1.02, goalieQualityScore: 0 };
    }

    const goalie = stats.startingGoalie;
    const svPct = goalie.savePct > 0 ? goalie.savePct : NHL_LEAGUE_AVERAGES.savePct;
    // Difference from league avg SV%: each +0.010 SV% reduces goals against by ~10%
    const diff = svPct - NHL_LEAGUE_AVERAGES.savePct;
    let factor = 1.0 - (diff * 8.0);
    factor = Math.max(0.85, Math.min(1.18, factor));

    const goalieQualityScore = goalie.isConfirmed ? 15 : 8;
    return { goalieFactor: Number(factor.toFixed(3)), goalieQualityScore };
  }

  /**
   * Calculates Expected Goals (Lambdas) for Home and Away teams
   */
  public static calculateExpectedGoals(
    homeStats: NHLTeamStats,
    awayStats: NHLTeamStats
  ): { lambdaHome: number; lambdaAway: number; dataQuality: number } {
    const lgAvg = NHL_LEAGUE_AVERAGES.goalsPerGame;

    // 1. Offense and Defense base rates
    const homeOff = this.applyShrinkage(homeStats.goalsForPerGame, lgAvg, homeStats.gamesPlayed);
    const homeDef = this.applyShrinkage(homeStats.goalsAgainstPerGame, lgAvg, homeStats.gamesPlayed);
    const awayOff = this.applyShrinkage(awayStats.goalsForPerGame, lgAvg, awayStats.gamesPlayed);
    const awayDef = this.applyShrinkage(awayStats.goalsAgainstPerGame, lgAvg, awayStats.gamesPlayed);

    // 2. Goalie adjustments
    const homeGoalie = this.calculateGoalieAdjustment(homeStats);
    const awayGoalie = this.calculateGoalieAdjustment(awayStats);

    // 3. Special Teams Multipliers
    // Home PP vs Away PK
    const homePpEfficiency = (homeStats.powerPlayPct / NHL_LEAGUE_AVERAGES.powerPlayPct) * ((1 - awayStats.penaltyKillPct) / (1 - NHL_LEAGUE_AVERAGES.penaltyKillPct));
    const awayPpEfficiency = (awayStats.powerPlayPct / NHL_LEAGUE_AVERAGES.powerPlayPct) * ((1 - homeStats.penaltyKillPct) / (1 - NHL_LEAGUE_AVERAGES.penaltyKillPct));

    const homeStAdj = 1.0 + (homePpEfficiency - 1.0) * 0.08;
    const awayStAdj = 1.0 + (awayPpEfficiency - 1.0) * 0.08;

    // 4. Base lambdas
    let lambdaHome = lgAvg * (homeOff / lgAvg) * (awayDef / lgAvg) * NHL_LEAGUE_AVERAGES.homeIceAdvantageFactor * homeStAdj * awayGoalie.goalieFactor;
    let lambdaAway = lgAvg * (awayOff / lgAvg) * (homeDef / lgAvg) * awayStAdj * homeGoalie.goalieFactor;

    // 5. Rest / Back-to-Back fatigue
    if (homeStats.isBackToBack) lambdaHome *= 0.94;
    if (awayStats.isBackToBack) lambdaAway *= 0.93;
    if (homeStats.restDays >= 2) lambdaHome *= 1.02;
    if (awayStats.restDays >= 2) lambdaAway *= 1.02;

    // Data Quality
    let dataQuality = 55;
    const minGames = Math.min(homeStats.gamesPlayed, awayStats.gamesPlayed);
    if (minGames >= 15) dataQuality += 20;
    else if (minGames >= 8) dataQuality += 10;

    dataQuality += homeGoalie.goalieQualityScore + awayGoalie.goalieQualityScore;

    return {
      lambdaHome: Number(Math.max(1.5, Math.min(5.5, lambdaHome)).toFixed(2)),
      lambdaAway: Number(Math.max(1.5, Math.min(5.5, lambdaAway)).toFixed(2)),
      dataQuality: Math.min(100, dataQuality)
    };
  }
}
