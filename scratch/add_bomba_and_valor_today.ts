import fs from "fs";
import path from "path";
import {
  getEcuadorDateString,
  generatePredictionsForUpcoming,
  isCuratedLeague,
} from "../lib/sports/db";
import { apiFootball, ApiFootballOddsItem, extractMarketOddsFromBookmaker } from "../lib/sports/api-football";
import { evaluateFixturePrediction, MarketOpportunity } from "../lib/sports/prediction-engine";

const getCanonicalTeamKey = (name: string) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  console.log(`[Add Bomba & Valor] Current date in Ecuador: ${todayDateStr}`);

  // 1. Load existing predictions for today
  const snapshotFile = path.join(process.cwd(), "data", "daily_snapshots", `${todayDateStr}.json`);
  let currentPredictions: MarketOpportunity[] = [];
  if (fs.existsSync(snapshotFile)) {
    try {
      currentPredictions = JSON.parse(fs.readFileSync(snapshotFile, "utf-8"));
    } catch {
      currentPredictions = [];
    }
  }

  console.log(`[Add Bomba & Valor] Existing predictions count: ${currentPredictions.length}`);

  if (currentPredictions.length === 0) {
    console.log("[Add Bomba & Valor] Generating initial base predictions for today...");
    currentPredictions = await generatePredictionsForUpcoming();
    console.log(`[Add Bomba & Valor] Initial predictions loaded: ${currentPredictions.length}`);
  }

  const existingMatchKeys = new Set(
    currentPredictions.map((p) => {
      const h = getCanonicalTeamKey(p.homeTeam);
      const a = getCanonicalTeamKey(p.awayTeam);
      return `${h}-${a}`;
    })
  );

  // 2. Fetch today's fixtures and odds from API
  console.log("[Add Bomba & Valor] Fetching today's fixtures and odds from API-Football...");
  const [todayFixtures, todayOddsList] = await Promise.all([
    apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil"),
    apiFootball.getOddsByDate(todayDateStr, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]),
  ]);

  const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
  if (Array.isArray(todayOddsList)) {
    for (const item of todayOddsList) {
      if (item.fixture?.id) {
        oddsMapByFixture[item.fixture.id] = item;
      }
    }
  }

  const availableOpportunities: MarketOpportunity[] = [];

  if (Array.isArray(todayFixtures)) {
    for (const item of todayFixtures) {
      if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name) continue;

      const hNorm = getCanonicalTeamKey(item.teams.home.name);
      const aNorm = getCanonicalTeamKey(item.teams.away.name);
      const matchKey = `${hNorm}-${aNorm}`;
      if (existingMatchKeys.has(matchKey)) continue;

      if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) continue;

      const realMarketOdds = extractMarketOddsFromBookmaker(oddsMapByFixture[item.fixture.id]);
      const opps = evaluateFixturePrediction({
        fixtureId: item.fixture.id,
        homeTeam: item.teams.home.name,
        awayTeam: item.teams.away.name,
        homeTeamId: item.teams.home.id,
        awayTeamId: item.teams.away.id,
        homeLogo: item.teams.home.logo,
        awayLogo: item.teams.away.logo,
        league: item.league.name,
        leagueId: item.league.id,
        country: item.league.country,
        leagueLogo: item.league.logo,
        kickoff: item.fixture.date,
        marketOdds: realMarketOdds,
      });

      if (opps.length > 0) {
        for (const opp of opps) {
          availableOpportunities.push(opp);
        }
      }
    }
  }

  console.log(`[Add Bomba & Valor] Available new candidates found: ${availableOpportunities.length}`);

  // 3. Find 1 Best Bomba (odds >= 2.00 or Draw)
  const bombaCandidates = availableOpportunities
    .filter((p) => (p.odds >= 2.00 || p.market.includes("Empate") || p.pickBadge === "bomba") && !existingMatchKeys.has(`${getCanonicalTeamKey(p.homeTeam)}-${getCanonicalTeamKey(p.awayTeam)}`))
    .sort((a, b) => b.edge - a.edge || b.probability - a.probability);

  let selectedBomba: MarketOpportunity | null = null;
  if (bombaCandidates.length > 0) {
    selectedBomba = { ...bombaCandidates[0], pickBadge: "bomba" };
    existingMatchKeys.add(`${getCanonicalTeamKey(selectedBomba.homeTeam)}-${getCanonicalTeamKey(selectedBomba.awayTeam)}`);
    console.log(`[Add Bomba & Valor] Selected BOMBA: ${selectedBomba.match} | ${selectedBomba.market} | Cuota: @${selectedBomba.odds.toFixed(2)} | Prob: ${selectedBomba.probability}%`);
  } else {
    const highestOddsCandidate = availableOpportunities
      .filter((p) => !existingMatchKeys.has(`${getCanonicalTeamKey(p.homeTeam)}-${getCanonicalTeamKey(p.awayTeam)}`))
      .sort((a, b) => b.odds - a.odds);
    if (highestOddsCandidate.length > 0) {
      selectedBomba = { ...highestOddsCandidate[0], pickBadge: "bomba" };
      existingMatchKeys.add(`${getCanonicalTeamKey(selectedBomba.homeTeam)}-${getCanonicalTeamKey(selectedBomba.awayTeam)}`);
      console.log(`[Add Bomba & Valor] Selected BOMBA (highest odds): ${selectedBomba.match} | ${selectedBomba.market} | Cuota: @${selectedBomba.odds.toFixed(2)} | Prob: ${selectedBomba.probability}%`);
    }
  }

  // 4. Find 1 Best Alto Valor (prob >= 70%, badge valor)
  const valorCandidates = availableOpportunities
    .filter((p) => p.probability >= 68 && !existingMatchKeys.has(`${getCanonicalTeamKey(p.homeTeam)}-${getCanonicalTeamKey(p.awayTeam)}`))
    .sort((a, b) => b.probability - a.probability || b.edge - a.edge);

  let selectedValor: MarketOpportunity | null = null;
  if (valorCandidates.length > 0) {
    selectedValor = { ...valorCandidates[0], pickBadge: "valor", confidence: "Muy Alta" };
    existingMatchKeys.add(`${getCanonicalTeamKey(selectedValor.homeTeam)}-${getCanonicalTeamKey(selectedValor.awayTeam)}`);
    console.log(`[Add Bomba & Valor] Selected VALOR: ${selectedValor.match} | ${selectedValor.market} | Cuota: @${selectedValor.odds.toFixed(2)} | Prob: ${selectedValor.probability}%`);
  }

  // 5. Append to existing predictions without altering what was already there
  const toAdd: MarketOpportunity[] = [];
  if (selectedBomba) toAdd.push(selectedBomba);
  if (selectedValor) toAdd.push(selectedValor);

  const finalSnapshot = [...currentPredictions, ...toAdd].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  fs.writeFileSync(snapshotFile, JSON.stringify(finalSnapshot, null, 2), "utf-8");

  console.log(`\n================ FINAL TODAY SNAPSHOT (${todayDateStr}) ================`);
  console.log(`Total Predictions: ${finalSnapshot.length}`);
  finalSnapshot.forEach((p, idx) => {
    const badge = p.pickBadge === "bomba" ? "💣 BOMBA" : p.pickBadge === "valor" ? "💎 VALOR" : "ESTÁNDAR";
    console.log(
      `${idx + 1}. [${badge}] [${p.league}] ${p.homeTeam} vs ${p.awayTeam} | ${p.market} | Casa: @${p.odds.toFixed(2)} | Modelo: @${p.fairOdds.toFixed(2)} | Prob: ${p.probability}% | Status: ${p.status}`
    );
  });
}

main().catch((err) => {
  console.error("Error adding bomba and valor:", err);
  process.exit(1);
});
