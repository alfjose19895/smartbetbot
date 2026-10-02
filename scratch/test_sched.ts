import { NHLProvider } from "./lib/sports/nhl/nhl-provider";

async function run() {
  const p = new NHLProvider();
  console.log("Calling p.getSchedule('2026-10-01')...");
  const res = await p.getSchedule('2026-10-01');
  console.log("Schedule count:", res.length);
  for (const g of res) {
    console.log("Game:", g.id, g.homeTeam.name, "vs", g.awayTeam.name, g.startsAt, g.status);
  }
}
run();
