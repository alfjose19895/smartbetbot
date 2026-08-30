/**
 * Direct API-Football client for Next.js (Vercel Serverless / Server Actions).
 * Provides typed, in-memory cached, rate-limited access to fixtures, leagues, teams, and odds.
 */

export interface SupportedLeague {
  id: number;
  name: string;
  country: string;
  category: "top_europe" | "cups" | "other_europe" | "americas" | "asia_africa" | "second_divisions";
  tier?: number;
}

export const SUPPORTED_LEAGUES: SupportedLeague[] = [
  // Top 5 European Leagues - Tier 1
  { id: 39, name: "Premier League", country: "Inglaterra", category: "top_europe", tier: 1 },
  { id: 140, name: "La Liga", country: "España", category: "top_europe", tier: 1 },
  { id: 135, name: "Serie A", country: "Italia", category: "top_europe", tier: 1 },
  { id: 78, name: "Bundesliga", country: "Alemania", category: "top_europe", tier: 1 },
  { id: 61, name: "Ligue 1", country: "Francia", category: "top_europe", tier: 1 },

  // European 2nd & 3rd Divisions (Inglaterra, España, Italia, Alemania, Francia)
  { id: 40, name: "Championship (2da Div)", country: "Inglaterra", category: "second_divisions", tier: 2 },
  { id: 41, name: "League One (3ra Div)", country: "Inglaterra", category: "second_divisions", tier: 3 },
  { id: 42, name: "League Two (4ta Div)", country: "Inglaterra", category: "second_divisions", tier: 4 },
  { id: 45, name: "FA Cup", country: "Inglaterra", category: "cups" },
  { id: 48, name: "EFL Cup (Carabao Cup)", country: "Inglaterra", category: "cups" },

  { id: 141, name: "La Liga 2 (Segunda División)", country: "España", category: "second_divisions", tier: 2 },
  { id: 142, name: "Primera Federación (3ra Div)", country: "España", category: "second_divisions", tier: 3 },
  { id: 143, name: "Copa del Rey", country: "España", category: "cups" },

  { id: 136, name: "Serie B", country: "Italia", category: "second_divisions", tier: 2 },
  { id: 137, name: "Serie C (3ra Div)", country: "Italia", category: "second_divisions", tier: 3 },
  { id: 138, name: "Coppa Italia", country: "Italia", category: "cups" },

  { id: 79, name: "2. Bundesliga", country: "Alemania", category: "second_divisions", tier: 2 },
  { id: 80, name: "3. Liga", country: "Alemania", category: "second_divisions", tier: 3 },
  { id: 81, name: "DFB Pokal", country: "Alemania", category: "cups" },

  { id: 62, name: "Ligue 2", country: "Francia", category: "second_divisions", tier: 2 },
  { id: 63, name: "National 1 (3ra Div)", country: "Francia", category: "second_divisions", tier: 3 },
  { id: 66, name: "Coupe de France", country: "Francia", category: "cups" },

  // Portugal (1ra, 2da, 3ra)
  { id: 94, name: "Primeira Liga", country: "Portugal", category: "other_europe", tier: 1 },
  { id: 95, name: "Liga Portugal 2", country: "Portugal", category: "second_divisions", tier: 2 },
  { id: 804, name: "Liga 3", country: "Portugal", category: "second_divisions", tier: 3 },
  { id: 96, name: "Taça de Portugal", country: "Portugal", category: "cups" },

  // Países Bajos (1ra, 2da)
  { id: 88, name: "Eredivisie", country: "Países Bajos", category: "other_europe", tier: 1 },
  { id: 89, name: "Eerste Divisie (2da Div)", country: "Países Bajos", category: "second_divisions", tier: 2 },
  { id: 90, name: "KNVB Beker", country: "Países Bajos", category: "cups" },

  // Bélgica (1ra, 2da, 3ra)
  { id: 144, name: "Pro League", country: "Bélgica", category: "other_europe", tier: 1 },
  { id: 145, name: "Challenger Pro League (2da Div)", country: "Bélgica", category: "second_divisions", tier: 2 },
  { id: 146, name: "National 1 (3ra Div)", country: "Bélgica", category: "second_divisions", tier: 3 },
  { id: 147, name: "Belgian Cup", country: "Bélgica", category: "cups" },

  // Escocia (1ra, 2da, 3ra)
  { id: 179, name: "Premiership", country: "Escocia", category: "other_europe", tier: 1 },
  { id: 180, name: "Championship (2da Div)", country: "Escocia", category: "second_divisions", tier: 2 },
  { id: 181, name: "League One (3ra Div)", country: "Escocia", category: "second_divisions", tier: 3 },
  { id: 182, name: "Scottish Cup", country: "Escocia", category: "cups" },

  // Turquía (1ra, 2da, 3ra)
  { id: 203, name: "Süper Lig", country: "Turquía", category: "other_europe", tier: 1 },
  { id: 204, name: "1. Lig (2da Div)", country: "Turquía", category: "second_divisions", tier: 2 },
  { id: 205, name: "2. Lig (3ra Div)", country: "Turquía", category: "second_divisions", tier: 3 },

  // Grecia (1ra, 2da)
  { id: 197, name: "Super League 1", country: "Grecia", category: "other_europe", tier: 1 },
  { id: 198, name: "Super League 2 (2da Div)", country: "Grecia", category: "second_divisions", tier: 2 },

  // Austria (1ra, 2da, 3ra)
  { id: 218, name: "Austrian Bundesliga", country: "Austria", category: "other_europe", tier: 1 },
  { id: 219, name: "2. Liga", country: "Austria", category: "second_divisions", tier: 2 },
  { id: 220, name: "Regionalliga (3ra Div)", country: "Austria", category: "second_divisions", tier: 3 },

  // Suiza (1ra, 2da, 3ra)
  { id: 207, name: "Super League", country: "Suiza", category: "other_europe", tier: 1 },
  { id: 208, name: "Challenge League (2da Div)", country: "Suiza", category: "second_divisions", tier: 2 },
  { id: 209, name: "Promotion League (3ra Div)", country: "Suiza", category: "second_divisions", tier: 3 },

  // Dinamarca (1ra, 2da, 3ra)
  { id: 119, name: "Superliga", country: "Dinamarca", category: "other_europe", tier: 1 },
  { id: 120, name: "1. Division (2da Div)", country: "Dinamarca", category: "second_divisions", tier: 2 },
  { id: 121, name: "2. Division (3ra Div)", country: "Dinamarca", category: "second_divisions", tier: 3 },

  // Suecia (1ra, 2da, 3ra)
  { id: 113, name: "Allsvenskan", country: "Suecia", category: "other_europe", tier: 1 },
  { id: 114, name: "Superettan (2da Div)", country: "Suecia", category: "second_divisions", tier: 2 },
  { id: 115, name: "Ettan (3ra Div)", country: "Suecia", category: "second_divisions", tier: 3 },

  // Noruega (1ra, 2da, 3ra)
  { id: 103, name: "Eliteserien", country: "Noruega", category: "other_europe", tier: 1 },
  { id: 104, name: "1. Division (2da Div)", country: "Noruega", category: "second_divisions", tier: 2 },
  { id: 105, name: "2. Division (3ra Div)", country: "Noruega", category: "second_divisions", tier: 3 },

  // Polonia (1ra, 2da, 3ra)
  { id: 106, name: "Ekstraklasa", country: "Polonia", category: "other_europe", tier: 1 },
  { id: 107, name: "I Liga (2da Div)", country: "Polonia", category: "second_divisions", tier: 2 },
  { id: 108, name: "II Liga (3ra Div)", country: "Polonia", category: "second_divisions", tier: 3 },

  // República Checa (1ra, 2da)
  { id: 345, name: "Czech First League", country: "República Checa", category: "other_europe", tier: 1 },
  { id: 346, name: "FNL (2da Div)", country: "República Checa", category: "second_divisions", tier: 2 },

  // Croacia (1ra, 2da)
  { id: 210, name: "HNL", country: "Croacia", category: "other_europe", tier: 1 },
  { id: 211, name: "1. NL (2da Div)", country: "Croacia", category: "second_divisions", tier: 2 },

  // UEFA & Continental Cups
  { id: 2, name: "UEFA Champions League", country: "Europa", category: "cups" },
  { id: 3, name: "UEFA Europa League", country: "Europa", category: "cups" },
  { id: 848, name: "UEFA Conference League", country: "Europa", category: "cups" },
  { id: 531, name: "UEFA Super Cup", country: "Europa", category: "cups" },
  { id: 5, name: "UEFA Nations League", country: "Europa", category: "cups" },
  { id: 1, name: "World Cup", country: "Mundial", category: "cups" },

  // Américas (1ra y 2da División)
  { id: 71, name: "Brasileirão Série A", country: "Brasil", category: "americas", tier: 1 },
  { id: 72, name: "Brasileirão Série B", country: "Brasil", category: "second_divisions", tier: 2 },
  { id: 128, name: "Liga Profesional Argentina", country: "Argentina", category: "americas", tier: 1 },
  { id: 129, name: "Primera Nacional (2da Div)", country: "Argentina", category: "second_divisions", tier: 2 },
  { id: 13, name: "Copa Libertadores", country: "Sudamérica", category: "cups" },
  { id: 11, name: "Copa Sudamericana", country: "Sudamérica", category: "cups" },
  { id: 262, name: "Liga MX", country: "México", category: "americas", tier: 1 },
  { id: 263, name: "Liga de Expansión MX", country: "México", category: "second_divisions", tier: 2 },
  { id: 253, name: "Major League Soccer (MLS)", country: "Estados Unidos", category: "americas", tier: 1 },
  { id: 254, name: "USL Championship", country: "Estados Unidos", category: "second_divisions", tier: 2 },
  { id: 239, name: "Primera A", country: "Colombia", category: "americas", tier: 1 },
  { id: 240, name: "Primera B", country: "Colombia", category: "second_divisions", tier: 2 },
  { id: 242, name: "Liga Pro", country: "Ecuador", category: "americas", tier: 1 },
  { id: 281, name: "Liga 1", country: "Perú", category: "americas", tier: 1 },
  { id: 265, name: "Primera División", country: "Chile", category: "americas", tier: 1 },
  { id: 271, name: "Primera División", country: "Uruguay", category: "americas", tier: 1 },
  { id: 250, name: "Primera División", country: "Paraguay", category: "americas", tier: 1 },

  // Asia, Middle East & Africa
  { id: 307, name: "Saudi Pro League", country: "Arabia Saudita", category: "asia_africa", tier: 1 },
  { id: 98, name: "J1 League", country: "Japón", category: "asia_africa", tier: 1 },
  { id: 99, name: "J2 League", country: "Japón", category: "second_divisions", tier: 2 },
  { id: 292, name: "K League 1", country: "Corea del Sur", category: "asia_africa", tier: 1 },
  { id: 188, name: "A-League", country: "Australia", category: "asia_africa", tier: 1 },
  { id: 301, name: "Stars League", country: "Qatar", category: "asia_africa", tier: 1 },
  { id: 233, name: "Premier League", country: "Egipto", category: "asia_africa", tier: 1 },
  { id: 288, name: "Premier Division", country: "Sudáfrica", category: "asia_africa", tier: 1 },
];

export const ALL_LEAGUE_IDS = SUPPORTED_LEAGUES.map((l) => l.id);
export const TOP_5_LEAGUE_IDS = [39, 140, 135, 78, 61];
export const CUPS_LEAGUE_IDS = [2, 3, 848, 5, 13, 11, 45, 48, 143, 138, 81, 66, 96, 90, 147, 182];
export const AMERICAS_LEAGUE_IDS = [71, 72, 128, 129, 262, 263, 253, 254, 239, 240, 242, 281, 265, 271, 250];

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
const DEFAULT_API_KEY = "01de09ba37a81c948be7aebcaf154c61";

// In-memory cache for Serverless runtime (prevents burning through API rate limits)
const cacheStore = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class ApiFootballClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey =
      apiKey ||
      process.env.API_FOOTBALL_KEY ||
      process.env.NEXT_PUBLIC_API_FOOTBALL_KEY ||
      DEFAULT_API_KEY;
    this.baseUrl = (baseUrl || process.env.API_FOOTBALL_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/$/,
      ""
    );
  }

  private async request<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const cacheKey = `${endpoint}?${searchParams.toString()}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T[];
    }

    const url = `${this.baseUrl}/${endpoint.replace(/^\//, "")}?${searchParams.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          "x-apisports-key": this.apiKey,
          "x-rapidapi-key": this.apiKey,
        },
      });

      if (!response.ok) {
        console.error(`[ApiFootball] Error ${response.status} fetching ${url}`);
        return [];
      }

      const data = await response.json();
      if (data.errors && Object.keys(data.errors).length > 0 && !Array.isArray(data.errors)) {
        console.warn("[ApiFootball] API message:", data.errors);
      }

      const result = (data.response as T[]) || [];
      if (result.length > 0) {
        cacheStore.set(cacheKey, { data: result, timestamp: Date.now() });
      }
      return result;
    } catch (err) {
      console.error(`[ApiFootball] Request exception for ${endpoint}:`, err);
      return [];
    }
  }

  /**
   * Fetch active leagues by ID list
   */
  async getLeagues(leagueIds: number[] = TOP_5_LEAGUE_IDS): Promise<ApiFootballLeague[]> {
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
    season?: number,
    fromDate?: string,
    toDate?: string,
    nextCount: number = 6
  ): Promise<ApiFootballFixtureItem[]> {
    if (fromDate && toDate && season) {
      const data = await this.request<ApiFootballFixtureItem>("fixtures", {
        league: leagueId,
        season,
        from: fromDate,
        to: toDate,
      });
      if (data && data.length > 0) return data;
    }

    return this.request<ApiFootballFixtureItem>("fixtures", {
      league: leagueId,
      next: nextCount,
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
