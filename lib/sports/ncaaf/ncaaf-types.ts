export type NCAAFConference = 
  | 'SEC'
  | 'BIG_TEN'
  | 'BIG_12'
  | 'ACC'
  | 'GROUP_OF_5'
  | 'FCS'
  | 'INDEPENDENT';

export interface NCAAFTeamStats {
  teamId: string | number;
  teamName: string;
  conference: NCAAFConference;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsPerGame: number;
  pointsAllowedPerGame: number;
  yardsPerGame: number;
  yardsAllowedPerGame: number;
  yardsPerPlay: number;
  yardsAllowedPerPlay: number;
  turnoversPerGame: number;
  strengthOfSchedule: number;
  opponentQualityFactor?: number;
  homePpg: number;
  homeOppPpg: number;
  awayPpg: number;
  awayOppPpg: number;
  last5Ppg: number;
  last5OppPpg: number;
  restDays: number;
}

export interface NCAAFMarketOdds {
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

export interface NCAAFModelOutput {
  modelVersion: string;
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
  awayTeamTotalOverProb: number;
  simulationsCount: number;
  varianceUsed: number;
}
