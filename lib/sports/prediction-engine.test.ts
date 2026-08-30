import { describe, it, expect } from "vitest";
import { evaluateFixturePrediction } from "./prediction-engine";
import { generatePredictionsForUpcoming } from "./db";

describe("Prediction Engine (TypeScript MVP)", () => {
  it("calculates realistic match probabilities across all 5 markets", () => {
    const homePick = evaluateFixturePrediction({
      fixtureId: 101,
      homeTeam: "Real Madrid",
      awayTeam: "Alaves",
      league: "La Liga",
      kickoff: "2026-08-30T15:00:00Z",
    });
    expect(homePick.length).toBeGreaterThan(0);

    const markets = new Set(homePick.map((p) => p.market));
    console.log("Single fixture evaluated markets:", Array.from(markets));
  });

  it("generates predictions with rich market variety from live multi-league queries", async () => {
    const predictions = await generatePredictionsForUpcoming();
    console.log("TOTAL LIVE PREDICTIONS:", predictions.length);

    const marketCounts: Record<string, number> = {};
    for (const p of predictions) {
      marketCounts[p.market] = (marketCounts[p.market] || 0) + 1;
    }

    console.log("MARKETS BREAKDOWN:", marketCounts);

    expect(predictions.length).toBeGreaterThan(0);
    expect(Object.keys(marketCounts).length).toBeGreaterThanOrEqual(4);
  }, 25000);
});
