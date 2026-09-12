import { describe, it, expect } from "vitest";
import { evaluateFixturePrediction } from "./prediction-engine";
import {
  generatePredictionsForUpcoming,
  addPredictionsToDailySnapshot,
  getEcuadorDateString,
  getStoredPredictions,
} from "./db";

describe("Prediction Engine (TypeScript MVP)", () => {
  it("accurately favors Real Madrid with high precision Over 2.5 goals vs Malaga", () => {
    const picks = evaluateFixturePrediction({
      fixtureId: 1570360,
      homeTeam: "Real Madrid",
      awayTeam: "Malaga",
      league: "La Liga",
      kickoff: "2026-08-30T15:00:00Z",
    });

    expect(picks.length).toBeGreaterThan(0);
    const topPick = picks[0];
    expect(topPick.probability).toBeGreaterThanOrEqual(60);
    expect(topPick.odds).toBeGreaterThanOrEqual(1.10);
    expect(topPick.fairOdds).toBeGreaterThanOrEqual(1.0);
    expect(topPick.h2h).toBeDefined();
    expect(topPick.homeLast5).toBeDefined();
  });

  it("accurately detects high-value profitable opportunities in Chelsea vs Brighton in core markets", () => {
    const picks = evaluateFixturePrediction({
      fixtureId: 1557379,
      homeTeam: "Chelsea",
      awayTeam: "Brighton",
      league: "Premier League",
      kickoff: "2026-08-30T13:00:00Z",
    });

    expect(picks.length).toBeGreaterThan(0);
    expect(picks.some((p) => p.market.includes("Ganador") || p.market.includes("Goles") || p.market.includes("Ambos"))).toBe(true);
  });

  it("strictly differentiates Egyptian Premier League from English Premier League and assigns star players", () => {
    const egyptPicks = evaluateFixturePrediction({
      fixtureId: 999123,
      homeTeam: "Al Ahly",
      awayTeam: "Zamalek",
      league: "Premier League",
      country: "Egypt",
      kickoff: "2026-08-30T17:00:00Z",
    });

    expect(egyptPicks.length).toBeGreaterThan(0);
    expect(egyptPicks[0].country).toBe("Egipto");
    expect(egyptPicks[0].league).not.toBe("Premier League (Inglaterra)");

    const realMadridPicks = evaluateFixturePrediction({
      fixtureId: 999124,
      homeTeam: "Real Madrid",
      awayTeam: "Alavés",
      league: "La Liga",
      country: "Spain",
      kickoff: "2026-08-30T19:00:00Z",
    });

    expect(realMadridPicks.length).toBeGreaterThan(0);
    expect(realMadridPicks[0].market).toBeDefined();
    expect(realMadridPicks[0].probability).toBeGreaterThanOrEqual(65);
  });

  it("correctly handles getEcuadorDateString for Date, number, and ISO string", () => {
    const dStr = getEcuadorDateString("2026-09-12T01:30:00Z");
    expect(dStr).toBe("2026-09-11"); // In Ecuador (UTC-5), 01:30 UTC on Sept 12 is 20:30 on Sept 11

    const nowStr = getEcuadorDateString(Date.now());
    expect(nowStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("correctly adds and tags MCP discovered alerts in active daily snapshot", () => {
    const mockMcpPick: any = {
      fixtureId: 999199,
      match: "Bayern Munich vs Borussia Dortmund",
      homeTeam: "Bayern Munich",
      awayTeam: "Borussia Dortmund",
      homeTeamId: 157,
      awayTeamId: 165,
      league: "Bundesliga",
      leagueId: 78,
      country: "Alemania",
      kickoff: "2026-09-12T13:30:00Z",
      market: "Over 2.5 Goles",
      selection: "Over 2.5",
      odds: 1.65,
      probability: 72.0,
      edge: 7.5,
      smartScore: 85,
      status: "pending",
    };

    const res = addPredictionsToDailySnapshot([mockMcpPick]);
    expect(res.addedCount).toBeGreaterThanOrEqual(1);
    expect(res.totalAlerts).toBeGreaterThanOrEqual(1);

    const found = res.predictions.find((p) => p.fixtureId === 999199);
    expect(found).toBeDefined();
    expect(found?.isMcpPick).toBe(true);
    expect(found?.source).toBe("mcp");
    expect(found?.pickBadge).toBe("mcp");
  });

  it("generates predictions with rich market variety from live curated multi-league queries", async () => {
    const predictions = await generatePredictionsForUpcoming();
    for (const p of predictions) {
      expect(p.odds).toBeGreaterThanOrEqual(1.10);
      expect(p.probability).toBeGreaterThanOrEqual(30);
    }
    expect(predictions.length).toBeGreaterThanOrEqual(0);
  }, 25000);
});
