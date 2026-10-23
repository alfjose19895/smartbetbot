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
    expect(["valor", "elite", "corners_vip"]).toContain(pick.pickBadge);
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

  it("applies unified Gemini AI Veto audit to corners picks", async () => {
    const { auditPredictionsWithGeminiVeto } = await import("@/lib/ai/claude-analyst");
    const vetoResult = await auditPredictionsWithGeminiVeto([mockCornerPick], "football");
    expect(vetoResult).toBeDefined();
    expect(vetoResult.approvedPicks.length).toBeGreaterThan(0);
    const auditedPick = vetoResult.approvedPicks[0];
    expect(auditedPick.fixtureId).toBe(mockCornerPick.fixtureId);
    expect(auditedPick.explanation).toBeDefined();
  });

  it("strictly filters out Under corner selections, permitting exclusively Over", async () => {
    const testDate = "2026-10-17";
    const underPick: MarketOpportunity = {
      ...mockCornerPick,
      fixtureId: 999102,
      selection: "Under 9.5",
    };
    const overPick: MarketOpportunity = {
      ...mockCornerPick,
      fixtureId: 999103,
      selection: "Over 8.5",
    };

    await saveCornersVipSnapshotAsync(testDate, [underPick, overPick], true);
    const slate = await getCornersVipSlate(testDate);
    expect(slate.predictions.some((p) => p.fixtureId === 999102)).toBe(false);
    expect(slate.predictions.some((p) => p.fixtureId === 999103)).toBe(true);
    expect(slate.predictions.every((p) => !p.selection.toLowerCase().includes("under"))).toBe(true);

    // Restore clean snapshot
    await saveCornersVipSnapshotAsync(testDate, [mockCornerPick], true);
  });

  it("enforces league tiers and rejects uncurated leagues like Tunisia or Algeria from Corners VIP", async () => {
    const { normalizeLeagueInfo } = await import("./prediction-engine");
    const { isCuratedLeague } = await import("./db");

    // Normalization verification
    const tunisiaInfo = normalizeLeagueInfo("Ligue 1", "Tunisia");
    expect(tunisiaInfo.country).toBe("Túnez");
    expect(tunisiaInfo.tier).toBe(4);
    expect(tunisiaInfo.country).not.toBe("Francia");

    const algeriaInfo = normalizeLeagueInfo("Ligue 1", "Algeria");
    expect(algeriaInfo.country).toBe("Argelia");
    expect(algeriaInfo.tier).toBe(4);
    expect(algeriaInfo.country).not.toBe("Francia");

    const cafInfo = normalizeLeagueInfo("CAF Champions League", "Africa");
    expect(cafInfo.tier).toBe(3);
    expect(cafInfo.tier).not.toBe(1);

    const afcInfo = normalizeLeagueInfo("AFC Challenge League", "Asia");
    expect(afcInfo.tier).toBe(4);

    // Curated league check
    expect(isCuratedLeague(202, "Ligue 1", "Tunisia")).toBe(false);
    expect(isCuratedLeague(186, "Ligue 1", "Algeria")).toBe(false);
    expect(isCuratedLeague(39, "Premier League", "England")).toBe(true);
    expect(isCuratedLeague(135, "Serie A", "Italy")).toBe(true);
    expect(isCuratedLeague(140, "La Liga", "Spain")).toBe(true);
  });
});
