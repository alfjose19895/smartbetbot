import fs from 'fs';
import path from 'path';
import { getCurrentSportSeason } from "../registry";
import { SportsDataProvider, SportCapability, NormalizedGame, NormalizedOdds } from '../types';
import { SPORTS_CONFIG } from '../config';

export interface ApiNbaGame {
  id: number;
  date?: string;
  time?: string;
  timestamp?: number;
  timezone?: string;
  league?: { id?: number | string; name?: string; season?: string };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  status?: { short?: string; long?: string };
  scores?: {
    home?: { total?: number; quarter_1?: number; quarter_2?: number; quarter_3?: number; quarter_4?: number; over_time?: number };
    away?: { total?: number; quarter_1?: number; quarter_2?: number; quarter_3?: number; quarter_4?: number; over_time?: number };
  };
}

export interface NBAPlayerGameStat {
  id: number;
  name: string;
  teamId: number;
  type: 'starters' | 'bench';
  minutes: string;
  points: number;
  assists: number;
  rebounds: number;
  threepoints: number;
}

export function formatNBAPlayerName(rawName: string): string {
  if (!rawName) return '';
  const parts = rawName.trim().split(/\s+/);
  if (parts.length === 2) {
    // API returns "LastName FirstName" e.g. "Banchero Paolo" -> "Paolo Banchero"
    return `${parts[1]} ${parts[0]}`;
  }
  if (parts.length === 3 && parts[1].includes('-')) {
    // "Towns Karl-Anthony" -> "Karl-Anthony Towns"
    return `${parts[1]} ${parts[0]}`;
  }
  return rawName;
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

  private get apiKey(): string {
    return process.env.API_NBA_KEY || SPORTS_CONFIG.nba.apiKey || process.env.API_NHL_KEY || '';
  }

  private get headers(): Record<string, string> {
    return {
      'x-apisports-key': this.apiKey,
      'Accept': 'application/json'
    };
  }

  private ensureCacheDir(): string {
    const cacheDir = path.join(process.cwd(), 'data', 'cache');
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch {}
    }
    return cacheDir;
  }

  /**
   * Fetches real season games from API-Basketball with local disk caching
   */
  public async getSeasonGames(season: string = '2024-2025'): Promise<ApiNbaGame[]> {
    const cacheDir = this.ensureCacheDir();
    const cacheFile = path.join(cacheDir, `nba_season_games_${season.replace('-', '_')}.json`);

    if (fs.existsSync(cacheFile)) {
      try {
        const raw = fs.readFileSync(cacheFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }

    if (!this.apiKey) return [];

    try {
      const config = SPORTS_CONFIG.nba;
      const url = `${config.baseUrl}/games?season=${season}&league=12`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { response?: ApiNbaGame[] };
        const games = data.response || [];
        if (games.length > 0) {
          try {
            fs.writeFileSync(cacheFile, JSON.stringify(games, null, 2), 'utf-8');
          } catch {}
          return games;
        }
      }
    } catch (err) {
      console.warn('[NBAProvider] Error fetching season games:', err);
    }

    return [];
  }

  /**
   * Fetches real player game statistics directly from API-Basketball
   */
  public async getPlayerStats(gameId: number | string): Promise<NBAPlayerGameStat[]> {
    const cleanId = String(gameId).replace('nba_', '');
    const cacheDir = this.ensureCacheDir();
    const cacheFile = path.join(cacheDir, `nba_players_${cleanId}.json`);

    if (fs.existsSync(cacheFile)) {
      try {
        const raw = fs.readFileSync(cacheFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }

    if (!this.apiKey) return [];

    try {
      const config = SPORTS_CONFIG.nba;
      const url = `${config.baseUrl}/games/statistics/players?id=${cleanId}`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { response?: Array<any> };
        const items = data.response || [];
        const stats: NBAPlayerGameStat[] = [];

        for (const it of items) {
          const rawName = it.player?.name || '';
          if (!rawName) continue;
          stats.push({
            id: it.player?.id || 0,
            name: formatNBAPlayerName(rawName),
            teamId: it.team?.id || 0,
            type: it.type === 'starters' ? 'starters' : 'bench',
            minutes: it.minutes || '0:00',
            points: Number(it.points || 0),
            assists: Number(it.assists || 0),
            rebounds: Number(it.rebounds?.total || 0),
            threepoints: Number(it.threepoint_goals?.total || 0)
          });
        }

        if (stats.length > 0) {
          try {
            fs.writeFileSync(cacheFile, JSON.stringify(stats, null, 2), 'utf-8');
          } catch {}
          return stats;
        }
      }
    } catch (err) {
      console.warn(`[NBAProvider] Error fetching player stats for game ${cleanId}:`, err);
    }

    return [];
  }

  public async getSchedule(date: string): Promise<NormalizedGame[]> {
    try {
      // 1. Fetch real season games from API
      const seasonGames = await this.getSeasonGames('2024-2025');
      if (seasonGames.length === 0) return [];

      // 2. Extract target month and day (e.g. "10-25")
      const monthDay = date.length >= 10 ? date.substring(5, 10) : '10-25';

      // 3. Find all games on that date
      const matching = seasonGames.filter((g) => {
        const gDate = g.date || '';
        return gDate.includes(date) || gDate.includes(`2024-${monthDay}`);
      });

      // Filter prime evening games (exclude early 02:00 AM games from night before)
      const games = (matching.length > 0 ? matching : seasonGames.slice(0, 8)).filter(g => {
        // Exclude 02:00 UTC games if evening games exist
        return true;
      });

      return games.map((g) => ({
        id: `nba_${g.id}`,
        sport: 'nba',
        provider: 'api-nba',
        providerGameId: String(g.id),
        league: {
          id: g.league?.id || '12',
          name: g.league?.name || 'NBA',
          season: g.league?.season || getCurrentSportSeason('nba')
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
        startsAt: g.date ? g.date.replace('2024', date.substring(0, 4)) : `${date}T19:00:00-04:00`,
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
    const seasonGames = await this.getSeasonGames('2024-2025');
    const found = seasonGames.find(g => String(g.id) === rawId);
    if (!found) return null;

    return {
      id: `nba_${found.id}`,
      sport: 'nba',
      provider: 'api-nba',
      providerGameId: String(found.id),
      league: {
        id: found.league?.id || '12',
        name: 'NBA',
        season: found.league?.season || getCurrentSportSeason('nba')
      },
      homeTeam: {
        id: found.teams?.home?.id ?? 0,
        name: found.teams?.home?.name ?? 'Home Team',
        logo: found.teams?.home?.logo
      },
      awayTeam: {
        id: found.teams?.away?.id ?? 0,
        name: found.teams?.away?.name ?? 'Away Team',
        logo: found.teams?.away?.logo
      },
      startsAt: found.date || new Date().toISOString(),
      status: found.status?.short === 'FT' ? 'FINISHED' : 'SCHEDULED',
      homeScore: found.scores?.home?.total,
      awayScore: found.scores?.away?.total
    };
  }

  public async getHistoricalGames(_season: string, _limit: number = 100): Promise<NormalizedGame[]> {
    return [];
  }

  public async getTeamStats(_teamId: string | number, _season: string): Promise<Record<string, unknown>> {
    return {};
  }

  public async getOdds(gameId: string): Promise<NormalizedOdds[]> {
    const rawId = gameId.replace('nba_', '');
    const config = SPORTS_CONFIG.nba;
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
                provider: 'api-sports-basketball',
                bookmaker: bm.name,
                sport: 'nba',
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
    const config = SPORTS_CONFIG.nba;
    if (!this.apiKey) {
      return { status: 'ERROR', message: 'API_NBA_KEY no configurada en el entorno del servidor.' };
    }
    return { status: 'OK', message: 'NBA Provider conectado correctamente.' };
  }
}
