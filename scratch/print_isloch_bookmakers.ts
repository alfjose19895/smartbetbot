import { apiFootball } from "../lib/sports/api-football";

async function main() {
  const oddsList = await apiFootball.getOddsByDate("2026-09-03", "America/Guayaquil");
  const islochOdds = oddsList.find((o: any) => 
    JSON.stringify(o).toLowerCase().includes("isloch") ||
    JSON.stringify(o).toLowerCase().includes("bate") ||
    o.fixture?.id === 1386762
  );

  if (islochOdds) {
    console.log("BOOKMAKERS FOR ISLOCH vs BATE:");
    for (const bm of islochOdds.bookmakers) {
      console.log(`\n--- ${bm.name} ---`);
      for (const bet of bm.bets) {
        if ([1, 2, 5, 8].includes(bet.id)) {
          console.log(`  [${bet.name}]`, bet.values);
        }
      }
    }
  }
}

main().catch(console.error);
