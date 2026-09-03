import fs from "fs";
import path from "path";

const snapshotPath = path.join(process.cwd(), "data", "daily_snapshots", "2026-09-03.json");
const data = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

console.log("=== CURRENT 2026-09-03 PREDICTIONS ===");
data.forEach((p: any, idx: number) => {
  console.log(
    `${idx + 1}. [${p.pickBadge}] [${p.league}] ${p.match} | ${p.market} | Casa: @${p.odds} | Modelo: @${p.fairOdds} | Prob: ${p.probability}%`
  );
});
