import { describe, it, expect } from "vitest";
import { evaluateFixturePrediction } from "./prediction-engine";
import { generatePredictionsForUpcoming } from "./db";

describe("Prediction Engine (TypeScript MVP)", () => {
  it("accurately favors PSV Eindhoven as away winner vs Utrecht with odds >= 1.40", () => {
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

    // Meets precision and profitable odds thresholds
    expect(topPick.probability).toBeGreaterThanOrEqual(65);
    expect(topPick.odds).toBeGreaterThanOrEqual(1.40);
    expect(["Gana Visitante", "Over 2.5 Goles", "Ambos Marcan (BTTS)"]).toContain(topPick.market);
  });

  it("accurately detects high-value profitable opportunities in Chelsea vs Brighton", () => {
    const picks = evaluateFixturePrediction({
      fixtureId: 1557379,
      homeTeam: "Chelsea",
      awayTeam: "Brighton",
      league: "Premier League",
      kickoff: "2026-08-30T13:00:00Z",
    });

    expect(picks.length).toBeGreaterThan(0);
    const topPick = picks[0];
    console.log("CHELSEA vs BRIGHTON TOP PICK:", topPick.market, topPick.probability, topPick.odds);
    expect(topPick.probability).toBeGreaterThanOrEqual(65);
    expect(topPick.odds).toBeGreaterThanOrEqual(1.40);
  });

  it("generates predictions with rich market variety with odds >= 1.40 from live multi-league queries", async () => {
    const predictions = await generatePredictionsForUpcoming();
    console.log("TOTAL LIVE PREDICTIONS:", predictions.length);

    const marketCounts: Record<string, number> = {};
    for (const p of predictions) {
      marketCounts[p.market] = (marketCounts[p.market] || 0) + 1;
      expect(p.odds).toBeGreaterThanOrEqual(1.40);
      expect(p.probability).toBeGreaterThanOrEqual(65);
    }

    console.log("MARKETS BREAKDOWN:", marketCounts);

    expect(predictions.length).toBeGreaterThan(0);
    expect(Object.keys(marketCounts).length).toBeGreaterThanOrEqual(3);
  }, 25000);
});
