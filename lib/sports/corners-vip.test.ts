import { describe, it, expect, beforeEach } from "vitest";
import {
  saveCornersVipSnapshotAsync,
  loadCornersVipSnapshot,
  getCornersVipSlate,
} from "./corners-vip-server";
import { MarketOpportunity } from "./prediction-engine";
import { isSportMatch, evaluateMarketResult } from "./db";

describe("Corners VIP Module Suite", () => {
  const mockCornerPick: MarketOpportunity = {
    fixtureId: 999101,
    match: "Arsenal vs Chelsea",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    league: "Premier League",
    country: "Inglaterra",
    kickoff: "2026-10-17T19:00:00.000Z",
    market: "Córners",
    selection: "Over 8.5",
    odds: 1.65,
    fairOdds: 1.45,
    probability: 72,
    edge: 13.8,
    expectedValue: 0.138,
    confidence: "Muy Alta",
    smartScore: 92,
    status: "pending",
    explanation: "Alta cadencia de ataques laterales proyecta más de 8.5 saques de esquina.",
    isCornersVip: true,
    pickBadge: "corners_vip",
    vipBadge: "Corners VIP",
    cornerAnalysis: {
      expectedTotalCorners: 10.4,
      expectedHomeCorners: 6.2,
      expectedAwayCorners: 4.2,
      distributionModel: "Bivariate Negative Binomial",
      dataQuality: 0.85,
      allCandidates: [],
      recommendedLine: 8.5,
    },
  };

  it("isolates corners_vip sport in isSportMatch correctly", () => {
    expect(isSportMatch(mockCornerPick, "corners_vip")).toBe(true);
    // Crucial: A corners_vip pick must NOT be identified as a general football pick to prevent cross-overwrites
    expect(isSportMatch(mockCornerPick, "football")).toBe(false);
    expect(isSportMatch(mockCornerPick, "nhl")).toBe(false);
  });

  it("saves and loads corners_vip snapshot independently in memory/disk", async () => {
    const testDate = "2026-10-17";
    await saveCornersVipSnapshotAsync(testDate, [mockCornerPick], true);

    const loaded = loadCornersVipSnapshot(testDate);
    expect(loaded).toBeDefined();
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded!.length).toBe(1);

    const pick = loaded![0];
    expect(pick.market).toBe("Córners");
    expect(pick.selection).toBe("Over 8.5");
    expect(pick.isCornersVip).toBe(true);
    expect(pick.pickBadge).toBe("corners_vip");
    expect(pick.vipBadge).toBe("Corners VIP");
  });

  it("evaluates corner market correctly as won when total corners exceed line", () => {
    const evalWon = evaluateMarketResult("Córners", 0, 0, {
      selection: "Over 8.5",
      homeCorners: 6,
      awayCorners: 4,
    });
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("10 Córners");

    const evalLost = evaluateMarketResult("Córners", 0, 0, {
      selection: "Over 8.5",
      homeCorners: 4,
      awayCorners: 4,
    });
    expect(evalLost.isWon).toBe(false);
    expect(evalLost.actualScoreText).toContain("8 Córners");
  });

  it("getCornersVipSlate retrieves sanitized corner-only opportunities", async () => {
    const slate = await getCornersVipSlate("2026-10-17");
    expect(slate).toBeDefined();
    expect(slate.count).toBeGreaterThanOrEqual(1);
    expect(slate.predictions.every((p) => p.market === "Córners" || p.selection.includes("Córner"))).toBe(true);
    expect(slate.predictions.every((p) => p.isCornersVip === true)).toBe(true);
    expect(slate.stats.total).toBeGreaterThanOrEqual(1);
  });
});
