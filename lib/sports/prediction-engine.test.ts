import { describe, it, expect } from "vitest";
import { evaluateFixturePrediction } from "./prediction-engine";
import { generatePredictionsForUpcoming } from "./db";

describe("Prediction Engine (TypeScript MVP)", () => {
  it("accurately favors PSV Eindhoven as away winner vs Utrecht", () => {
    const picks = evaluateFixturePrediction({
      fixtureId: 1552148,
      homeTeam: "Utrecht",
      awayTeam: "PSV Eindhoven",
      league: "Eredivisie",
      kickoff: "2026-08-30T10:15:00Z",
    });

    expect(picks.length).toBeGreaterThan(0);
    const topPick = picks[0];
    console.log("UTRECHT vs PSV TOP PICK:", topPick.market, topPick.probability, topPick.odds);

    // PSV is the away favorite, so Gana Local for Utrecht MUST NOT be the top pick
    expect(topPick.market).not.toBe("Gana Local");
    expect(["Gana Visitante", "Over 2.5 Goles", "Ambos Marcan (BTTS)"]).toContain(topPick.market);
  });

  it("accurately favors Real Madrid as home winner vs Malaga", () => {
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
    expect(topPick.market).toBe("Gana Local");
    expect(topPick.probability).toBeGreaterThanOrEqual(75);
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
    expect(Object.keys(marketCounts).length).toBeGreaterThanOrEqual(3);
  }, 25000);
});
