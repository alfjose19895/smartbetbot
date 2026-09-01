/**
 * API-Football Client for SmartBetBot
 * Comprehensive integration with RapidAPI / API-Sports v3
 * Strictly real data with America/Guayaquil (UTC-5) timezone alignment.
 */

export interface SupportedLeague {
  id: number;
  name: string;
  country: string;
  category: "top5" | "second_divisions" | "europe_mid" | "americas" | "cups" | "asia_africa";
  tier?: number;
}

export const SUPPORTED_LEAGUES: SupportedLeague[] = [
  // Top 5 Ligas Europeas
  { id: 39, name: "Premier League", country: "Inglaterra", category: "top5", tier: 1 },
  { id: 140, name: "La Liga", country: "España", category: "top5", tier: 1 },
  { id: 135, name: "Serie A", country: "Italia", category: "top5", tier: 1 },
  { id: 78, name: "Bundesliga", country: "Alemania", category: "top5", tier: 1 },
  { id: 61, name: "Ligue 1", country: "Francia", category: "top5", tier: 1 },

  // Segundas Divisiones Europeas
  { id: 40, name: "Championship", country: "Inglaterra", category: "second_divisions", tier: 2 },
  { id: 141, name: "La Liga 2 (Segunda División)", country: "España", category: "second_divisions", tier: 2 },
  { id: 136, name: "Serie B", country: "Italia", category: "second_divisions", tier: 2 },
  { id: 79, name: "2. Bundesliga", country: "Alemania", category: "second_divisions", tier: 2 },
  { id: 62, name: "Ligue 2", country: "Francia", category: "second_divisions", tier: 2 },

  // Ligas Europeas Medianas (1ra División)
  { id: 88, name: "Eredivisie", country: "Países Bajos", category: "europe_mid", tier: 1 },
  { id: 89, name: "Eerste Divisie (2da Div)", country: "Países Bajos", category: "second_divisions", tier: 2 },
  { id: 94, name: "Primeira Liga", country: "Portugal", category: "europe_mid", tier: 1 },
  { id: 95, name: "Liga Portugal 2", country: "Portugal", category: "second_divisions", tier: 2 },
  { id: 203, name: "Süper Lig", country: "Turquía", category: "europe_mid", tier: 1 },
  { id: 144, name: "Jupiler Pro League", country: "Bélgica", category: "europe_mid", tier: 1 },
  { id: 179, name: "Premiership", country: "Escocia", category: "europe_mid", tier: 1 },
  { id: 218, name: "Austrian Bundesliga", country: "Austria", category: "europe_mid", tier: 1 },
  { id: 207, name: "Super League", country: "Suiza", category: "europe_mid", tier: 1 },
  { id: 119, name: "Superliga", country: "Dinamarca", category: "europe_mid", tier: 1 },
  { id: 103, name: "Eliteserien", country: "Noruega", category: "europe_mid", tier: 1 },
  { id: 113, name: "Allsvenskan", country: "Suecia", category: "europe_mid", tier: 1 },
  { id: 197, name: "Super League 1", country: "Grecia", category: "europe_mid", tier: 1 },

  // Copas y Torneos Internacionales
  { id: 2, name: "UEFA Champions League", country: "Europa", category: "cups" },
  { id: 3, name: "UEFA Europa League", country: "Europa", category: "cups" },
  { id: 848, name: "UEFA Europa Conference League", country: "Europa", category: "cups" },
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
  code: string;
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
    periods: {
      first: number | null;
      second: number | null;
    };
    venue: {
      id: number | null;
      name: string | null;
      city: string | null;
    };
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
    halftime: {
      home: number | null;
      away: number | null;
    };
    fulltime: {
      home: number | null;
      away: number | null;
    };
    extratime: {
      home: number | null;
      away: number | null;
    };
    penalty: {
      home: number | null;
      away: number | null;
    };
  };
}

export interface ApiFootballOddsItem {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    season: number;
  };
  fixture: {
    id: number;
    timezone: string;
    date: string;
    timestamp: number;
  };
  bookmakers: {
    id: number;
    name: string;
    bets: {
      id: number;
      name: string;
      values: {
        value: string | number;
        odd: string;
      }[];
    }[];
  }[];
}

class ApiFootballClient {
  private apiKey: string;
  private baseUrl: string = "https://v3.football.api-sports.io";
  private defaultTimezone: string = "America/Guayaquil";

  constructor() {
    this.apiKey =
      process.env.API_FOOTBALL_KEY ||
      process.env.NEXT_PUBLIC_API_FOOTBALL_KEY ||
      "01de09ba37a81c948be7aebcaf154c61";
  }

  public async request<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
    if (!this.apiKey) {
      console.warn(`[ApiFootball] API Key is missing. Skipping request to ${endpoint}`);
      return [];
    }

    try {
      const url = new URL(`${this.baseUrl}/${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-rapidapi-key": this.apiKey,
          "x-apisports-key": this.apiKey,
        },
        next: { revalidate: 180 },
      });

      if (!response.ok) {
        console.error(`[ApiFootball] HTTP error ${response.status} fetching ${endpoint}`);
        return [];
      }

      const json = await response.json();

      if (json.errors && Object.keys(json.errors).length > 0) {
        console.warn(`[ApiFootball] API returned errors:`, json.errors);
        return [];
      }

      return (json.response as T[]) || [];
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
  async getUpcomingFixtures(leagueId: number, nextCount: number = 10, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", {
      league: leagueId,
      next: nextCount,
      timezone,
    });
  }

  /**
   * Fetch all fixtures for a specific date in a single API call strictly in Ecuador timezone
   */
  async getFixturesByDate(dateStr: string, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { date: dateStr, timezone });
  }

  /**
   * Fetch official finished fixtures with confirmed real final scores for a specific date in Ecuador timezone
   */
  async getFinishedFixturesByDate(dateStr: string, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { date: dateStr, status: "FT", timezone });
  }

  /**
   * Fetch live in-play fixtures
   */
  async getLiveFixtures(timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { live: "all", timezone });
  }

  /**
   * Fetch fixtures for a league (general helper)
   */
  async getFixtures(leagueId: number, count: number = 20, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { league: leagueId, next: count, timezone });
  }

  /**
   * Fetch Head-to-Head between two team IDs
   */
  async getHeadToHead(teamA: number, teamB: number, last: number = 10, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures/headtohead", {
      h2h: `${teamA}-${teamB}`,
      last,
      timezone,
    });
  }

  /**
   * Fetch recent finished fixtures for a specific team
   */
  async getTeamRecentFixtures(teamId: number, last: number = 5, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", {
      team: teamId,
      last,
      status: "FT",
      timezone,
    });
  }

  async getTeamLastFixtures(teamId: number, last: number = 5, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.getTeamRecentFixtures(teamId, last, timezone);
  }

  /**
   * Search for a team by name to get its official API-Football ID
   */
  async searchTeam(name: string): Promise<ApiFootballTeam | null> {
    const results = await this.request<{ team: ApiFootballTeam }>("teams", { search: name });
    if (results && results.length > 0) {
      return results[0].team;
    }
    return null;
  }

  /**
   * Fetch live in-play odds or pre-match odds for a fixture
   */
  async getOddsByFixture(fixtureId: number): Promise<ApiFootballOddsItem | null> {
    const data = await this.request<ApiFootballOddsItem>("odds", {
      fixture: fixtureId,
    });
    return data.length > 0 ? data[0] : null;
  }
}

export const apiFootball = new ApiFootballClient();
