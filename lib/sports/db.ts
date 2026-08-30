/**
 * Direct Supabase persistence and real-time live API-Football prediction service.
 * Strictly 100% real fixtures from API-Football across all European divisions and world leagues.
 */

import { createClient } from "@supabase/supabase-js";
import { apiFootball, ALL_LEAGUE_IDS, TOP_5_LEAGUE_IDS, SUPPORTED_LEAGUES } from "./api-football";
import { evaluateFixturePrediction, MarketOpportunity } from "./prediction-engine";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  try {
    return createClient(url, key, {
      auth: { persistSession: false },
    });
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// In-memory cache for live evaluated predictions (15 min TTL)
let cachedLivePredictions: MarketOpportunity[] = [];
let cacheTimestamp = 0;
const PREDICTIONS_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Core active leagues to scan for upcoming fixtures
 */
export const ACTIVE_SCAN_LEAGUES: number[] = [
  39,  // Premier League (Inglaterra)
  40,  // Championship (Inglaterra 2da)
  41,  // League One (Inglaterra 3ra)
  42,  // League Two (Inglaterra 4ta)
  140, // La Liga (España)
  141, // La Liga 2 (España 2da)
  135, // Serie A (Italia)
  136, // Serie B (Italia 2da)
  78,  // Bundesliga (Alemania)
  79,  // 2. Bundesliga (Alemania 2da)
  61,  // Ligue 1 (Francia)
  62,  // Ligue 2 (Francia 2da)
  94,  // Primeira Liga (Portugal)
  88,  // Eredivisie (Países Bajos)
  144, // Pro League (Bélgica)
  179, // Scottish Premiership (Escocia)
  203, // Süper Lig (Turquía)
  119, // Superliga (Dinamarca)
  103, // Eliteserien (Noruega)
  113, // Allsvenskan (Suecia)
  106, // Ekstraklasa (Polonia)
  218, // Austrian Bundesliga (Austria)
  207, // Super League (Suiza)
  71,  // Brasileirão Série A (Brasil)
  72,  // Brasileirão Série B (Brasil 2da)
  128, // Liga Profesional (Argentina)
  262, // Liga MX (México)
  253, // MLS (Estados Unidos)
  239, // Primera A (Colombia)
  242, // Liga Pro (Ecuador)
  307, // Saudi Pro League (Arabia Saudita)
];

/**
 * Generate 100% REAL predictions exclusively from API-Football live upcoming fixtures
 */
export async function generatePredictionsForUpcoming(
  targetLeagueIds?: number[]
): Promise<MarketOpportunity[]> {
  const nowMs = Date.now();

  // If cached and fresh, return immediately
  if (
    cachedLivePredictions.length > 0 &&
    nowMs - cacheTimestamp < PREDICTIONS_CACHE_TTL_MS &&
    (!targetLeagueIds || targetLeagueIds.length === 0)
  ) {
    return cachedLivePredictions;
  }

  const allOpportunities: MarketOpportunity[] = [];
  const processedKeys = new Set<string>();

  const leaguesToScan =
    targetLeagueIds && targetLeagueIds.length > 0 ? targetLeagueIds : ACTIVE_SCAN_LEAGUES;

  // Process in small batches with brief pause to respect API-Football rate limit
  const chunkSize = 4;
  for (let i = 0; i < leaguesToScan.length; i += chunkSize) {
    const chunk = leaguesToScan.slice(i, i + chunkSize);
    const promises = chunk.map(async (lid) => {
      try {
        const items = await apiFootball.getFixtures(lid, undefined, undefined, undefined, 6);
        return items;
      } catch {
        return [];
      }
    });

    const results = await Promise.all(promises);

    for (const items of results) {
      for (const item of items) {
        if (!item.fixture || !item.teams || !item.teams.home || !item.teams.away) continue;

        const kickoffMs = new Date(item.fixture.date).getTime();
        const shortStatus = item.fixture.status?.short || "NS";

        // Filter out past, finished, or cancelled matches
        if (["FT", "AET", "PEN", "PST", "CANC", "ABD"].includes(shortStatus)) continue;
        if (kickoffMs <= nowMs - 15 * 60 * 1000) continue;

        const opps = evaluateFixturePrediction({
          fixtureId: item.fixture.id,
          homeTeam: item.teams.home.name,
          awayTeam: item.teams.away.name,
          homeLogo: item.teams.home.logo,
          awayLogo: item.teams.away.logo,
          league: item.league.name,
          leagueLogo: item.league.logo,
          kickoff: item.fixture.date,
        });

        for (const opp of opps.slice(0, 2)) {
          const key = `${item.fixture.id}-${opp.market}`;
          if (processedKeys.has(key)) continue;
          processedKeys.add(key);
          allOpportunities.push(opp);
        }
      }
    }

    if (i + chunkSize < leaguesToScan.length) {
      await sleep(150); // Respect API-Football rate limits
    }
  }

  // Sort strictly by upcoming kickoff ascending
  const sorted = allOpportunities.sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  if (sorted.length > 0 && (!targetLeagueIds || targetLeagueIds.length === 0)) {
    cachedLivePredictions = sorted;
    cacheTimestamp = nowMs;
  }

  return sorted;
}

/**
 * Flush cache to force fresh live API-Football query
 */
export function invalidatePredictionsCache() {
  cachedLivePredictions = [];
  cacheTimestamp = 0;
}


/**
 * Synchronize active leagues and teams from API-Football into Supabase
 */
export async function syncLeaguesAndTeams(leagueIds: number[] = ALL_LEAGUE_IDS) {
  const supabase = getAdminClient();
  const leagues = await apiFootball.getLeagues(leagueIds);

  let leaguesSaved = 0;
  let teamsSaved = 0;

  if (supabase) {
    for (const l of leagues) {
      await supabase.from("leagues").upsert({
        provider_id: l.id,
        name: l.name,
        country: l.country.name,
        season: l.season,
        type: l.type,
        logo_url: l.logo,
        flag_url: l.country.flag,
        active: true,
        updated_at: new Date().toISOString(),
      });
      leaguesSaved++;
      await sleep(100);
    }
  }

  return { leaguesSaved, teamsSaved };
}

/**
 * Synchronize upcoming fixtures from API-Football into Supabase
 */
export async function syncUpcomingFixtures(leagueIds: number[] = ACTIVE_SCAN_LEAGUES, nextCount: number = 6) {
  const supabase = getAdminClient();
  let fixturesSaved = 0;

  for (const lid of leagueIds) {
    try {
      const fixtures = await apiFootball.getFixtures(lid, undefined, undefined, undefined, nextCount);
      if (supabase && fixtures.length > 0) {
        for (const item of fixtures) {
          if (!item.fixture || !item.teams) continue;
          await supabase.from("fixtures").upsert({
            provider_id: item.fixture.id,
            kickoff_at: item.fixture.date,
            status: item.fixture.status?.short || "NS",
            raw_payload: item,
            updated_at: new Date().toISOString(),
          });
          fixturesSaved++;
        }
      }
      await sleep(100);
    } catch {
      // Continue
    }
  }

  return { fixturesSaved };
}
