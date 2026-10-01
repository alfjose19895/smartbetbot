export interface NFLTeamStats {
  teamId: string | number;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  pointsPerGame: number;
  pointsAllowedPerGame: number;
  yardsPerGame: number;
  yardsAllowedPerGame: number;
  passYardsPerGame: number;
  rushYardsPerGame: number;
  yardsPerPlay: number;
  yardsAllowedPerPlay: number;
  turnoverDifferential: number;
  thirdDownPct: number;
  redZonePct: number;
  sacks: number;
  qbRating: number;
  qbAvailability: 'STARTER' | 'BACKUP' | 'QUESTIONABLE';
  homePpg: number;
  homeOppPpg: number;
  awayPpg: number;
  awayOppPpg: number;
  last5Ppg: number;
  last5OppPpg: number;
  restDays: number;
  weather?: {
    windMph: number;
    temperatureF: number;
    isPrecipitation: boolean;
    isDome: boolean;
  };
}

export interface NFLMarketOdds {
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

export interface NFLModelOutput {
  modelVersion: string;
  eloHome: number;
  eloAway: number;
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
