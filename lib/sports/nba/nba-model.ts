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

    const expectedTotal = expectedHomePoints + expectedAwayPoints;
    const stdDev = NBA_LEAGUE_AVERAGES.varianceStdDev;
    const rng = new SeededRNG(seed);

    let homeWins = 0;
    let awayWins = 0;

    // Spread counters
    const spreadLine = odds?.spread?.homeLine ?? (expectedAwayPoints - expectedHomePoints);
    let homeSpreadCovers = 0;
    let awaySpreadCovers = 0;

    // Total points counters
    const totalLine = odds?.totalPoints?.line ?? expectedTotal;
    let totalOvers = 0;
    let totalUnders = 0;

    // Team total counters
    const homeTeamTotalLine = odds?.teamTotalPoints?.homeLine ?? expectedHomePoints;
    const awayTeamTotalLine = odds?.teamTotalPoints?.awayLine ?? expectedAwayPoints;
    let homeTeamTotalOvers = 0;
    let homeTeamTotalUnders = 0;
    let awayTeamTotalOvers = 0;
    let awayTeamTotalUnders = 0;

    // Halves lines
    const half1Line = odds?.totalPoints1H?.line ?? Math.round(expectedTotal * 0.502 * 2) / 2;
    const half2Line = odds?.totalPoints2H?.line ?? Math.round(expectedTotal * 0.498 * 2) / 2;
    let half1Overs = 0;
    let half1Unders = 0;
    let half2Overs = 0;
    let half2Unders = 0;

    // Quarters lines
    const q1Line = odds?.quartersTotal?.q1Line ?? Math.round(expectedTotal * 0.255 * 2) / 2;
    const q2Line = odds?.quartersTotal?.q2Line ?? Math.round(expectedTotal * 0.247 * 2) / 2;
    const q3Line = odds?.quartersTotal?.q3Line ?? Math.round(expectedTotal * 0.252 * 2) / 2;
    const q4Line = odds?.quartersTotal?.q4Line ?? Math.round(expectedTotal * 0.246 * 2) / 2;
    let q1Overs = 0;
    let q1Unders = 0;
    let q2Overs = 0;
    let q2Unders = 0;
    let q3Overs = 0;
    let q3Unders = 0;
    let q4Overs = 0;
    let q4Unders = 0;

    // Standard deviation for quarters and halves
    const halfStdDev = stdDev * 0.707;
    const quarterStdDev = stdDev * 0.50;

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
      if (margin > -spreadLine) homeSpreadCovers++;
      else awaySpreadCovers++;

      // Total Points
      const totalScore = simHomeScore + simAwayScore;
      if (totalScore > totalLine) totalOvers++;
      else totalUnders++;

      // Team Totals
      if (simHomeScore > homeTeamTotalLine) homeTeamTotalOvers++;
      else homeTeamTotalUnders++;

      if (simAwayScore > awayTeamTotalLine) awayTeamTotalOvers++;
      else awayTeamTotalUnders++;

      // 1st Half Simulation
      const simHalf1 = rng.nextGaussian(expectedTotal * 0.502, halfStdDev * 1.414);
      if (simHalf1 > half1Line) half1Overs++;
      else half1Unders++;

      // 2nd Half Simulation
      const simHalf2 = rng.nextGaussian(expectedTotal * 0.498, halfStdDev * 1.414);
      if (simHalf2 > half2Line) half2Overs++;
      else half2Unders++;

      // Quarters Simulation
      const simQ1 = rng.nextGaussian(expectedTotal * 0.255, quarterStdDev * 1.414);
      if (simQ1 > q1Line) q1Overs++;
      else q1Unders++;

      const simQ2 = rng.nextGaussian(expectedTotal * 0.247, quarterStdDev * 1.414);
      if (simQ2 > q2Line) q2Overs++;
      else q2Unders++;

      const simQ3 = rng.nextGaussian(expectedTotal * 0.252, quarterStdDev * 1.414);
      if (simQ3 > q3Line) q3Overs++;
      else q3Unders++;

      const simQ4 = rng.nextGaussian(expectedTotal * 0.246, quarterStdDev * 1.414);
      if (simQ4 > q4Line) q4Overs++;
      else q4Unders++;
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
      // Halves
      expectedHalf1Points: Number((expectedTotal * 0.502).toFixed(2)),
      half1TotalLine: half1Line,
      half1OverProb: Number((half1Overs / simulationsCount).toFixed(4)),
      half1UnderProb: Number((half1Unders / simulationsCount).toFixed(4)),
      expectedHalf2Points: Number((expectedTotal * 0.498).toFixed(2)),
      half2TotalLine: half2Line,
      half2OverProb: Number((half2Overs / simulationsCount).toFixed(4)),
      half2UnderProb: Number((half2Unders / simulationsCount).toFixed(4)),
      // Quarters
      q1Line,
      q1OverProb: Number((q1Overs / simulationsCount).toFixed(4)),
      q1UnderProb: Number((q1Unders / simulationsCount).toFixed(4)),
      q2Line,
      q2OverProb: Number((q2Overs / simulationsCount).toFixed(4)),
      q2UnderProb: Number((q2Unders / simulationsCount).toFixed(4)),
      q3Line,
      q3OverProb: Number((q3Overs / simulationsCount).toFixed(4)),
      q3UnderProb: Number((q3Unders / simulationsCount).toFixed(4)),
      q4Line,
      q4OverProb: Number((q4Overs / simulationsCount).toFixed(4)),
      q4UnderProb: Number((q4Unders / simulationsCount).toFixed(4)),
      // Team Totals
      homeTeamTotalOverProb: Number((homeTeamTotalOvers / simulationsCount).toFixed(4)),
      homeTeamTotalUnderProb: Number((homeTeamTotalUnders / simulationsCount).toFixed(4)),
      awayTeamTotalOverProb: Number((awayTeamTotalOvers / simulationsCount).toFixed(4)),
      awayTeamTotalUnderProb: Number((awayTeamTotalUnders / simulationsCount).toFixed(4)),
      simulationsCount,
      varianceUsed: stdDev
    };
  }
}
