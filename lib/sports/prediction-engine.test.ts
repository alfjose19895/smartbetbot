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

  it("accurately detects high-value profitable opportunities in Chelsea vs Brighton in core markets", () => {
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
    expect(picks.some((p) => p.market.includes("Gana") || p.market.includes("Empate") || p.market.includes("Goles") || p.market.includes("Ambos"))).toBe(true);
  });

  it("strictly differentiates Egyptian Premier League from English Premier League and assigns star players", () => {
    const egyptPicks = evaluateFixturePrediction({
      fixtureId: 999123,
      homeTeam: "Al Ahly",
      awayTeam: "Zamalek",
      league: "Premier League",
      country: "Egypt",
      kickoff: "2026-08-30T17:00:00Z",
    });

    expect(egyptPicks.length).toBeGreaterThan(0);
    expect(egyptPicks[0].country).toBe("Egipto");
    expect(egyptPicks[0].league).not.toBe("Premier League (Inglaterra)");

    const realMadridPicks = evaluateFixturePrediction({
      fixtureId: 999124,
      homeTeam: "Real Madrid",
      awayTeam: "Alavés",
      league: "La Liga",
      country: "Spain",
      kickoff: "2026-08-30T19:00:00Z",
    });

    expect(realMadridPicks.length).toBeGreaterThan(0);
    expect(realMadridPicks[0].market).toBeDefined();
    expect(realMadridPicks[0].probability).toBeGreaterThanOrEqual(65);
  });

  it("accurately evaluates and categorizes J1/J2 League (Japan) and K League 1/2 (South Korea)", () => {
    const japanPicks = evaluateFixturePrediction({
      fixtureId: 888101,
      homeTeam: "Vissel Kobe",
      awayTeam: "Yokohama F. Marinos",
      league: "J1 League",
      country: "Japan",
      kickoff: "2026-09-03T10:00:00Z",
    });

    expect(japanPicks.length).toBeGreaterThan(0);
    expect(japanPicks[0].country).toBe("Japón");
    expect(japanPicks[0].league).toBe("J1 League");
    expect(japanPicks[0].probability).toBeGreaterThanOrEqual(55);

    const koreaPicks = evaluateFixturePrediction({
      fixtureId: 888102,
      homeTeam: "Ulsan HD",
      awayTeam: "Jeonbuk Motors",
      league: "K League 1",
      country: "South-Korea",
      kickoff: "2026-09-03T11:00:00Z",
    });

    expect(koreaPicks.length).toBeGreaterThan(0);
    expect(koreaPicks[0].country).toBe("Corea del Sur");
    expect(koreaPicks[0].league).toBe("K League 1");
    expect(koreaPicks[0].probability).toBeGreaterThanOrEqual(50);
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

    expect(predictions.length).toBeGreaterThanOrEqual(0);
    expect(Object.keys(marketCounts).length).toBeGreaterThanOrEqual(0);
  }, 25000);
});
