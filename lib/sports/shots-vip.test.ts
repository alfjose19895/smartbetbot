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
    expect(pick.pickBadge).toBe("shots_vip");
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
});
