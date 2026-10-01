export interface NHLStartingGoalie {
  name: string;
  isConfirmed: boolean;
  gamesPlayed: number;
  savePct: number;
  goalsAgainstAvg: number;
  recentSavePct?: number;
}

export interface NHLTeamStats {
  teamId: string | number;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  shotsForPerGame: number;
  shotsAgainstPerGame: number;
  shootingPct: number;
  savePct: number;
  powerPlayPct: number;
  penaltyKillPct: number;
  powerPlayOpportunitiesPerGame: number;
  penaltyMinutesPerGame: number;
  homeGpg: number;
  homeGaa: number;
  awayGpg: number;
  awayGaa: number;
  last5Gpg: number;
  last5Gaa: number;
  restDays: number;
  isBackToBack: boolean;
  startingGoalie?: NHLStartingGoalie;
}

export interface NHLMarketOdds {
  gameId: string;
  moneyline?: {
    homeOdds: number;
    awayOdds: number;
    bookmaker: string;
  };
  puckLine?: {
    homeLine: number;
    homeOdds: number;
    awayLine: number;
    awayOdds: number;
    bookmaker: string;
  };
  totalGoals?: {
    line: number;
    overOdds: number;
    underOdds: number;
    bookmaker: string;
  };
  teamTotalGoals?: {
    homeLine: number;
    homeOverOdds: number;
    homeUnderOdds: number;
    awayLine: number;
    awayOverOdds: number;
    awayUnderOdds: number;
    bookmaker: string;
  };
}

export interface NHLModelOutput {
  modelVersion: string;
  lambdaHome: number;
  lambdaAway: number;
  expectedTotalGoals: number;
  regHomeWinProb: number;
  regDrawProb: number;
  regAwayWinProb: number;
  otHomeWinProb: number;
  otAwayWinProb: number;
  moneylineHomeProb: number;
  moneylineAwayProb: number;
  puckLineHomeProb: number;
  puckLineAwayProb: number;
  totalOverProb: number;
  totalUnderProb: number;
  homeTeamTotalOverProb: number;
  awayTeamTotalOverProb: number;
  simulationsCount: number;
}
