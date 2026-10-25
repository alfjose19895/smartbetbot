import { describe, it, expect } from "vitest";
import {
  saveOver25VipSnapshotAsync,
  loadOver25VipSnapshot,
  getOver25VipSlate,
} from "./over25-vip-server";
import { MarketOpportunity } from "./prediction-engine";
import { isSportMatch, evaluateMarketResult, isCuratedLeague } from "./db";

describe("Over 2.5 VIP Module Suite (Decoupled, Strict Prob >= 60%)", () => {
  const mockOver25Pick: MarketOpportunity = {
    fixtureId: 888101,
    match: "Bayern Munich vs Borussia Dortmund",
    homeTeam: "Bayern Munich",
    awayTeam: "Borussia Dortmund",
    league: "Bundesliga",
    country: "Alemania",
    kickoff: "2026-10-24T17:30:00.000Z",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    odds: 1.55,
    fairOdds: 1.35,
    probability: 74.5,
    edge: 15.2,
    expectedValue: 0.152,
    confidence: "Muy Alta",
    smartScore: 94,
    status: "pending",
    explanation: "Alta cadencia ofensiva combinada (xG total 3.65) proyecta partido de alta anotación.",
    isOver25Vip: true,
    pickBadge: "over25_vip",
    vipBadge: "Over 2.5 VIP",
  };

  it("isolates over25_vip sport in isSportMatch correctly", () => {
    expect(isSportMatch(mockOver25Pick, "over25_vip")).toBe(true);
    // Crucial: An over25_vip pick must NOT be identified as a general football pick or corners_vip
    expect(isSportMatch(mockOver25Pick, "football")).toBe(false);
    expect(isSportMatch(mockOver25Pick, "corners_vip")).toBe(false);
    expect(isSportMatch(mockOver25Pick, "btts_vip")).toBe(false);
    expect(isSportMatch(mockOver25Pick, "nhl")).toBe(false);
  });

  it("saves and loads over25_vip snapshot independently in memory/disk", async () => {
    const testDate = "2026-10-24";
    await saveOver25VipSnapshotAsync(testDate, [mockOver25Pick], true);

    const loaded = loadOver25VipSnapshot(testDate);
    expect(loaded).toBeDefined();
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded!.length).toBe(1);

    const pick = loaded![0];
    expect(pick.market).toBe("Over 2.5 Goles");
    expect(pick.selection).toBe("Over 2.5");
    expect(pick.isOver25Vip).toBe(true);
    expect(pick.vipBadge).toBe("Over 2.5 VIP");
    expect(pick.probability).toBeGreaterThanOrEqual(60.0);
  });

  it("evaluates Over 2.5 Goles market correctly as won when total goals exceed 2.5", () => {
    // 2-1 = 3 goals -> WON
    const evalWon = evaluateMarketResult("Over 2.5 Goles", 2, 1);
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("3 Goles");

    // 1-1 = 2 goals -> LOST
    const evalLost = evaluateMarketResult("Over 2.5 Goles", 1, 1);
    expect(evalLost.isWon).toBe(false);
    expect(evalLost.actualScoreText).toContain("2 Goles");

    // 3-0 = 3 goals -> WON
    const evalWon2 = evaluateMarketResult("Over 2.5 Goles", 3, 0);
    expect(evalWon2.isWon).toBe(true);
    expect(evalWon2.actualScoreText).toContain("3 Goles");
  });

  it("getOver25VipSlate strictly enforces the >= 60% probability threshold", async () => {
    const testDate = "2026-10-24";
    const sub60Pick: MarketOpportunity = {
      ...mockOver25Pick,
      fixtureId: 888102,
      probability: 56.0, // Fails strict threshold
      match: "Team A vs Team B",
    };
    const valid60Pick: MarketOpportunity = {
      ...mockOver25Pick,
      fixtureId: 888103,
      probability: 63.0, // Passes strict threshold
      match: "Team C vs Team D",
    };

    await saveOver25VipSnapshotAsync(testDate, [sub60Pick, valid60Pick], true);
    const slate = await getOver25VipSlate(testDate);

    expect(slate).toBeDefined();
    expect(slate.predictions.some((p) => p.fixtureId === 888102)).toBe(false);
    expect(slate.predictions.some((p) => p.fixtureId === 888103)).toBe(true);
    expect(slate.predictions.every((p) => p.probability >= 60.0)).toBe(true);
    expect(slate.predictions.every((p) => p.isOver25Vip === true)).toBe(true);

    // Restore clean snapshot
    await saveOver25VipSnapshotAsync(testDate, [mockOver25Pick], true);
  });

  it("applies unified Gemini AI Veto audit to Over 2.5 picks", async () => {
    const { auditPredictionsWithGeminiVeto } = await import("@/lib/ai/claude-analyst");
    const vetoResult = await auditPredictionsWithGeminiVeto([mockOver25Pick], "football");
    expect(vetoResult).toBeDefined();
    expect(vetoResult.approvedPicks.length).toBeGreaterThan(0);
    const auditedPick = vetoResult.approvedPicks[0];
    expect(auditedPick.fixtureId).toBe(mockOver25Pick.fixtureId);
    expect(auditedPick.explanation).toBeDefined();
  });

  it("enforces curated league filter on Over 2.5 fixtures", () => {
    expect(isCuratedLeague(39, "Premier League", "England")).toBe(true);
    expect(isCuratedLeague(78, "Bundesliga", "Germany")).toBe(true);
    expect(isCuratedLeague(140, "La Liga", "Spain")).toBe(true);
    // Uncurated leagues are rejected
    expect(isCuratedLeague(202, "Ligue 1", "Tunisia")).toBe(false);
  });
});
