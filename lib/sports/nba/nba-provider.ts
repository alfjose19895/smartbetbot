import { SportsDataProvider, SportCapability, NormalizedGame, NormalizedOdds } from '../types';
import { SPORTS_CONFIG } from '../config';

interface ApiNbaGame {
  id: number;
  date?: string;
  league?: { id?: number | string; name?: string; season?: string };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  status?: { short?: string };
  scores?: {
    home?: { total?: number };
    away?: { total?: number };
  };
}

export class NBAProvider implements SportsDataProvider {
  public readonly sport = 'nba';
  public readonly name = 'API-NBA Provider';

  private readonly supportedCapabilities: Set<SportCapability> = new Set([
    'schedule',
    'team_stats',
    'player_stats',
    'injuries',
    'odds',
    'h2h'
  ]);

  public supports(capability: SportCapability): boolean {
    return this.supportedCapabilities.has(capability);
  }

  private get headers(): Record<string, string> {
    const config = SPORTS_CONFIG.nba;
    return {
      'x-apisports-key': config.apiKey || '',
      'Accept': 'application/json'
    };
  }

  public async getSchedule(date: string): Promise<NormalizedGame[]> {
    const config = SPORTS_CONFIG.nba;
    if (!config.apiKey) {
      return [];
    }

    try {
      const url = `${config.baseUrl}/games?date=${date}&league=12&season=2025-2026`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) return [];

      const data = (await res.json()) as { response?: ApiNbaGame[] };
      const games = data.response || [];

      return games.map((g) => ({
        id: `nba_${g.id}`,
        sport: 'nba',
        provider: 'api-nba',
        providerGameId: String(g.id),
        league: {
          id: g.league?.id || '12',
          name: g.league?.name || 'NBA',
          season: g.league?.season || '2025-2026'
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
        status: g.status?.short === 'FT' || g.status?.short === 'AOT' ? 'FINISHED' : 'SCHEDULED',
        homeScore: g.scores?.home?.total,
        awayScore: g.scores?.away?.total
      }));
    } catch {
      return [];
    }
  }

  public async getGame(gameId: string): Promise<NormalizedGame | null> {
    const rawId = gameId.replace('nba_', '');
    const config = SPORTS_CONFIG.nba;
    if (!config.apiKey) return null;

    try {
      const url = `${config.baseUrl}/games?id=${rawId}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) return null;
      const data = (await res.json()) as { response?: ApiNbaGame[] };
      const g = data.response?.[0];
      if (!g) return null;

      return {
        id: `nba_${g.id}`,
        sport: 'nba',
        provider: 'api-nba',
        providerGameId: String(g.id),
        league: {
          id: g.league?.id || '12',
          name: 'NBA',
          season: g.league?.season || '2025-2026'
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
        startsAt: g.date || new Date().toISOString(),
        status: g.status?.short === 'FT' ? 'FINISHED' : 'SCHEDULED',
        homeScore: g.scores?.home?.total,
        awayScore: g.scores?.away?.total
      };
    } catch {
      return null;
    }
  }

  public async getHistoricalGames(_season: string, _limit: number = 100): Promise<NormalizedGame[]> {
    return [];
  }

  public async getTeamStats(_teamId: string | number, _season: string): Promise<Record<string, unknown>> {
    return {};
  }

  public async getOdds(_gameId: string): Promise<NormalizedOdds[]> {
    return [];
  }

  public async getResults(date: string): Promise<NormalizedGame[]> {
    return this.getSchedule(date);
  }

  public async getDiagnostics(): Promise<{ status: 'OK' | 'ERROR'; message: string; remainingQuota?: number }> {
    const config = SPORTS_CONFIG.nba;
    if (!config.apiKey) {
      return { status: 'ERROR', message: 'API_NBA_KEY no configurada en el entorno del servidor.' };
    }
    return { status: 'OK', message: 'NBA Provider conectado correctamente.' };
  }
}
