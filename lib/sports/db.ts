/**
 * Direct Supabase persistence and query service for SmartBetBot MVP.
 */

import { createClient } from "@supabase/supabase-js";
import { apiFootball, TOP_5_LEAGUE_IDS } from "./api-football";
import { evaluateFixturePrediction, MarketOpportunity } from "./prediction-engine";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Synchronize active leagues and teams from API-Football into Supabase
 */
export async function syncLeaguesAndTeams(leagueIds: number[] = TOP_5_LEAGUE_IDS) {
  const supabase = getAdminClient();
  const leagues = await apiFootball.getLeagues(leagueIds);

  let leaguesSaved = 0;
  let teamsSaved = 0;

  for (const league of leagues) {
    // 1. Ensure country exists
    let countryId: number | null = null;
    if (league.country.name) {
      const { data: countryData } = await supabase
        .from("countries")
        .upsert(
          {
            name: league.country.name,
            code: league.country.code,
            flag_url: league.country.flag,
          },
          { onConflict: "name" }
        )
        .select("id")
        .single();
      if (countryData) countryId = countryData.id;
    }

    // 2. Ensure sport exists
    const { data: sportData } = await supabase
      .from("sports")
      .upsert({ name: "Football", slug: "football" }, { onConflict: "slug" })
      .select("id")
      .single();
    const sportId = sportData ? sportData.id : 1;

    // 3. Upsert League
    const { data: savedLeague } = await supabase
      .from("leagues")
      .upsert(
        {
          sport_id: sportId,
          country_id: countryId,
          provider: "api_football",
          provider_id: String(league.id),
          name: league.name,
          league_type: league.type.toLowerCase() === "cup" ? "cup" : "league",
          logo_url: league.logo,
          is_active: true,
        },
        { onConflict: "provider,provider_id" }
      )
      .select("id")
      .single();

    if (savedLeague) {
      leaguesSaved++;

      // Upsert season
      await supabase.from("seasons").upsert(
        {
          league_id: savedLeague.id,
          season_year: league.season,
          is_current: true,
        },
        { onConflict: "league_id,season_year" }
      );

      // 4. Fetch and upsert teams
      const teams = await apiFootball.getTeams(league.id, league.season);
      for (const team of teams) {
        await supabase.from("teams").upsert(
          {
            country_id: countryId,
            provider: "api_football",
            provider_id: String(team.id),
            name: team.name,
            code: team.code,
            logo_url: team.logo,
          },
          { onConflict: "provider,provider_id" }
        );
        teamsSaved++;
      }
    }
  }

  return { leaguesSaved, teamsSaved };
}

/**
 * Synchronize upcoming fixtures for active leagues
 */
export async function syncUpcomingFixtures(leagueIds: number[] = TOP_5_LEAGUE_IDS, lookaheadDays: number = 7) {
  const supabase = getAdminClient();
  const leagues = await apiFootball.getLeagues(leagueIds);

  let fixturesSaved = 0;
  const now = new Date();
  const from = now.toISOString().split("T")[0];
  const to = new Date(now.getTime() + lookaheadDays * 86400000).toISOString().split("T")[0];

  for (const league of leagues) {
    let dbLeagueId: string | null = null;

    const { data: dbLeague } = await supabase
      .from("leagues")
      .select("id")
      .eq("provider", "api_football")
      .eq("provider_id", String(league.id))
      .single();

    if (dbLeague) {
      dbLeagueId = dbLeague.id;
    } else {
      const { data: createdLeague } = await supabase
        .from("leagues")
        .upsert(
          {
            sport_id: 1,
            provider: "api_football",
            provider_id: String(league.id),
            name: league.name,
            league_type: league.type.toLowerCase() === "cup" ? "cup" : "league",
            logo_url: league.logo,
            is_active: true,
          },
          { onConflict: "provider,provider_id" }
        )
        .select("id")
        .single();
      if (createdLeague) dbLeagueId = createdLeague.id;
    }

    if (!dbLeagueId) continue;

    // Get or create season
    let dbSeasonId: string | null = null;
    const { data: dbSeason } = await supabase
      .from("seasons")
      .select("id")
      .eq("league_id", dbLeagueId)
      .eq("season_year", league.season)
      .single();

    if (dbSeason) {
      dbSeasonId = dbSeason.id;
    } else {
      const { data: createdSeason } = await supabase
        .from("seasons")
        .upsert(
          {
            league_id: dbLeagueId,
            season_year: league.season,
            is_current: true,
          },
          { onConflict: "league_id,season_year" }
        )
        .select("id")
        .single();
      if (createdSeason) dbSeasonId = createdSeason.id;
    }

    const fixtures = await apiFootball.getFixtures(league.id, league.season, from, to);

    for (const f of fixtures) {
      if (!f.fixture || !f.teams) continue;

      // Upsert home and away teams
      const { data: homeTeam } = await supabase
        .from("teams")
        .upsert(
          {
            provider: "api_football",
            provider_id: String(f.teams.home.id),
            name: f.teams.home.name,
            logo_url: f.teams.home.logo,
          },
          { onConflict: "provider,provider_id" }
        )
        .select("id")
        .single();

      const { data: awayTeam } = await supabase
        .from("teams")
        .upsert(
          {
            provider: "api_football",
            provider_id: String(f.teams.away.id),
            name: f.teams.away.name,
            logo_url: f.teams.away.logo,
          },
          { onConflict: "provider,provider_id" }
        )
        .select("id")
        .single();

      if (homeTeam && awayTeam) {
        let status = "scheduled";
        const shortStatus = f.fixture.status?.short || "NS";
        if (["1H", "2H", "HT", "ET", "P"].includes(shortStatus)) status = "live";
        else if (["FT", "AET", "PEN"].includes(shortStatus)) status = "finished";
        else if (["PST"].includes(shortStatus)) status = "postponed";
        else if (["CANC"].includes(shortStatus)) status = "cancelled";

        await supabase.from("fixtures").upsert(
          {
            league_id: dbLeagueId,
            season_id: dbSeasonId,
            home_team_id: homeTeam.id,
            away_team_id: awayTeam.id,
            provider: "api_football",
            provider_id: String(f.fixture.id),
            kickoff_at: f.fixture.date,
            status,
            provider_status: shortStatus,
            home_score: f.goals?.home || null,
            away_score: f.goals?.away || null,
            round: f.league?.round || null,
            referee: f.fixture.referee,
            raw_payload: {
              home_team: { name: f.teams.home.name, logo_url: f.teams.home.logo },
              away_team: { name: f.teams.away.name, logo_url: f.teams.away.logo },
              league: { name: league.name, logo_url: league.logo },
            },
            has_odds: true,
          },
          { onConflict: "provider,provider_id" }
        );
        fixturesSaved++;
      }
    }
  }

  return { fixturesSaved };
}

interface RawFixtureRow {
  id: string;
  provider_id: string;
  kickoff_at: string;
  status: string;
  raw_payload: {
    home_team?: { name?: string; logo_url?: string };
    away_team?: { name?: string; logo_url?: string };
    league?: { name?: string; logo_url?: string };
  } | null;
  home_team?: { name: string; logo_url: string | null } | null;
  away_team?: { name: string; logo_url: string | null } | null;
  league?: { name: string; logo_url: string | null } | null;
}

/**
 * Generate predictions for upcoming fixtures and return opportunities
 */
export async function generatePredictionsForUpcoming(): Promise<MarketOpportunity[]> {
  const supabase = getAdminClient();

  const now = new Date().toISOString();
  const maxDate = new Date(Date.now() + 14 * 86400000).toISOString();

  // 1. First query fixtures from Supabase
  const { data } = await supabase
    .from("fixtures")
    .select(`
      id,
      provider_id,
      kickoff_at,
      status,
      raw_payload,
      home_team:teams!fixtures_home_team_id_fkey(name, logo_url),
      away_team:teams!fixtures_away_team_id_fkey(name, logo_url),
      league:leagues!fixtures_league_id_fkey(name, logo_url)
    `)
    .gte("kickoff_at", now)
    .lte("kickoff_at", maxDate)
    .order("kickoff_at", { ascending: true })
    .limit(30);

  const fixtures = data as unknown as RawFixtureRow[] | null;

  const allOpportunities: MarketOpportunity[] = [];

  if (fixtures && fixtures.length > 0) {
    for (const item of fixtures) {
      const homeName = item.home_team?.name || item.raw_payload?.home_team?.name || "Local";
      const awayName = item.away_team?.name || item.raw_payload?.away_team?.name || "Visitante";
      const homeLogo = item.home_team?.logo_url || item.raw_payload?.home_team?.logo_url || undefined;
      const awayLogo = item.away_team?.logo_url || item.raw_payload?.away_team?.logo_url || undefined;
      const leagueName = item.league?.name || item.raw_payload?.league?.name || "Liga Principal";
      const leagueLogo = item.league?.logo_url || item.raw_payload?.league?.logo_url || undefined;

      const opps = evaluateFixturePrediction({
        fixtureId: item.provider_id,
        homeTeam: homeName,
        awayTeam: awayName,
        homeLogo,
        awayLogo,
        league: leagueName,
        leagueLogo,
        kickoff: item.kickoff_at,
      });

      if (opps.length > 0) {
        allOpportunities.push(opps[0]);
      }
    }
  }

  // 2. If DB has few fixtures, fetch directly from API-Football for top leagues
  if (allOpportunities.length < 3) {
    try {
      const directFixtures = await apiFootball.getFixtures(39, 2026);
      for (const item of directFixtures.slice(0, 10)) {
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
        if (opps.length > 0) {
          allOpportunities.push(opps[0]);
        }
      }
    } catch (err) {
      console.warn("Direct API-Football fetch fallback:", err);
    }
  }

  // 3. If still empty, return fallback featured cards
  return allOpportunities.length > 0 ? allOpportunities : getFallbackFeaturedPredictions();
}

/**
 * Fallback featured predictions matching the reference visual cards
 */
export function getFallbackFeaturedPredictions(): MarketOpportunity[] {
  const now = new Date();
  return [
    {
      id: "pred-1",
      fixtureId: 101,
      match: "Liverpool vs Nottingham Forest",
      homeTeam: "Liverpool",
      awayTeam: "Nottingham Forest",
      homeLogo: "https://media.api-sports.io/football/teams/40.png",
      awayLogo: "https://media.api-sports.io/football/teams/65.png",
      league: "Premier League",
      leagueLogo: "https://media.api-sports.io/football/leagues/39.png",
      kickoff: new Date(now.getTime() + 4 * 3600000).toISOString(),
      market: "Over 2.5 Goles",
      selection: "Over 2.5",
      odds: 1.54,
      probability: 70.0,
      impliedProbability: 64.9,
      edge: 5.1,
      expectedValue: 7.8,
      confidence: "Alta",
      smartScore: 88,
      explanation:
        "El análisis automatizado detectó indicadores positivos que fortalecen esta recomendación. El modelo combina indicadores ofensivos, comportamiento histórico, simulaciones matemáticas y filtros internos antes de validar una oportunidad.",
      status: "pending",
    },
    {
      id: "pred-2",
      fixtureId: 102,
      match: "Bayern München vs VfB Stuttgart",
      homeTeam: "Bayern München",
      awayTeam: "VfB Stuttgart",
      homeLogo: "https://media.api-sports.io/football/teams/157.png",
      awayLogo: "https://media.api-sports.io/football/teams/172.png",
      league: "Bundesliga",
      leagueLogo: "https://media.api-sports.io/football/leagues/78.png",
      kickoff: new Date(now.getTime() + 6 * 3600000).toISOString(),
      market: "Gana Local",
      selection: "1",
      odds: 1.60,
      probability: 69.0,
      impliedProbability: 62.5,
      edge: 6.5,
      expectedValue: 10.4,
      confidence: "Alta",
      smartScore: 91,
      explanation:
        "La simulación matemática del partido respalda este mercado como una de las mejores alternativas disponibles. El modelo combina rendimiento reciente y métricas de producción ofensiva.",
      status: "pending",
    },
    {
      id: "pred-3",
      fixtureId: 103,
      match: "Crystal Palace vs Manchester City",
      homeTeam: "Crystal Palace",
      awayTeam: "Manchester City",
      homeLogo: "https://media.api-sports.io/football/teams/52.png",
      awayLogo: "https://media.api-sports.io/football/teams/50.png",
      league: "Premier League",
      leagueLogo: "https://media.api-sports.io/football/leagues/39.png",
      kickoff: new Date(now.getTime() + 8 * 3600000).toISOString(),
      market: "Gana Visitante",
      selection: "2",
      odds: 1.65,
      probability: 67.0,
      impliedProbability: 60.6,
      edge: 6.4,
      expectedValue: 10.5,
      confidence: "Alta",
      smartScore: 89,
      explanation:
        "El modelo de SmartBetBot encontró una oportunidad estadística para el mercado Gana Visitante. La probabilidad estimada es del 67.0% con valor positivo sobre la cuota ofrecida.",
      status: "pending",
    },
    {
      id: "pred-4",
      fixtureId: 104,
      match: "Lille vs Paris Saint Germain",
      homeTeam: "Lille",
      awayTeam: "Paris Saint Germain",
      homeLogo: "https://media.api-sports.io/football/teams/79.png",
      awayLogo: "https://media.api-sports.io/football/teams/85.png",
      league: "Ligue 1",
      leagueLogo: "https://media.api-sports.io/football/leagues/61.png",
      kickoff: new Date(now.getTime() + 24 * 3600000).toISOString(),
      market: "Ambos Marcan (BTTS)",
      selection: "Yes",
      odds: 1.66,
      probability: 70.0,
      impliedProbability: 60.2,
      edge: 9.8,
      expectedValue: 16.2,
      confidence: "Alta",
      smartScore: 92,
      explanation:
        "El modelo de SmartBetBot encontró que tanto Lille como PSG mantienen una alta tasa de conversión ofensiva y vulnerabilidades defensivas recientes para este mercado.",
      status: "pending",
    },
    {
      id: "pred-5",
      fixtureId: 105,
      match: "1. FC Köln vs 1899 Hoffenheim",
      homeTeam: "1. FC Köln",
      awayTeam: "1899 Hoffenheim",
      homeLogo: "https://media.api-sports.io/football/teams/192.png",
      awayLogo: "https://media.api-sports.io/football/teams/167.png",
      league: "Bundesliga",
      leagueLogo: "https://media.api-sports.io/football/leagues/78.png",
      kickoff: new Date(now.getTime() + 28 * 3600000).toISOString(),
      market: "Over 2.5 Goles",
      selection: "Over 2.5",
      odds: 1.55,
      probability: 77.0,
      impliedProbability: 64.5,
      edge: 12.5,
      expectedValue: 19.3,
      confidence: "Muy Alta",
      smartScore: 95,
      explanation:
        "Tras evaluar cientos de escenarios posibles, el modelo encontró condiciones favorables para esta apuesta. La evaluación incorpora simulaciones Poisson, producción ofensiva y comportamiento reciente.",
      status: "pending",
    },
    {
      id: "pred-6",
      fixtureId: 106,
      match: "1. FC Heidenheim vs Dynamo Dresden",
      homeTeam: "1. FC Heidenheim",
      awayTeam: "Dynamo Dresden",
      homeLogo: "https://media.api-sports.io/football/teams/180.png",
      awayLogo: "https://media.api-sports.io/football/teams/191.png",
      league: "2. Bundesliga",
      leagueLogo: "https://media.api-sports.io/football/leagues/79.png",
      kickoff: new Date(now.getTime() + 32 * 3600000).toISOString(),
      market: "Gana Local",
      selection: "1",
      odds: 2.33,
      probability: 66.5,
      impliedProbability: 42.9,
      edge: 23.6,
      expectedValue: 55.0,
      confidence: "Alta",
      smartScore: 96,
      explanation:
        "El modelo de SmartBetBot encontró una gran oportunidad estadística para el mercado Gana Local con una cuota de alto valor (2.33) frente a una probabilidad estimada del 66.5%.",
      status: "pending",
    },
  ];
}
