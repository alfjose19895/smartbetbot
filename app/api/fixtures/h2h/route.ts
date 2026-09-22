import { NextRequest, NextResponse } from "next/server";
import { apiFootball, extractMatchDetails, isWomenContext } from "@/lib/sports/api-football";
import {
  getTeamRating,
  getCanonicalTeamKey,
  generateTeamRecentForm,
  generateH2HClashes,
  H2HMatch,
  TeamFormMatch,
} from "@/lib/sports/prediction-engine";
import fs from "fs";
import path from "path";

export interface TeamCornerSummary {
  avgTotal: number;
  avgFor: number;
  avgAgainst: number;
  over85Rate: number;
  over95Rate: number;
  over105Rate: number;
  history: number[];
}

interface H2HApiResponse {
  success: boolean;
  h2h: H2HMatch[];
  recentH2H: H2HMatch[];
  homeLast5: TeamFormMatch[];
  awayLast5: TeamFormMatch[];
  homeElo: number;
  awayElo: number;
  isOfficial: boolean;
  homeCornerStats?: TeamCornerSummary | null;
  awayCornerStats?: TeamCornerSummary | null;
  error?: string;
}

// Persistent In-Memory and Disk Cache for H2H
const memoryH2HCache: Record<string, { timestamp: number; data: H2HApiResponse }> = {};
const CACHE_DIR = path.join(process.cwd(), "data", "h2h_cache");
const STATS_CACHE_DIR = path.join(process.cwd(), "data", "fixture_stats_cache");

function ensureDirs() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (!fs.existsSync(STATS_CACHE_DIR)) fs.mkdirSync(STATS_CACHE_DIR, { recursive: true });
  } catch (err) {
    console.warn("Could not create cache directories:", err);
  }
}

function loadH2HFromDisk(cacheKey: string): H2HApiResponse | null {
  try {
    ensureDirs();
    const filePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`Could not read H2H cache for ${cacheKey}:`, err);
  }
  return null;
}

function saveH2HToDisk(cacheKey: string, data: H2HApiResponse) {
  try {
    ensureDirs();
    const filePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn(`Could not write H2H cache for ${cacheKey}:`, err);
  }
}

async function getCachedFixtureCorners(fixtureId: number): Promise<{ homeCorners: number; awayCorners: number; totalCorners: number; hasRealCorners: boolean } | null> {
  try {
    ensureDirs();
    const filePath = path.join(STATS_CACHE_DIR, `${fixtureId}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
    const stats = await apiFootball.getFixtureStatistics(fixtureId);
    if (stats && Array.isArray(stats) && stats.length >= 2) {
      const details = extractMatchDetails(stats);
      if (details.hasStats) {
        const cornerData = {
          homeCorners: details.homeCorners,
          awayCorners: details.awayCorners,
          totalCorners: details.totalCorners,
          hasRealCorners: true,
        };
        fs.writeFileSync(filePath, JSON.stringify(cornerData, null, 2), "utf-8");
        return cornerData;
      }
    }
  } catch (err) {
    console.warn(`[Stats] Could not get real corner stats for fixture ${fixtureId}:`, err);
  }
  return null;
}

function calculateCornerSummary(matches: TeamFormMatch[]): TeamCornerSummary | null {
  if (!matches || matches.length === 0) return null;

  const validMatches = matches.filter(
    (m) => m.totalCorners !== undefined && m.totalCorners !== null && m.teamCorners !== undefined
  );
  if (validMatches.length === 0) return null;

  const totals = validMatches.map((m) => m.totalCorners!);
  const forList = validMatches.map((m) => m.teamCorners!);
  const againstList = validMatches.map((m) => m.opponentCorners!);

  const sumTotal = totals.reduce((a, b) => a + b, 0);
  const sumFor = forList.reduce((a, b) => a + b, 0);
  const sumAgainst = againstList.reduce((a, b) => a + b, 0);

  const over85Count = totals.filter((t) => t > 8.5).length;
  const over95Count = totals.filter((t) => t > 9.5).length;
  const over105Count = totals.filter((t) => t > 10.5).length;

  return {
    avgTotal: Math.round((sumTotal / validMatches.length) * 10) / 10,
    avgFor: Math.round((sumFor / validMatches.length) * 10) / 10,
    avgAgainst: Math.round((sumAgainst / validMatches.length) * 10) / 10,
    over85Rate: Math.round((over85Count / validMatches.length) * 100),
    over95Rate: Math.round((over95Count / validMatches.length) * 100),
    over105Rate: Math.round((over105Count / validMatches.length) * 100),
    history: totals,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeTeam = searchParams.get("homeTeam") || searchParams.get("home") || "";
    const awayTeam = searchParams.get("awayTeam") || searchParams.get("away") || "";
    const league = searchParams.get("league") || "Liga";
    const kickoff = searchParams.get("kickoff") || "";

    if (!homeTeam || !awayTeam) {
      return NextResponse.json({ success: false, error: "Faltan parámetros homeTeam y awayTeam" }, { status: 400 });
    }

    const hNorm = getCanonicalTeamKey(homeTeam);
    const aNorm = getCanonicalTeamKey(awayTeam);
    const isWomenMatch = isWomenContext(league) || isWomenContext(homeTeam) || isWomenContext(awayTeam);
    const cacheKey = `${hNorm}-${aNorm}${isWomenMatch ? "-women" : ""}`;

    // 1. Return from Memory Cache (0ms latency, 0 API calls)
    if (memoryH2HCache[cacheKey]) {
      return NextResponse.json(memoryH2HCache[cacheKey].data);
    }

    // 2. Return from Disk Cache (0 API calls)
    const diskCached = loadH2HFromDisk(cacheKey);
    if (diskCached) {
      memoryH2HCache[cacheKey] = { timestamp: Date.now(), data: diskCached };
      return NextResponse.json(diskCached);
    }

    let homeTeamId = searchParams.get("homeTeamId") ? parseInt(searchParams.get("homeTeamId")!) : undefined;
    let awayTeamId = searchParams.get("awayTeamId") ? parseInt(searchParams.get("awayTeamId")!) : undefined;

    // Search official team IDs using sanitized search if not provided
    if (!homeTeamId || homeTeamId === 0) {
      const homeSearch = await apiFootball.searchTeam(homeTeam, league);
      if (homeSearch) homeTeamId = homeSearch.id;
    }

    if (!awayTeamId || awayTeamId === 0) {
      const awaySearch = await apiFootball.searchTeam(awayTeam, league);
      if (awaySearch) awayTeamId = awaySearch.id;
    }

    const homeElo = getTeamRating(homeTeam);
    const awayElo = getTeamRating(awayTeam);

    let h2hMatches: H2HMatch[] = [];
    let homeLast5: TeamFormMatch[] = [];
    let awayLast5: TeamFormMatch[] = [];
    let isOfficial = false;

    // Fetch official H2H clashes from API-Football
    if (homeTeamId && awayTeamId) {
      isOfficial = true;
      try {
        const rawH2H = await apiFootball.getHeadToHead(homeTeamId, awayTeamId, 5);
        if (Array.isArray(rawH2H) && rawH2H.length > 0) {
          h2hMatches = await Promise.all(
            rawH2H.map(async (item: any) => {
              const hGoals = item.goals?.home ?? 0;
              const aGoals = item.goals?.away ?? 0;
              let winner = "Empate";
              if (hGoals > aGoals) winner = item.teams.home.name;
              else if (aGoals > hGoals) winner = item.teams.away.name;

              const cornerStats = item.fixture?.id ? await getCachedFixtureCorners(item.fixture.id) : null;
              const hasCorners = Boolean(cornerStats && cornerStats.hasRealCorners);
              const homeCorners = hasCorners ? cornerStats!.homeCorners : undefined;
              const awayCorners = hasCorners ? cornerStats!.awayCorners : undefined;
              const totalCorners = hasCorners ? cornerStats!.totalCorners : undefined;

              return {
                date: item.fixture?.date ? item.fixture.date.split("T")[0] : "2026-08",
                homeTeam: item.teams.home.name,
                awayTeam: item.teams.away.name,
                score: `${hGoals} - ${aGoals}`,
                winner,
                competition: item.league?.name || league,
                homeCorners,
                awayCorners,
                totalCorners,
                corners: hasCorners ? `${homeCorners} - ${awayCorners} (${totalCorners} Córners)` : undefined,
              };
            })
          );
        }
      } catch (err) {
        console.warn("[H2H API] Error fetching raw H2H:", err);
      }

      // Fetch last 5 matches for Home Team strictly from official API
      try {
        const rawHomeLast5 = await apiFootball.getTeamRecentFixtures(homeTeamId, 5);
        if (Array.isArray(rawHomeLast5) && rawHomeLast5.length > 0) {
          homeLast5 = await Promise.all(
            rawHomeLast5.map(async (item: any) => {
              const isHome = item.teams.home.id === homeTeamId;
              const myGoals = isHome ? (item.goals?.home ?? 0) : (item.goals?.away ?? 0);
              const oppGoals = isHome ? (item.goals?.away ?? 0) : (item.goals?.home ?? 0);
              const opponent = isHome ? item.teams.away.name : item.teams.home.name;
              let result: "W" | "D" | "L" = "D";
              if (myGoals > oppGoals) result = "W";
              else if (myGoals < oppGoals) result = "L";

              const cornerStats = item.fixture?.id ? await getCachedFixtureCorners(item.fixture.id) : null;
              const hasCorners = Boolean(cornerStats && cornerStats.hasRealCorners);
              const teamCorners = hasCorners ? (isHome ? cornerStats!.homeCorners : cornerStats!.awayCorners) : undefined;
              const opponentCorners = hasCorners ? (isHome ? cornerStats!.awayCorners : cornerStats!.homeCorners) : undefined;
              const totalCorners = hasCorners ? cornerStats!.totalCorners : undefined;

              return {
                date: item.fixture?.date ? item.fixture.date.split("T")[0] : "2026-08",
                opponent,
                isHome,
                score: `${myGoals} - ${oppGoals}`,
                result,
                competition: item.league?.name || league,
                teamCorners,
                opponentCorners,
                totalCorners,
                corners: hasCorners ? `${teamCorners} - ${opponentCorners}` : undefined,
                over85Corners: hasCorners ? totalCorners! > 8.5 : undefined,
                over95Corners: hasCorners ? totalCorners! > 9.5 : undefined,
                over105Corners: hasCorners ? totalCorners! > 10.5 : undefined,
              };
            })
          );
        }
      } catch (err) {
        console.warn("[H2H API] Error fetching home last 5:", err);
      }

      // Fetch last 5 matches for Away Team strictly from official API
      try {
        const rawAwayLast5 = await apiFootball.getTeamRecentFixtures(awayTeamId, 5);
        if (Array.isArray(rawAwayLast5) && rawAwayLast5.length > 0) {
          awayLast5 = await Promise.all(
            rawAwayLast5.map(async (item: any) => {
              const isHome = item.teams.home.id === awayTeamId;
              const myGoals = isHome ? (item.goals?.home ?? 0) : (item.goals?.away ?? 0);
              const oppGoals = isHome ? (item.goals?.away ?? 0) : (item.goals?.home ?? 0);
              const opponent = isHome ? item.teams.away.name : item.teams.home.name;
              let result: "W" | "D" | "L" = "D";
              if (myGoals > oppGoals) result = "W";
              else if (myGoals < oppGoals) result = "L";

              const cornerStats = item.fixture?.id ? await getCachedFixtureCorners(item.fixture.id) : null;
              const hasCorners = Boolean(cornerStats && cornerStats.hasRealCorners);
              const teamCorners = hasCorners ? (isHome ? cornerStats!.homeCorners : cornerStats!.awayCorners) : undefined;
              const opponentCorners = hasCorners ? (isHome ? cornerStats!.awayCorners : cornerStats!.homeCorners) : undefined;
              const totalCorners = hasCorners ? cornerStats!.totalCorners : undefined;

              return {
                date: item.fixture?.date ? item.fixture.date.split("T")[0] : "2026-08",
                opponent,
                isHome,
                score: `${myGoals} - ${oppGoals}`,
                result,
                competition: item.league?.name || league,
                teamCorners,
                opponentCorners,
                totalCorners,
                corners: hasCorners ? `${teamCorners} - ${opponentCorners}` : undefined,
                over85Corners: hasCorners ? totalCorners! > 8.5 : undefined,
                over95Corners: hasCorners ? totalCorners! > 9.5 : undefined,
                over105Corners: hasCorners ? totalCorners! > 10.5 : undefined,
              };
            })
          );
        }
      } catch (err) {
        console.warn("[H2H API] Error fetching away last 5:", err);
      }
    }

    // If teams are not official API teams, return empty lists rather than fake data
    if (!isOfficial) {
      if (h2hMatches.length === 0) h2hMatches = [];
      if (homeLast5.length === 0) homeLast5 = [];
      if (awayLast5.length === 0) awayLast5 = [];
    }

    const homeCornerStats = calculateCornerSummary(homeLast5);
    const awayCornerStats = calculateCornerSummary(awayLast5);

    const response: H2HApiResponse = {
      success: true,
      h2h: h2hMatches,
      recentH2H: h2hMatches,
      homeLast5,
      awayLast5,
      homeElo,
      awayElo,
      isOfficial,
      homeCornerStats,
      awayCornerStats,
    };

    // Save to Memory & Disk Cache if valid data exists
    if (homeLast5.length > 0 || awayLast5.length > 0 || h2hMatches.length > 0) {
      memoryH2HCache[cacheKey] = { timestamp: Date.now(), data: response };
      saveH2HToDisk(cacheKey, response);
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al procesar H2H";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
