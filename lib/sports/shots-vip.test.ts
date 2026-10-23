import { describe, it, expect } from "vitest";
import {
  saveShotsVipSnapshotAsync,
  loadShotsVipSnapshot,
  getShotsVipSlate,
  evaluateFixtureShotsPrediction,
} from "./shots-vip-server";
import { MarketOpportunity } from "./prediction-engine";
import { isSportMatch, evaluateMarketResult } from "./db";

describe("Shots VIP (Disparos VIP) Module Suite", () => {
  const mockShotPick: MarketOpportunity = {
    fixtureId: 777101,
    match: "Liverpool vs Manchester City",
    homeTeam: "Liverpool",
    awayTeam: "Manchester City",
    league: "Premier League",
    country: "Inglaterra",
    kickoff: "2026-10-17T20:30:00.000Z",
    market: "Tiros a Puerta",
    selection: "Over 8.5 Tiros a Puerta",
    odds: 1.68,
    fairOdds: 1.44,
    probability: 69.5,
    edge: 16.6,
    expectedValue: 0.166,
    confidence: "Alta",
    smartScore: 91,
    status: "pending",
    explanation: "Duelo de alta posesión y ritmo ofensivo vertical con proyección superior a 8.5 tiros al arco.",
    isShotsVip: true,
    pickBadge: "shots_vip",
    vipBadge: "Disparos VIP",
  };

  it("isolates shots_vip sport in isSportMatch correctly", () => {
    expect(isSportMatch(mockShotPick, "shots_vip")).toBe(true);
    // Crucial: shots_vip must NOT be classified as general football to maintain isolated snapshots
    expect(isSportMatch(mockShotPick, "football")).toBe(false);
    expect(isSportMatch(mockShotPick, "corners_vip")).toBe(false);
    expect(isSportMatch(mockShotPick, "cards_vip")).toBe(false);
  });

  it("saves and loads shots_vip snapshot independently in disk/memory", async () => {
    const testDate = "2099-01-01";
    await saveShotsVipSnapshotAsync(testDate, [mockShotPick], true);

    const loaded = loadShotsVipSnapshot(testDate);
    expect(loaded).toBeDefined();
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded!.length).toBe(1);

    const pick = loaded![0];
    expect(pick.market).toBe("Tiros a Puerta");
    expect(pick.selection).toBe("Over 8.5 Tiros a Puerta");
    expect(pick.isShotsVip).toBe(true);
    expect(["shots_vip", "valor", "elite"]).toContain(pick.pickBadge);
    expect(pick.vipBadge).toBe("Disparos VIP");
  });

  it("evaluates shots on goal market correctly based on real shot statistics", () => {
    const evalWon = evaluateMarketResult("Tiros a Puerta", 2, 2, {
      selection: "Over 8.5 Tiros a Puerta",
      homeShotsOnGoal: 5,
      awayShotsOnGoal: 4,
    });
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("9 Tiros a Puerta");

    const evalLost = evaluateMarketResult("Tiros a Puerta", 1, 0, {
      selection: "Over 8.5 Tiros a Puerta",
      homeShotsOnGoal: 4,
      awayShotsOnGoal: 3,
    });
    expect(evalLost.isWon).toBe(false);
    expect(evalLost.actualScoreText).toContain("7 Tiros a Puerta");
  });

  it("evaluates total shots market correctly based on real total shot counts", () => {
    const evalWon = evaluateMarketResult("Disparos", 2, 1, {
      selection: "Over 21.5 Disparos Totales",
      homeTotalShots: 13,
      awayTotalShots: 10,
    });
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("23 Disparos");

    const evalLost = evaluateMarketResult("Disparos", 1, 1, {
      selection: "Over 21.5 Disparos Totales",
      homeTotalShots: 10,
      awayTotalShots: 9,
    });
    expect(evalLost.isWon).toBe(false);
    expect(evalLost.actualScoreText).toContain("19 Disparos");
  });

  it("getShotsVipSlate retrieves sanitized shot-only opportunities with VIP badges", async () => {
    const slate = await getShotsVipSlate("2099-01-01");
    expect(slate).toBeDefined();
    expect(slate.count).toBeGreaterThanOrEqual(1);
    expect(
      slate.predictions.every(
        (p) =>
          p.market === "Disparos" ||
          p.market === "Tiros a Puerta" ||
          p.selection.includes("Disparo") ||
          p.selection.includes("Tiro")
      )
    ).toBe(true);
    expect(slate.predictions.every((p) => p.isShotsVip === true)).toBe(true);
    expect(slate.stats.total).toBeGreaterThanOrEqual(1);
  });

  it("strictly filters out Under shot selections, permitting exclusively Over", async () => {
    const testDate = "2099-01-01";
    const underPick: MarketOpportunity = {
      ...mockShotPick,
      fixtureId: 777102,
      selection: "Under 8.5 Tiros a Puerta",
    };
    const overPick: MarketOpportunity = {
      ...mockShotPick,
      fixtureId: 777103,
      selection: "Over 8.5 Tiros a Puerta",
    };

    await saveShotsVipSnapshotAsync(testDate, [underPick, overPick], true);
    const slate = await getShotsVipSlate(testDate);
    expect(slate.predictions.some((p) => p.fixtureId === 777102)).toBe(false);
    expect(slate.predictions.some((p) => p.fixtureId === 777103)).toBe(true);
    expect(slate.predictions.every((p) => !p.selection.toLowerCase().includes("under"))).toBe(true);

    // Restore clean snapshot
    await saveShotsVipSnapshotAsync(testDate, [mockShotPick], true);
  });

  it("evaluateFixtureShotsPrediction rejects low-volume matches without sufficient shots expectation", () => {
    const opps = evaluateFixtureShotsPrediction({
      fixtureId: 999111,
      homeTeam: "Defensive Team A",
      awayTeam: "Defensive Team B",
      league: "Lowland League",
      country: "Scotland",
      kickoff: "2026-10-18T15:00:00Z",
    });
    // Expected to be empty because low team ratings and low league base lambda do not meet the minimum threshold
    expect(opps.length).toBe(0);
  });

  it("evaluateFixtureShotsPrediction evaluates high-volume clashes in top leagues with strictly positive EV", () => {
    const opps = evaluateFixtureShotsPrediction({
      fixtureId: 999222,
      homeTeam: "Manchester City",
      awayTeam: "Liverpool",
      league: "Premier League",
      country: "England",
      kickoff: "2026-10-18T17:30:00Z",
      marketOdds: {
        shotsOnGoalOver75: 1.55,
        totalShotsOver215: 1.60,
      } as any,
    });
    expect(opps.length).toBeGreaterThan(0);
    expect(opps.every((o) => o.odds >= 1.25 && o.odds <= 1.95)).toBe(true);
    expect(opps.every((o) => o.probability >= 55)).toBe(true);
    expect(opps.every((o) => o.selection.toLowerCase().includes("over"))).toBe(true);
    expect(opps.every((o) => !o.selection.toLowerCase().includes("under"))).toBe(true);
  });

  it("discards real bookmaker odds when they represent severe subpayment (edge < -5%)", () => {
    const opps = evaluateFixtureShotsPrediction({
      fixtureId: 999333,
      homeTeam: "Everton",
      awayTeam: "Fulham",
      league: "Premier League",
      country: "England",
      kickoff: "2026-10-18T17:30:00Z",
      marketOdds: {
        // Severe subpayment: odd of 1.30 when fair odds are ~1.55 (edge ~ -16%)
        shotsOnGoalOver85: 1.30,
      } as any,
    });
    // Over 8.5 should be discarded due to negative EV
    expect(opps.some((o) => o.selection.includes("Over 8.5 Tiros a Puerta"))).toBe(false);
  });

  it("evaluates real dynamic bookmaker lines for total shots and shots on goal instead of fixed 21.5", () => {
    const opps = evaluateFixtureShotsPrediction({
      fixtureId: 999444,
      homeTeam: "Manchester City",
      awayTeam: "Arsenal",
      league: "Premier League",
      country: "England",
      kickoff: "2026-10-24T16:00:00Z",
      marketOdds: {
        totalShotsLines: {
          25.5: { over: 1.55, under: 2.35 },
          27.5: { over: 1.95, under: 1.80 },
          29.5: { over: 2.50, under: 1.50 },
        },
        shotsOnGoalLines: {
          8.5: { over: 1.45, under: 2.60 },
          9.5: { over: 1.82, under: 1.95 },
          10.5: { over: 2.30, under: 1.55 },
        },
      } as any,
    });

    expect(opps.length).toBeGreaterThan(0);
    // Verified that predictions reflect the real bookmaker lines (e.g. 25.5, 27.5, 8.5, 9.5) and NOT forced 21.5
    expect(opps.some((o) => o.selection.includes("25.5") || o.selection.includes("27.5"))).toBe(true);
    expect(opps.some((o) => o.selection.includes("8.5") || o.selection.includes("9.5"))).toBe(true);
    expect(opps.every((o) => !o.selection.includes("21.5"))).toBe(true);
  });

  it("strictly rejects matches without real bookmaker odds, never fabricating artificial odds", () => {
    const opps = evaluateFixtureShotsPrediction({
      fixtureId: 999555,
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      country: "Spain",
      kickoff: "2026-10-24T20:00:00Z",
      // No market odds provided
      marketOdds: {} as any,
    });
    // Must strictly return empty - no fake fabricated odds or default Over 21.5
    expect(opps.length).toBe(0);
  });

  it("extracts real lines dynamically from Bet 87 (Total ShotOnGoal) and Bet 211 (Total Shots)", async () => {
    const { extractMarketOddsFromBookmaker } = await import("./api-football");
    const mockOddsItem = {
      fixture: { id: 888101 },
      bookmakers: [
        {
          id: 6,
          name: "Bwin",
          bets: [
            {
              id: 87,
              name: "Total ShotOnGoal",
              values: [
                { value: "Over 8.5", odd: "1.45" },
                { value: "Under 8.5", odd: "2.55" },
                { value: "Over 9.5", odd: "1.85" },
                { value: "Under 9.5", odd: "1.90" },
              ],
            },
            {
              id: 211,
              name: "Total Shots",
              values: [
                { value: "Over 26.5", odd: "1.72" },
                { value: "Under 26.5", odd: "2.05" },
                { value: "Over 28.5", odd: "2.20" },
                { value: "Under 28.5", odd: "1.60" },
              ],
            },
          ],
        },
      ],
    };

    const extracted = extractMarketOddsFromBookmaker(mockOddsItem as any);
    expect(extracted.shotsOnGoalLines).toBeDefined();
    expect(extracted.shotsOnGoalLines?.[8.5]?.over).toBe(1.45);
    expect(extracted.shotsOnGoalLines?.[9.5]?.over).toBe(1.85);

    expect(extracted.totalShotsLines).toBeDefined();
    expect(extracted.totalShotsLines?.[26.5]?.over).toBe(1.72);
    expect(extracted.totalShotsLines?.[28.5]?.over).toBe(2.20);
  });
});

