import { describe, it, expect } from "vitest";
import { isExcludedMatch, evaluateFixturePrediction } from "./prediction-engine";
import { loadDailySnapshot } from "./db";

describe("Match Exclusion Rules", () => {
  it("identifies and blocks ADT vs Cienciano (Peru) properly", () => {
    expect(isExcludedMatch("ADT", "Cienciano")).toBe(true);
    expect(isExcludedMatch("ADT Tarma", "Club Cienciano")).toBe(true);
    expect(isExcludedMatch("Cienciano", "Asociación Deportiva Tarma")).toBe(true);
    expect(isExcludedMatch(undefined, undefined, "ADT vs Cienciano")).toBe(true);

    const opps = evaluateFixturePrediction({
      fixtureId: 9991,
      homeTeam: "ADT",
      awayTeam: "Cienciano",
      league: "Liga 1",
      kickoff: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(opps).toHaveLength(0);
  });

  it("identifies and blocks Teplice vs Slavia Praha (Czech Liga) properly", () => {
    expect(isExcludedMatch("FK Teplice", "SK Slavia Praha")).toBe(true);
    expect(isExcludedMatch("Teplice", "Slavia Praga")).toBe(true);
    expect(isExcludedMatch("Slavia Praha", "Teplice")).toBe(true);
    expect(isExcludedMatch(undefined, undefined, "Teplice vs Slavia Praha")).toBe(true);

    const opps = evaluateFixturePrediction({
      fixtureId: 9992,
      homeTeam: "FK Teplice",
      awayTeam: "SK Slavia Praha",
      league: "Czech Liga",
      kickoff: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(opps).toHaveLength(0);
  });

  it("allows normal matches like Real Madrid vs Barcelona and Inter Miami vs Orlando City", () => {
    expect(isExcludedMatch("Real Madrid", "Barcelona")).toBe(false);
    expect(isExcludedMatch("Inter Miami", "Orlando City SC")).toBe(false);
    expect(isExcludedMatch("LDU de Quito", "Barcelona SC")).toBe(false);
  });
});
