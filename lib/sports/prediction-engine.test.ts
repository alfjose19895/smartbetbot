import { describe, it, expect } from "vitest";
import { evaluateFixturePrediction } from "./prediction-engine";
import { generatePredictionsForUpcoming } from "./db";

describe("Prediction Engine (TypeScript MVP)", () => {
  it("calculates realistic match probabilities and detects positive edge", () => {
    const opps = evaluateFixturePrediction({
      fixtureId: 999,
      homeTeam: "Liverpool",
      awayTeam: "Nottingham Forest",
      league: "Premier League",
      kickoff: "2026-08-30T15:00:00Z",
      homeExpectedGoals: 2.2,
      awayExpectedGoals: 0.8,
      marketOdds: {
        homeWin: 1.55,
        over25: 1.60,
        bttsYes: 1.75,
      },
    });

    expect(opps.length).toBeGreaterThan(0);
    const topPick = opps[0];
    expect(topPick.match).toBe("Liverpool vs Nottingham Forest");
    expect(topPick.probability).toBeGreaterThan(50);
    expect(topPick.odds).toBeGreaterThan(1.0);
    expect(topPick.explanation).toBeTruthy();
    expect(topPick.smartScore).toBeGreaterThanOrEqual(70);
  });

  it("generates predictions from live multi-league queries", async () => {
    const predictions = await generatePredictionsForUpcoming();
    console.log("TEST GENERATED PREDICTIONS COUNT:", predictions.length);
    if (predictions.length > 0) {
      console.log("Sample prediction:", predictions[0]);
    }
    expect(predictions.length).toBeGreaterThan(0);
  });
});
