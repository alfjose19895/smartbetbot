import { NBATeamStats } from './nba-types';

export const NBA_LEAGUE_AVERAGES = {
  pace: 99.2,
  offensiveRating: 114.8,
  defensiveRating: 114.8,
  pointsPerGame: 114.2,
  homeCourtAdvantagePoints: 2.6,
  varianceStdDev: 11.6 // Standard deviation of NBA game points per team
};

export class NBAFeatureEngine {
  /**
   * Applies Empirical Bayes shrinkage towards league average for small sample sizes
   */
  public static applyShrinkage(teamValue: number, leagueAvg: number, gamesPlayed: number, priorWeight: number = 10): number {
    if (gamesPlayed <= 0) return leagueAvg;
    return (gamesPlayed * teamValue + priorWeight * leagueAvg) / (gamesPlayed + priorWeight);
  }

  /**
   * Calculates expected game pace (possessions per 48 minutes)
   * Formula: (Pace_home * Pace_away) / Pace_league
   */
  public static calculateExpectedPossessions(homeStats: NBATeamStats, awayStats: NBATeamStats): number {
    const homePace = this.applyShrinkage(homeStats.pace, NBA_LEAGUE_AVERAGES.pace, homeStats.gamesPlayed, 8);
    const awayPace = this.applyShrinkage(awayStats.pace, NBA_LEAGUE_AVERAGES.pace, awayStats.gamesPlayed, 8);

    const expectedPace = (homePace * awayPace) / NBA_LEAGUE_AVERAGES.pace;
    return Number(Math.max(90, Math.min(110, expectedPace)).toFixed(2));
  }

  /**
   * Calculates Expected Home and Away Scores using:
   * - Offensive vs Defensive ratings
   * - Recent weighted form (last 5 games)
   * - Home court advantage
   * - Rest & Back-to-Back fatigue
   * - Injury impact adjustments
   */
  public static calculateExpectedScore(
    homeStats: NBATeamStats,
    awayStats: NBATeamStats,
    expectedPossessions: number
  ): { expectedHomePoints: number; expectedAwayPoints: number; dataQuality: number } {
    // 1. Base Ratings with Shrinkage
    const homeOff = this.applyShrinkage(homeStats.offensiveRating, NBA_LEAGUE_AVERAGES.offensiveRating, homeStats.gamesPlayed);
    const homeDef = this.applyShrinkage(homeStats.defensiveRating, NBA_LEAGUE_AVERAGES.defensiveRating, homeStats.gamesPlayed);
    const awayOff = this.applyShrinkage(awayStats.offensiveRating, NBA_LEAGUE_AVERAGES.offensiveRating, awayStats.gamesPlayed);
    const awayDef = this.applyShrinkage(awayStats.defensiveRating, NBA_LEAGUE_AVERAGES.defensiveRating, awayStats.gamesPlayed);

    // 2. Form Recency Weight (Last 5 games form: 30% weight, season: 70%)
    const homeFormFactor = homeStats.last5Ppg > 0 ? (homeStats.last5Ppg - homeStats.pointsPerGame) * 0.3 : 0;
    const awayFormFactor = awayStats.last5Ppg > 0 ? (awayStats.last5Ppg - awayStats.pointsPerGame) * 0.3 : 0;

    // 3. Efficiency Ratings (Pts per 100 possessions)
    let homeNetORtg = homeOff + (awayDef - NBA_LEAGUE_AVERAGES.defensiveRating) + homeFormFactor;
    let awayNetORtg = awayOff + (homeDef - NBA_LEAGUE_AVERAGES.defensiveRating) + awayFormFactor;

    // 4. Home Court Advantage (Add ~2.6 pts to Home Net ORtg per 100 poss)
    homeNetORtg += NBA_LEAGUE_AVERAGES.homeCourtAdvantagePoints * (100 / expectedPossessions);

    // 5. Fatigue & Rest Adjustment
    if (homeStats.isBackToBack) homeNetORtg -= 1.8 * (100 / expectedPossessions);
    if (awayStats.isBackToBack) awayNetORtg -= 2.2 * (100 / expectedPossessions); // Travel back-to-back is harder
    if (homeStats.restDays >= 2) homeNetORtg += 0.8 * (100 / expectedPossessions);
    if (awayStats.restDays >= 2) awayNetORtg += 0.8 * (100 / expectedPossessions);

    // 6. Injury Adjustments
    if (homeStats.injuries) {
      for (const inj of homeStats.injuries) {
        if (inj.status === 'OUT') {
          if (inj.impact === 'HIGH') homeNetORtg -= 3.5;
          else if (inj.impact === 'MEDIUM') homeNetORtg -= 1.5;
        }
      }
    }
    if (awayStats.injuries) {
      for (const inj of awayStats.injuries) {
        if (inj.status === 'OUT') {
          if (inj.impact === 'HIGH') awayNetORtg -= 3.5;
          else if (inj.impact === 'MEDIUM') awayNetORtg -= 1.5;
        }
      }
    }

    // Convert ORtg per 100 possessions into Expected Points
    const expectedHomePoints = Number(((homeNetORtg * expectedPossessions) / 100).toFixed(2));
    const expectedAwayPoints = Number(((awayNetORtg * expectedPossessions) / 100).toFixed(2));

    // Data Quality calculation (0 - 100)
    let dataQuality = 60;
    const minGames = Math.min(homeStats.gamesPlayed, awayStats.gamesPlayed);
    if (minGames >= 20) dataQuality += 25;
    else if (minGames >= 10) dataQuality += 15;
    else dataQuality += 5;

    if (homeStats.offensiveRating > 0 && awayStats.offensiveRating > 0) dataQuality += 10;
    if (homeStats.last5Ppg > 0 && awayStats.last5Ppg > 0) dataQuality += 5;

    return {
      expectedHomePoints: Math.max(80, expectedHomePoints),
      expectedAwayPoints: Math.max(80, expectedAwayPoints),
      dataQuality: Math.min(100, dataQuality)
    };
  }
}
