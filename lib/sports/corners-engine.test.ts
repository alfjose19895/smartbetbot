import { describe, it, expect } from "vitest";
import {
  CornerLineSelectionEngine,
  calculateExpectedCorners,
  simulateCornerDistribution,
  SUPPORTED_CORNER_LINES,
  CornerMarketConfig,
  DEFAULT_CORNER_CONFIG,
} from "./corners-engine";
import { evaluateMarketResult } from "./db";

describe("Dynamic Corners Line Engine (corners_total_over_prematch)", () => {
  // 1. Monotonicity Test
  it("strictly enforces probability monotonicity P(O6.5) >= P(O7.5) >= P(O8.5) >= P(O9.5) >= P(O10.5)", () => {
    const exp = calculateExpectedCorners({
      homeTeam: "Manchester City",
      awayTeam: "Chelsea",
      league: "Premier League",
      homeElo: 1900,
      awayElo: 1750,
    });

    const dist = simulateCornerDistribution(exp.expectedHome, exp.expectedAway, exp.dataQuality, 20000);
    const p = dist.probabilities;

    expect(p[6.5]).toBeGreaterThanOrEqual(p[7.5]);
    expect(p[7.5]).toBeGreaterThanOrEqual(p[8.5]);
    expect(p[8.5]).toBeGreaterThanOrEqual(p[9.5]);
    expect(p[9.5]).toBeGreaterThanOrEqual(p[10.5]);
  });

  // 2. Candidate Generation & Mathematical Formulas
  it("calculates accurate implied probability, Smart Edge, Expected Value, and Expected Margin", () => {
    const engine = new CornerLineSelectionEngine();
    const mockDist = {
      expected_home_corners: 6.2,
      expected_away_corners: 4.5,
      expected_total_corners: 10.7,
      distribution_model: "Negative Binomial" as const,
      data_quality: 0.88,
      simulations_count: 20000,
      probabilities: {
        6.5: 0.90,
        7.5: 0.84,
        8.5: 0.77,
        9.5: 0.68,
        10.5: 0.59,
      },
      simulated_histogram: {},
    };

    const result = engine.evaluateFixture({
      homeTeam: "Liverpool",
      awayTeam: "Arsenal",
      league: "Premier League",
      distribution: mockDist,
      oddsByLine: {
        6.5: 1.22,
        7.5: 1.37,
        8.5: 1.58,
        9.5: 1.88,
        10.5: 2.25,
      },
    });

    expect(result.all_candidates).toHaveLength(5);

    const c85 = result.all_candidates.find((c) => c.line === 8.5)!;
    expect(c85.model_probability).toBe(0.77);
    expect(c85.decimal_odds).toBe(1.58);
    // Implied prob = 1 / 1.58 = 0.633
    expect(c85.implied_probability).toBeCloseTo(0.633, 2);
    // Smart edge = 0.77 - 0.633 = +0.137 (+13.7%)
    expect(c85.smart_edge).toBeCloseTo(0.137, 2);
    // EV = (0.77 * 1.58) - 1 = 1.2166 - 1 = +0.217 (+21.7%)
    expect(c85.expected_value).toBeCloseTo(0.217, 2);
    // Expected margin = 10.7 - 9 = +1.7
    expect(c85.expected_margin).toBe(1.7);
  });

  // 3. Balanced Line Selection Test (Does not blindly pick Over 6.5 or max odds)
  it("selects the optimal balanced line (e.g. Over 8.5) instead of blindly picking lowest line or highest odds", () => {
    const engine = new CornerLineSelectionEngine();
    const mockDist = {
      expected_home_corners: 6.2,
      expected_away_corners: 4.5,
      expected_total_corners: 10.7,
      distribution_model: "Negative Binomial" as const,
      data_quality: 0.88,
      simulations_count: 20000,
      probabilities: {
        6.5: 0.89,
        7.5: 0.84,
        8.5: 0.77,
        9.5: 0.68,
        10.5: 0.59,
      },
      simulated_histogram: {},
    };

    const result = engine.evaluateFixture({
      homeTeam: "Liverpool",
      awayTeam: "Arsenal",
      league: "Premier League",
      distribution: mockDist,
      oddsByLine: {
        6.5: 1.20, // Low odds, low EV
        7.5: 1.38,
        8.5: 1.62, // High EV (+24.7%) with solid 77% probability
        9.5: 1.92,
        10.5: 2.25,
      },
    });

    expect(result.status).toBe("SIGNAL");
    expect(result.recommended_candidate).toBeDefined();
    // Over 8.5 should be chosen over Over 6.5 because of far superior Smart Score (EV & Edge balance)
    expect(result.recommended_candidate?.line).toBe(8.5);
    expect(result.recommended_candidate?.selection).toBe("Over 8.5");
  });

  // 4. Missing Odds Handling (ODDS_UNAVAILABLE)
  it("marks candidates without bookmaker odds as ODDS_UNAVAILABLE and ignores them for signal generation", () => {
    const engine = new CornerLineSelectionEngine();
    const mockDist = {
      expected_home_corners: 5.5,
      expected_away_corners: 4.0,
      expected_total_corners: 9.5,
      distribution_model: "Negative Binomial" as const,
      data_quality: 0.85,
      simulations_count: 20000,
      probabilities: { 6.5: 0.85, 7.5: 0.78, 8.5: 0.68, 9.5: 0.55, 10.5: 0.42 },
      simulated_histogram: {},
    };

    const result = engine.evaluateFixture({
      homeTeam: "Sevilla",
      awayTeam: "Real Betis",
      league: "La Liga",
      distribution: mockDist,
      oddsByLine: {
        7.5: 1.45,
        // 6.5, 8.5, 9.5, 10.5 missing
      },
    });

    const c65 = result.all_candidates.find((c) => c.line === 6.5)!;
    expect(c65.qualification_status).toBe("ODDS_UNAVAILABLE");
    expect(c65.decimal_odds).toBe("ODDS_UNAVAILABLE");

    const c75 = result.all_candidates.find((c) => c.line === 7.5)!;
    expect(c75.qualification_status).toBe("QUALIFIED");
    expect(result.recommended_candidate?.line).toBe(7.5);
  });

  // 5. Disabled Line Configuration
  it("respects admin configuration disabling specific lines (e.g. Over 10.5)", () => {
    const customConfig: CornerMarketConfig = {
      ...DEFAULT_CORNER_CONFIG,
      lines: {
        ...DEFAULT_CORNER_CONFIG.lines,
        10.5: { ...DEFAULT_CORNER_CONFIG.lines[10.5], enabled: false },
      },
    };

    const engine = new CornerLineSelectionEngine(customConfig);
    const mockDist = {
      expected_home_corners: 7.0,
      expected_away_corners: 5.5,
      expected_total_corners: 12.5,
      distribution_model: "Negative Binomial" as const,
      data_quality: 0.90,
      simulations_count: 20000,
      probabilities: { 6.5: 0.95, 7.5: 0.90, 8.5: 0.85, 9.5: 0.78, 10.5: 0.72 },
      simulated_histogram: {},
    };

    const result = engine.evaluateFixture({
      homeTeam: "Bayern Munich",
      awayTeam: "Bayer Leverkusen",
      league: "Bundesliga",
      distribution: mockDist,
      oddsByLine: {
        6.5: 1.25,
        7.5: 1.35,
        8.5: 1.50,
        9.5: 1.70,
        10.5: 2.10,
      },
    });

    const c105 = result.all_candidates.find((c) => c.line === 10.5)!;
    expect(c105.qualification_status).toBe("DISABLED");
    expect(result.recommended_candidate?.line).not.toBe(10.5);
  });

  // 6. WATCH Status When No Candidate Qualifies
  it("outputs WATCH status with explanation when no line meets minimum edge / probability / odds", () => {
    const engine = new CornerLineSelectionEngine();
    const mockDist = {
      expected_home_corners: 4.0,
      expected_away_corners: 3.5,
      expected_total_corners: 7.5,
      distribution_model: "Negative Binomial" as const,
      data_quality: 0.82,
      simulations_count: 20000,
      probabilities: { 6.5: 0.65, 7.5: 0.50, 8.5: 0.38, 9.5: 0.25, 10.5: 0.15 },
      simulated_histogram: {},
    };

    const result = engine.evaluateFixture({
      homeTeam: "Getafe",
      awayTeam: "Mallorca",
      league: "La Liga",
      distribution: mockDist,
      oddsByLine: {
        6.5: 1.20, // Prob 65% vs req 80% -> REJECTED
        7.5: 1.35, // Prob 50% vs req 76% -> REJECTED
        8.5: 1.55, // Prob 38% vs req 72% -> REJECTED
        9.5: 1.95, // Prob 25% vs req 70% -> REJECTED
        10.5: 2.50, // Prob 15% vs req 68% -> REJECTED
      },
    });

    expect(result.status).toBe("WATCH");
    expect(result.recommended_candidate).toBeUndefined();
    expect(result.watch_summary).toContain("El partido presenta tendencia favorable en córners, pero actualmente ninguna línea ofrece suficiente combinación de probabilidad y valor.");
  });

  // 7. Settlement for All 5 Lines
  it("correctly settles Over 6.5, 7.5, 8.5, 9.5, 10.5 based on official total corners", () => {
    // Over 6.5 (Requires >= 7)
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 6.5", homeCorners: 4, awayCorners: 3 }).isWon).toBe(true); // 7 corners -> WON
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 6.5", homeCorners: 3, awayCorners: 3 }).isWon).toBe(false); // 6 corners -> LOST

    // Over 7.5 (Requires >= 8)
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 7.5", homeCorners: 5, awayCorners: 3 }).isWon).toBe(true); // 8 corners -> WON
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 7.5", homeCorners: 4, awayCorners: 3 }).isWon).toBe(false); // 7 corners -> LOST

    // Over 8.5 (Requires >= 9)
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 8.5", homeCorners: 5, awayCorners: 4 }).isWon).toBe(true); // 9 corners -> WON
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 8.5", homeCorners: 4, awayCorners: 4 }).isWon).toBe(false); // 8 corners -> LOST

    // Over 9.5 (Requires >= 10)
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 9.5", homeCorners: 6, awayCorners: 4 }).isWon).toBe(true); // 10 corners -> WON
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 9.5", homeCorners: 5, awayCorners: 4 }).isWon).toBe(false); // 9 corners -> LOST

    // Over 10.5 (Requires >= 11)
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 10.5", homeCorners: 7, awayCorners: 4 }).isWon).toBe(true); // 11 corners -> WON
    expect(evaluateMarketResult("Córners", 0, 0, { selection: "Over 10.5", homeCorners: 6, awayCorners: 4 }).isWon).toBe(false); // 10 corners -> LOST
  });

  // 8. Single Corner Recommendation per Fixture
  it("ensures exactly ONE recommended candidate is produced per fixture", () => {
    const engine = new CornerLineSelectionEngine();
    const mockDist = {
      expected_home_corners: 6.0,
      expected_away_corners: 4.8,
      expected_total_corners: 10.8,
      distribution_model: "Negative Binomial" as const,
      data_quality: 0.88,
      simulations_count: 20000,
      probabilities: { 6.5: 0.91, 7.5: 0.85, 8.5: 0.78, 9.5: 0.69, 10.5: 0.58 },
      simulated_histogram: {},
    };

    const result = engine.evaluateFixture({
      homeTeam: "Tottenham",
      awayTeam: "Aston Villa",
      league: "Premier League",
      distribution: mockDist,
      oddsByLine: {
        6.5: 1.25,
        7.5: 1.40,
        8.5: 1.62,
        9.5: 1.95,
        10.5: 2.30,
      },
    });

    expect(result.status).toBe("SIGNAL");
    expect(result.recommended_candidate).toBeDefined();
    // Exactly one recommended candidate
    expect(typeof result.recommended_candidate?.line).toBe("number");
    expect(["Over 6.5", "Over 7.5", "Over 8.5", "Over 9.5", "Over 10.5"]).toContain(result.recommended_candidate?.selection);
  });
});