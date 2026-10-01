import { getCurrentSportSeason } from "../registry";
import { SportsDataProvider, SportCapability, NormalizedGame, NormalizedOdds } from '../types';
import { SPORTS_CONFIG } from '../config';

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

  private get headers(): Record<string, string> {
    const config = SPORTS_CONFIG.nhl;
    return {
      'x-apisports-key': config.apiKey || '',
      'Accept': 'application/json'
    };
  }

  public async getSchedule(date: string): Promise<NormalizedGame[]> {
    const config = SPORTS_CONFIG.nhl;
    if (!config.apiKey) {
      return [];
    }

    try {
      const url = `${config.baseUrl}/games?date=${date}&league=57`;
      const res = await fetch(url, { headers: this.headers, next: { revalidate: 300 } });
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
    if (!config.apiKey) return null;

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

  public async getHistoricalGames(_season: string, _limit: number = 100): Promise<NormalizedGame[]> {
    return [];
  }

  public async getTeamStats(teamId: string | number, season: string = getCurrentSportSeason('nhl')): Promise<Record<string, unknown>> {
    const config = SPORTS_CONFIG.nhl;
    if (!config.apiKey) return {};

    try {
      const url = `${config.baseUrl}/teams/statistics?league=57&season=${season}&team=${teamId}`;
      const res = await fetch(url, { headers: this.headers, next: { revalidate: 3600 } });
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
    if (!config.apiKey) return [];

    try {
      const url = `${config.baseUrl}/odds?game=${rawId}`;
      const res = await fetch(url, { headers: this.headers, next: { revalidate: 600 } });
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
                market: bet.name.toUpperCase(),
                selection: val.value,
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
    if (!config.apiKey) {
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
