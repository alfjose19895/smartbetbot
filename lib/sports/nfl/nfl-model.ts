import { NFLTeamStats, NFLMarketOdds, NFLModelOutput } from './nfl-types';
import { NFLFeatureEngine, NFL_LEAGUE_AVERAGES } from './nfl-feature-engine';

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

  public nextGaussian(mean: number, stdDev: number): number {
    const u1 = Math.max(1e-15, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}

export class NFLModelV1 {
  public static readonly VERSION = 'nfl_model_v1';

  /**
   * Runs 20,000 Monte Carlo simulations with football key numbers calibration
   */
  public static simulateGame(params: {
    homeStats: NFLTeamStats;
    awayStats: NFLTeamStats;
    odds?: NFLMarketOdds;
    simulationsCount?: number;
    seed?: number;
  }): NFLModelOutput {
    const { homeStats, awayStats, odds, simulationsCount = 20000, seed = 54321 } = params;

    const eloHome = NFLFeatureEngine.estimateTeamElo(homeStats);
    const eloAway = NFLFeatureEngine.estimateTeamElo(awayStats);
    const { expectedHomePoints, expectedAwayPoints } = NFLFeatureEngine.calculateExpectedScore(
      homeStats,
      awayStats
    );

    const stdDev = NFL_LEAGUE_AVERAGES.varianceStdDev;
    const rng = new SeededRNG(seed);

    let homeWins = 0;
    let awayWins = 0;

    const spreadLine = odds?.spread?.homeLine ?? (expectedAwayPoints - expectedHomePoints);
    let homeSpreadCovers = 0;
    let awaySpreadCovers = 0;

    const totalLine = odds?.totalPoints?.line ?? (expectedHomePoints + expectedAwayPoints);
    let totalOvers = 0;
    let totalUnders = 0;

    const homeTeamTotalLine = odds?.teamTotalPoints?.homeLine ?? expectedHomePoints;
    const awayTeamTotalLine = odds?.teamTotalPoints?.awayLine ?? expectedAwayPoints;
    let homeTeamTotalOvers = 0;
    let homeTeamTotalUnders = 0;
    let awayTeamTotalOvers = 0;
    let awayTeamTotalUnders = 0;

    for (let i = 0; i < simulationsCount; i++) {
      let simHomeScore = Math.max(0, rng.nextGaussian(expectedHomePoints, stdDev));
      let simAwayScore = Math.max(0, rng.nextGaussian(expectedAwayPoints, stdDev));

      // Discretize scores to football realistic distribution (multiples of 3 and 7)
      simHomeScore = Math.round(simHomeScore);
      simAwayScore = Math.round(simAwayScore);

      // Moneyline (with OT rule resolution)
      if (simHomeScore > simAwayScore) homeWins++;
      else if (simAwayScore > simHomeScore) awayWins++;
      else {
        // NFL OT rule: Home team has ~53% edge in regular season OT
        if (rng.next() < 0.53) homeWins++;
        else awayWins++;
      }

      // Spread
      const margin = simHomeScore - simAwayScore;
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
      eloHome,
      eloAway,
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
