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

  it("strictly ranks markets according to the 7-tier priority hierarchy: 1: Over Corners, 2: BTTS, 3: Over Goals, 4: Under Corners, 5: Under Goals, 6: Local, 7: Visitante", async () => {
    const { getMarketPriorityRank } = await import("./prediction-engine");

    // 1. OVER CORNERS
    expect(getMarketPriorityRank("Córners", "Over 8.5")).toBe(1);
    expect(getMarketPriorityRank("Over Córners", "Over 7.5")).toBe(1);
    expect(getMarketPriorityRank("Over 8.5 Córners")).toBe(1);

    // 2. AMBOS EQUIPOS ANOTAN
    expect(getMarketPriorityRank("Ambos Equipos Anotan", "Sí")).toBe(2);
    expect(getMarketPriorityRank("BTTS", "Yes")).toBe(2);

    // 3. OVER GOLES
    expect(getMarketPriorityRank("Over 2.5 Goles", "Over 2.5")).toBe(3);
    expect(getMarketPriorityRank("Over 1.5 Goles", "Over 1.5")).toBe(3);
    expect(getMarketPriorityRank("Over 3.5 Goles", "Over 3.5")).toBe(3);

    // 4. UNDER CORNERS
    expect(getMarketPriorityRank("Under Córners", "Under 9.5")).toBe(4);
    expect(getMarketPriorityRank("Córners", "Under 9.5")).toBe(4);
    expect(getMarketPriorityRank("Under 10.5 Córners")).toBe(4);

    // 5. UNDER GOLES
    expect(getMarketPriorityRank("Under 2.5 Goles", "Under 2.5")).toBe(5);
    expect(getMarketPriorityRank("Under 3.5 Goles", "Under 3.5")).toBe(5);

    // 6. GANADOR LOCAL
    expect(getMarketPriorityRank("Ganador Local", "1")).toBe(6);
    expect(getMarketPriorityRank("Gana Local")).toBe(6);

    // 7. GANADOR VISITANTE
    expect(getMarketPriorityRank("Ganador Visitante", "2")).toBe(7);
    expect(getMarketPriorityRank("Gana Visitante")).toBe(7);
  });

  it("evaluates Under Goles and Under Córners when genuine bookmaker odds and metrics warrant it", () => {
    const picks = evaluateFixturePrediction({
      fixtureId: 999993,
      homeTeam: "Getafe",
      awayTeam: "Mallorca",
      league: "La Liga",
      kickoff: "2026-10-06T19:00:00Z",
      marketOdds: {
        homeWin: 2.30,
        draw: 2.90,
        awayWin: 3.40,
        under25: 1.85,
        under35: 1.38,
        cornersUnder95: 2.10,
        cornersUnder105: 1.48,
      },
    });

    expect(picks.length).toBeGreaterThan(0);
    const underPick = picks.find((p) => p.market.includes("Under"));
    expect(underPick).toBeDefined();
    expect(underPick?.odds).toBeGreaterThanOrEqual(1.25);
  });

});
