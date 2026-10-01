export interface NBATeamStats {
  teamId: string | number;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsPerGame: number;
  pointsAllowedPerGame: number;
  offensiveRating: number;
  defensiveRating: number;
  pace: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  reboundsPerGame: number;
  offensiveReboundsPerGame: number;
  turnoversPerGame: number;
  assistRate: number;
  homePpg: number;
  homeOppPpg: number;
  awayPpg: number;
  awayOppPpg: number;
  last5Ppg: number;
  last5OppPpg: number;
  restDays: number;
  isBackToBack: boolean;
  injuries?: {
    player: string;
    status: 'OUT' | 'QUESTIONABLE' | 'PROBABLE';
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
}

export interface NBAMarketOdds {
  gameId: string;
  moneyline?: {
    homeOdds: number;
    awayOdds: number;
    bookmaker: string;
  };
  spread?: {
    homeLine: number;
    homeOdds: number;
    awayLine: number;
    awayOdds: number;
    bookmaker: string;
  };
  totalPoints?: {
    line: number;
    overOdds: number;
    underOdds: number;
    bookmaker: string;
  };
  teamTotalPoints?: {
    homeLine: number;
    homeOverOdds: number;
    homeUnderOdds: number;
    awayLine: number;
    awayOverOdds: number;
    awayUnderOdds: number;
    bookmaker: string;
  };
}

export interface NBAModelOutput {
  modelVersion: string;
  expectedPossessions: number;
  expectedHomePoints: number;
  expectedAwayPoints: number;
  expectedTotalPoints: number;
  expectedSpreadMargin: number;
  homeWinProb: number;
  awayWinProb: number;
  spreadCoverProbHome: number;
  spreadCoverProbAway: number;
  totalOverProb: number;
  totalUnderProb: number;
  homeTeamTotalOverProb: number;
  homeTeamTotalUnderProb: number;
  awayTeamTotalOverProb: number;
  awayTeamTotalUnderProb: number;
  simulationsCount: number;
  varianceUsed: number;
}
