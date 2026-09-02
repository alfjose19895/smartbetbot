import fs from "fs";
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const API_KEY = process.env.API_FOOTBALL_KEY || process.env.NEXT_PUBLIC_API_FOOTBALL_KEY;
const API_URL = "https://v3.football.api-sports.io";

async function checkFixtureStats() {
  console.log("Using API Key:", API_KEY ? "Found key (" + API_KEY.slice(0, 6) + "...)" : "MISSING KEY");

  // Search for recent matches in Premier League / Championship or Ecuador Liga Pro
  // Let's query finished matches from 2026-08-30 or 2026-08-31 or 2026-09-01
  const dates = ["2026-09-01", "2026-08-31", "2026-08-30"];
  for (const d of dates) {
    console.log(`\n--- Fetching finished fixtures for ${d} ---`);
    const res = await fetch(`${API_URL}/fixtures?date=${d}&status=FT`, {
      headers: { "x-apisports-key": API_KEY || "" },
    });
    const json = await res.json();
    console.log(`Response count for ${d}:`, json.results);
    if (json.response && json.response.length > 0) {
      const sample = json.response.slice(0, 5);
      for (const item of sample) {
        console.log(`Match: ${item.teams.home.name} vs ${item.teams.away.name} (ID: ${item.fixture.id}), Score: ${item.goals.home}-${item.goals.away}`);
        
        // Fetch statistics for this match
        const statRes = await fetch(`${API_URL}/fixtures/statistics?fixture=${item.fixture.id}`, {
          headers: { "x-apisports-key": API_KEY || "" },
        });
        const statJson = await statRes.json();
        if (statJson.response && statJson.response.length >= 2) {
          const homeCorners = statJson.response[0].statistics.find((s: any) => s.type === "Corner Kicks")?.value;
          const awayCorners = statJson.response[1].statistics.find((s: any) => s.type === "Corner Kicks")?.value;
          const homeYellows = statJson.response[0].statistics.find((s: any) => s.type === "Yellow Cards")?.value;
          const awayYellows = statJson.response[1].statistics.find((s: any) => s.type === "Yellow Cards")?.value;
          console.log(`  -> Real Stats: Home Corners: ${homeCorners}, Away Corners: ${awayCorners}, Total: ${Number(homeCorners || 0) + Number(awayCorners || 0)}`);
          console.log(`  -> Real Cards: Home Yellows: ${homeYellows}, Away Yellows: ${awayYellows}`);
        } else {
          console.log(`  -> Statistics response:`, statJson.response?.length || 0, "entries");
        }
      }
    }
  }
}

checkFixtureStats().catch(console.error);
