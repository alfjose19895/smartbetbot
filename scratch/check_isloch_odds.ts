import { apiFootball } from "../lib/sports/api-football";

async function main() {
  const [fixtures, oddsList] = await Promise.all([
    apiFootball.getFixturesByDate("2026-09-03", "America/Guayaquil"),
    apiFootball.getOddsByDate("2026-09-03", "America/Guayaquil").catch(() => []),
  ]);

  const islochFixture = fixtures.find((f: any) => 
    (f.teams?.home?.name || "").toLowerCase().includes("isloch") ||
    (f.teams?.away?.name || "").toLowerCase().includes("isloch") ||
    (f.teams?.home?.name || "").toLowerCase().includes("bate") ||
    (f.teams?.away?.name || "").toLowerCase().includes("bate")
  );

  console.log("ISLOCH FIXTURE:", JSON.stringify(islochFixture, null, 2));

  if (islochFixture) {
    const fixtureOdds = oddsList.find((o: any) => o.fixture?.id === islochFixture.fixture.id);
    console.log("ISLOCH RAW ODDS:", JSON.stringify(fixtureOdds, null, 2));
  }
}

main().catch(console.error);
