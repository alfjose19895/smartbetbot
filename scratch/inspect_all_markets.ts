import fs from "fs";
import path from "path";

for (const f of ["2026-08-31.json", "2026-09-01.json"]) {
  const p = path.resolve(process.cwd(), "data", "daily_snapshots", f);
  if (!fs.existsSync(p)) continue;
  const data = JSON.parse(fs.readFileSync(p, "utf-8"));
  console.log(`\n=== FILE: ${f} (${data.length} picks) ===`);
  const marketCounts: Record<string, number> = {};
  for (const item of data) {
    marketCounts[item.market] = (marketCounts[item.market] || 0) + 1;
  }
  console.log("Markets:", marketCounts);
  console.log("Sample items with scores:");
  data.slice(0, 15).forEach((d: any) => {
    console.log(`  - ${d.homeTeam} vs ${d.awayTeam} | Market: ${d.market} | ActualScore: ${d.actualScore} | Status: ${d.status}`);
  });
}
