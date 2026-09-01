/**
 * API-Football Client for SmartBetBot
 * Comprehensive integration with RapidAPI / API-Sports v3
 * Strictly real data with America/Guayaquil (UTC-5) timezone alignment.
 */

export interface SupportedLeague {
  id: number;
  name: string;
  country: string;
  category: "top5" | "second_divisions" | "europe_mid" | "americas" | "cups" | "asia_africa" | "nordics_others";
  tier?: number;
}

export const SUPPORTED_LEAGUES: SupportedLeague[] = [
  // --- TOP 5 LIGAS EUROPEAS & COPAS UEFA ---
  { id: 39, name: "Premier League", country: "Inglaterra", category: "top5", tier: 1 },
  { id: 140, name: "La Liga", country: "España", category: "top5", tier: 1 },
  { id: 135, name: "Serie A", country: "Italia", category: "top5", tier: 1 },
  { id: 78, name: "Bundesliga", country: "Alemania", category: "top5", tier: 1 },
  { id: 61, name: "Ligue 1", country: "Francia", category: "top5", tier: 1 },
  { id: 2, name: "UEFA Champions League", country: "Europa", category: "cups", tier: 1 },
  { id: 3, name: "UEFA Europa League", country: "Europa", category: "cups", tier: 1 },
  { id: 848, name: "UEFA Europa Conference League", country: "Europa", category: "cups", tier: 1 },
  { id: 5, name: "UEFA Nations League", country: "Europa", category: "cups", tier: 1 },

  // --- INGLATERRA (TODAS LAS DIVISIONES) ---
  { id: 40, name: "Championship", country: "Inglaterra", category: "second_divisions", tier: 2 },
  { id: 41, name: "League One", country: "Inglaterra", category: "nordics_others", tier: 3 },
  { id: 42, name: "League Two", country: "Inglaterra", category: "nordics_others", tier: 4 },
  { id: 43, name: "National League", country: "Inglaterra", category: "nordics_others", tier: 5 },
  { id: 44, name: "National League - North", country: "Inglaterra", category: "nordics_others", tier: 6 },
  { id: 45, name: "National League - South", country: "Inglaterra", category: "nordics_others", tier: 6 },

  // --- ALEMANIA (1RA, 2DA, 3RA Y REGIONALES) ---
  { id: 79, name: "2. Bundesliga", country: "Alemania", category: "second_divisions", tier: 2 },
  { id: 80, name: "3. Liga", country: "Alemania", category: "nordics_others", tier: 3 },
  { id: 86, name: "Regionalliga - Nord", country: "Alemania", category: "nordics_others", tier: 4 },
  { id: 87, name: "Regionalliga - Nordost", country: "Alemania", category: "nordics_others", tier: 4 },
  { id: 84, name: "Regionalliga - West", country: "Alemania", category: "nordics_others", tier: 4 },
  { id: 85, name: "Regionalliga - Südwest", country: "Alemania", category: "nordics_others", tier: 4 },
  { id: 83, name: "Regionalliga - Bayern", country: "Alemania", category: "nordics_others", tier: 4 },

  // --- ESPAÑA, ITALIA Y FRANCIA SEGUNDAS ---
  { id: 141, name: "La Liga 2 (Segunda División)", country: "España", category: "second_divisions", tier: 2 },
  { id: 136, name: "Serie B", country: "Italia", category: "second_divisions", tier: 2 },
  { id: 62, name: "Ligue 2", country: "Francia", category: "second_divisions", tier: 2 },

  // --- PAÍSES BAJOS & PORTUGAL ---
  { id: 88, name: "Eredivisie", country: "Países Bajos", category: "europe_mid", tier: 2 },
  { id: 89, name: "Eerste Divisie (2da Div)", country: "Países Bajos", category: "second_divisions", tier: 2 },
  { id: 94, name: "Primeira Liga", country: "Portugal", category: "europe_mid", tier: 2 },
  { id: 95, name: "Liga Portugal 2", country: "Portugal", category: "second_divisions", tier: 2 },

  // --- NORUEGA (1RA Y 2DA DIVISIÓN) ---
  { id: 103, name: "Eliteserien", country: "Noruega", category: "europe_mid", tier: 2 },
  { id: 104, name: "1. Division (OBOS-ligaen)", country: "Noruega", category: "second_divisions", tier: 2 },

  // --- ISLANDIA (1RA Y 2DA DIVISIÓN) ---
  { id: 164, name: "Úrvalsdeild (Besta deild)", country: "Islandia", category: "europe_mid", tier: 2 },
  { id: 165, name: "1. Deild karla", country: "Islandia", category: "second_divisions", tier: 2 },

  // --- IRLANDA (1RA Y 2DA DIVISIÓN) ---
  { id: 357, name: "Premier Division", country: "Irlanda", category: "europe_mid", tier: 2 },
  { id: 358, name: "First Division", country: "Irlanda", category: "second_divisions", tier: 2 },

  // --- SUECIA (1RA Y 2DA DIVISIÓN) ---
  { id: 113, name: "Allsvenskan", country: "Suecia", category: "europe_mid", tier: 2 },
  { id: 114, name: "Superettan", country: "Suecia", category: "second_divisions", tier: 2 },

  // --- SUIZA (1RA Y 2DA DIVISIÓN) ---
  { id: 207, name: "Super League", country: "Suiza", category: "europe_mid", tier: 2 },
  { id: 208, name: "Challenge League", country: "Suiza", category: "second_divisions", tier: 2 },

  // --- ESCOCIA (TODAS LAS DIVISIONES) ---
  { id: 179, name: "Premiership", country: "Escocia", category: "europe_mid", tier: 2 },
  { id: 180, name: "Championship", country: "Escocia", category: "second_divisions", tier: 2 },
  { id: 183, name: "League One", country: "Escocia", category: "nordics_others", tier: 3 },
  { id: 184, name: "League Two", country: "Escocia", category: "nordics_others", tier: 4 },

  // --- AUSTRIA (1RA Y 2DA DIVISIÓN) ---
  { id: 218, name: "Austrian Bundesliga", country: "Austria", category: "europe_mid", tier: 2 },
  { id: 219, name: "2. Liga", country: "Austria", category: "second_divisions", tier: 2 },

  // --- DINAMARCA (1RA Y 2DA DIVISIÓN) ---
  { id: 119, name: "Superliga", country: "Dinamarca", category: "europe_mid", tier: 2 },
  { id: 120, name: "1. Division", country: "Dinamarca", category: "second_divisions", tier: 2 },

  // --- ISRAEL (1RA Y 2DA DIVISIÓN) ---
  { id: 383, name: "Ligat Ha'al (Premier League)", country: "Israel", category: "europe_mid", tier: 2 },
  { id: 382, name: "Liga Leumit (2da Div)", country: "Israel", category: "second_divisions", tier: 2 },

  // --- TURQUÍA (1RA Y 2DA DIVISIÓN) ---
  { id: 203, name: "Süper Lig", country: "Turquía", category: "europe_mid", tier: 2 },
  { id: 204, name: "1. Lig", country: "Turquía", category: "second_divisions", tier: 2 },

  // --- ARMENIA (1RA Y 2DA DIVISIÓN) ---
  { id: 342, name: "Premier League", country: "Armenia", category: "europe_mid", tier: 2 },
  { id: 343, name: "First League", country: "Armenia", category: "second_divisions", tier: 2 },

  // --- BULGARIA (1RA Y 2DA DIVISIÓN) ---
  { id: 172, name: "First League", country: "Bulgaria", category: "europe_mid", tier: 2 },
  { id: 173, name: "Second League", country: "Bulgaria", category: "second_divisions", tier: 2 },

  // --- AMÉRICAS (1RA Y 2DA DIVISIÓN) ---
  { id: 242, name: "Liga Pro", country: "Ecuador", category: "americas", tier: 2 },
  { id: 71, name: "Brasileirão Série A", country: "Brasil", category: "americas", tier: 2 },
  { id: 72, name: "Brasileirão Série B", country: "Brasil", category: "second_divisions", tier: 2 },
  { id: 128, name: "Liga Profesional Argentina", country: "Argentina", category: "americas", tier: 2 },
  { id: 129, name: "Primera Nacional (2da Div)", country: "Argentina", category: "second_divisions", tier: 2 },
  { id: 13, name: "Copa Libertadores", country: "Sudamérica", category: "cups", tier: 2 },
  { id: 11, name: "Copa Sudamericana", country: "Sudamérica", category: "cups", tier: 2 },
  { id: 262, name: "Liga MX", country: "México", category: "americas", tier: 2 },
  { id: 263, name: "Liga de Expansión MX", country: "México", category: "second_divisions", tier: 2 },
  { id: 253, name: "Major League Soccer (MLS)", country: "Estados Unidos", category: "americas", tier: 2 },
  { id: 254, name: "USL Championship", country: "Estados Unidos", category: "second_divisions", tier: 2 },
  { id: 239, name: "Primera A", country: "Colombia", category: "americas", tier: 2 },
  { id: 281, name: "Liga 1", country: "Perú", category: "americas", tier: 2 },
  { id: 265, name: "Primera División", country: "Chile", category: "americas", tier: 2 },
  { id: 271, name: "Primera División", country: "Uruguay", category: "americas", tier: 2 },
  { id: 250, name: "Primera División", country: "Paraguay", category: "americas", tier: 2 },
];

export const ALL_LEAGUE_IDS = SUPPORTED_LEAGUES.map((l) => l.id);
export const TOP_5_LEAGUE_IDS = [39, 140, 135, 78, 61];
export const CUPS_LEAGUE_IDS = [2, 3, 848, 5, 13, 11];
export const AMERICAS_LEAGUE_IDS = [242, 71, 72, 128, 129, 262, 263, 253, 254, 239, 281, 265, 271, 250];

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
   * Fetch fixtures for a league
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
