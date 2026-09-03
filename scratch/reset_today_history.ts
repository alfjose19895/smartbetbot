import fs from "fs";
import path from "path";
import { getEcuadorDateString, generatePredictionsForUpcoming } from "../lib/sports/db";

async function main() {
  const todayStr = getEcuadorDateString(Date.now());
  console.log(`[Reset Today] Today Ecuador date: ${todayStr}`);

  // 1. Path to today's snapshot file
  const snapshotFile = path.join(process.cwd(), "data", "daily_snapshots", `${todayStr}.json`);
  if (fs.existsSync(snapshotFile)) {
    fs.unlinkSync(snapshotFile);
    console.log(`[Reset Today] Successfully deleted existing snapshot: ${snapshotFile}`);
  } else {
    console.log(`[Reset Today] Snapshot file did not exist at ${snapshotFile}`);
  }

  // 2. Regenerate fresh predictions from scratch
  console.log(`[Reset Today] Generating fresh predictions from API for ${todayStr}...`);
  const freshPredictions = await generatePredictionsForUpcoming();

  console.log(`[Reset Today] Total fresh predictions generated: ${freshPredictions.length}`);
  freshPredictions.forEach((p, idx) => {
    console.log(
      `${idx + 1}. [${p.league}] ${p.homeTeam} vs ${p.awayTeam} | ${p.market} | Casa: @${p.odds.toFixed(2)} | Modelo: @${p.fairOdds.toFixed(2)} | Prob: ${p.probability}% | Status: ${p.status}`
    );
  });
}

main().catch((err) => {
  console.error("Error resetting today:", err);
  process.exit(1);
});
