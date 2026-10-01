import { NBATeamStats, NBAMarketOdds, NBAModelOutput } from './nba-types';
import { NBAFeatureEngine, NBA_LEAGUE_AVERAGES } from './nba-feature-engine';

/**
 * Seedable Pseudo-Random Number Generator (PRNG) for reproducible Monte Carlo runs
 */
class SeededRNG {
  private seed: number;
  constructor(seed: number = 42) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  public next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  // Box-Muller transform for Gaussian distribution
  public nextGaussian(mean: number, stdDev: number): number {
    const u1 = Math.max(1e-15, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}

export class NBAModelV1 {
  public static readonly VERSION = 'nba_model_v1';

  /**
   * Evaluates an NBA game using Monte Carlo simulation (20,000 iterations default)
   */
  public static simulateGame(params: {
    homeStats: NBATeamStats;
    awayStats: NBATeamStats;
    odds?: NBAMarketOdds;
    simulationsCount?: number;
    seed?: number;
  }): NBAModelOutput {
    const { homeStats, awayStats, odds, simulationsCount = 20000, seed = 12345 } = params;

    const expectedPossessions = NBAFeatureEngine.calculateExpectedPossessions(homeStats, awayStats);
    const { expectedHomePoints, expectedAwayPoints } = NBAFeatureEngine.calculateExpectedScore(
      homeStats,
      awayStats,
      expectedPossessions
    );

    const stdDev = NBA_LEAGUE_AVERAGES.varianceStdDev;
    const rng = new SeededRNG(seed);

    let homeWins = 0;
    let awayWins = 0;

    // Spread counters
    const spreadLine = odds?.spread?.homeLine ?? (expectedAwayPoints - expectedHomePoints);
    let homeSpreadCovers = 0;
    let awaySpreadCovers = 0;

    // Total points counters
    const totalLine = odds?.totalPoints?.line ?? (expectedHomePoints + expectedAwayPoints);
    let totalOvers = 0;
    let totalUnders = 0;

    // Team total counters
    const homeTeamTotalLine = odds?.teamTotalPoints?.homeLine ?? expectedHomePoints;
    const awayTeamTotalLine = odds?.teamTotalPoints?.awayLine ?? expectedAwayPoints;
    let homeTeamTotalOvers = 0;
    let homeTeamTotalUnders = 0;
    let awayTeamTotalOvers = 0;
    let awayTeamTotalUnders = 0;

    for (let i = 0; i < simulationsCount; i++) {
      const simHomeScore = rng.nextGaussian(expectedHomePoints, stdDev);
      const simAwayScore = rng.nextGaussian(expectedAwayPoints, stdDev);

      // Moneyline
      if (simHomeScore > simAwayScore) homeWins++;
      else if (simAwayScore > simHomeScore) awayWins++;
      else {
        // Tie in regulation -> overtime (50/50 slight home edge)
        if (rng.next() < 0.52) homeWins++;
        else awayWins++;
      }

      // Spread: Home margin = simHomeScore - simAwayScore
      const margin = simHomeScore - simAwayScore;
      // If Boston is -5.5, cover means margin > 5.5
      if (margin > -spreadLine) homeSpreadCovers++;
      else awaySpreadCovers++;

      // Total
      const totalScore = simHomeScore + simAwayScore;
      if (totalScore > totalLine) totalOvers++;
      else totalUnders++;

      // Team Totals
      if (simHomeScore > homeTeamTotalLine) homeTeamTotalOvers++;
      else homeTeamTotalUnders++;

      if (simAwayScore > awayTeamTotalLine) awayTeamTotalOvers++;
      else awayTeamTotalUnders++;
    }

    return {
      modelVersion: this.VERSION,
      expectedPossessions,
      expectedHomePoints,
      expectedAwayPoints,
      expectedTotalPoints: Number((expectedHomePoints + expectedAwayPoints).toFixed(2)),
      expectedSpreadMargin: Number((expectedHomePoints - expectedAwayPoints).toFixed(2)),
      homeWinProb: Number((homeWins / simulationsCount).toFixed(4)),
      awayWinProb: Number((awayWins / simulationsCount).toFixed(4)),
      spreadCoverProbHome: Number((homeSpreadCovers / simulationsCount).toFixed(4)),
      spreadCoverProbAway: Number((awaySpreadCovers / simulationsCount).toFixed(4)),
      totalOverProb: Number((totalOvers / simulationsCount).toFixed(4)),
      totalUnderProb: Number((totalUnders / simulationsCount).toFixed(4)),
      homeTeamTotalOverProb: Number((homeTeamTotalOvers / simulationsCount).toFixed(4)),
      homeTeamTotalUnderProb: Number((homeTeamTotalUnders / simulationsCount).toFixed(4)),
      awayTeamTotalOverProb: Number((awayTeamTotalOvers / simulationsCount).toFixed(4)),
      awayTeamTotalUnderProb: Number((awayTeamTotalUnders / simulationsCount).toFixed(4)),
      simulationsCount,
      varianceUsed: stdDev
    };
  }
}
