import { describe, it, expect } from "vitest";
import {
  dixonColesTau,
  poissonProbability,
  evaluateFixturePrediction,
} from "./prediction-engine";
import { auditPredictionsWithGeminiVeto } from "../ai/claude-analyst";

describe("Dixon-Coles Mathematical Calibration", () => {
  it("computes tau correction factors correctly for 0-0, 1-0, 0-1, and 1-1", () => {
    const hXg = 1.4;
    const aXg = 1.1;
    const rho = -0.11;

    // 0-0 should have tau > 1 (boosting low-scoring / draw probability)
    const tau00 = dixonColesTau(0, 0, hXg, aXg, rho);
    expect(tau00).toBeGreaterThan(1.0);
    expect(tau00).toBeCloseTo(1.0 - hXg * aXg * rho, 4);

    // 1-1 should have tau > 1 (boosting 1-1 draw)
    const tau11 = dixonColesTau(1, 1, hXg, aXg, rho);
    expect(tau11).toBeGreaterThan(1.0);
    expect(tau11).toBeCloseTo(1.0 - rho, 4);

    // 0-1 and 1-0 should have tau < 1 (reducing 1-0/0-1 bias)
    const tau01 = dixonColesTau(0, 1, hXg, aXg, rho);
    expect(tau01).toBeLessThan(1.0);

    const tau10 = dixonColesTau(1, 0, hXg, aXg, rho);
    expect(tau10).toBeLessThan(1.0);

    // Higher scores (2-1, 2-2, 3-1, etc.) must remain unadjusted (tau = 1.0)
    expect(dixonColesTau(2, 1, hXg, aXg, rho)).toBe(1.0);
    expect(dixonColesTau(3, 2, hXg, aXg, rho)).toBe(1.0);
  });

  it("evaluates fixture predictions with Sweet Spot odds and anti-trap rules", () => {
    const opportunities = evaluateFixturePrediction({
      fixtureId: 9991,
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      country: "Spain",
      kickoff: "2026-10-25T19:00:00Z",
      marketOdds: {
        homeWin: 2.05,
        draw: 3.50,
        awayWin: 3.40,
        over25: 1.70,
        under25: 2.15,
        bttsYes: 1.62,
        bttsNo: 2.20,
      },
    });

    expect(opportunities.length).toBeGreaterThan(0);
    for (const opp of opportunities) {
      // Must belong to authorized markets
      expect([
        "Ganador Local",
        "Ganador Visitante",
        "Over 2.5 Goles",
        "Ambos Equipos Anotan",
      ]).toContain(opp.market);

      // Must have positive expected value (+EV) or minimum safety edge
      expect(opp.probability).toBeGreaterThanOrEqual(30);
      expect(opp.odds).toBeGreaterThanOrEqual(1.20);
    }
  });

  it("executes Gemini Devil's Advocate Veto Auditor without throwing", async () => {
    const sampleOpportunities = evaluateFixturePrediction({
      fixtureId: 9992,
      homeTeam: "Manchester City",
      awayTeam: "Arsenal",
      league: "Premier League",
      country: "England",
      kickoff: "2026-11-01T16:30:00Z",
      marketOdds: {
        homeWin: 1.95,
        draw: 3.60,
        awayWin: 3.80,
        over25: 1.75,
        under25: 2.10,
        bttsYes: 1.68,
        bttsNo: 2.15,
      },
    });

    const vetoResult = await auditPredictionsWithGeminiVeto(sampleOpportunities);
    expect(vetoResult).toBeDefined();
    expect(Array.isArray(vetoResult.approvedPicks)).toBe(true);
    expect(Array.isArray(vetoResult.audits)).toBe(true);
  });
});
