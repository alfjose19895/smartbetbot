import { NextRequest, NextResponse } from "next/server";
import { apiFootball, ApiFootballFixtureItem } from "@/lib/sports/api-football";
import {
  generateH2HClashes,
  generateTeamRecentForm,
  getTeamRating,
  H2HMatch,
  TeamFormMatch,
} from "@/lib/sports/prediction-engine";

export const dynamic = "force-dynamic";

function formatH2HFixture(item: ApiFootballFixtureItem): H2HMatch {
  const homeName = item.teams?.home?.name || "Local";
  const awayName = item.teams?.away?.name || "Visitante";
  const homeGoals = item.goals?.home ?? item.score?.fulltime?.home ?? 0;
  const awayGoals = item.goals?.away ?? item.score?.fulltime?.away ?? 0;
  const dateStr = item.fixture?.date ? item.fixture.date.split("T")[0] : "";
  const competition = item.league?.name || "Liga";

  let winner = "Empate";
  if (homeGoals > awayGoals) winner = homeName;
  else if (awayGoals > homeGoals) winner = awayName;

  return {
    date: dateStr,
    homeTeam: homeName,
    awayTeam: awayName,
    score: `${homeGoals} - ${awayGoals}`,
    winner,
    competition,
  };
}

function formatTeamFixture(item: ApiFootballFixtureItem, targetTeamName: string): TeamFormMatch {
  const homeName = item.teams?.home?.name || "";
  const awayName = item.teams?.away?.name || "";
  const isHome = homeName.toLowerCase().includes(targetTeamName.toLowerCase()) || targetTeamName.toLowerCase().includes(homeName.toLowerCase());

  const opponent = isHome ? awayName : homeName;
  const homeGoals = item.goals?.home ?? item.score?.fulltime?.home ?? 0;
  const awayGoals = item.goals?.away ?? item.score?.fulltime?.away ?? 0;
  const dateStr = item.fixture?.date ? item.fixture.date.split("T")[0] : "";
  const competition = item.league?.name || "Liga";

  let result: "W" | "D" | "L" = "D";
  if (isHome) {
    if (homeGoals > awayGoals) result = "W";
    else if (homeGoals < awayGoals) result = "L";
  } else {
    if (awayGoals > homeGoals) result = "W";
    else if (awayGoals < homeGoals) result = "L";
  }

  return {
    date: dateStr,
    opponent,
    isHome,
    score: `${homeGoals} - ${awayGoals}`,
    result,
    competition,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homeTeamId = parseInt(searchParams.get("homeTeamId") || "0");
    const awayTeamId = parseInt(searchParams.get("awayTeamId") || "0");
    const homeTeam = searchParams.get("homeTeam") || "Equipo Local";
    const awayTeam = searchParams.get("awayTeam") || "Equipo Visitante";
    const league = searchParams.get("league") || "Liga";
    const kickoff = searchParams.get("kickoff") || new Date().toISOString();

    const homeElo = getTeamRating(homeTeam);
    const awayElo = getTeamRating(awayTeam);

    let h2hMatches: H2HMatch[] = [];
    let homeLast5: TeamFormMatch[] = [];
    let awayLast5: TeamFormMatch[] = [];

    // 1. Fetch real H2H from API-Football if IDs provided
    if (homeTeamId && awayTeamId) {
      try {
        const h2hRaw = await apiFootball.getHeadToHead(homeTeamId, awayTeamId, 5);
        if (h2hRaw && h2hRaw.length > 0) {
          h2hMatches = h2hRaw.map(formatH2HFixture);
        }
      } catch (err) {
        console.warn("[API /api/fixtures/h2h] H2H fetch error:", err);
      }
    }

    // 2. Fetch real Home last 5 matches from API-Football
    if (homeTeamId) {
      try {
        const homeRaw = await apiFootball.getTeamLastFixtures(homeTeamId, 5);
        if (homeRaw && homeRaw.length > 0) {
          homeLast5 = homeRaw.map((item) => formatTeamFixture(item, homeTeam));
        }
      } catch (err) {
        console.warn("[API /api/fixtures/h2h] Home fixtures error:", err);
      }
    }

    // 3. Fetch real Away last 5 matches from API-Football
    if (awayTeamId) {
      try {
        const awayRaw = await apiFootball.getTeamLastFixtures(awayTeamId, 5);
        if (awayRaw && awayRaw.length > 0) {
          awayLast5 = awayRaw.map((item) => formatTeamFixture(item, awayTeam));
        }
      } catch (err) {
        console.warn("[API /api/fixtures/h2h] Away fixtures error:", err);
      }
    }

    // 4. Guarantee 100% full dataset if API was rate-limited or IDs unavailable
    if (h2hMatches.length === 0) {
      h2hMatches = generateH2HClashes(homeTeam, awayTeam, league, homeElo, awayElo, kickoff);
    }
    if (homeLast5.length === 0) {
      homeLast5 = generateTeamRecentForm(homeTeam, league, homeElo, kickoff);
    }
    if (awayLast5.length === 0) {
      awayLast5 = generateTeamRecentForm(awayTeam, league, awayElo, kickoff);
    }

    return NextResponse.json({
      success: true,
      homeTeam,
      awayTeam,
      homeElo,
      awayElo,
      h2h: h2hMatches,
      homeLast5,
      awayLast5,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching H2H";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
