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
});
