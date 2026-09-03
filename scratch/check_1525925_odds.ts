import { apiFootball } from "../lib/sports/api-football";

async function main() {
  const oddsList = await apiFootball.getOddsByDate("2026-09-03", "America/Guayaquil");
  const fixOdds = oddsList.find((o: any) => o.fixture?.id === 1525925);
  console.log("FIXTURE 1525925 ODDS:", JSON.stringify(fixOdds, null, 2));
}

main().catch(console.error);
