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

    const getStat = (list: any[], typeName: string): number | null => {
      const item = list.find((s) => s.type.toLowerCase().trim() === typeName.toLowerCase().trim());
      if (!item || item.value === null || item.value === undefined) return null;
      const num = parseInt(String(item.value), 10);
      return isNaN(num) ? null : num;
    };

    const home = json.response[0].statistics || [];
    const away = json.response[1].statistics || [];

    const hCorners = getStat(home, "Corner Kicks");
    const aCorners = getStat(away, "Corner Kicks");
    const hYellows = getStat(home, "Yellow Cards") || 0;
    const aYellows = getStat(away, "Yellow Cards") || 0;
    const hReds = getStat(home, "Red Cards") || 0;
    const aReds = getStat(away, "Red Cards") || 0;

    return {
      homeTeam: json.response[0].team.name,
      awayTeam: json.response[1].team.name,
      homeCorners: hCorners,
      awayCorners: aCorners,
      totalCorners: hCorners !== null && aCorners !== null ? hCorners + aCorners : null,
      totalCards: hYellows + aYellows + hReds + aReds,
    };
  } catch (err) {
    return null;
  }
}

async function fetchFixtureScore(fixtureId: number) {
  try {
    const res = await fetch(`${API_URL}/fixtures?id=${fixtureId}`, {
      headers: { "x-apisports-key": API_KEY || "" },
    });
    const json = await res.json();
    if (json.response && json.response.length > 0) {
      const f = json.response[0];
      return {
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        status: f.fixture.status.short,
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function updateAllSnapshotsWithRealStats() {
  const snapshotsDir = path.resolve(process.cwd(), "data", "daily_snapshots");
  const files = ["2026-08-31.json", "2026-09-01.json"];

  for (const file of files) {
    const filePath = path.join(snapshotsDir, file);
    if (!fs.existsSync(filePath)) continue;

    const picks = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log(`\nProcessing ${file} (${picks.length} picks)...`);

    let updatedCount = 0;

    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (!p.fixtureId) continue;

      const fId = Number(p.fixtureId);
      const scoreData = await fetchFixtureScore(fId);
      const statsData = await fetchStats(fId);

      const hG = scoreData?.homeGoals !== null && scoreData?.homeGoals !== undefined ? scoreData.homeGoals : 0;
      const aG = scoreData?.awayGoals !== null && scoreData?.awayGoals !== undefined ? scoreData.awayGoals : 0;
      const totalG = hG + aG;

      const mLower = p.market.toLowerCase().trim();

      if (mLower.includes("córner") || mLower.includes("corner")) {
        let realCorners = statsData?.totalCorners;
        if (realCorners !== null && realCorners !== undefined) {
          const isWon = realCorners > 8.5;
          p.actualScore = `${hG} - ${aG} (${realCorners} Córners)`;
          p.status = isWon ? "won" : "lost";
          console.log(`  ✓ REAL CORNERS: ${p.homeTeam} vs ${p.awayTeam} -> ${p.actualScore} (${p.status.toUpperCase()})`);
          updatedCount++;
        } else {
          // If the official API has no corners recorded for lower tiers, report score with exact match score
          console.log(`  ⚠ NO CORNER STATS IN API: ${p.homeTeam} vs ${p.awayTeam} (Fixture ${fId})`);
        }
      } else if (mLower.includes("tarjeta") || mLower.includes("card")) {
        let realCards = statsData?.totalCards;
        if (realCards !== null && realCards !== undefined) {
          const isWon = realCards > 3.5;
          p.actualScore = `${hG} - ${aG} (${realCards} Tarjetas)`;
          p.status = isWon ? "won" : "lost";
          console.log(`  ✓ REAL CARDS: ${p.homeTeam} vs ${p.awayTeam} -> ${p.actualScore} (${p.status.toUpperCase()})`);
          updatedCount++;
        }
      } else if (mLower.includes("gana local")) {
        const isWon = hG > aG;
        p.actualScore = `${hG} - ${aG}`;
        p.status = isWon ? "won" : "lost";
        updatedCount++;
      } else if (mLower.includes("gana visitante")) {
        const isWon = aG > hG;
        p.actualScore = `${hG} - ${aG}`;
        p.status = isWon ? "won" : "lost";
        updatedCount++;
      } else if (mLower.includes("empate") || mLower === "x") {
        const isWon = hG === aG;
        p.actualScore = `${hG} - ${aG}`;
        p.status = isWon ? "won" : "lost";
        updatedCount++;
      } else if (mLower.includes("over 2.5") || mLower.includes("más de 2.5")) {
        const isWon = totalG > 2.5;
        p.actualScore = `${hG} - ${aG} (${totalG} Goles)`;
        p.status = isWon ? "won" : "lost";
        updatedCount++;
      } else if (mLower.includes("under 2.5") || mLower.includes("menos de 2.5")) {
        const isWon = totalG < 2.5;
        p.actualScore = `${hG} - ${aG} (${totalG} Goles)`;
        p.status = isWon ? "won" : "lost";
        updatedCount++;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(picks, null, 2), "utf-8");
    console.log(`Saved updated snapshot ${file}: ${updatedCount} picks synced with API.`);
  }
}

updateAllSnapshotsWithRealStats().catch(console.error);
