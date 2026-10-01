import { NextRequest, NextResponse } from "next/server";
import { apiFootball, extractMatchDetails, isWomenContext } from "@/lib/sports/api-football";
import {
  getTeamRating,
  getCanonicalTeamKey,
  generateTeamRecentForm,
  generateH2HClashes,
  H2HMatch,
  TeamFormMatch,
  isCompetitionWithCornerTelemetry,
} from "@/lib/sports/prediction-engine";
import { SupportedSport } from "@/lib/sports/types";
import { getMultiSportH2HAndForm } from "@/lib/sports/multi-sport-h2h";
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
  sport?: SupportedSport;
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
      return JSON.parse(content) as H2HApiResponse;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveH2HToDisk(cacheKey: string, data: H2HApiResponse) {
  try {
    ensureDirs();
    const filePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not write H2H cache to disk:", err);
  }
}

function calculateCornerSummary(list: TeamFormMatch[]): TeamCornerSummary | null {
  const valid = list.filter((m) => typeof m.totalCorners === "number" || typeof m.teamCorners === "number");
  if (valid.length === 0) return null;

  const totals = valid.map((m) => m.totalCorners ?? ((m.teamCorners || 0) + (m.opponentCorners || 0)));
  const forList = valid.map((m) => m.teamCorners ?? Math.round((m.totalCorners || 0) / 2));
  const againstList = valid.map((m) => m.opponentCorners ?? Math.max(0, (m.totalCorners || 0) - (m.teamCorners || 0)));

  const sumTotal = totals.reduce((a, b) => a + b, 0);
  const sumFor = forList.reduce((a, b) => a + b, 0);
  const sumAgainst = againstList.reduce((a, b) => a + b, 0);

  return {
    avgTotal: Math.round((sumTotal / valid.length) * 10) / 10,
    avgFor: Math.round((sumFor / valid.length) * 10) / 10,
    avgAgainst: Math.round((sumAgainst / valid.length) * 10) / 10,
    over85Rate: Math.round((totals.filter((t) => t > 8.5).length / valid.length) * 100),
    over95Rate: Math.round((totals.filter((t) => t > 9.5).length / valid.length) * 100),
    over105Rate: Math.round((totals.filter((t) => t > 10.5).length / valid.length) * 100),
    history: totals,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSport = (searchParams.get("sport") || "football").toLowerCase();
    const sport: SupportedSport = (["football", "nba", "nfl", "ncaaf", "nhl"].includes(rawSport) ? rawSport : "football") as SupportedSport;
    
    const homeTeam = searchParams.get("homeTeam") || "";
    const awayTeam = searchParams.get("awayTeam") || "";
    const homeTeamIdStr = searchParams.get("homeTeamId");
    const awayTeamIdStr = searchParams.get("awayTeamId");
    const league = searchParams.get("league") || "";
    const country = searchParams.get("country") || "";
    const homeEloParam = searchParams.get("homeElo");
    const awayEloParam = searchParams.get("awayElo");

    if (!homeTeam || !awayTeam) {
      return NextResponse.json({ success: false, error: "Missing homeTeam or awayTeam" }, { status: 400 });
    }

    const cacheKey = `${sport}_${encodeURIComponent(homeTeam.toLowerCase())}_vs_${encodeURIComponent(awayTeam.toLowerCase())}`;

    // Memory Cache
    const cached = memoryH2HCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 6) {
      return NextResponse.json(cached.data);
    }

    // Disk Cache
    const diskCached = loadH2HFromDisk(cacheKey);
    if (diskCached) {
      memoryH2HCache[cacheKey] = { timestamp: Date.now(), data: diskCached };
      return NextResponse.json(diskCached);
    }

    // MULTI-SPORT ROUTING (NHL, NBA, NFL, NCAAF)
    if (sport !== "football") {
      const msData = await getMultiSportH2HAndForm(sport, homeTeam, awayTeam, homeTeamIdStr || undefined, awayTeamIdStr || undefined);
      const response: H2HApiResponse = {
        success: true,
        sport,
        h2h: msData.h2h,
        recentH2H: msData.h2h,
        homeLast5: msData.homeLast5,
        awayLast5: msData.awayLast5,
        homeElo: homeEloParam ? parseFloat(homeEloParam) : msData.homeElo,
        awayElo: awayEloParam ? parseFloat(awayEloParam) : msData.awayElo,
        isOfficial: true,
        homeCornerStats: null,
        awayCornerStats: null,
      };

      memoryH2HCache[cacheKey] = { timestamp: Date.now(), data: response };
      saveH2HToDisk(cacheKey, response);
      return NextResponse.json(response);
    }

    // FOOTBALL ROUTING (API-Football)
    let homeTeamId = homeTeamIdStr ? parseInt(homeTeamIdStr, 10) : undefined;
    let awayTeamId = awayTeamIdStr ? parseInt(awayTeamIdStr, 10) : undefined;

    let isOfficial = false;
    let homeElo = homeEloParam ? parseFloat(homeEloParam) : getTeamRating(homeTeam);
    let awayElo = awayEloParam ? parseFloat(awayEloParam) : getTeamRating(awayTeam);

    let h2hMatches: H2HMatch[] = [];
    let homeLast5: TeamFormMatch[] = [];
    let awayLast5: TeamFormMatch[] = [];

    const hasCornerTelemetry = isCompetitionWithCornerTelemetry(league, country, homeTeam, awayTeam);

    // Check if IDs are valid numbers
    if (homeTeamId && isNaN(homeTeamId)) homeTeamId = undefined;
    if (awayTeamId && isNaN(awayTeamId)) awayTeamId = undefined;

    if (homeTeamId && awayTeamId && !isNaN(homeTeamId) && !isNaN(awayTeamId)) {
      isOfficial = true;

      // Fetch Direct H2H
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

      // Fetch Home Last 5
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

      // Fetch Away Last 5
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

    // If football fallback needed
    if (h2hMatches.length === 0) {
      h2hMatches = generateH2HClashes(homeTeam, awayTeam, league, homeElo, awayElo, new Date().toISOString());
    }
    if (homeLast5.length === 0) {
      homeLast5 = generateTeamRecentForm(homeTeam, league, homeElo, new Date().toISOString());
    }
    if (awayLast5.length === 0) {
      awayLast5 = generateTeamRecentForm(awayTeam, league, awayElo, new Date().toISOString());
    }

    const homeCornerStats = hasCornerTelemetry ? calculateCornerSummary(homeLast5) : null;
    const awayCornerStats = hasCornerTelemetry ? calculateCornerSummary(awayLast5) : null;

    const response: H2HApiResponse = {
      success: true,
      sport: "football",
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

    memoryH2HCache[cacheKey] = { timestamp: Date.now(), data: response };
    saveH2HToDisk(cacheKey, response);

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al procesar H2H";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
