import { NextRequest, NextResponse } from "next/server";
import { apiFootball } from "@/lib/sports/api-football";
import {
  getTeamRating,
  getCanonicalTeamKey,
  H2HMatch,
  TeamFormMatch,
} from "@/lib/sports/prediction-engine";
import fs from "fs";
import path from "path";

interface H2HApiResponse {
  success: boolean;
  h2h: H2HMatch[];
  recentH2H: H2HMatch[];
  homeLast5: TeamFormMatch[];
  awayLast5: TeamFormMatch[];
  homeElo: number;
  awayElo: number;
  isOfficial: boolean;
  error?: string;
}

// Persistent In-Memory and Disk Cache for H2H
const memoryH2HCache: Record<string, { timestamp: number; data: H2HApiResponse }> = {};
const CACHE_DIR = path.join(process.cwd(), "data", "h2h_cache");

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create h2h cache dir:", err);
  }
}

function loadH2HFromDisk(cacheKey: string): H2HApiResponse | null {
  try {
    ensureCacheDir();
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
    ensureCacheDir();
    const filePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn(`Could not write H2H cache for ${cacheKey}:`, err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeTeam = searchParams.get("homeTeam") || searchParams.get("home") || "";
    const awayTeam = searchParams.get("awayTeam") || searchParams.get("away") || "";
    const league = searchParams.get("league") || "Liga";

    if (!homeTeam || !awayTeam) {
      return NextResponse.json({ success: false, error: "Faltan parámetros homeTeam y awayTeam" }, { status: 400 });
    }

    const hNorm = getCanonicalTeamKey(homeTeam);
    const aNorm = getCanonicalTeamKey(awayTeam);
    const cacheKey = `${hNorm}-${aNorm}`;

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

    // Search official team IDs if not provided
    if (!homeTeamId || homeTeamId === 0) {
      const homeSearch = await apiFootball.searchTeam(homeTeam);
      if (homeSearch) homeTeamId = homeSearch.id;
    }

    if (!awayTeamId || awayTeamId === 0) {
      const awaySearch = await apiFootball.searchTeam(awayTeam);
      if (awaySearch) awayTeamId = awaySearch.id;
    }

    const homeElo = getTeamRating(homeTeam);
    const awayElo = getTeamRating(awayTeam);

    let h2hMatches: H2HMatch[] = [];
    let homeLast5: TeamFormMatch[] = [];
    let awayLast5: TeamFormMatch[] = [];

    // Fetch official H2H clashes from API-Football
    if (homeTeamId && awayTeamId) {
      try {
        const rawH2H = await apiFootball.getHeadToHead(homeTeamId, awayTeamId, 5);
        if (Array.isArray(rawH2H) && rawH2H.length > 0) {
          h2hMatches = rawH2H.map((item: any) => {
            const hGoals = item.goals?.home ?? 0;
            const aGoals = item.goals?.away ?? 0;
            let winner = "Empate";
            if (hGoals > aGoals) winner = item.teams.home.name;
            else if (aGoals > hGoals) winner = item.teams.away.name;

            return {
              date: item.fixture?.date ? item.fixture.date.split("T")[0] : "2026-08",
              homeTeam: item.teams.home.name,
              awayTeam: item.teams.away.name,
              score: `${hGoals} - ${aGoals}`,
              winner,
              competition: item.league?.name || league,
            };
          });
        }
      } catch (err) {
        console.warn("[H2H API] Error fetching raw H2H:", err);
      }

      // Fetch last 5 matches for Home Team
      try {
        const rawHomeLast5 = await apiFootball.getTeamRecentFixtures(homeTeamId, 5);
        if (Array.isArray(rawHomeLast5) && rawHomeLast5.length > 0) {
          homeLast5 = rawHomeLast5.map((item: any) => {
            const isHome = item.teams.home.id === homeTeamId;
            const myGoals = isHome ? (item.goals?.home ?? 0) : (item.goals?.away ?? 0);
            const oppGoals = isHome ? (item.goals?.away ?? 0) : (item.goals?.home ?? 0);
            const opponent = isHome ? item.teams.away.name : item.teams.home.name;
            let result: "W" | "D" | "L" = "D";
            if (myGoals > oppGoals) result = "W";
            else if (myGoals < oppGoals) result = "L";

            return {
              date: item.fixture?.date ? item.fixture.date.split("T")[0] : "2026-08",
              opponent,
              isHome,
              score: `${myGoals} - ${oppGoals}`,
              result,
              competition: item.league?.name || league,
            };
          });
        }
      } catch (err) {
        console.warn("[H2H API] Error fetching home last 5:", err);
      }

      // Fetch last 5 matches for Away Team
      try {
        const rawAwayLast5 = await apiFootball.getTeamRecentFixtures(awayTeamId, 5);
        if (Array.isArray(rawAwayLast5) && rawAwayLast5.length > 0) {
          awayLast5 = rawAwayLast5.map((item: any) => {
            const isHome = item.teams.home.id === awayTeamId;
            const myGoals = isHome ? (item.goals?.home ?? 0) : (item.goals?.away ?? 0);
            const oppGoals = isHome ? (item.goals?.away ?? 0) : (item.goals?.home ?? 0);
            const opponent = isHome ? item.teams.away.name : item.teams.home.name;
            let result: "W" | "D" | "L" = "D";
            if (myGoals > oppGoals) result = "W";
            else if (myGoals < oppGoals) result = "L";

            return {
              date: item.fixture?.date ? item.fixture.date.split("T")[0] : "2026-08",
              opponent,
              isHome,
              score: `${myGoals} - ${oppGoals}`,
              result,
              competition: item.league?.name || league,
            };
          });
        }
      } catch (err) {
        console.warn("[H2H API] Error fetching away last 5:", err);
      }
    }

    const response: H2HApiResponse = {
      success: true,
      h2h: h2hMatches,
      recentH2H: h2hMatches,
      homeLast5,
      awayLast5,
      homeElo,
      awayElo,
      isOfficial: h2hMatches.length > 0,
    };

    // Save to Memory & Disk Cache permanently
    memoryH2HCache[cacheKey] = { timestamp: Date.now(), data: response };
    saveH2HToDisk(cacheKey, response);

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al procesar H2H";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
