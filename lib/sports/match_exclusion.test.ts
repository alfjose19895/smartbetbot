import { describe, it, expect } from "vitest";
import { isExcludedMatch, evaluateFixturePrediction } from "./prediction-engine";

describe("Match Exclusion Rules", () => {
  it("identifies and blocks ADT vs Cienciano (Peru) for today 2026-09-13", () => {
    expect(isExcludedMatch("ADT", "Cienciano", undefined, "2026-09-13")).toBe(true);
    expect(isExcludedMatch("ADT Tarma", "Club Cienciano", undefined, "2026-09-13")).toBe(true);
    expect(isExcludedMatch("Cienciano", "Asociación Deportiva Tarma", undefined, "2026-09-13")).toBe(true);
    expect(isExcludedMatch(undefined, undefined, "ADT vs Cienciano", "2026-09-13")).toBe(true);

    const oppsToday = evaluateFixturePrediction({
      fixtureId: 9991,
      homeTeam: "ADT",
      awayTeam: "Cienciano",
      league: "Liga 1",
      kickoff: "2026-09-13T15:00:00Z",
    });
    expect(oppsToday).toHaveLength(0);
  });

  it("permits ADT vs Cienciano for future dates beyond 2026-09-13", () => {
    expect(isExcludedMatch("ADT", "Cienciano", undefined, "2026-09-20")).toBe(false);
    expect(isExcludedMatch("ADT Tarma", "Cienciano", undefined, "2026-10-01")).toBe(false);

    const oppsFuture = evaluateFixturePrediction({
      fixtureId: 9991,
      homeTeam: "ADT",
      awayTeam: "Cienciano",
      league: "Liga 1",
      kickoff: "2026-09-20T15:00:00Z",
    });
    expect(oppsFuture.length).toBeGreaterThan(0);
  });

  it("identifies and blocks Teplice vs Slavia Praha (Czech Liga) for today 2026-09-13", () => {
    expect(isExcludedMatch("FK Teplice", "SK Slavia Praha", undefined, "2026-09-13")).toBe(true);
    expect(isExcludedMatch("Teplice", "Slavia Praga", undefined, "2026-09-13")).toBe(true);

    const oppsToday = evaluateFixturePrediction({
      fixtureId: 9992,
      homeTeam: "FK Teplice",
      awayTeam: "SK Slavia Praha",
      league: "Czech Liga",
      kickoff: "2026-09-13T15:00:00Z",
    });
    expect(oppsToday).toHaveLength(0);
  });

  it("permits Teplice vs Slavia Praha for future dates beyond 2026-09-13", () => {
    expect(isExcludedMatch("FK Teplice", "SK Slavia Praha", undefined, "2026-09-25")).toBe(false);

    const oppsFuture = evaluateFixturePrediction({
      fixtureId: 9992,
      homeTeam: "FK Teplice",
      awayTeam: "SK Slavia Praha",
      league: "Czech Liga",
      kickoff: "2026-09-25T15:00:00Z",
    });
    expect(oppsFuture.length).toBeGreaterThan(0);
  });

  it("allows normal matches on any date", () => {
    expect(isExcludedMatch("Real Madrid", "Barcelona", undefined, "2026-09-13")).toBe(false);
    expect(isExcludedMatch("Inter Miami", "Orlando City SC", undefined, "2026-09-13")).toBe(false);
    expect(isExcludedMatch("Celta Vigo", "Malaga", undefined, "2026-09-13")).toBe(false);
    expect(isExcludedMatch("Viking", "Kristiansund BK", undefined, "2026-09-13")).toBe(false);
  });
});
