import { NHLTeamStats, NHLMarketOdds, NHLModelOutput } from './nhl-types';
import { NHLFeatureEngine } from './nhl-feature-engine';

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

  public nextPoisson(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
}

export class NHLModelV1 {
  public static readonly VERSION = 'nhl_model_v1';

  public static simulateGame(params: {
    homeStats: NHLTeamStats;
    awayStats: NHLTeamStats;
    odds?: NHLMarketOdds;
    simulationsCount?: number;
    seed?: number;
  }): NHLModelOutput {
    const { homeStats, awayStats, odds, simulationsCount = 20000, seed = 98765 } = params;

    const { lambdaHome, lambdaAway } = NHLFeatureEngine.calculateExpectedGoals(homeStats, awayStats);
    const rng = new SeededRNG(seed);

    let regHomeWins = 0;
    let regDraws = 0;
    let regAwayWins = 0;

    let mlHomeWins = 0;
    let mlAwayWins = 0;

    const puckLineTarget = odds?.puckLine?.homeLine ?? -1.5;
    let puckLineHomeCovers = 0;
    let puckLineAwayCovers = 0;

    const totalLine = odds?.totalGoals?.line ?? (lambdaHome + lambdaAway);
    let totalOvers = 0;
    let totalUnders = 0;

    const homeTeamTotalLine = odds?.teamTotalGoals?.homeLine ?? lambdaHome;
    const awayTeamTotalLine = odds?.teamTotalGoals?.awayLine ?? lambdaAway;
    let homeTeamTotalOvers = 0;
    let awayTeamTotalOvers = 0;

    const otHomeStrength = lambdaHome / (lambdaHome + lambdaAway);

    for (let i = 0; i < simulationsCount; i++) {
      const simHomeGoals = rng.nextPoisson(lambdaHome);
      const simAwayGoals = rng.nextPoisson(lambdaAway);

      let finalHomeGoals = simHomeGoals;
      let finalAwayGoals = simAwayGoals;

      const regMargin = simHomeGoals - simAwayGoals;
      if (Math.abs(regMargin) === 1) {
        const pullRoll = rng.next();
        if (pullRoll < 0.22) {
          if (regMargin > 0) finalHomeGoals += 1;
          else finalAwayGoals += 1;
        } else if (pullRoll > 0.94) {
          if (regMargin > 0) finalAwayGoals += 1;
          else finalHomeGoals += 1;
        }
      }

      if (finalHomeGoals > finalAwayGoals) {
        regHomeWins++;
        mlHomeWins++;
      } else if (finalAwayGoals > finalHomeGoals) {
        regAwayWins++;
        mlAwayWins++;
      } else {
        regDraws++;
        const otRoll = rng.next();
        if (otRoll < otHomeStrength) {
          mlHomeWins++;
          finalHomeGoals += 1;
        } else {
          mlAwayWins++;
          finalAwayGoals += 1;
        }
      }

      const finalMargin = finalHomeGoals - finalAwayGoals;
      if (finalMargin > -puckLineTarget) puckLineHomeCovers++;
      else puckLineAwayCovers++;

      const totalScore = finalHomeGoals + finalAwayGoals;
      if (totalScore > totalLine) totalOvers++;
      else totalUnders++;

      if (finalHomeGoals > homeTeamTotalLine) homeTeamTotalOvers++;
      if (finalAwayGoals > awayTeamTotalLine) awayTeamTotalOvers++;
    }

    const regHomeProb = Number((regHomeWins / simulationsCount).toFixed(4));
    const regDrawProb = Number((regDraws / simulationsCount).toFixed(4));
    const regAwayProb = Number((regAwayWins / simulationsCount).toFixed(4));

    const mlHomeProb = Number((mlHomeWins / simulationsCount).toFixed(4));
    const mlAwayProb = Number((mlAwayWins / simulationsCount).toFixed(4));

    return {
      modelVersion: this.VERSION,
      lambdaHome,
      lambdaAway,
      expectedTotalGoals: Number((lambdaHome + lambdaAway).toFixed(2)),
      regHomeWinProb: regHomeProb,
      regDrawProb: regDrawProb,
      regAwayWinProb: regAwayProb,
      otHomeWinProb: Number(otHomeStrength.toFixed(4)),
      otAwayWinProb: Number((1 - otHomeStrength).toFixed(4)),
      moneylineHomeProb: mlHomeProb,
      moneylineAwayProb: mlAwayProb,
      puckLineHomeProb: Number((puckLineHomeCovers / simulationsCount).toFixed(4)),
      puckLineAwayProb: Number((puckLineAwayCovers / simulationsCount).toFixed(4)),
      totalOverProb: Number((totalOvers / simulationsCount).toFixed(4)),
      totalUnderProb: Number((totalUnders / simulationsCount).toFixed(4)),
      homeTeamTotalOverProb: Number((homeTeamTotalOvers / simulationsCount).toFixed(4)),
      awayTeamTotalOverProb: Number((awayTeamTotalOvers / simulationsCount).toFixed(4)),
      simulationsCount
    };
  }
}
