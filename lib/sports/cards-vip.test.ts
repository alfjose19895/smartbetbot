import { describe, it, expect } from "vitest";
import {
  saveCardsVipSnapshotAsync,
  loadCardsVipSnapshot,
  getCardsVipSlate,
} from "./cards-vip-server";
import { MarketOpportunity } from "./prediction-engine";
import { isSportMatch, evaluateMarketResult } from "./db";

describe("Cards VIP (Tarjetas VIP) Module Suite", () => {
  const mockCardPick: MarketOpportunity = {
    fixtureId: 888101,
    match: "Sevilla vs Betis",
    homeTeam: "Sevilla",
    awayTeam: "Betis",
    league: "La Liga",
    country: "España",
    kickoff: "2026-10-17T20:00:00.000Z",
    market: "Tarjetas",
    selection: "Over 4.5 Tarjetas",
    odds: 1.72,
    fairOdds: 1.48,
    probability: 68,
    edge: 16.2,
    expectedValue: 0.162,
    confidence: "Alta",
    smartScore: 90,
    status: "pending",
    explanation: "Derbi sevillano de alta tensión con árbitro riguroso proyecta más de 4.5 tarjetas.",
    isCardsVip: true,
    pickBadge: "cards_vip",
    vipBadge: "Tarjetas VIP",
  };

  it("isolates cards_vip sport in isSportMatch correctly", () => {
    expect(isSportMatch(mockCardPick, "cards_vip")).toBe(true);
    // Crucial: cards_vip must NOT be classified as general football to maintain isolated snapshots
    expect(isSportMatch(mockCardPick, "football")).toBe(false);
    expect(isSportMatch(mockCardPick, "corners_vip")).toBe(false);
    expect(isSportMatch(mockCardPick, "shots_vip")).toBe(false);
  });

  it("saves and loads cards_vip snapshot independently in disk/memory", async () => {
    const testDate = "2099-01-01";
    await saveCardsVipSnapshotAsync(testDate, [mockCardPick], true);

    const loaded = loadCardsVipSnapshot(testDate);
    expect(loaded).toBeDefined();
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded!.length).toBe(1);

    const pick = loaded![0];
    expect(pick.market).toBe("Tarjetas");
    expect(pick.selection).toBe("Over 4.5 Tarjetas");
    expect(pick.isCardsVip).toBe(true);
    expect(pick.pickBadge).toBe("cards_vip");
    expect(pick.vipBadge).toBe("Tarjetas VIP");
  });

  it("evaluates card market correctly based on real card counts", () => {
    const evalWon = evaluateMarketResult("Tarjetas", 2, 1, {
      selection: "Over 4.5 Tarjetas",
      homeCards: 3,
      awayCards: 2,
    });
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("5 Tarjetas");

    const evalLost = evaluateMarketResult("Tarjetas", 1, 0, {
      selection: "Over 4.5 Tarjetas",
      homeCards: 2,
      awayCards: 1,
    });
    expect(evalLost.isWon).toBe(false);
    expect(evalLost.actualScoreText).toContain("3 Tarjetas");
  });

  it("getCardsVipSlate retrieves sanitized card-only opportunities with VIP badges", async () => {
    const slate = await getCardsVipSlate("2099-01-01");
    expect(slate).toBeDefined();
    expect(slate.count).toBeGreaterThanOrEqual(1);
    expect(slate.predictions.every((p) => p.market === "Tarjetas" || p.selection.includes("Tarjeta"))).toBe(true);
    expect(slate.predictions.every((p) => p.isCardsVip === true)).toBe(true);
    expect(slate.stats.total).toBeGreaterThanOrEqual(1);
  });

  it("strictly filters out Under card selections, permitting exclusively Over", async () => {
    const testDate = "2099-01-01";
    const underPick: MarketOpportunity = {
      ...mockCardPick,
      fixtureId: 888102,
      selection: "Under 4.5 Tarjetas",
    };
    const overPick: MarketOpportunity = {
      ...mockCardPick,
      fixtureId: 888103,
      selection: "Over 3.5 Tarjetas",
    };

    await saveCardsVipSnapshotAsync(testDate, [underPick, overPick], true);
    const slate = await getCardsVipSlate(testDate);
    expect(slate.predictions.some((p) => p.fixtureId === 888102)).toBe(false);
    expect(slate.predictions.some((p) => p.fixtureId === 888103)).toBe(true);
    expect(slate.predictions.every((p) => !p.selection.toLowerCase().includes("under"))).toBe(true);

    // Restore clean snapshot
    await saveCardsVipSnapshotAsync(testDate, [mockCardPick], true);
  });
});
