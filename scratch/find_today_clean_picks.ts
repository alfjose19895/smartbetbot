import { apiFootball, extractMarketOddsFromBookmaker } from "../lib/sports/api-football";
import { evaluateFixturePrediction } from "../lib/sports/prediction-engine";
import { isCuratedLeague } from "../lib/sports/db";

async function main() {
  const [fixtures, oddsList] = await Promise.all([
    apiFootball.getFixturesByDate("2026-09-03", "America/Guayaquil"),
    apiFootball.getOddsByDate("2026-09-03", "America/Guayaquil").catch(() => []),
  ]);

  const oddsMap: Record<number, any> = {};
  for (const o of oddsList) {
    if (o.fixture?.id) oddsMap[o.fixture.id] = o;
  }

  console.log("=== ALL CURATED FIXTURES & BOOKMAKER ODDS FOR TODAY ===");
  for (const f of fixtures) {
    if (!isCuratedLeague(f.league?.id, f.league?.name, f.league?.country)) continue;
    const realOdds = extractMarketOddsFromBookmaker(oddsMap[f.fixture.id]);
    const opps = evaluateFixturePrediction({
      fixtureId: f.fixture.id,
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      homeTeamId: f.teams.home.id,
      awayTeamId: f.teams.away.id,
      homeLogo: f.teams.home.logo,
      awayLogo: f.teams.away.logo,
      league: f.league.name,
      leagueId: f.league.id,
      country: f.league.country,
      leagueLogo: f.league.logo,
      kickoff: f.fixture.date,
      marketOdds: realOdds,
    });

    console.log(`\n⚽ [${f.league.name} - ${f.league.country}] ${f.teams.home.name} vs ${f.teams.away.name} (Hora: ${f.fixture.date})`);
    console.log("  Real Bookmaker Odds:", realOdds);
    opps.forEach((op) => {
      console.log(`  -> [${op.pickBadge}] ${op.market} (${op.selection}) | Casa: @${op.odds} | Modelo: @${op.fairOdds} | Prob: ${op.probability}%`);
    });
  }
}

main().catch(console.error);
