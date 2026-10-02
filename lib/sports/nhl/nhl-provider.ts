import { getCurrentSportSeason, getSportLocalDateString } from "../registry";
import { SportsDataProvider, SportCapability, NormalizedGame, NormalizedOdds } from '../types';
import { SPORTS_CONFIG } from '../config';

export const NHL_TEAMS_MAP: Record<string, { id: number; name: string; logo: string }> = {
  'anaheim ducks': { id: 670, name: 'Anaheim Ducks', logo: 'https://media.api-sports.io/hockey/teams/670.png' },
  'boston bruins': { id: 673, name: 'Boston Bruins', logo: 'https://media.api-sports.io/hockey/teams/673.png' },
  'buffalo sabres': { id: 674, name: 'Buffalo Sabres', logo: 'https://media.api-sports.io/hockey/teams/674.png' },
  'calgary flames': { id: 675, name: 'Calgary Flames', logo: 'https://media.api-sports.io/hockey/teams/675.png' },
  'carolina hurricanes': { id: 676, name: 'Carolina Hurricanes', logo: 'https://media.api-sports.io/hockey/teams/676.png' },
  'chicago blackhawks': { id: 678, name: 'Chicago Blackhawks', logo: 'https://media.api-sports.io/hockey/teams/678.png' },
  'colorado avalanche': { id: 679, name: 'Colorado Avalanche', logo: 'https://media.api-sports.io/hockey/teams/679.png' },
  'columbus blue jackets': { id: 680, name: 'Columbus Blue Jackets', logo: 'https://media.api-sports.io/hockey/teams/680.png' },
  'dallas stars': { id: 681, name: 'Dallas Stars', logo: 'https://media.api-sports.io/hockey/teams/681.png' },
  'detroit red wings': { id: 682, name: 'Detroit Red Wings', logo: 'https://media.api-sports.io/hockey/teams/682.png' },
  'edmonton oilers': { id: 683, name: 'Edmonton Oilers', logo: 'https://media.api-sports.io/hockey/teams/683.png' },
  'florida panthers': { id: 684, name: 'Florida Panthers', logo: 'https://media.api-sports.io/hockey/teams/684.png' },
  'los angeles kings': { id: 685, name: 'Los Angeles Kings', logo: 'https://media.api-sports.io/hockey/teams/685.png' },
  'minnesota wild': { id: 687, name: 'Minnesota Wild', logo: 'https://media.api-sports.io/hockey/teams/687.png' },
  'montreal canadiens': { id: 688, name: 'Montreal Canadiens', logo: 'https://media.api-sports.io/hockey/teams/688.png' },
  'nashville predators': { id: 689, name: 'Nashville Predators', logo: 'https://media.api-sports.io/hockey/teams/689.png' },
  'new jersey devils': { id: 690, name: 'New Jersey Devils', logo: 'https://media.api-sports.io/hockey/teams/690.png' },
  'new york islanders': { id: 691, name: 'New York Islanders', logo: 'https://media.api-sports.io/hockey/teams/691.png' },
  'new york rangers': { id: 692, name: 'New York Rangers', logo: 'https://media.api-sports.io/hockey/teams/692.png' },
  'ottawa senators': { id: 693, name: 'Ottawa Senators', logo: 'https://media.api-sports.io/hockey/teams/693.png' },
  'philadelphia flyers': { id: 695, name: 'Philadelphia Flyers', logo: 'https://media.api-sports.io/hockey/teams/695.png' },
  'pittsburgh penguins': { id: 696, name: 'Pittsburgh Penguins', logo: 'https://media.api-sports.io/hockey/teams/696.png' },
  'san jose sharks': { id: 697, name: 'San Jose Sharks', logo: 'https://media.api-sports.io/hockey/teams/697.png' },
  'seattle kraken': { id: 1436, name: 'Seattle Kraken', logo: 'https://media.api-sports.io/hockey/teams/1436.png' },
  'st. louis blues': { id: 698, name: 'St. Louis Blues', logo: 'https://media.api-sports.io/hockey/teams/698.png' },
  'tampa bay lightning': { id: 699, name: 'Tampa Bay Lightning', logo: 'https://media.api-sports.io/hockey/teams/699.png' },
  'toronto maple leafs': { id: 700, name: 'Toronto Maple Leafs', logo: 'https://media.api-sports.io/hockey/teams/700.png' },
  'utah mammoth': { id: 2483, name: 'Utah Mammoth', logo: 'https://media.api-sports.io/hockey/teams/2483.png' },
  'vancouver canucks': { id: 701, name: 'Vancouver Canucks', logo: 'https://media.api-sports.io/hockey/teams/701.png' },
  'vegas golden knights': { id: 702, name: 'Vegas Golden Knights', logo: 'https://media.api-sports.io/hockey/teams/702.png' },
  'washington capitals': { id: 703, name: 'Washington Capitals', logo: 'https://media.api-sports.io/hockey/teams/703.png' },
  'winnipeg jets': { id: 704, name: 'Winnipeg Jets', logo: 'https://media.api-sports.io/hockey/teams/704.png' },
};

export function lookupNHLTeamId(teamName: string): number | undefined {
  const norm = (teamName || '').toLowerCase().trim();
  for (const [k, v] of Object.entries(NHL_TEAMS_MAP)) {
    if (norm.includes(k) || k.includes(norm)) return v.id;
  }
  return undefined;
}

interface ApiHockeyGame {
  id: number;
  date: string;
  time?: string;
  timestamp?: number;
  timezone?: string;
  status: {
    long?: string;
    short?: string;
  };
  league: {
    id: number;
    name: string;
    type?: string;
    season: number | string;
    logo?: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo?: string;
    };
    away: {
      id: number;
      name: string;
      logo?: string;
    };
  };
  scores: {
    home?: number;
    away?: number;
  };
  periods?: {
    first?: { home?: number; away?: number };
    second?: { home?: number; away?: number };
    third?: { home?: number; away?: number };
    overtime?: { home?: number; away?: number };
    penalties?: { home?: number; away?: number };
  };
}

export class NHLProvider implements SportsDataProvider {
  public readonly sport = 'nhl';
  public readonly name = 'API-Sports Hockey (NHL)';

  private readonly supportedCapabilities: Set<SportCapability> = new Set([
    'schedule',
    'team_stats',
    'odds',
    'injuries',
    'h2h'
  ]);

  public supports(capability: SportCapability): boolean {
    return this.supportedCapabilities.has(capability);
  }

  private get apiKey(): string {
    return process.env.API_NHL_KEY || SPORTS_CONFIG.nhl.apiKey || '';
  }

  private get headers(): Record<string, string> {
    return {
      'x-apisports-key': this.apiKey,
      'Accept': 'application/json'
    };
  }

  public async getSchedule(date: string): Promise<NormalizedGame[]> {
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) {
      return [];
    }

    try {
      const seasonInt = parseInt(String(getCurrentSportSeason('nhl')).split('-')[0], 10) || 2026;
      const url = `${config.baseUrl}/games?date=${date}&league=57&season=${seasonInt}&timezone=America/New_York`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (!res.ok) return [];

      const data = (await res.json()) as { response?: ApiHockeyGame[] };
      const games = data.response || [];

      return games.map((g) => {
        const isFinished = ['FT', 'AOT', 'AP', 'POST'].includes(g.status?.short || '');
        const isLive = ['1P', '2P', '3P', 'OT', 'PT'].includes(g.status?.short || '');

        return {
          id: `nhl_${g.id}`,
          sport: 'nhl',
          provider: 'api-sports-hockey',
          providerGameId: String(g.id),
          league: {
            id: g.league?.id || 57,
            name: g.league?.name || 'NHL',
            season: g.league?.season || getCurrentSportSeason('nhl')
          },
          homeTeam: {
            id: g.teams?.home?.id ?? 0,
            name: g.teams?.home?.name ?? 'Home Team',
            logo: g.teams?.home?.logo
          },
          awayTeam: {
            id: g.teams?.away?.id ?? 0,
            name: g.teams?.away?.name ?? 'Away Team',
            logo: g.teams?.away?.logo
          },
          startsAt: g.date || date,
          status: isFinished ? 'FINISHED' : isLive ? 'IN_PLAY' : 'SCHEDULED',
          homeScore: g.scores?.home,
          awayScore: g.scores?.away,
          periodScores: g.periods ? {
            home: [g.periods.first?.home ?? 0, g.periods.second?.home ?? 0, g.periods.third?.home ?? 0],
            away: [g.periods.first?.away ?? 0, g.periods.second?.away ?? 0, g.periods.third?.away ?? 0]
          } : undefined,
          isOvertime: Boolean(g.periods?.overtime?.home || g.periods?.overtime?.away),
          isShootout: Boolean(g.periods?.penalties?.home || g.periods?.penalties?.away)
        };
      });
    } catch {
      return [];
    }
  }

  public async getGame(gameId: string): Promise<NormalizedGame | null> {
    const rawId = gameId.replace('nhl_', '');
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) return null;

    try {
      const url = `${config.baseUrl}/games?id=${rawId}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) return null;

      const data = (await res.json()) as { response?: ApiHockeyGame[] };
      const g = data.response?.[0];
      if (!g) return null;

      const isFinished = ['FT', 'AOT', 'AP'].includes(g.status?.short || '');

      return {
        id: `nhl_${g.id}`,
        sport: 'nhl',
        provider: 'api-sports-hockey',
        providerGameId: String(g.id),
        league: {
          id: g.league?.id || 57,
          name: 'NHL',
          season: g.league?.season || getCurrentSportSeason('nhl')
        },
        homeTeam: {
          id: g.teams?.home?.id ?? 0,
          name: g.teams?.home?.name ?? 'Home Team',
          logo: g.teams?.home?.logo
        },
        awayTeam: {
          id: g.teams?.away?.id ?? 0,
          name: g.teams?.away?.name ?? 'Away Team',
          logo: g.teams?.away?.logo
        },
        startsAt: g.date,
        status: isFinished ? 'FINISHED' : 'SCHEDULED',
        homeScore: g.scores?.home,
        awayScore: g.scores?.away
      };
    } catch {
      return null;
    }
  }

  public async getH2H(homeTeamId: number | string, awayTeamId: number | string, limit: number = 5): Promise<NormalizedGame[]> {
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) return [];

    try {
      const url = `${config.baseUrl}/games/h2h?h2h=${homeTeamId}-${awayTeamId}`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (!res.ok) return [];

      const data = (await res.json()) as { response?: ApiHockeyGame[] };
      const games = data.response || [];

      // Sort by date descending to get the most recent clashes
      const finished = games
        .filter(g => ['FT', 'AOT', 'AP', 'POST'].includes(g.status?.short || ''))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit);

      return finished.map((g) => ({
        id: `nhl_${g.id}`,
        sport: 'nhl',
        provider: 'api-sports-hockey',
        providerGameId: String(g.id),
        league: {
          id: g.league?.id || 57,
          name: g.league?.name || 'NHL',
          season: g.league?.season || getCurrentSportSeason('nhl')
        },
        homeTeam: {
          id: g.teams?.home?.id ?? 0,
          name: g.teams?.home?.name ?? 'Home Team',
          logo: g.teams?.home?.logo
        },
        awayTeam: {
          id: g.teams?.away?.id ?? 0,
          name: g.teams?.away?.name ?? 'Away Team',
          logo: g.teams?.away?.logo
        },
        startsAt: g.date,
        status: 'FINISHED',
        homeScore: g.scores?.home,
        awayScore: g.scores?.away,
        periodScores: g.periods ? {
          home: [g.periods.first?.home ?? 0, g.periods.second?.home ?? 0, g.periods.third?.home ?? 0],
          away: [g.periods.first?.away ?? 0, g.periods.second?.away ?? 0, g.periods.third?.away ?? 0]
        } : undefined
      }));
    } catch {
      return [];
    }
  }

  public async getTeamRecentGames(teamId: number | string, limit: number = 5): Promise<NormalizedGame[]> {
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) return [];

    try {
      const seasonInt = parseInt(String(getCurrentSportSeason('nhl')).split('-')[0], 10) || 2026;
      let url = `${config.baseUrl}/games?team=${teamId}&season=${seasonInt}`;
      let res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      let data = (await res.json()) as { response?: ApiHockeyGame[] };
      let games = (data.response || []).filter(g => ['FT', 'AOT', 'AP'].includes(g.status?.short || ''));

      // If season 2026 has fewer games, query 2025
      if (games.length < limit) {
        const prevUrl = `${config.baseUrl}/games?team=${teamId}&season=${seasonInt - 1}`;
        const prevRes = await fetch(prevUrl, { headers: this.headers, cache: 'no-store' });
        if (prevRes.ok) {
          const prevData = (await prevRes.json()) as { response?: ApiHockeyGame[] };
          const prevGames = (prevData.response || []).filter(g => ['FT', 'AOT', 'AP'].includes(g.status?.short || ''));
          games = [...games, ...prevGames];
        }
      }

      // Sort descending by date
      games.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return games.slice(0, limit).map((g) => ({
        id: `nhl_${g.id}`,
        sport: 'nhl',
        provider: 'api-sports-hockey',
        providerGameId: String(g.id),
        league: {
          id: g.league?.id || 57,
          name: g.league?.name || 'NHL',
          season: g.league?.season || getCurrentSportSeason('nhl')
        },
        homeTeam: {
          id: g.teams?.home?.id ?? 0,
          name: g.teams?.home?.name ?? 'Home Team',
          logo: g.teams?.home?.logo
        },
        awayTeam: {
          id: g.teams?.away?.id ?? 0,
          name: g.teams?.away?.name ?? 'Away Team',
          logo: g.teams?.away?.logo
        },
        startsAt: g.date,
        status: 'FINISHED',
        homeScore: g.scores?.home,
        awayScore: g.scores?.away
      }));
    } catch {
      return [];
    }
  }

  public async getHistoricalGames(season: string = getCurrentSportSeason('nhl'), limit: number = 100): Promise<NormalizedGame[]> {
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) return [];

    try {
      const seasonInt = parseInt(String(season).split('-')[0], 10) || 2026;
      const url = `${config.baseUrl}/games?league=57&season=${seasonInt}`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (!res.ok) return [];

      const data = (await res.json()) as { response?: ApiHockeyGame[] };
      const games = (data.response || []).filter(g => ['FT', 'AOT', 'AP', 'POST'].includes(g.status?.short || ''));
      games.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return games.slice(0, limit).map((g) => ({
        id: `nhl_${g.id}`,
        sport: 'nhl',
        provider: 'api-sports-hockey',
        providerGameId: String(g.id),
        league: {
          id: g.league?.id || 57,
          name: 'NHL',
          season: g.league?.season || season
        },
        homeTeam: {
          id: g.teams?.home?.id ?? 0,
          name: g.teams?.home?.name ?? 'Home Team',
          logo: g.teams?.home?.logo
        },
        awayTeam: {
          id: g.teams?.away?.id ?? 0,
          name: g.teams?.away?.name ?? 'Away Team',
          logo: g.teams?.away?.logo
        },
        startsAt: g.date,
        status: 'FINISHED',
        homeScore: g.scores?.home,
        awayScore: g.scores?.away
      }));
    } catch {
      return [];
    }
  }

  public async getTeamStats(teamId: string | number, season: string = getCurrentSportSeason('nhl')): Promise<Record<string, unknown>> {
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) return {};

    try {
      const url = `${config.baseUrl}/teams/statistics?league=57&season=${season}&team=${teamId}`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (!res.ok) return {};

      const data = (await res.json()) as { response?: Record<string, unknown> };
      return data.response || {};
    } catch {
      return {};
    }
  }

  public async getOdds(gameId: string): Promise<NormalizedOdds[]> {
    const rawId = gameId.replace('nhl_', '');
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) return [];

    try {
      const url = `${config.baseUrl}/odds?game=${rawId}`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (!res.ok) return [];

      const data = (await res.json()) as { response?: Array<{ bookmakers?: Array<{ name: string; bets: Array<{ name: string; values: Array<{ value: string; odd: string }> }> }> }> };
      const bookmakers = data.response?.[0]?.bookmakers || [];
      const oddsList: NormalizedOdds[] = [];

      for (const bm of bookmakers) {
        for (const bet of bm.bets) {
          for (const val of bet.values) {
            const decimalOdds = parseFloat(val.odd);
            if (decimalOdds > 1.0) {
              oddsList.push({
                provider: 'api-sports-hockey',
                bookmaker: bm.name,
                sport: 'nhl',
                gameId,
                market: String(bet.name || '').toUpperCase(),
                selection: String(val.value ?? ''),
                decimalOdds,
                impliedProbability: Number((1 / decimalOdds).toFixed(4)),
                capturedAt: new Date().toISOString()
              });
            }
          }
        }
      }

      return oddsList;
    } catch {
      return [];
    }
  }

  public async getResults(date: string): Promise<NormalizedGame[]> {
    return this.getSchedule(date);
  }

  public async getDiagnostics(): Promise<{ status: 'OK' | 'ERROR'; message: string; remainingQuota?: number }> {
    const config = SPORTS_CONFIG.nhl;
    if (!this.apiKey) {
      return { status: 'ERROR', message: 'API_NHL_KEY no configurada en el entorno del servidor.' };
    }

    try {
      const url = `${config.baseUrl}/status`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return { status: 'ERROR', message: `API-NHL HTTP ${res.status}` };
      }
      const data = (await res.json()) as { response?: { requests?: { current?: number; limit_day?: number } } };
      const current = data.response?.requests?.current ?? 0;
      const limit = data.response?.requests?.limit_day ?? 100;
      const remaining = Math.max(0, limit - current);

      return {
        status: 'OK',
        message: `API-NHL Conectada y Operativa (${remaining} peticiones restantes hoy).`,
        remainingQuota: remaining
      };
    } catch (err) {
      return {
        status: 'ERROR',
        message: err instanceof Error ? err.message : 'Error al conectar con API-NHL'
      };
    }
  }
}
