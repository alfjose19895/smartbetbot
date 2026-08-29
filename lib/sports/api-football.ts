/**
 * Direct API-Football client for Next.js (Vercel Serverless / Server Actions).
 * Provides typed, cached, rate-limited access to fixtures, leagues, teams, and odds.
 */

export interface SupportedLeague {
  id: number;
  name: string;
  country: string;
  category: "top_europe" | "cups" | "americas" | "other_europe" | "second_divisions";
}

export const SUPPORTED_LEAGUES: SupportedLeague[] = [
  // Top 5 Europe
  { id: 39, name: "Premier League", country: "Inglaterra", category: "top_europe" },
  { id: 140, name: "La Liga", country: "España", category: "top_europe" },
  { id: 135, name: "Serie A", country: "Italia", category: "top_europe" },
  { id: 78, name: "Bundesliga", country: "Alemania", category: "top_europe" },
  { id: 61, name: "Ligue 1", country: "Francia", category: "top_europe" },

  // European Competitions
  { id: 2, name: "UEFA Champions League", country: "Europa", category: "cups" },
  { id: 3, name: "UEFA Europa League", country: "Europa", category: "cups" },
  { id: 848, name: "UEFA Conference League", country: "Europa", category: "cups" },

  // Other European First Tiers
  { id: 94, name: "Primeira Liga", country: "Portugal", category: "other_europe" },
  { id: 88, name: "Eredivisie", country: "Países Bajos", category: "other_europe" },
  { id: 203, name: "Süper Lig", country: "Turquía", category: "other_europe" },
  { id: 179, name: "Premiership", country: "Escocia", category: "other_europe" },
  { id: 144, name: "Pro League", country: "Bélgica", category: "other_europe" },

  // Second Divisions
  { id: 40, name: "Championship", country: "Inglaterra", category: "second_divisions" },
  { id: 141, name: "La Liga 2", country: "España", category: "second_divisions" },
  { id: 79, name: "2. Bundesliga", country: "Alemania", category: "second_divisions" },
  { id: 136, name: "Serie B", country: "Italia", category: "second_divisions" },

  // Americas & Rest of World
  { id: 13, name: "Copa Libertadores", country: "Sudamérica", category: "cups" },
  { id: 11, name: "Copa Sudamericana", country: "Sudamérica", category: "cups" },
  { id: 71, name: "Brasileirão Série A", country: "Brasil", category: "americas" },
  { id: 128, name: "Liga Profesional", country: "Argentina", category: "americas" },
  { id: 262, name: "Liga MX", country: "México", category: "americas" },
  { id: 253, name: "Major League Soccer (MLS)", country: "Estados Unidos", category: "americas" },
  { id: 239, name: "Primera A", country: "Colombia", category: "americas" },
  { id: 307, name: "Saudi Pro League", country: "Arabia Saudita", category: "americas" },
];

export const ALL_LEAGUE_IDS = SUPPORTED_LEAGUES.map((l) => l.id);
export const TOP_5_LEAGUE_IDS = [39, 140, 135, 78, 61];
export const CUPS_LEAGUE_IDS = [2, 3, 848, 13, 11];
export const AMERICAS_LEAGUE_IDS = [71, 128, 262, 253, 239, 307];

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

export interface ApiFootballFixtureItem {
  fixture: {
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
        next: { revalidate: 300 }, // 5 min cache
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
   * Fetch active leagues by ID list
   */
  async getLeagues(leagueIds: number[] = ALL_LEAGUE_IDS): Promise<ApiFootballLeague[]> {
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
   * Fetch upcoming and next fixtures for a league
   */
  async getFixtures(
    leagueId: number,
    season: number,
    fromDate?: string,
    toDate?: string
  ): Promise<ApiFootballFixtureItem[]> {
    const now = new Date();
    const from = fromDate || now.toISOString().split("T")[0];
    const to =
      toDate || new Date(now.getTime() + 14 * 86400000).toISOString().split("T")[0];

    // Query both date range and next fixtures
    const data = await this.request<ApiFootballFixtureItem>("fixtures", {
      league: leagueId,
      season,
      from,
      to,
    });

    if (data && data.length > 0) return data;

    // Fallback: query next 10 fixtures for this league
    return this.request<ApiFootballFixtureItem>("fixtures", {
      league: leagueId,
      season,
      next: 10,
    });
  }

  /**
   * Fetch live in-play fixtures
   */
  async getLiveFixtures(): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { live: "all" });
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
