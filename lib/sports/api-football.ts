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
  // --- TOP 5 LIGAS EUROPEAS, COPAS UEFA & CONCACAF ---
  { id: 39, name: "Premier League", country: "Inglaterra", category: "top5", tier: 1 },
  { id: 140, name: "La Liga", country: "España", category: "top5", tier: 1 },
  { id: 135, name: "Serie A", country: "Italia", category: "top5", tier: 1 },
  { id: 78, name: "Bundesliga", country: "Alemania", category: "top5", tier: 1 },
  { id: 61, name: "Ligue 1", country: "Francia", category: "top5", tier: 1 },
  { id: 2, name: "UEFA Champions League", country: "Europa", category: "cups", tier: 1 },
  { id: 3, name: "UEFA Europa League", country: "Europa", category: "cups", tier: 1 },
  { id: 848, name: "UEFA Europa Conference League", country: "Europa", category: "cups", tier: 1 },
  { id: 5, name: "UEFA Nations League", country: "Europa", category: "cups", tier: 1 },
  { id: 525, name: "UEFA Champions League Women", country: "Europa", category: "cups", tier: 1 },
  { id: 772, name: "Leagues Cup", country: "Norteamérica", category: "cups", tier: 1 },
  { id: 16, name: "CONCACAF Champions League", country: "Norteamérica", category: "cups", tier: 1 },

  // --- INGLATERRA (TODAS LAS DIVISIONES) ---
  { id: 40, name: "Championship", country: "Inglaterra", category: "second_divisions", tier: 2 },
  { id: 41, name: "League One", country: "Inglaterra", category: "nordics_others", tier: 3 },
  { id: 42, name: "League Two", country: "Inglaterra", category: "nordics_others", tier: 4 },
  { id: 43, name: "National League", country: "Inglaterra", category: "nordics_others", tier: 5 },
  { id: 44, name: "National League - North", country: "Inglaterra", category: "nordics_others", tier: 6 },
  { id: 45, name: "National League - South", country: "Inglaterra", category: "nordics_others", tier: 6 },

  // --- GRANDES SEGUNDAS DIVISIONES DE EUROPA ---
  { id: 141, name: "La Liga 2 (Segunda División)", country: "España", category: "second_divisions", tier: 2 },
  { id: 136, name: "Serie B", country: "Italia", category: "second_divisions", tier: 2 },
  { id: 79, name: "2. Bundesliga", country: "Alemania", category: "second_divisions", tier: 2 },
  { id: 80, name: "3. Liga", country: "Alemania", category: "nordics_others", tier: 3 },
  { id: 62, name: "Ligue 2", country: "Francia", category: "second_divisions", tier: 2 },
  { id: 89, name: "Eerste Divisie (2da Div)", country: "Países Bajos", category: "second_divisions", tier: 2 },
  { id: 95, name: "Liga Portugal 2", country: "Portugal", category: "second_divisions", tier: 2 },
  { id: 145, name: "Challenger Pro League (2da Div)", country: "Bélgica", category: "second_divisions", tier: 2 },
  { id: 180, name: "Championship", country: "Escocia", category: "second_divisions", tier: 2 },
  { id: 104, name: "1. Division (OBOS-ligaen)", country: "Noruega", category: "second_divisions", tier: 2 },
  { id: 114, name: "Superettan", country: "Suecia", category: "second_divisions", tier: 2 },
  { id: 120, name: "1. Division", country: "Dinamarca", category: "second_divisions", tier: 2 },
  { id: 208, name: "Challenge League", country: "Suiza", category: "second_divisions", tier: 2 },
  { id: 219, name: "2. Liga", country: "Austria", category: "second_divisions", tier: 2 },
  { id: 204, name: "1. Lig", country: "Turquía", category: "second_divisions", tier: 2 },
  { id: 358, name: "First Division", country: "Irlanda", category: "second_divisions", tier: 2 },
  { id: 382, name: "Liga Leumit (2da Div)", country: "Israel", category: "second_divisions", tier: 2 },

  // --- LIGAS PRINCIPALES DE EUROPA (1RA DIVISIÓN & FEMENINA) ---
  { id: 142, name: "Primera División Femenina (Liga F)", country: "España", category: "europe_mid", tier: 1 },
  { id: 88, name: "Eredivisie", country: "Países Bajos", category: "europe_mid", tier: 1 },
  { id: 94, name: "Primeira Liga", country: "Portugal", category: "europe_mid", tier: 1 },
  { id: 144, name: "Jupiler Pro League", country: "Bélgica", category: "europe_mid", tier: 1 },
  { id: 203, name: "Süper Lig", country: "Turquía", category: "europe_mid", tier: 1 },
  { id: 179, name: "Premiership", country: "Escocia", category: "europe_mid", tier: 1 },
  { id: 103, name: "Eliteserien", country: "Noruega", category: "europe_mid", tier: 1 },
  { id: 113, name: "Allsvenskan", country: "Suecia", category: "europe_mid", tier: 1 },
  { id: 119, name: "Superliga", country: "Dinamarca", category: "europe_mid", tier: 1 },
  { id: 207, name: "Super League", country: "Suiza", category: "europe_mid", tier: 1 },
  { id: 218, name: "Austrian Bundesliga", country: "Austria", category: "europe_mid", tier: 1 },
  { id: 106, name: "Ekstraklasa", country: "Polonia", category: "europe_mid", tier: 1 },
  { id: 333, name: "Premier League", country: "Ucrania", category: "europe_mid", tier: 1 },
  { id: 210, name: "HNL", country: "Croacia", category: "europe_mid", tier: 1 },
  { id: 271, name: "NB I (OTP Bank Liga)", country: "Hungría", category: "europe_mid", tier: 1 },
  { id: 244, name: "Veikkausliiga", country: "Finlandia", category: "europe_mid", tier: 1 },
  { id: 357, name: "Premier Division", country: "Irlanda", category: "europe_mid", tier: 1 },
  { id: 164, name: "Úrvalsdeild (Besta deild)", country: "Islandia", category: "europe_mid", tier: 1 },
  { id: 383, name: "Ligat Ha'al (Premier League)", country: "Israel", category: "europe_mid", tier: 1 },
  { id: 172, name: "First League", country: "Bulgaria", category: "europe_mid", tier: 1 },
  { id: 315, name: "Premijer Liga BiH", country: "Bosnia", category: "europe_mid", tier: 1 },
  { id: 332, name: "Super Liga (Niké liga)", country: "Eslovaquia", category: "europe_mid", tier: 1 },
  { id: 373, name: "1. SNL (PrvaLiga)", country: "Eslovenia", category: "europe_mid", tier: 1 },
  { id: 286, name: "Super Liga", country: "Serbia", category: "europe_mid", tier: 1 },
  { id: 345, name: "Czech Liga", country: "República Checa", category: "europe_mid", tier: 1 },
  { id: 116, name: "Premier League", country: "Bielorrusia", category: "europe_mid", tier: 1 },

  // --- AMÉRICAS (1RA, 2DA DIVISIÓN & COPAS CONMEBOL) ---
  { id: 242, name: "Liga Pro", country: "Ecuador", category: "americas", tier: 1 },
  { id: 71, name: "Brasileirão Série A", country: "Brasil", category: "americas", tier: 1 },
  { id: 72, name: "Brasileirão Série B", country: "Brasil", category: "second_divisions", tier: 2 },
  { id: 128, name: "Liga Profesional Argentina", country: "Argentina", category: "americas", tier: 1 },
  { id: 344, name: "Primera División", country: "Bolivia", category: "americas", tier: 1 },
  { id: 13, name: "Copa Libertadores", country: "Sudamérica", category: "cups", tier: 1 },
  { id: 11, name: "Copa Sudamericana", country: "Sudamérica", category: "cups", tier: 1 },
  { id: 262, name: "Liga MX", country: "México", category: "americas", tier: 1 },
  { id: 263, name: "Liga de Expansión MX", country: "México", category: "second_divisions", tier: 2 },
  { id: 253, name: "Major League Soccer (MLS)", country: "Estados Unidos", category: "americas", tier: 1 },
  { id: 254, name: "USL Championship", country: "Estados Unidos", category: "second_divisions", tier: 2 },
  { id: 239, name: "Primera A", country: "Colombia", category: "americas", tier: 1 },
  { id: 281, name: "Liga 1", country: "Perú", category: "americas", tier: 1 },
  { id: 265, name: "Primera División", country: "Chile", category: "americas", tier: 1 },
  { id: 271, name: "Primera División", country: "Uruguay", category: "americas", tier: 1 },
  { id: 250, name: "Primera División", country: "Paraguay", category: "americas", tier: 1 },
  { id: 162, name: "Primera División (Liga FPD)", country: "Costa Rica", category: "americas", tier: 1 },

  // --- ASIA, MEDIO ORIENTE & OCEANÍA ---
  { id: 307, name: "Saudi Pro League", country: "Arabia Saudita", category: "asia_africa", tier: 1 },
  { id: 98, name: "J1 League", country: "Japón", category: "asia_africa", tier: 1 },
  { id: 99, name: "J2 League", country: "Japón", category: "second_divisions", tier: 2 },
  { id: 101, name: "J-League Cup", country: "Japón", category: "cups", tier: 1 },
  { id: 102, name: "Emperor Cup", country: "Japón", category: "cups", tier: 1 },
  { id: 292, name: "K League 1", country: "Corea del Sur", category: "asia_africa", tier: 1 },
  { id: 293, name: "K League 2", country: "Corea del Sur", category: "second_divisions", tier: 2 },
  { id: 294, name: "Korean FA Cup", country: "Corea del Sur", category: "cups", tier: 1 },
  { id: 169, name: "Chinese Super League", country: "China", category: "asia_africa", tier: 1 },
  { id: 188, name: "A-League Men", country: "Australia", category: "asia_africa", tier: 1 },
  { id: 190, name: "A-League Women", country: "Australia", category: "asia_africa", tier: 1 },
];

export const ALL_LEAGUE_IDS = SUPPORTED_LEAGUES.map((l) => l.id);
export const TOP_5_LEAGUE_IDS = [39, 140, 135, 78, 61];
export const CUPS_LEAGUE_IDS = [2, 3, 848, 5, 13, 11];
export const AMERICAS_LEAGUE_IDS = [242, 71, 72, 128, 344, 262, 263, 253, 254, 239, 281, 265, 271, 250];

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

  async queryLeagues(params: Record<string, string | number>): Promise<any[]> {
    return this.request<any>("leagues", params);
  }

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

  async getUpcomingFixtures(leagueId: number, nextCount: number = 10, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", {
      league: leagueId,
      next: nextCount,
      timezone,
    });
  }

  async getFixturesByDate(dateStr: string, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { date: dateStr, timezone });
  }

  async getFinishedFixturesByDate(dateStr: string, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { date: dateStr, status: "FT", timezone });
  }

  async getLiveFixtures(timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { live: "all", timezone });
  }

  async getFixtures(leagueId: number, count: number = 20, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures", { league: leagueId, next: count, timezone });
  }

  async getHeadToHead(teamA: number, teamB: number, last: number = 10, timezone: string = this.defaultTimezone): Promise<ApiFootballFixtureItem[]> {
    return this.request<ApiFootballFixtureItem>("fixtures/headtohead", {
      h2h: `${teamA}-${teamB}`,
      last,
      timezone,
    });
  }

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

  async searchTeam(name: string): Promise<ApiFootballTeam | null> {
    const results = await this.request<{ team: ApiFootballTeam }>("teams", { search: name });
    if (results && results.length > 0) {
      return results[0].team;
    }
    return null;
  }

  async getOddsByFixture(fixtureId: number): Promise<ApiFootballOddsItem | null> {
    const data = await this.request<ApiFootballOddsItem>("odds", {
      fixture: fixtureId,
    });
    return data.length > 0 ? data[0] : null;
  }

  async getOddsByDate(dateStr: string, timezone: string = this.defaultTimezone): Promise<ApiFootballOddsItem[]> {
    return this.request<ApiFootballOddsItem>("odds", {
      date: dateStr,
      timezone,
    });
  }

  async getFixtureStatistics(fixtureId: number): Promise<ApiFootballFixtureStatistics[]> {
    return this.request<ApiFootballFixtureStatistics>("fixtures/statistics", {
      fixture: fixtureId,
    });
  }
}

export interface ApiFootballStatisticItem {
  type: string;
  value: number | string | null;
}

export interface ApiFootballFixtureStatistics {
  team: {
    id: number;
    name: string;
    logo: string;
  };
  statistics: ApiFootballStatisticItem[];
}

export function extractMatchDetails(stats?: ApiFootballFixtureStatistics[] | null): {
  homeCorners: number;
  awayCorners: number;
  totalCorners: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  totalCards: number;
  hasStats: boolean;
} {
  if (!stats || !Array.isArray(stats) || stats.length < 2) {
    return {
      homeCorners: 0,
      awayCorners: 0,
      totalCorners: 0,
      homeYellowCards: 0,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      totalCards: 0,
      hasStats: false,
    };
  }

  const getStat = (list: ApiFootballStatisticItem[], typeName: string): number => {
    const item = list.find((s) => s.type.toLowerCase().trim() === typeName.toLowerCase().trim());
    if (!item || item.value === null || item.value === undefined) return 0;
    const num = parseInt(String(item.value), 10);
    return isNaN(num) ? 0 : num;
  };

  const homeStats = stats[0]?.statistics || [];
  const awayStats = stats[1]?.statistics || [];

  const homeCorners = getStat(homeStats, "Corner Kicks");
  const awayCorners = getStat(awayStats, "Corner Kicks");
  const homeYellowCards = getStat(homeStats, "Yellow Cards");
  const awayYellowCards = getStat(awayStats, "Yellow Cards");
  const homeRedCards = getStat(homeStats, "Red Cards");
  const awayRedCards = getStat(awayStats, "Red Cards");

  return {
    homeCorners,
    awayCorners,
    totalCorners: homeCorners + awayCorners,
    homeYellowCards,
    awayYellowCards,
    homeRedCards,
    awayRedCards,
    totalCards: homeYellowCards + awayYellowCards + homeRedCards + awayRedCards,
    hasStats: homeStats.length > 0 || awayStats.length > 0,
  };
}

export function extractMarketOddsFromBookmaker(oddsItem?: ApiFootballOddsItem | null): {
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  doubleChance1X?: number;
  doubleChanceX2?: number;
  doubleChance12?: number;
  over15?: number;
  under35?: number;
  over25?: number;
  under25?: number;
  bttsYes?: number;
  bttsNo?: number;
} {
  if (!oddsItem || !oddsItem.bookmakers || oddsItem.bookmakers.length === 0) {
    return {};
  }

  // Find preferred top tier bookmakers (Bet365, Pinnacle, 1xBet, Betway, Unibet)
  const bm =
    oddsItem.bookmakers.find((b) => b.name.toLowerCase().includes("bet365")) ||
    oddsItem.bookmakers.find((b) => b.name.toLowerCase().includes("pinnacle")) ||
    oddsItem.bookmakers.find((b) => b.name.toLowerCase().includes("1xbet")) ||
    oddsItem.bookmakers.find((b) => b.name.toLowerCase().includes("betway")) ||
    oddsItem.bookmakers[0];

  if (!bm || !bm.bets) return {};

  const result: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    doubleChance1X?: number;
    doubleChanceX2?: number;
    doubleChance12?: number;
    over15?: number;
    under35?: number;
    over25?: number;
    under25?: number;
    bttsYes?: number;
    bttsNo?: number;
  } = {};

  for (const bet of bm.bets) {
    const betName = bet.name.toLowerCase();
    // 1X2 Match Winner
    if (bet.id === 1 || betName.includes("match winner") || betName.includes("1x2") || betName === "winner") {
      for (const val of bet.values) {
        const v = String(val.value).toLowerCase();
        const o = parseFloat(String(val.odd));
        if (!isNaN(o) && o > 1.0) {
          if (v === "home" || v === "1") result.homeWin = o;
          else if (v === "draw" || v === "x" || v === "empate") result.draw = o;
          else if (v === "away" || v === "2") result.awayWin = o;
        }
      }
    }
    // Double Chance
    else if (bet.id === 12 || betName.includes("double chance") || betName.includes("doble oportunidad")) {
      for (const val of bet.values) {
        const v = String(val.value).toLowerCase();
        const o = parseFloat(String(val.odd));
        if (!isNaN(o) && o > 1.0) {
          if (v.includes("home/draw") || v === "1x" || v.includes("local/empate")) result.doubleChance1X = o;
          else if (v.includes("draw/away") || v === "x2" || v.includes("empate/visitante")) result.doubleChanceX2 = o;
          else if (v.includes("home/away") || v === "12" || v.includes("local/visitante")) result.doubleChance12 = o;
        }
      }
    }
    // Over / Under Goals (1.5, 2.5, 3.5)
    else if (bet.id === 5 || betName.includes("goals over/under") || betName.includes("over/under")) {
      for (const val of bet.values) {
        const v = String(val.value).toLowerCase();
        const o = parseFloat(String(val.odd));
        if (!isNaN(o) && o > 1.0) {
          if (v.includes("over 1.5") || v === "over 1.5") result.over15 = o;
          else if (v.includes("over 2.5") || v === "over 2.5") result.over25 = o;
          else if (v.includes("under 2.5") || v === "under 2.5") result.under25 = o;
          else if (v.includes("under 3.5") || v === "under 3.5") result.under35 = o;
        }
      }
    }
    // Both Teams to Score (BTTS)
    else if (bet.id === 8 || betName.includes("both teams score") || betName.includes("btts")) {
      for (const val of bet.values) {
        const v = String(val.value).toLowerCase();
        const o = parseFloat(String(val.odd));
        if (!isNaN(o) && o > 1.0) {
          if (v === "yes" || v === "sí" || v === "si") result.bttsYes = o;
          else if (v === "no") result.bttsNo = o;
        }
      }
    }
  }

  return result;
}

export const apiFootball = new ApiFootballClient();

