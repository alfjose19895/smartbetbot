/**
 * Direct API-Football client for Next.js (Vercel Serverless / Server Actions).
 * Provides typed, cached, rate-limited access to fixtures, leagues, teams, and odds.
 */

export interface ApiFootballLeague {
  id: number;
  name: string;
  type: string;
  logo: string;
  country: {
    name: string;
    code: string | null;
    flag: string | null;
  };
  season: number;
}

export interface ApiFootballTeam {
  id: number;
  name: string;
  code: string | null;
  logo: string;
  country: string;
}

export interface ApiFootballFixture {
  id: number;
  referee: string | null;
  timezone: string;
  date: string;
  timestamp: number;
  status: {
    long: string;
    short: string;
    elapsed: number | null;
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
    round: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
    away: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

export interface ApiFootballOdds {
  fixtureId: number;
  bookmaker: string;
  markets: {
    name: string;
    values: {
      value: string;
      odd: number;
    }[];
  }[];
}

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";

export class ApiFootballClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey =
      apiKey ||
      process.env.API_FOOTBALL_KEY ||
      process.env.NEXT_PUBLIC_API_FOOTBALL_KEY ||
      "";
    this.baseUrl = (baseUrl || process.env.API_FOOTBALL_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/$/,
      ""
    );
  }

  private async request<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
    if (!this.apiKey) {
      console.warn("[ApiFootball] No API key configured. Returning empty result.");
      return [];
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const url = `${this.baseUrl}/${endpoint.replace(/^\//, "")}?${searchParams.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          "x-apisports-key": this.apiKey,
          "x-rapidapi-key": this.apiKey,
        },
        next: { revalidate: 300 }, // 5 min Next.js cache
      });

      if (!response.ok) {
        console.error(`[ApiFootball] Error ${response.status} fetching ${url}`);
        return [];
      }

      const data = await response.json();
      if (data.errors && Object.keys(data.errors).length > 0 && !Array.isArray(data.errors)) {
        console.error("[ApiFootball] API returned errors:", data.errors);
      }

      return (data.response as T[]) || [];
    } catch (err) {
      console.error(`[ApiFootball] Request exception for ${endpoint}:`, err);
      return [];
    }
  }

  /**
   * Fetch active leagues (defaults to Premier League 39 and La Liga 140)
   */
  async getLeagues(leagueIds: number[] = [39, 140]): Promise<ApiFootballLeague[]> {
    const results: ApiFootballLeague[] = [];
    for (const id of leagueIds) {
      const data = await this.request<{
        league: { id: number; name: string; type: string; logo: string };
        country: { name: string; code: string; flag: string };
        seasons: { year: number; current: boolean }[];
      }>("leagues", { id, current: "true" });

      if (data && data.length > 0) {
        const item = data[0];
        const currentSeason = item.seasons.find((s) => s.current) || item.seasons[item.seasons.length - 1];
        results.push({
          id: item.league.id,
          name: item.league.name,
          type: item.league.type,
          logo: item.league.logo,
          country: item.country,
          season: currentSeason ? currentSeason.year : new Date().getFullYear(),
        });
      }
    }
    return results;
  }

  /**
   * Fetch teams for a specific league and season
   */
  async getTeams(leagueId: number, season: number): Promise<ApiFootballTeam[]> {
    const data = await this.request<{
      team: { id: number; name: string; code: string; logo: string; country: string };
    }>("teams", { league: leagueId, season });

    return data.map((item) => ({
      id: item.team.id,
      name: item.team.name,
      code: item.team.code,
      logo: item.team.logo,
      country: item.team.country,
    }));
  }

  /**
   * Fetch upcoming and today's fixtures for a league
   */
  async getFixtures(
    leagueId: number,
    season: number,
    fromDate?: string,
    toDate?: string
  ): Promise<ApiFootballFixture[]> {
    const now = new Date();
    const from = fromDate || now.toISOString().split("T")[0];
    const to =
      toDate || new Date(now.getTime() + 14 * 86400000).toISOString().split("T")[0];

    const data = await this.request<ApiFootballFixture>("fixtures", {
      league: leagueId,
      season,
      from,
      to,
    });

    return data;
  }

  /**
   * Fetch live in-play fixtures
   */
  async getLiveFixtures(): Promise<ApiFootballFixture[]> {
    return this.request<ApiFootballFixture>("fixtures", { live: "all" });
  }

  /**
   * Fetch match odds from bookmakers
   */
  async getOdds(fixtureId: number): Promise<ApiFootballOdds | null> {
    const data = await this.request<{
      fixture: { id: number };
      bookmakers: {
        name: string;
        bets: {
          name: string;
          values: { value: string; odd: string }[];
        }[];
      }[];
    }>("odds", { fixture: fixtureId });

    if (!data || data.length === 0 || !data[0].bookmakers || data[0].bookmakers.length === 0) {
      return null;
    }

    const bookmaker = data[0].bookmakers[0];
    return {
      fixtureId,
      bookmaker: bookmaker.name,
      markets: bookmaker.bets.map((bet) => ({
        name: bet.name,
        values: bet.values.map((v) => ({
          value: v.value,
          odd: parseFloat(v.odd),
        })),
      })),
    };
  }
}

export const apiFootball = new ApiFootballClient();
