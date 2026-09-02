import fs from "fs";
import path from "path";

if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.NEXT_PUBLIC_API_FOOTBALL_KEY;
const API_URL = "https://v3.football.api-sports.io";

async function fetchStats(fixtureId: number) {
  try {
    const res = await fetch(`${API_URL}/fixtures/statistics?fixture=${fixtureId}`, {
      headers: { "x-apisports-key": API_KEY || "" },
    });
    const json = await res.json();
    if (!json.response || !Array.isArray(json.response) || json.response.length < 2) {
      return null;
    }

    const getStat = (list: any[], typeName: string): number => {
      const item = list.find((s) => s.type.toLowerCase().trim() === typeName.toLowerCase().trim());
      if (!item || item.value === null || item.value === undefined) return 0;
      const num = parseInt(String(item.value), 10);
      return isNaN(num) ? 0 : num;
    };

    const home = json.response[0].statistics || [];
    const away = json.response[1].statistics || [];

    const homeCorners = getStat(home, "Corner Kicks");
    const awayCorners = getStat(away, "Corner Kicks");
    const homeYellows = getStat(home, "Yellow Cards");
    const awayYellows = getStat(away, "Yellow Cards");
    const homeReds = getStat(home, "Red Cards");
    const awayReds = getStat(away, "Red Cards");

    return {
      homeCorners,
      awayCorners,
      totalCorners: homeCorners + awayCorners,
      homeCards: homeYellows + homeReds,
      awayCards: awayYellows + awayReds,
      totalCards: homeYellows + awayYellows + homeReds + awayReds,
      homeTeam: json.response[0].team.name,
      awayTeam: json.response[1].team.name,
    };
  } catch (err) {
    return null;
  }
}

async function auditSnapshots() {
  const snapshotsDir = path.resolve(process.cwd(), "data", "daily_snapshots");
  const files = ["2026-08-31.json", "2026-09-01.json"];

  for (const file of files) {
    const filePath = path.join(snapshotsDir, file);
    if (!fs.existsSync(filePath)) continue;

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log(`\n========================================`);
    console.log(`Auditing snapshot: ${file} (${data.length} matches)`);
    console.log(`========================================`);

    const cornerPicks = data.filter((p: any) => (p.market || "").toLowerCase().includes("corner"));
    console.log(`Found ${cornerPicks.length} Corner picks.`);

    for (const p of cornerPicks) {
      console.log(`\nMatch: ${p.homeTeam} vs ${p.awayTeam} (FixtureId: ${p.fixtureId})`);
      console.log(`  Current Recorded ActualScore: "${p.actualScore}", Status: "${p.status}"`);

      if (p.fixtureId) {
        const stats = await fetchStats(Number(p.fixtureId));
        if (stats) {
          console.log(`  API-FOOTBALL REAL CORNERS: Home: ${stats.homeCorners}, Away: ${stats.awayCorners} => TOTAL: ${stats.totalCorners}`);
          console.log(`  API-FOOTBALL REAL CARDS: Home: ${stats.homeCards}, Away: ${stats.awayCards} => TOTAL: ${stats.totalCards}`);
          
          const isOver = stats.totalCorners > 8.5;
          const [hG, aG] = (p.actualScore || "0 - 0").split("(")[0].trim().split("-").map((x: string) => parseInt(x.trim(), 10));
          const newScoreText = `${isNaN(hG) ? 0 : hG} - ${isNaN(aG) ? 0 : aG} (${stats.totalCorners} Córners)`;
          console.log(`  -> Corrected Result: ${newScoreText} | Status: ${isOver ? "won" : "lost"}`);
        } else {
          console.log(`  [WARN] No statistics available from API for fixture ${p.fixtureId}`);
        }
      }
    }
  }
}

auditSnapshots().catch(console.error);
