import { apiFootball, extractMarketOddsFromBookmaker } from "../lib/sports/api-football";

async function main() {
  const [fixtures, oddsList] = await Promise.all([
    apiFootball.getFixturesByDate("2026-09-03", "America/Guayaquil"),
    apiFootball.getOddsByDate("2026-09-03", "America/Guayaquil").catch(() => []),
  ]);

  const leonesFixture = fixtures.find((f: any) => 
    (f.teams?.home?.name || "").toLowerCase().includes("leones") ||
    (f.teams?.away?.name || "").toLowerCase().includes("leones")
  );

  console.log("LEONES FIXTURE:", JSON.stringify(leonesFixture, null, 2));

  if (leonesFixture) {
    const fixtureOdds = oddsList.find((o: any) => o.fixture?.id === leonesFixture.fixture.id);
    console.log("LEONES RAW ODDS:", JSON.stringify(fixtureOdds, null, 2));
    if (fixtureOdds) {
      console.log("EXTRACTED ODDS:", extractMarketOddsFromBookmaker(fixtureOdds));
    }
  }
}

main().catch(console.error);
