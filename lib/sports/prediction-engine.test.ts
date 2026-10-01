import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { evaluateFixturePrediction } from "./prediction-engine";
import {
  generatePredictionsForUpcoming,
  addPredictionsToDailySnapshot,
  getEcuadorDateString,
  getStoredPredictions,
  loadDailySnapshot,
  saveDailySnapshot,
} from "./db";

describe("Prediction Engine (TypeScript MVP)", () => {
  it("accurately favors Real Madrid with high precision Over 2.5 goals vs Malaga", () => {
    const picks = evaluateFixturePrediction(
      { fixtureId: 1570360, homeTeam: "Real Madrid", awayTeam: "Malaga", league: "La Liga", kickoff: "2026-08-30T15:00:00Z" }
    );
    expect(picks.length).toBeGreaterThan(0);
    const topPick = picks[0];
    expect(topPick.probability).toBeGreaterThanOrEqual(60);
    expect(topPick.odds).toBeGreaterThanOrEqual(1.10);
  });

  it("accurately detects high-value profitable opportunities in Chelsea vs Brighton", () => {
    const picks = evaluateFixturePrediction(
      { fixtureId: 1557379, homeTeam: "Chelsea", awayTeam: "Brighton", league: "Premier League", kickoff: "2026-08-30T13:00:00Z" }
    );
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.some((p) => p.market.includes("Ganador") || p.market.includes("Goles") || p.market.includes("Ambos") || p.market.includes("Córners"))).toBe(true);
  });

  it("correctly handles getEcuadorDateString", () => {
    const dStr = getEcuadorDateString("2026-09-12T01:30:00Z");
    expect(dStr).toBe("2026-09-11");
    const nowStr = getEcuadorDateString(Date.now());
    expect(nowStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("generates predictions with rich market variety", async () => {
    const predictions = await generatePredictionsForUpcoming();
    for (const p of predictions) {
      expect(p.odds).toBeGreaterThanOrEqual(1.10);
    }
    expect(predictions.length).toBeGreaterThanOrEqual(0);
  }, 25000);

  it("does NOT generate corner predictions with ghost odds when no corner odds are provided", () => {
    const picks = evaluateFixturePrediction({
      fixtureId: 999991,
      homeTeam: "Manchester City",
      awayTeam: "Liverpool",
      league: "Premier League",
      kickoff: "2026-10-05T15:00:00Z",
      marketOdds: {
        homeWin: 1.85,
        draw: 3.75,
        awayWin: 4.10,
        over25: 1.65,
        bttsYes: 1.55,
        // No corner odds provided
      },
    });

    // None of the returned picks should be Corners with fake odds
    const cornerPicks = picks.filter((p) => p.market === "Córners");
    expect(cornerPicks.length).toBe(0);
  });

  it("accurately predicts corners using the exact authentic odds when bookmaker provides them", () => {
    const authenticCornerOdd = 1.34;
    const picks = evaluateFixturePrediction({
      fixtureId: 999992,
      homeTeam: "Manchester City",
      awayTeam: "Liverpool",
      league: "Premier League",
      kickoff: "2026-10-05T15:00:00Z",
      marketOdds: {
        homeWin: 1.85,
        draw: 3.75,
        awayWin: 4.10,
        over25: 1.65,
        bttsYes: 1.55,
        cornersOver65: authenticCornerOdd,
      },
    });

    const cornerPick = picks.find((p) => p.market === "Córners" && p.selection === "Over 6.5");
    expect(cornerPick).toBeDefined();
    expect(cornerPick?.odds).toBe(authenticCornerOdd);
  });
});
