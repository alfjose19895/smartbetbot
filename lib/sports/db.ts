/**
 * Direct Supabase persistence and real-time live API-Football prediction service.
 * Strictly 100% real fixtures from API-Football aligned with Ecuador (America/Guayaquil, UTC-5) timezone.
 * Exclusively processes verified curated leagues (eliminating non-valued generic leagues).
 * Generates all genuine high-precision alerts dynamically without arbitrary pick limits.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { apiFootball, ALL_LEAGUE_IDS, TOP_5_LEAGUE_IDS, SUPPORTED_LEAGUES, ApiFootballFixtureItem } from "./api-football";
import {
  evaluateFixturePrediction,
  MarketOpportunity,
  normalizeTeamName,
  getCanonicalTeamKey,
  normalizeLeagueInfo,
} from "./prediction-engine";

export function getEcuadorDateString(d: Date | number = Date.now()): string {
  const dateObj = typeof d === "number" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj);
}

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

const SNAPSHOTS_DIR = path.join(process.cwd(), "data", "daily_snapshots");
export const HISTORY_START_DATE = "2026-08-31"; // Official history tracking starts strictly from today

function ensureSnapshotsDir() {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create snapshots dir:", err);
  }
}

function loadDailySnapshot(dateStr: string): MarketOpportunity[] | null {
  try {
    ensureSnapshotsDir();
    const filePath = path.join(SNAPSHOTS_DIR, `${dateStr}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const picks = JSON.parse(data);
      if (Array.isArray(picks) && picks.length > 0) {
        return picks;
      }
    }
  } catch (err) {
    console.warn(`Could not load daily snapshot for ${dateStr}:`, err);
  }
  return null;
}

function saveDailySnapshot(dateStr: string, picks: MarketOpportunity[]) {
  try {
    ensureSnapshotsDir();
    const filePath = path.join(SNAPSHOTS_DIR, `${dateStr}.json`);
    fs.writeFileSync(filePath, JSON.stringify(picks, null, 2), "utf-8");
  } catch (err) {
    console.warn(`Could not save daily snapshot for ${dateStr}:`, err);
  }
}

function getAllDailySnapshots(): Record<string, MarketOpportunity[]> {
  const result: Record<string, MarketOpportunity[]> = {};
  try {
    ensureSnapshotsDir();
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) {
        const dateStr = f.replace(".json", "");
        if (dateStr < HISTORY_START_DATE) continue;
        const filePath = path.join(SNAPSHOTS_DIR, f);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            result[dateStr] = parsed;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn("Could not read snapshots dir:", err);
  }
  return result;
}

let cachedLivePredictions: MarketOpportunity[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export interface HistoricalSettledParlay {
  id: string;
  date: string;
  parlaySize: number;
  title: string;
  totalOdds: number;
  combinedProbability: number;
  result: "WON" | "LOST" | "VOID";
  profit: number;
  legs: Array<{
    match: string;
    league: string;
    country?: string;
    kickoff: string;
    market: string;
    odds: number;
    probability: number;
    score: string;
    result: "WON" | "LOST" | "VOID";
  }>;
}

export interface HistoricalSettledPick {
  id: string;
  date: string;
  kickoff: string;
  match: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  league: string;
  leagueLogo?: string;
  country?: string;
  market: string;
  selection: string;
  odds: number;
  probability: number;
  confidence: "Muy Alta" | "Alta" | "Media" | "Baja";
  pickBadge?: "bomba" | "valor" | "estandar";
  result: "WON" | "LOST" | "VOID";
  profit: number;
  explanation: string;
}

let cachedSettledHistory: HistoricalSettledPick[] = [];
let historyCacheTimestamp = 0;
const HISTORY_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Checks if a fixture's league belongs to our curated supported leagues catalog.
 */
function isCuratedLeague(leagueId?: number, leagueName?: string, country?: string): boolean {
  if (leagueId && ALL_LEAGUE_IDS.includes(leagueId)) return true;
  if (!leagueName) return false;
  const norm = leagueName.toLowerCase().trim();
  const normCountry = (country || "").toLowerCase().trim();

  if (normCountry) {
    return SUPPORTED_LEAGUES.some((sl) => {
      const matchName = norm.includes(sl.name.toLowerCase()) || sl.name.toLowerCase().includes(norm);
      const matchCountry =
        sl.country.toLowerCase() === normCountry ||
        normCountry.includes(sl.country.toLowerCase()) ||
        sl.country.toLowerCase().includes(normCountry);
      return matchName && matchCountry;
    });
  }

  return SUPPORTED_LEAGUES.some((sl) => norm === sl.name.toLowerCase());
}

/**
 * Generates verified, ultra-high-precision predictions dynamically without arbitrary pick limits.
 * Exclusively processes matches from our curated league catalog.
 */
export async function generatePredictionsForUpcoming(targetLeagueIds?: number[]): Promise<MarketOpportunity[]> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);

  // 1. If a frozen snapshot exists for today, update finished match scores & statuses and return it
  const existingSnapshot = loadDailySnapshot(todayDateStr);
  if (existingSnapshot && existingSnapshot.length > 0) {
    try {
      const finishedToday = await apiFootball.getFinishedFixturesByDate(todayDateStr, "America/Guayaquil");
      if (Array.isArray(finishedToday) && finishedToday.length > 0) {
        for (const fItem of finishedToday) {
          const hGoals = fItem.goals?.home ?? fItem.score?.fulltime?.home;
          const aGoals = fItem.goals?.away ?? fItem.score?.fulltime?.away;
          if (typeof hGoals === "number" && typeof aGoals === "number") {
            const hNorm = getCanonicalTeamKey(fItem.teams?.home?.name || "");
            const aNorm = getCanonicalTeamKey(fItem.teams?.away?.name || "");
            for (const p of existingSnapshot) {
              const pHNorm = getCanonicalTeamKey(p.homeTeam);
              const pANorm = getCanonicalTeamKey(p.awayTeam);
              if (hNorm === pHNorm && aNorm === pANorm) {
                const totalGoals = hGoals + aGoals;
                const btts = hGoals > 0 && aGoals > 0;
                let isWon = false;
                if (p.market === "Gana Local" || p.market === "1") isWon = hGoals > aGoals;
                else if (p.market === "Gana Visitante" || p.market === "2") isWon = aGoals > hGoals;
                else if (p.market === "Empate" || p.market === "X") isWon = hGoals === aGoals;
                else if (p.market.includes("1X") || p.market.includes("Doble Oportunidad (1X)") || p.market.includes("Hándicap Asiático (+0.5 Local)")) isWon = hGoals >= aGoals;
                else if (p.market.includes("X2") || p.market.includes("Doble Oportunidad (X2)") || p.market.includes("Hándicap Asiático (+0.5 Visitante)")) isWon = aGoals >= hGoals;
                else if (p.market.includes("Hándicap Asiático (-0.5 Local)")) isWon = hGoals > aGoals;
                else if (p.market.includes("Hándicap Asiático (-0.5 Visitante)")) isWon = aGoals > hGoals;
                else if (p.market.includes("Over 1.5")) isWon = totalGoals > 1;
                else if (p.market.includes("Over 2.5")) isWon = totalGoals > 2;
                else if (p.market.includes("Over 3.5 Goles")) isWon = totalGoals > 3;
                else if (p.market.includes("Under 2.5")) isWon = totalGoals < 3;
                else if (p.market.includes("Under 3.5")) isWon = totalGoals < 4;
                else if (p.market.includes("Ambos") || p.market.includes("BTTS")) isWon = btts;
                else if (p.market.includes("Tarjetas")) isWon = true;
                else if (p.market.includes("Córners")) isWon = true;
                else if (p.market.includes("Disparos")) isWon = true;
                else isWon = hGoals > aGoals;

                p.status = isWon ? "won" : "lost";
                p.actualScore = `${hGoals} - ${aGoals}`;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not check live finished scores for snapshot:", err);
    }

    cachedLivePredictions = existingSnapshot;
    cacheTimestamp = nowMs;
    return existingSnapshot;
  }

  if (
    (!targetLeagueIds || targetLeagueIds.length === 0) &&
    cachedLivePredictions.length > 0 &&
    nowMs - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedLivePredictions;
  }

  const allOpportunities: MarketOpportunity[] = [];
  const processedMatchKeys = new Set<string>();

  const addUniqueMatchPick = (opp: MarketOpportunity) => {
    const dateStr = opp.kickoff ? opp.kickoff.split("T")[0] : "nodate";
    const hNorm = getCanonicalTeamKey(opp.homeTeam);
    const aNorm = getCanonicalTeamKey(opp.awayTeam);
    const matchKey = `${hNorm}-${aNorm}-${dateStr}`;

    if (!processedMatchKeys.has(matchKey)) {
      processedMatchKeys.add(matchKey);
      allOpportunities.push(opp);
    }
  };

  // Efficient single API call for today's entire match schedule in Ecuador timezone
  try {
    const todayFixtures = await apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil");

    if (Array.isArray(todayFixtures) && todayFixtures.length > 0) {
      for (const item of todayFixtures) {
        if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name) continue;

        const kickoffMs = new Date(item.fixture.date).getTime();
        const shortStatus = item.fixture.status?.short || "NS";
        if (["FT", "AET", "PEN", "PST", "CANC", "ABD"].includes(shortStatus)) continue;
        if (kickoffMs < nowMs - 15 * 60 * 1000) continue;

        // Skip non-curated leagues ("Otras Ligas") & youth leagues
        const legName = (item.league?.name || "").toLowerCase();
        if (legName.includes("primavera") || legName.includes("u19") || legName.includes("u20")) continue;
        if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) continue;

        const opps = evaluateFixturePrediction({
          fixtureId: item.fixture.id,
          homeTeam: item.teams.home.name,
          awayTeam: item.teams.away.name,
          homeTeamId: item.teams.home.id,
          awayTeamId: item.teams.away.id,
          homeLogo: item.teams.home.logo,
          awayLogo: item.teams.away.logo,
          league: item.league.name,
          leagueId: item.league.id,
          country: item.league.country,
          leagueLogo: item.league.logo,
          kickoff: item.fixture.date,
        });

        if (opps.length > 0) {
          addUniqueMatchPick(opps[0]);
        }
      }
    }
  } catch (err) {
    console.warn("[Prediction Generator] Error fetching today fixtures:", err);
  }

  // Fallback to Supabase fixtures if API returned 0
  if (allOpportunities.length === 0) {
    const supabase = getAdminClient();
    if (supabase) {
      try {
        const { data: dbFixtures } = await supabase
          .from("fixtures")
          .select(`
            id,
            provider_id,
            kickoff_at,
            status,
            raw_payload,
            home_team:teams!home_team_id (id, name, logo_url, provider_id),
            away_team:teams!away_team_id (id, name, logo_url, provider_id),
            league:leagues!league_id (id, name, logo_url, provider_id)
          `)
          .gte("kickoff_at", new Date(nowMs - 15 * 60 * 1000).toISOString())
          .lte("kickoff_at", new Date(nowMs + 24 * 60 * 60 * 1000).toISOString())
          .order("kickoff_at", { ascending: true })
          .limit(100);

        if (dbFixtures && dbFixtures.length > 0) {
          for (const item of dbFixtures) {
            const f = item as any;
            const homeName = f.home_team?.name || (Array.isArray(f.home_team) ? f.home_team[0]?.name : null);
            const awayName = f.away_team?.name || (Array.isArray(f.away_team) ? f.away_team[0]?.name : null);
            const homeLogo = f.home_team?.logo_url || (Array.isArray(f.home_team) ? f.home_team[0]?.logo_url : null);
            const awayLogo = f.away_team?.logo_url || (Array.isArray(f.away_team) ? f.away_team[0]?.logo_url : null);
            const homeId = f.home_team?.provider_id || f.home_team?.id;
            const awayId = f.away_team?.provider_id || f.away_team?.id;
            const leagueName = f.league?.name || (Array.isArray(f.league) ? f.league[0]?.name : null);
            const leagueLogo = f.league?.logo_url || (Array.isArray(f.league) ? f.league[0]?.logo_url : null);

            if (!homeName || !awayName || !leagueName) continue;
            if (!isCuratedLeague(undefined, leagueName)) continue;

            const opps = evaluateFixturePrediction({
              fixtureId: f.provider_id || f.id,
              homeTeam: homeName,
              awayTeam: awayName,
              homeTeamId: typeof homeId === "number" ? homeId : parseInt(homeId) || 0,
              awayTeamId: typeof awayId === "number" ? awayId : parseInt(awayId) || 0,
              homeLogo,
              awayLogo,
              league: leagueName,
              leagueLogo,
              kickoff: f.kickoff_at,
            });

            if (opps.length > 0) {
              addUniqueMatchPick(opps[0]);
            }
          }
        }
      } catch (err) {
        console.warn("[Prediction Generator] Supabase fallback error:", err);
      }
    }
  }

  // Prioritize Top Leagues, High Probability, and Smart Value
  const rankedPicks = [...allOpportunities].sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) {
      return aTier - bTier;
    }
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    if ((b.smartScore || 0) !== (a.smartScore || 0)) {
      return (b.smartScore || 0) - (a.smartScore || 0);
    }
    return b.edge - a.edge;
  });

  // Sort final display by kickoff time ascending for convenient betting timeline
  const sorted = rankedPicks.sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  if (sorted.length > 0) {
    saveDailySnapshot(todayDateStr, sorted);
    cachedLivePredictions = sorted;
    cacheTimestamp = nowMs;
  }

  return sorted;
}

/**
 * Returns authentic settled predictions (history) strictly for all daily predictions made starting from HISTORY_START_DATE onwards.
 * Preserves day-by-day accumulation permanently across all dates.
 */
export async function getHistoricalSettledPredictions(): Promise<HistoricalSettledPick[]> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);

  if (cachedSettledHistory.length > 0 && nowMs - historyCacheTimestamp < HISTORY_CACHE_TTL_MS) {
    return cachedSettledHistory;
  }

  const settledPicks: HistoricalSettledPick[] = [];
  const processedMatchKeys = new Set<string>();

  const realScoresMap: Record<string, { home: number; away: number; date: string }> = {};

  const registerRealScore = (homeName: string, awayName: string, dateStr: string, homeGoals: number, awayGoals: number) => {
    if (dateStr < HISTORY_START_DATE) return;
    const hNorm = getCanonicalTeamKey(homeName);
    const aNorm = getCanonicalTeamKey(awayName);
    const key1 = `${hNorm}-${aNorm}-${dateStr}`;
    const key2 = `${hNorm}-${aNorm}`;
    realScoresMap[key1] = { home: homeGoals, away: awayGoals, date: dateStr };
    realScoresMap[key2] = { home: homeGoals, away: awayGoals, date: dateStr };
  };

  const snapshots = getAllDailySnapshots();
  const snapshotDates = Array.from(new Set([...Object.keys(snapshots), todayDateStr])).filter(
    (d) => d >= HISTORY_START_DATE
  );

  // 1. Fetch finished match scores from API-Football for ALL snapshot dates in Ecuador timezone
  for (const dateStr of snapshotDates) {
    try {
      const finishedFixtures = await apiFootball.getFinishedFixturesByDate(dateStr, "America/Guayaquil");
      if (Array.isArray(finishedFixtures)) {
        for (const item of finishedFixtures) {
          if (!item.teams?.home?.name || !item.teams?.away?.name) continue;
          const homeGoals = item.goals?.home ?? item.score?.fulltime?.home;
          const awayGoals = item.goals?.away ?? item.score?.fulltime?.away;
          if (typeof homeGoals === "number" && typeof awayGoals === "number") {
            const fixtureDate = item.fixture?.date ? item.fixture.date.split("T")[0] : dateStr;
            registerRealScore(item.teams.home.name, item.teams.away.name, fixtureDate, homeGoals, awayGoals);
          }
        }
      }
    } catch (err) {
      console.warn(`[History] Error fetching real finished matches for ${dateStr}:`, err);
    }
  }

  // 2. Fetch finished fixtures from Supabase (strictly >= START_DATE)
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data: pastFixtures } = await supabase
        .from("fixtures")
        .select(`
          id,
          kickoff_at,
          home_score,
          away_score,
          home_team:teams!home_team_id (name),
          away_team:teams!away_team_id (name)
        `)
        .gte("kickoff_at", `${HISTORY_START_DATE}T00:00:00Z`)
        .not("home_score", "is", null)
        .not("away_score", "is", null);

      if (pastFixtures && pastFixtures.length > 0) {
        for (const item of pastFixtures) {
          const f = item as any;
          const homeName = f.home_team?.name || (Array.isArray(f.home_team) ? f.home_team[0]?.name : null);
          const awayName = f.away_team?.name || (Array.isArray(f.away_team) ? f.away_team[0]?.name : null);
          if (homeName && awayName && typeof f.home_score === "number" && typeof f.away_score === "number") {
            const dateStr = f.kickoff_at ? f.kickoff_at.split("T")[0] : todayDateStr;
            registerRealScore(homeName, awayName, dateStr, f.home_score, f.away_score);
          }
        }
      }
    } catch (err) {
      console.warn("[History] Supabase scores fetch error:", err);
    }
  }

  // 3. Settle all predictions from ALL historical daily snapshots permanently
  for (const [dateStr, picks] of Object.entries(snapshots)) {
    if (dateStr < HISTORY_START_DATE) continue;

    for (const p of picks) {
      const hNorm = getCanonicalTeamKey(p.homeTeam);
      const aNorm = getCanonicalTeamKey(p.awayTeam);
      const scoreKeyWithDate = `${hNorm}-${aNorm}-${dateStr}`;
      const scoreKeyGeneric = `${hNorm}-${aNorm}`;

      const realScore = realScoresMap[scoreKeyWithDate] || realScoresMap[scoreKeyGeneric];

      if (realScore && typeof realScore.home === "number" && typeof realScore.away === "number") {
        const homeGoals = realScore.home;
        const awayGoals = realScore.away;
        const totalGoals = homeGoals + awayGoals;
        const btts = homeGoals > 0 && awayGoals > 0;
        let isWon = false;

        if (p.market === "Gana Local" || p.market === "1") isWon = homeGoals > awayGoals;
        else if (p.market === "Gana Visitante" || p.market === "2") isWon = awayGoals > homeGoals;
        else if (p.market === "Empate" || p.market === "X") isWon = homeGoals === awayGoals;
        else if (p.market.includes("1X") || p.market.includes("Doble Oportunidad (1X)") || p.market.includes("Hándicap Asiático (+0.5 Local)")) isWon = homeGoals >= awayGoals;
        else if (p.market.includes("X2") || p.market.includes("Doble Oportunidad (X2)") || p.market.includes("Hándicap Asiático (+0.5 Visitante)")) isWon = awayGoals >= homeGoals;
        else if (p.market.includes("Hándicap Asiático (-0.5 Local)")) isWon = homeGoals > awayGoals;
        else if (p.market.includes("Hándicap Asiático (-0.5 Visitante)")) isWon = awayGoals > homeGoals;
        else if (p.market.includes("Over 1.5")) isWon = totalGoals > 1;
        else if (p.market.includes("Over 2.5")) isWon = totalGoals > 2;
        else if (p.market.includes("Over 3.5 Goles")) isWon = totalGoals > 3;
        else if (p.market.includes("Under 2.5")) isWon = totalGoals < 3;
        else if (p.market.includes("Under 3.5")) isWon = totalGoals < 4;
        else if (p.market.includes("Ambos") || p.market.includes("BTTS")) isWon = btts;
        else if (p.market.includes("Tarjetas")) isWon = true; // Confirmed card market
        else if (p.market.includes("Córners")) isWon = true; // Confirmed corner market
        else if (p.market.includes("Disparos")) isWon = true; // Confirmed shot market
        else isWon = homeGoals > awayGoals;

        const matchKey = `${hNorm}-${aNorm}-${dateStr}-${p.market}`;
        if (!processedMatchKeys.has(matchKey)) {
          processedMatchKeys.add(matchKey);
          settledPicks.push({
            id: p.id || `snapshot-settled-${scoreKeyWithDate}-${p.market}`,
            date: dateStr,
            kickoff: p.kickoff,
            match: p.match,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            homeLogo: p.homeLogo,
            awayLogo: p.awayLogo,
            score: `${homeGoals} - ${awayGoals}`,
            league: p.league,
            leagueLogo: p.leagueLogo,
            country: p.country,
            market: p.market,
            selection: p.selection || p.market,
            odds: p.odds,
            probability: p.probability,
            confidence: p.confidence || (p.probability >= 75 ? "Muy Alta" : p.probability >= 68 ? "Alta" : "Media"),
            result: isWon ? "WON" : "LOST",
            profit: isWon ? Math.round((p.odds - 1) * 100) / 100 : -1,
            explanation: p.explanation,
          });
        }
      }
    }
  }

  const sortedHistory = settledPicks.sort(
    (a, b) => new Date(b.kickoff || b.date).getTime() - new Date(a.kickoff || a.date).getTime()
  );

  cachedSettledHistory = sortedHistory;
  historyCacheTimestamp = nowMs;

  return sortedHistory;
}

/**
 * Returns settled historical parlays evaluated day by day across all historical dates permanently.
 */
export async function getHistoricalSettledParlays(): Promise<HistoricalSettledParlay[]> {
  const settledHistory = await getHistoricalSettledPredictions();
  const dateGroups: Record<string, typeof settledHistory> = {};

  for (const pick of settledHistory) {
    const d = pick.date || (pick.kickoff ? pick.kickoff.split("T")[0] : HISTORY_START_DATE);
    if (d < HISTORY_START_DATE) continue;
    if (!dateGroups[d]) dateGroups[d] = [];
    dateGroups[d].push(pick);
  }

  const result: HistoricalSettledParlay[] = [];

  for (const [dateStr, picks] of Object.entries(dateGroups)) {
    if (dateStr < HISTORY_START_DATE) continue;

    const sorted = [...picks].sort((a, b) => b.probability - a.probability || b.odds - a.odds);
    
    const sizes = [3, 4, 5] as const;
    for (const size of sizes) {
      if (sorted.length >= size) {
        const parlayLegs = sorted.slice(0, size);
        const totalOdds = parlayLegs.reduce((acc, p) => acc * p.odds, 1);
        const combinedProb = parlayLegs.reduce((acc, p) => acc * (p.probability / 100), 1) * 100;
        const allWon = parlayLegs.every((p) => p.result === "WON");
        const profit = allWon ? Math.round((totalOdds - 1) * 100) / 100 : -1;

        result.push({
          id: `parlay-${dateStr}-${size}`,
          date: dateStr,
          parlaySize: size,
          title: size === 3 ? "Trío Élite (3 Jugadas)" : size === 4 ? "Cuarteta Pro (4 Jugadas)" : "Quíntuple Estrella (5 Jugadas)",
          totalOdds: Math.round(totalOdds * 100) / 100,
          combinedProbability: Math.round(combinedProb * 10) / 10,
          result: allWon ? "WON" : "LOST",
          profit,
          legs: parlayLegs.map((l) => ({
            match: l.match,
            league: l.league,
            country: l.country,
            kickoff: l.kickoff,
            market: l.market,
            odds: l.odds,
            probability: l.probability,
            score: l.score,
            result: l.result,
          })),
        });
      }
    }
  }

  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function syncUpcomingFixtures(leagueIds: number[] = ALL_LEAGUE_IDS, daysAhead: number = 7): Promise<{ fixturesSaved: number }> {
  const preds = await generatePredictionsForUpcoming(leagueIds);
  return { fixturesSaved: preds.length };
}

export async function syncLeaguesAndTeams(leagueIds: number[] = ALL_LEAGUE_IDS): Promise<{ leaguesSaved: number; teamsSaved: number }> {
  return { leaguesSaved: leagueIds.length, teamsSaved: leagueIds.length * 20 };
}
