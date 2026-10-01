import { SupportedSport } from './types';
import { H2HMatch, TeamFormMatch } from './prediction-engine';
import { NHLProvider, lookupNHLTeamId } from './nhl/nhl-provider';

export async function getMultiSportH2HAndForm(
  sport: SupportedSport,
  homeTeamName: string,
  awayTeamName: string,
  homeTeamId?: number | string,
  awayTeamId?: number | string
): Promise<{
  h2h: H2HMatch[];
  homeLast5: TeamFormMatch[];
  awayLast5: TeamFormMatch[];
  homeElo: number;
  awayElo: number;
  sport: SupportedSport;
  competitionName: string;
}> {
  let competitionName = sport.toUpperCase();
  if (sport === 'nhl') competitionName = 'NHL';
  else if (sport === 'nba') competitionName = 'NBA';
  else if (sport === 'nfl') competitionName = 'NFL';
  else if (sport === 'ncaaf') competitionName = 'NCAA Football';

  // 1. NHL REAL API INTEGRATION
  if (sport === 'nhl') {
    const provider = new NHLProvider();
    const hId = homeTeamId ? Number(homeTeamId) : lookupNHLTeamId(homeTeamName);
    const aId = awayTeamId ? Number(awayTeamId) : lookupNHLTeamId(awayTeamName);

    let h2hMatches: H2HMatch[] = [];
    let homeLast5: TeamFormMatch[] = [];
    let awayLast5: TeamFormMatch[] = [];

    // Fetch live H2H if IDs are resolved
    if (hId && aId) {
      try {
        const liveH2H = await provider.getH2H(hId, aId, 5);
        if (Array.isArray(liveH2H) && liveH2H.length > 0) {
          h2hMatches = liveH2H.map((g) => {
            const hScore = g.homeScore ?? 0;
            const aScore = g.awayScore ?? 0;
            let winner = 'Empate';
            if (hScore > aScore) winner = g.homeTeam.name;
            else if (aScore > hScore) winner = g.awayTeam.name;

            return {
              date: g.startsAt ? g.startsAt.split('T')[0] : '2026',
              homeTeam: g.homeTeam.name,
              awayTeam: g.awayTeam.name,
              score: `${hScore} - ${aScore}`,
              winner,
              competition: 'NHL',
            };
          });
        }
      } catch (err) {
        console.warn('[multi-sport-h2h] Error fetching live NHL H2H:', err);
      }
    }

    // Fetch live Home Team Recent Games
    if (hId) {
      try {
        const rawHome = await provider.getTeamRecentGames(hId, 5);
        if (Array.isArray(rawHome) && rawHome.length > 0) {
          homeLast5 = rawHome.map((g) => {
            const isHome = g.homeTeam.id === hId || g.homeTeam.name.toLowerCase().includes(homeTeamName.toLowerCase());
            const myScore = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
            const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
            const opponent = isHome ? g.awayTeam.name : g.homeTeam.name;
            let result: 'W' | 'D' | 'L' = 'D';
            if (myScore > oppScore) result = 'W';
            else if (myScore < oppScore) result = 'L';

            return {
              date: g.startsAt ? g.startsAt.split('T')[0] : '2026',
              opponent,
              isHome,
              score: `${myScore} - ${oppScore}`,
              result,
              competition: 'NHL'
            };
          });
        }
      } catch (err) {
        console.warn('[multi-sport-h2h] Error fetching home recent NHL games:', err);
      }
    }

    // Fetch live Away Team Recent Games
    if (aId) {
      try {
        const rawAway = await provider.getTeamRecentGames(aId, 5);
        if (Array.isArray(rawAway) && rawAway.length > 0) {
          awayLast5 = rawAway.map((g) => {
            const isHome = g.homeTeam.id === aId || g.homeTeam.name.toLowerCase().includes(awayTeamName.toLowerCase());
            const myScore = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
            const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
            const opponent = isHome ? g.awayTeam.name : g.homeTeam.name;
            let result: 'W' | 'D' | 'L' = 'D';
            if (myScore > oppScore) result = 'W';
            else if (myScore < oppScore) result = 'L';

            return {
              date: g.startsAt ? g.startsAt.split('T')[0] : '2026',
              opponent,
              isHome,
              score: `${myScore} - ${oppScore}`,
              result,
              competition: 'NHL'
            };
          });
        }
      } catch (err) {
        console.warn('[multi-sport-h2h] Error fetching away recent NHL games:', err);
      }
    }

    return {
      h2h: h2hMatches,
      homeLast5,
      awayLast5,
      homeElo: 1560,
      awayElo: 1540,
      sport: 'nhl',
      competitionName: 'NHL'
    };
  }

  // NBA, NFL, NCAAF
  return {
    h2h: [],
    homeLast5: [],
    awayLast5: [],
    homeElo: 1600,
    awayElo: 1580,
    sport,
    competitionName
  };
}
