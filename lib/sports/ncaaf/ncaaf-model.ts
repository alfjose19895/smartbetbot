import { NCAAFTeamStats, NCAAFMarketOdds, NCAAFModelOutput } from './ncaaf-types';
import { NCAAFFeatureEngine, NCAAF_LEAGUE_AVERAGES } from './ncaaf-feature-engine';

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

export class NCAAFModelV1 {
  public static readonly VERSION = 'ncaaf_model_v1';

  public static simulateGame(params: {
    homeStats: NCAAFTeamStats;
    awayStats: NCAAFTeamStats;
    odds?: NCAAFMarketOdds;
    simulationsCount?: number;
    seed?: number;
  }): NCAAFModelOutput {
    const { homeStats, awayStats, odds, simulationsCount = 20000, seed = 77712 } = params;

    const { expectedHomePoints, expectedAwayPoints } = NCAAFFeatureEngine.calculateExpectedScore(
      homeStats,
      awayStats
    );

    const stdDev = NCAAF_LEAGUE_AVERAGES.varianceStdDev;
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
    let awayTeamTotalOvers = 0;

    for (let i = 0; i < simulationsCount; i++) {
      let simHomeScore = Math.max(0, Math.round(rng.nextGaussian(expectedHomePoints, stdDev)));
      let simAwayScore = Math.max(0, Math.round(rng.nextGaussian(expectedAwayPoints, stdDev)));

      // Moneyline with College OT (possession from 25 yard line)
      if (simHomeScore > simAwayScore) homeWins++;
      else if (simAwayScore > simHomeScore) awayWins++;
      else {
        // College OT resolution
        if (rng.next() < 0.52) homeWins++;
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
      if (simAwayScore > awayTeamTotalLine) awayTeamTotalOvers++;
    }

    return {
      modelVersion: this.VERSION,
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
      awayTeamTotalOverProb: Number((awayTeamTotalOvers / simulationsCount).toFixed(4)),
      simulationsCount,
      varianceUsed: stdDev
    };
  }
}
