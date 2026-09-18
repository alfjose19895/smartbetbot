import { describe, it, expect } from "vitest";
import {
  poissonProbability,
  dixonColesTau,
  evaluateFixturePrediction,
} from "./prediction-engine";
import { auditPredictionsWithGeminiVeto } from "../ai/claude-analyst";

describe("Dixon-Coles Mathematical Calibration", () => {
  it("calculates Poisson probabilities accurately", () => {
    const p0 = poissonProbability(0, 1.5);
    const p1 = poissonProbability(1, 1.5);
    const p2 = poissonProbability(2, 1.5);

    expect(p0).toBeCloseTo(Math.exp(-1.5), 4);
    expect(p1).toBeCloseTo(1.5 * Math.exp(-1.5), 4);
    expect(p2).toBeCloseTo((2.25 / 2) * Math.exp(-1.5), 4);
  });

  it("applies Dixon-Coles tau adjustment parameter for low scoring events", () => {
    const tau00 = dixonColesTau(0, 0, 1.2, 0.8, -0.11);
    const tau01 = dixonColesTau(0, 1, 1.2, 0.8, -0.11);
    const tau10 = dixonColesTau(1, 0, 1.2, 0.8, -0.11);
    const tau11 = dixonColesTau(1, 1, 1.2, 0.8, -0.11);
    const tau22 = dixonColesTau(2, 2, 1.2, 0.8, -0.11);

    expect(tau00).toBeGreaterThan(1.0); // 0-0 is elevated when rho is negative
    expect(tau01).toBeLessThan(1.0);    // 0-1 is depressed when rho is negative
    expect(tau10).toBeLessThan(1.0);    // 1-0 is depressed when rho is negative
    expect(tau11).toBeGreaterThan(1.0); // 1-1 is elevated when rho is negative
    expect(tau22).toBe(1.0);            // higher scores unchanged
  });

  it("evaluates opportunities strictly against allowed markets", () => {
    const opps = evaluateFixturePrediction({
      fixtureId: 9991,
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      country: "Spain",
      kickoff: "2026-10-25T19:00:00Z",
      marketOdds: {
        homeWin: 2.10,
        draw: 3.50,
        awayWin: 3.20,
        over25: 1.65,
        under25: 2.25,
        bttsYes: 1.55,
        bttsNo: 2.40,
      },
    });

    expect(opps.length).toBeGreaterThan(0);
    for (const opp of opps) {
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
  }, 20000);
});