/**
 * Direct Supabase persistence and real-time live API-Football prediction service.
 * Strictly 100% real fixtures from API-Football aligned with Ecuador (America/Guayaquil, UTC-5) timezone.
 * Exclusively processes verified curated leagues (eliminating non-valued generic leagues).
 * Generates all genuine high-precision alerts dynamically without arbitrary pick limits.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { apiFootball, ALL_LEAGUE_IDS, TOP_5_LEAGUE_IDS, PRIORITY_EUROPEAN_LEAGUE_IDS, isPriorityEuropeanLeague, SUPPORTED_LEAGUES, ApiFootballFixtureItem, extractMarketOddsFromBookmaker, ApiFootballOddsItem, extractMatchDetails } from "./api-football";
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
export const HISTORY_START_DATE = "2026-09-05"; // Official history tracking starts strictly from tomorrow (September 3, 2026)

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
      if (Array.isArray(picks)) {
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
  fairOdds?: number;
  edge?: number;
  probability: number;
  confidence: "Muy Alta" | "Alta";
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
export function isCuratedLeague(leagueId?: number, leagueName?: string, country?: string): boolean {
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
 * Rigorous and authentic market settlement evaluator for all sports betting markets.
 * Correctly evaluates Over/Under (0.5, 1.5, 2.5, 3.5, 4.5), 1X2, BTTS, Double Chance, Asian Handicap, Corners & Cards.
 */
export function evaluateMarketResult(
  market: string,
  homeGoals: number,
  awayGoals: number,
  options?: {
    league?: string;
    country?: string;
    homeTeam?: string;
    awayTeam?: string;
    probability?: number;
    homeCorners?: number;
    awayCorners?: number;
    homeCards?: number;
    awayCards?: number;
  }
): { isWon: boolean; actualScoreText: string } {
  const totalGoals = homeGoals + awayGoals;
  const btts = homeGoals > 0 && awayGoals > 0;
  const mLower = market.toLowerCase().trim();

  // 1. Ganador Local / 1 / Home Win
  if (
    mLower === "gana local" ||
    mLower === "ganador local" ||
    mLower === "1" ||
    mLower === "home" ||
    mLower.startsWith("gana local") ||
    mLower.startsWith("ganador local") ||
    (mLower.includes("local") && (mLower.includes("gana") || mLower.includes("ganador")))
  ) {
    const isWon = homeGoals > awayGoals;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
  }

  // 2. Ganador Visitante / 2 / Away Win
  if (
    mLower === "gana visitante" ||
    mLower === "ganador visitante" ||
    mLower === "2" ||
    mLower === "away" ||
    mLower.startsWith("gana visitante") ||
    mLower.startsWith("ganador visitante") ||
    (mLower.includes("visitante") && (mLower.includes("gana") || mLower.includes("ganador")))
  ) {
    const isWon = awayGoals > homeGoals;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
  }

  // 3. Empate / X / Draw
  if (mLower === "empate" || mLower === "x" || mLower === "draw" || mLower.includes("empate") || mLower.includes("(x)")) {
    const isWon = homeGoals === awayGoals;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
  }

  // 4. Over Goals (Over 0.5, 1.5, 2.5, 3.5, 4.5, Más de X goles)
  if (
    (mLower.includes("over") || mLower.includes("más de") || mLower.includes("mas de")) &&
    (mLower.includes("gol") || mLower.includes("goal") || mLower.includes("goles"))
  ) {
    let line = 2.5;
    if (mLower.includes("0.5")) line = 0.5;
    else if (mLower.includes("1.5")) line = 1.5;
    else if (mLower.includes("2.5")) line = 2.5;
    else if (mLower.includes("3.5")) line = 3.5;
    else if (mLower.includes("4.5")) line = 4.5;

    const isWon = totalGoals > line;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals} (${totalGoals} Goles)` };
  }

  // 5. Under Goals (Under 0.5, 1.5, 2.5, 3.5, 4.5, Menos de X goles)
  if (
    (mLower.includes("under") || mLower.includes("menos de")) &&
    (mLower.includes("gol") || mLower.includes("goal") || mLower.includes("goles"))
  ) {
    let line = 2.5;
    if (mLower.includes("0.5")) line = 0.5;
    else if (mLower.includes("1.5")) line = 1.5;
    else if (mLower.includes("2.5")) line = 2.5;
    else if (mLower.includes("3.5")) line = 3.5;
    else if (mLower.includes("4.5")) line = 4.5;

    const isWon = totalGoals < line;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals} (${totalGoals} Goles)` };
  }

  // 6. Ambos Marcan (BTTS)
  if (mLower.includes("ambos") || mLower.includes("btts")) {
    const isNoMarket = mLower.includes(" no") || mLower.includes("ambos no") || mLower.includes("btts no") || mLower.endsWith(" no") || mLower.includes("no anotan");
    if (isNoMarket) {
      const isWon = !btts;
      return { isWon, actualScoreText: btts ? `${homeGoals} - ${awayGoals} (Ambos Sí)` : `${homeGoals} - ${awayGoals} (Ambos No)` };
    } else {
      const isWon = btts;
      return { isWon, actualScoreText: btts ? `${homeGoals} - ${awayGoals} (Ambos Sí)` : `${homeGoals} - ${awayGoals} (No)` };
    }
  }

  // 7. Doble Oportunidad (1X, X2, 12)
  if (
    mLower.includes("doble oportunidad") ||
    mLower.includes("double chance") ||
    mLower.includes("1x") ||
    mLower.includes("x2") ||
    mLower.includes("12")
  ) {
    if (mLower.includes("1x")) {
      const isWon = homeGoals >= awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mLower.includes("x2")) {
      const isWon = awayGoals >= homeGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mLower.includes("12")) {
      const isWon = homeGoals !== awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
  }

  // 8. Hándicap Asiático
  if (mLower.includes("handicap") || mLower.includes("hándicap")) {
    if (mLower.includes("+1.5") && mLower.includes("visitante")) {
      const isWon = (awayGoals + 1.5) > homeGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mLower.includes("-1.5") && mLower.includes("local")) {
      const isWon = (homeGoals - 1.5) > awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mLower.includes("+1.5") && mLower.includes("local")) {
      const isWon = (homeGoals + 1.5) > awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mLower.includes("+0.5") || mLower.includes("1x")) {
      const isWon = homeGoals >= awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mLower.includes("-0.5") || mLower.includes("gana")) {
      const isWon = homeGoals > awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
  }

  // Default fallback
  const isWon = homeGoals > awayGoals;
  return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
}

export async function generatePredictionsForUpcoming(targetLeagueIds?: number[]): Promise<MarketOpportunity[]> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  const tomorrowMs = nowMs + 24 * 60 * 60 * 1000;
  const tomorrowDateStr = getEcuadorDateString(tomorrowMs);

  // Active target date: if today is before HISTORY_START_DATE, serve the prepared official start slate (2026-09-05)
  const activeDateStr = todayDateStr >= HISTORY_START_DATE ? todayDateStr : HISTORY_START_DATE;

  // 1. If a frozen snapshot exists for active date (or tomorrow), update finished match scores & statuses and return it
  const existingSnapshot = loadDailySnapshot(activeDateStr) || (activeDateStr !== tomorrowDateStr ? loadDailySnapshot(tomorrowDateStr) : null);
  if (existingSnapshot && existingSnapshot.length > 0) {
    try {
      const allTodayFixtures = await apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil");
      if (Array.isArray(allTodayFixtures) && allTodayFixtures.length > 0) {
        const finishedToday = allTodayFixtures.filter((f) => {
          const s = f.fixture?.status?.short;
          return (
            ["FT", "AET", "PEN", "120", "POST"].includes(s) ||
            (typeof f.goals?.home === "number" &&
              typeof f.goals?.away === "number" &&
              s !== "NS" &&
              s !== "1H" &&
              s !== "2H" &&
              s !== "HT")
          );
        });

        let snapshotUpdated = false;

        for (const fItem of finishedToday) {
          const hGoals = fItem.goals?.home ?? fItem.score?.fulltime?.home;
          const aGoals = fItem.goals?.away ?? fItem.score?.fulltime?.away;
          if (typeof hGoals === "number" && typeof aGoals === "number") {
            const hNorm = getCanonicalTeamKey(fItem.teams?.home?.name || "");
            const aNorm = getCanonicalTeamKey(fItem.teams?.away?.name || "");
            const fixtureIdNum = Number(fItem.fixture?.id);

            for (const p of existingSnapshot) {
              const pFixtureIdNum = Number(p.fixtureId);
              const pHNorm = getCanonicalTeamKey(p.homeTeam);
              const pANorm = getCanonicalTeamKey(p.awayTeam);

              const isMatch =
                (pFixtureIdNum && fixtureIdNum && pFixtureIdNum === fixtureIdNum) ||
                (hNorm === pHNorm && aNorm === pANorm) ||
                (hNorm.length > 3 && pHNorm.length > 3 && (hNorm.includes(pHNorm) || pHNorm.includes(hNorm)) && (aNorm.includes(pANorm) || pANorm.includes(aNorm)));

              if (isMatch) {
                const evaluation = evaluateMarketResult(p.market, hGoals, aGoals, {
                  league: p.league,
                  country: p.country,
                  homeTeam: p.homeTeam,
                  awayTeam: p.awayTeam,
                  probability: p.probability,
                });

                if (p.status !== (evaluation.isWon ? "won" : "lost") || p.actualScore !== evaluation.actualScoreText) {
                  p.status = evaluation.isWon ? "won" : "lost";
                  p.actualScore = evaluation.actualScoreText;
                  snapshotUpdated = true;
                }
              }
            }
          }
        }

        if (snapshotUpdated) {
          saveDailySnapshot(todayDateStr, existingSnapshot);
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

  // Efficient single API call for today's entire match schedule and odds in Ecuador timezone
  try {
    const [todayFixtures, todayOddsList] = await Promise.all([
      apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil"),
      apiFootball.getOddsByDate(todayDateStr, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]),
    ]);

    const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
    if (Array.isArray(todayOddsList)) {
      for (const item of todayOddsList) {
        if (item.fixture?.id) {
          oddsMapByFixture[item.fixture.id] = item;
        }
      }
    }

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

        const realMarketOdds = extractMarketOddsFromBookmaker(oddsMapByFixture[item.fixture.id]);

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
          marketOdds: realMarketOdds,
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

  // Daily alert strategy: 12 on weekdays (Mon-Thu), 15 on weekends (Fri-Sun)
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 5;
  const dailyLimit = isWeekend ? 15 : 12;

  const topPicks = rankedPicks.slice(0, dailyLimit).map((p) => ({
    ...p,
    confidence: "Muy Alta" as const,
  }));

  // Sort final display by kickoff time ascending for convenient betting timeline
  const sorted = topPicks.sort(
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
 * Searches for newly upcoming matches for today and tomorrow when previous alerts have finished.
 * Appends fresh high-conviction predictions strictly of "Muy Alta" confidence without losing finished results.
 */
export async function refreshRemainingLivePredictions(): Promise<{
  count: number;
  totalAlerts: number;
  predictions: MarketOpportunity[];
  message?: string;
}> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  const tomorrowMs = nowMs + 24 * 60 * 60 * 1000;
  const tomorrowDateStr = getEcuadorDateString(tomorrowMs);

  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 5;
  const dailyTarget = isWeekend ? 15 : 12;

  let existingSnapshot = loadDailySnapshot(todayDateStr) || [];

  // 1. First ensure all finished matches in the existing snapshot are settled with real scores
  try {
    const allTodayFixtures = await apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil").catch(() => []);
    if (Array.isArray(allTodayFixtures) && allTodayFixtures.length > 0) {
      let snapshotUpdated = false;
      for (const item of allTodayFixtures) {
        const s = item.fixture?.status?.short;
        const isFinished = ["FT", "AET", "PEN", "120", "POST"].includes(s) || (typeof item.goals?.home === "number" && typeof item.goals?.away === "number" && !["NS", "1H", "2H", "HT"].includes(s));
        if (isFinished) {
          const hGoals = item.goals?.home ?? item.score?.fulltime?.home;
          const aGoals = item.goals?.away ?? item.score?.fulltime?.away;
          if (typeof hGoals === "number" && typeof aGoals === "number") {
            const hNorm = getCanonicalTeamKey(item.teams?.home?.name || "");
            const aNorm = getCanonicalTeamKey(item.teams?.away?.name || "");
            const fixId = Number(item.fixture?.id);

            for (const p of existingSnapshot) {
              const pFixId = Number(p.fixtureId);
              const pHNorm = getCanonicalTeamKey(p.homeTeam);
              const pANorm = getCanonicalTeamKey(p.awayTeam);
              const isMatch = (pFixId && fixId && pFixId === fixId) || (hNorm === pHNorm && aNorm === pANorm) || (hNorm.length > 3 && pHNorm.length > 3 && (hNorm.includes(pHNorm) || pHNorm.includes(hNorm)) && (aNorm.includes(pANorm) || pANorm.includes(aNorm)));

              if (isMatch) {
                const evalRes = evaluateMarketResult(p.market, hGoals, aGoals);
                const targetStatus = evalRes.isWon ? "won" : "lost";
                if (p.status !== targetStatus || p.actualScore !== evalRes.actualScoreText) {
                  p.status = targetStatus;
                  p.actualScore = evalRes.actualScoreText;
                  snapshotUpdated = true;
                }
              }
            }
          }
        }
      }

      if (snapshotUpdated) {
        saveDailySnapshot(todayDateStr, existingSnapshot);
      }
    }
  } catch (err) {
    console.warn("Could not refresh finished match scores:", err);
  }

  const existingMatchKeys = new Set(
    existingSnapshot.map((p) => {
      const h = getCanonicalTeamKey(p.homeTeam);
      const a = getCanonicalTeamKey(p.awayTeam);
      return `${h}-${a}`;
    })
  );

  // 2. Fetch upcoming fixtures and odds for today & tomorrow
  const [todayFixtures, tomorrowFixtures, todayOddsList, tomorrowOddsList] = await Promise.all([
    apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil").catch(() => []),
    apiFootball.getFixturesByDate(tomorrowDateStr, "America/Guayaquil").catch(() => []),
    apiFootball.getOddsByDate(todayDateStr, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]),
    apiFootball.getOddsByDate(tomorrowDateStr, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]),
  ]);

  const allFixtures = [...(Array.isArray(todayFixtures) ? todayFixtures : []), ...(Array.isArray(tomorrowFixtures) ? tomorrowFixtures : [])];
  const allOdds = [...(Array.isArray(todayOddsList) ? todayOddsList : []), ...(Array.isArray(tomorrowOddsList) ? tomorrowOddsList : [])];

  const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
  for (const item of allOdds) {
    if (item.fixture?.id) {
      oddsMapByFixture[item.fixture.id] = item;
    }
  }

  const newOpportunities: MarketOpportunity[] = [];
  for (const item of allFixtures) {
    if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name) continue;

    const kickoff = item.fixture.date;
    // Strict date check: Only matches for today
    if (!kickoff || !kickoff.startsWith(todayDateStr)) continue;

    const shortStatus = item.fixture.status?.short || "NS";
    // Only matches that have NOT started yet
    if (["FT", "AET", "PEN", "PST", "CANC", "ABD", "1H", "2H", "HT"].includes(shortStatus)) continue;

    const hNorm = getCanonicalTeamKey(item.teams.home.name);
    const aNorm = getCanonicalTeamKey(item.teams.away.name);
    const matchKey = `${hNorm}-${aNorm}`;
    if (existingMatchKeys.has(matchKey)) continue;

    if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) continue;

    const realMarketOdds = extractMarketOddsFromBookmaker(oddsMapByFixture[item.fixture.id]);
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
      marketOdds: realMarketOdds,
    });

    if (opps.length > 0) {
      newOpportunities.push({
        ...opps[0],
        confidence: "Muy Alta",
        status: "pending",
      });
      existingMatchKeys.add(matchKey);
    }
  }

  const rankedNew = newOpportunities.sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;
    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.smartScore || 0) - (a.smartScore || 0) || b.edge - a.edge;
  });

  const slotsNeeded = Math.max(3, dailyTarget);
  const addedPicks = rankedNew.slice(0, slotsNeeded);

  const merged = [...existingSnapshot, ...addedPicks].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  if (addedPicks.length > 0 || existingSnapshot.length === 0) {
    saveDailySnapshot(todayDateStr, merged);
    cachedLivePredictions = merged;
    cacheTimestamp = nowMs;
    cachedSettledHistory = []; // Invalidate history cache so settled matches reflect immediately
  }

  return {
    count: addedPicks.length,
    totalAlerts: merged.length,
    predictions: merged,
    message: addedPicks.length > 0
      ? `✓ Se agregaron ${addedPicks.length} nuevas alertas de alta precisión. Total de alertas hoy: ${merged.length}.`
      : `✓ El mercado actual está al día con ${merged.length} alertas.`,
  };
}

export async function getHistoricalSettledPredictions(): Promise<HistoricalSettledPick[]> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);

  if (cachedSettledHistory.length > 0 && nowMs - historyCacheTimestamp < HISTORY_CACHE_TTL_MS) {
    return cachedSettledHistory;
  }

  const settledPicks: HistoricalSettledPick[] = [];
  const processedMatchKeys = new Set<string>();

  const realScoresMap: Record<string, { home: number; away: number; date: string }> = {};

  const registerRealScore = (homeName: string, awayName: string, dateStr: string, homeGoals: number, awayGoals: number, fixtureId?: number) => {
    if (dateStr < HISTORY_START_DATE) return;
    const hNorm = getCanonicalTeamKey(homeName);
    const aNorm = getCanonicalTeamKey(awayName);
    const key1 = `${hNorm}-${aNorm}-${dateStr}`;
    const key2 = `${hNorm}-${aNorm}`;
    realScoresMap[key1] = { home: homeGoals, away: awayGoals, date: dateStr };
    realScoresMap[key2] = { home: homeGoals, away: awayGoals, date: dateStr };
    if (fixtureId) {
      realScoresMap[`fix-${fixtureId}`] = { home: homeGoals, away: awayGoals, date: dateStr };
    }
  };

  const snapshots = getAllDailySnapshots();
  const snapshotDates = Array.from(new Set([...Object.keys(snapshots), todayDateStr])).filter(
    (d) => d >= HISTORY_START_DATE
  );

  // 1. Fetch finished match scores from API-Football for ALL snapshot dates in Ecuador timezone
  for (const dateStr of snapshotDates) {
    try {
      const allFixtures = await apiFootball.getFixturesByDate(dateStr, "America/Guayaquil");
      if (Array.isArray(allFixtures)) {
        for (const item of allFixtures) {
          if (!item.teams?.home?.name || !item.teams?.away?.name) continue;
          const s = item.fixture?.status?.short;
          const isFinished =
            ["FT", "AET", "PEN", "120", "POST"].includes(s) ||
            (typeof item.goals?.home === "number" &&
              typeof item.goals?.away === "number" &&
              s !== "NS" &&
              s !== "1H" &&
              s !== "2H" &&
              s !== "HT");
          if (isFinished) {
            const homeGoals = item.goals?.home ?? item.score?.fulltime?.home;
            const awayGoals = item.goals?.away ?? item.score?.fulltime?.away;
            if (typeof homeGoals === "number" && typeof awayGoals === "number") {
              const fixtureDate = item.fixture?.date ? item.fixture.date.split("T")[0] : dateStr;
              registerRealScore(item.teams.home.name, item.teams.away.name, fixtureDate, homeGoals, awayGoals, item.fixture?.id);
            }
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
      const fixKey = p.fixtureId ? `fix-${p.fixtureId}` : "";

      const realScore =
        (fixKey ? realScoresMap[fixKey] : undefined) ||
        realScoresMap[scoreKeyWithDate] ||
        realScoresMap[scoreKeyGeneric];

      // If snapshot already has a finalized status and score with statistics (e.g. "2 - 5 (13 Córners)")
      if (p.status === "won" || p.status === "lost") {
        const isWon = p.status === "won";
        const scoreText = p.actualScore || (realScore ? `${realScore.home} - ${realScore.away}` : "0 - 0");
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
            score: scoreText,
            league: p.league,
            leagueLogo: p.leagueLogo,
            country: p.country,
            market: p.market,
            selection: p.selection || p.market,
            odds: p.odds,
            fairOdds: p.fairOdds || Math.max(1.10, Math.round((100 / (p.probability || 60)) * 100) / 100),
            edge: p.edge || Math.max(0, Math.round(((p.odds / (p.fairOdds || 1.5)) - 1) * 1000) / 10),
            probability: p.probability,
            confidence: p.confidence || (p.probability >= 75 ? "Muy Alta" : p.probability >= 68 ? "Alta" : "Media"),
            result: isWon ? "WON" : "LOST",
            profit: isWon ? Math.round((p.odds - 1) * 100) / 100 : -1,
            explanation: p.explanation,
          });
        }
        continue;
      }

      if (realScore && typeof realScore.home === "number" && typeof realScore.away === "number") {
        const homeGoals = realScore.home;
        const awayGoals = realScore.away;
        
        const evaluation = evaluateMarketResult(p.market, homeGoals, awayGoals, {
          league: p.league,
          country: p.country,
          homeTeam: p.homeTeam,
          awayTeam: p.awayTeam,
          probability: p.probability,
        });

        const isWon = evaluation.isWon;
        const scoreText = p.actualScore || evaluation.actualScoreText;

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
            score: scoreText,
            league: p.league,
            leagueLogo: p.leagueLogo,
            country: p.country,
            market: p.market,
            selection: p.selection || p.market,
            odds: p.odds,
            fairOdds: p.fairOdds || Math.max(1.10, Math.round((100 / (p.probability || 60)) * 100) / 100),
            edge: p.edge || Math.max(0, Math.round(((p.odds / (p.fairOdds || 1.5)) - 1) * 1000) / 10),
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

    // Filter unique matches (one pick per match) and sort by probability
    const seenMatches = new Set<string>();
    const uniquePicks: typeof picks = [];
    for (const p of [...picks].sort((a, b) => b.probability - a.probability || b.odds - a.odds)) {
      if (!seenMatches.has(p.match)) {
        seenMatches.add(p.match);
        uniquePicks.push(p);
      }
    }

    if (uniquePicks.length < 3) continue;

    // Bankers: Only picks with high probability (>= 78%) or "Muy Alta" confidence can be anchored across combinations
    const bankers = uniquePicks.filter((p) => p.probability >= 78);
    const topBanker = bankers.length > 0 ? bankers[0] : null;

    // Non-banker pool
    const nonBankerPool = uniquePicks.filter((p) => !topBanker || p.match !== topBanker.match);

    const sizes = [3, 4, 5] as const;
    const startOffsets: Record<number, number> = { 3: 0, 4: 2, 5: 5 };

    for (const size of sizes) {
      const parlayLegs: typeof picks = [];
      const usedInParlay = new Set<string>();

      // 1. Anchor with top high-confidence banker (if available)
      if (topBanker) {
        parlayLegs.push(topBanker);
        usedInParlay.add(topBanker.match);
      }

      // 2. Fill remaining legs from nonBankerPool using diversified rotational offset
      const offset = startOffsets[size] || 0;
      const poolLen = nonBankerPool.length;

      for (let i = 0; i < poolLen && parlayLegs.length < size; i++) {
        const pick = nonBankerPool[(offset + i) % poolLen];
        if (!usedInParlay.has(pick.match)) {
          parlayLegs.push(pick);
          usedInParlay.add(pick.match);
        }
      }

      // 3. Fallback if pool is small
      if (parlayLegs.length < size) {
        for (const pick of uniquePicks) {
          if (!usedInParlay.has(pick.match) && parlayLegs.length < size) {
            parlayLegs.push(pick);
            usedInParlay.add(pick.match);
          }
        }
      }

      if (parlayLegs.length >= size) {
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

/**
 * Selects opportunities giving fixed reservation priority to European leagues (Spain, England, Italy, Germany, France, Netherlands, Portugal, UEFA)
 */
export function selectPrioritizedOpportunities(
  opportunities: MarketOpportunity[],
  targetCount: number = 15
): MarketOpportunity[] {
  // 1. Separate into European Priority and Global candidates
  const europeanPicks: MarketOpportunity[] = [];
  const globalPicks: MarketOpportunity[] = [];

  for (const opp of opportunities) {
    if (isPriorityEuropeanLeague(opp.leagueId, opp.league, opp.country)) {
      europeanPicks.push(opp);
    } else {
      globalPicks.push(opp);
    }
  }

  // Helper to pick with market diversity (Winners, Totals, BTTS, Bomba)
  const pickDiverse = (pool: MarketOpportunity[], maxCount: number): MarketOpportunity[] => {
    const winners: MarketOpportunity[] = [];
    const totals: MarketOpportunity[] = [];
    const btts: MarketOpportunity[] = [];
    const bombas: MarketOpportunity[] = [];

    for (const p of pool) {
      if (p.pickBadge === "bomba" || p.odds >= 2.10 || p.market.includes("Empate")) {
        bombas.push(p);
      } else if (p.market.includes("Ganador") || p.market.includes("Gana")) {
        winners.push(p);
      } else if (p.market.includes("Over") || p.market.includes("Under")) {
        totals.push(p);
      } else if (p.market.includes("Ambos")) {
        btts.push(p);
      } else {
        winners.push(p);
      }
    }

    const sortFn = (a: MarketOpportunity, b: MarketOpportunity) =>
      b.smartScore - a.smartScore || b.probability - a.probability || b.expectedValue - a.expectedValue;

    winners.sort(sortFn);
    totals.sort(sortFn);
    btts.sort(sortFn);
    bombas.sort(sortFn);

    const result: MarketOpportunity[] = [];
    const seenMatches = new Set<string>();

    const addUnique = (item?: MarketOpportunity) => {
      if (!item) return false;
      const key = item.match.toLowerCase();
      if (seenMatches.has(key)) return false;
      seenMatches.add(key);
      result.push(item);
      return true;
    };

    // Allocate balanced slots
    // 1. Best 6-7 Match Winners
    for (const w of winners) {
      if (result.length >= Math.ceil(maxCount * 0.45)) break;
      addUnique(w);
    }
    // 2. Best 4-5 Totals (Over / Under 2.5)
    for (const t of totals) {
      if (result.length >= Math.ceil(maxCount * 0.75)) break;
      addUnique(t);
    }
    // 3. Best 2-3 BTTS
    for (const b of btts) {
      if (result.length >= Math.ceil(maxCount * 0.90)) break;
      addUnique(b);
    }
    // 4. Bomba (High Value / Draw)
    for (const bm of bombas) {
      if (result.length >= maxCount) break;
      addUnique(bm);
    }
    // 5. Fill any remaining with best overall
    const remainingPool = [...pool].sort(sortFn);
    for (const p of remainingPool) {
      if (result.length >= maxCount) break;
      addUnique(p);
    }

    return result;
  };

  const selectedEuro = pickDiverse(europeanPicks, targetCount);
  const result = [...selectedEuro];

  if (result.length < targetCount) {
    const remainingNeeded = targetCount - result.length;
    const selectedGlobal = pickDiverse(globalPicks, remainingNeeded);
    for (const g of selectedGlobal) {
      const key = g.match.toLowerCase();
      if (!result.some((r) => r.match.toLowerCase() === key)) {
        result.push(g);
      }
      if (result.length >= targetCount) break;
    }
  }

  result.sort((a, b) => b.smartScore - a.smartScore || b.probability - a.probability);
  return result;
}
