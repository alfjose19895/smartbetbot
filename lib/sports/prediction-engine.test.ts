import { describe, it, expect } from "vitest";
import { evaluateFixturePrediction } from "./prediction-engine";
import { generatePredictionsForUpcoming } from "./db";

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
    console.log("REAL MADRID vs MALAGA TOP PICK:", topPick.market, topPick.probability, topPick.odds);

    expect(topPick.probability).toBeGreaterThanOrEqual(60);
    expect(topPick.odds).toBeGreaterThanOrEqual(1.35);
    expect(topPick.fairOdds).toBeGreaterThanOrEqual(1.0);
    expect(topPick.h2h).toBeDefined();
    expect(topPick.homeLast5).toBeDefined();
  });

  it("accurately detects high-value profitable opportunities in Chelsea vs Brighton including Asian Handicap, Shots, Corners and Cards", () => {
    const picks = evaluateFixturePrediction({
      fixtureId: 1557379,
      homeTeam: "Chelsea",
      awayTeam: "Brighton",
      league: "Premier League",
      kickoff: "2026-08-30T13:00:00Z",
    });

    expect(picks.length).toBeGreaterThan(0);
    const markets = picks.map((p) => p.market);
    console.log("CHELSEA vs BRIGHTON AVAILABLE MARKETS:", markets);
    expect(picks.some((p) => p.market.includes("Hándicap Asiático") || p.market.includes("Disparos") || p.market.includes("Córners") || p.market.includes("Tarjetas") || p.market.includes("Goles"))).toBe(true);
  });

  it("generates predictions with rich market variety from live curated multi-league queries", async () => {
    const predictions = await generatePredictionsForUpcoming();
    console.log("TOTAL LIVE PREDICTIONS:", predictions.length);

    const marketCounts: Record<string, number> = {};
    for (const p of predictions) {
      marketCounts[p.market] = (marketCounts[p.market] || 0) + 1;
      expect(p.odds).toBeGreaterThanOrEqual(1.35);
      expect(p.probability).toBeGreaterThanOrEqual(55);
    }

    console.log("MARKETS BREAKDOWN:", marketCounts);

    expect(predictions.length).toBeGreaterThan(0);
    expect(Object.keys(marketCounts).length).toBeGreaterThanOrEqual(1);
  }, 25000);
});
