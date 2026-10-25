export type NBASubModule =
  | 'ganador'
  | 'spread'
  | 'overs'
  | 'overs_1h'
  | 'overs_cuartos'
  | 'overs_equipo'
  | 'overs_2h'
  | 'props';

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
  totalPoints1H?: {
    line: number;
    overOdds: number;
    underOdds: number;
    bookmaker: string;
  };
  totalPoints2H?: {
    line: number;
    overOdds: number;
    underOdds: number;
    bookmaker: string;
  };
  quartersTotal?: {
    q1Line: number;
    q1OverOdds: number;
    q1UnderOdds: number;
    q2Line: number;
    q2OverOdds: number;
    q2UnderOdds: number;
    q3Line: number;
    q3OverOdds: number;
    q3UnderOdds: number;
    q4Line: number;
    q4OverOdds: number;
    q4UnderOdds: number;
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
  // 1st Half
  expectedHalf1Points: number;
  half1TotalLine: number;
  half1OverProb: number;
  half1UnderProb: number;
  // 2nd Half
  expectedHalf2Points: number;
  half2TotalLine: number;
  half2OverProb: number;
  half2UnderProb: number;
  // Quarters
  q1Line: number;
  q1OverProb: number;
  q1UnderProb: number;
  q2Line: number;
  q2OverProb: number;
  q2UnderProb: number;
  q3Line: number;
  q3OverProb: number;
  q3UnderProb: number;
  q4Line: number;
  q4OverProb: number;
  q4UnderProb: number;
  // Team Totals
  homeTeamTotalOverProb: number;
  homeTeamTotalUnderProb: number;
  awayTeamTotalOverProb: number;
  awayTeamTotalUnderProb: number;
  simulationsCount: number;
  varianceUsed: number;
}

export interface NBAPlayerProp {
  id: string;
  gameId: string;
  playerId: string | number;
  playerName: string;
  team: string;
  opponent: string;
  propType: 'points' | 'threes' | 'assists' | 'rebounds' | 'pra';
  propLabel: string;
  line: number;
  selection: string;
  odds: number;
  fairOdds: number;
  probability: number;
  edge: number;
  expectedValue: number;
  confidence: 'Muy Alta' | 'Alta' | 'Media';
  smartScore: number;
  isSmartPick?: boolean;
  explanation: string;
}
