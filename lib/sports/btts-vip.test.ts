import { describe, it, expect } from "vitest";
import {
  saveBttsVipSnapshotAsync,
  loadBttsVipSnapshot,
  getBttsVipSlate,
} from "./btts-vip-server";
import { MarketOpportunity } from "./prediction-engine";
import { isSportMatch, evaluateMarketResult, isCuratedLeague } from "./db";

describe("Ambos Anotan VIP Module Suite (Decoupled, Strict Prob >= 58%)", () => {
  const mockBttsPick: MarketOpportunity = {
    fixtureId: 777101,
    match: "Liverpool vs Newcastle",
    homeTeam: "Liverpool",
    awayTeam: "Newcastle",
    league: "Premier League",
    country: "Inglaterra",
    kickoff: "2026-10-24T20:00:00.000Z",
    market: "Ambos Equipos Anotan",
    selection: "Sí",
    odds: 1.62,
    fairOdds: 1.48,
    probability: 63.5,
    edge: 11.2,
    expectedValue: 0.112,
    confidence: "Alta",
    smartScore: 91,
    status: "pending",
    explanation: "Ambos equipos superan 1.4 xG individual y registran 80% de partidos recientes anotando.",
    isBttsVip: true,
    pickBadge: "btts_vip",
    vipBadge: "Ambos Anotan VIP",
  };

  it("isolates btts_vip sport in isSportMatch correctly", () => {
    expect(isSportMatch(mockBttsPick, "btts_vip")).toBe(true);
    // Crucial: A btts_vip pick must NOT be identified as general football, corners_vip, or over25_vip
    expect(isSportMatch(mockBttsPick, "football")).toBe(false);
    expect(isSportMatch(mockBttsPick, "corners_vip")).toBe(false);
    expect(isSportMatch(mockBttsPick, "over25_vip")).toBe(false);
    expect(isSportMatch(mockBttsPick, "nhl")).toBe(false);
  });

  it("saves and loads btts_vip snapshot independently in memory/disk", async () => {
    const testDate = "2026-10-24";
    await saveBttsVipSnapshotAsync(testDate, [mockBttsPick], true);

    const loaded = loadBttsVipSnapshot(testDate);
    expect(loaded).toBeDefined();
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded!.length).toBe(1);

    const pick = loaded![0];
    expect(pick.market).toBe("Ambos Equipos Anotan");
    expect(pick.selection).toBe("Sí");
    expect(pick.isBttsVip).toBe(true);
    expect(pick.vipBadge).toBe("Ambos Anotan VIP");
    expect(pick.probability).toBeGreaterThanOrEqual(58.0);
  });

  it("evaluates Ambos Equipos Anotan market correctly as won when both teams score", () => {
    // 1-1 -> Both scored -> WON
    const evalWon = evaluateMarketResult("Ambos Equipos Anotan", 1, 1);
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("Ambos Sí");

    // 2-0 -> Only home scored -> LOST
    const evalLost = evaluateMarketResult("Ambos Equipos Anotan", 2, 0);
    expect(evalLost.isWon).toBe(false);
    expect(evalLost.actualScoreText).toContain("No");

    // 0-0 -> Neither scored -> LOST
    const evalLost2 = evaluateMarketResult("Ambos Equipos Anotan", 0, 0);
    expect(evalLost2.isWon).toBe(false);
    expect(evalLost2.actualScoreText).toContain("No");
  });

  it("getBttsVipSlate strictly enforces the >= 58% probability threshold", async () => {
    const testDate = "2026-10-24";
    const sub58Pick: MarketOpportunity = {
      ...mockBttsPick,
      fixtureId: 777102,
      probability: 54.0, // Fails strict threshold
      match: "Team X vs Team Y",
    };
    const valid58Pick: MarketOpportunity = {
      ...mockBttsPick,
      fixtureId: 777103,
      probability: 60.0, // Passes strict threshold
      match: "Team W vs Team Z",
    };

    await saveBttsVipSnapshotAsync(testDate, [sub58Pick, valid58Pick], true);
    const slate = await getBttsVipSlate(testDate);

    expect(slate).toBeDefined();
    expect(slate.predictions.some((p) => p.fixtureId === 777102)).toBe(false);
    expect(slate.predictions.some((p) => p.fixtureId === 777103)).toBe(true);
    expect(slate.predictions.every((p) => p.probability >= 58.0)).toBe(true);
    expect(slate.predictions.every((p) => p.isBttsVip === true)).toBe(true);

    // Restore clean snapshot
    await saveBttsVipSnapshotAsync(testDate, [mockBttsPick], true);
  });

  it("applies unified Gemini AI Veto audit to Ambos Anotan picks", async () => {
    const { auditPredictionsWithGeminiVeto } = await import("@/lib/ai/claude-analyst");
    const vetoResult = await auditPredictionsWithGeminiVeto([mockBttsPick], "football");
    expect(vetoResult).toBeDefined();
    expect(vetoResult.approvedPicks.length).toBeGreaterThan(0);
    const auditedPick = vetoResult.approvedPicks[0];
    expect(auditedPick.fixtureId).toBe(mockBttsPick.fixtureId);
    expect(auditedPick.explanation).toBeDefined();
  });

  it("enforces curated league filter on Ambos Anotan fixtures", () => {
    expect(isCuratedLeague(39, "Premier League", "England")).toBe(true);
    expect(isCuratedLeague(135, "Serie A", "Italy")).toBe(true);
    expect(isCuratedLeague(140, "La Liga", "Spain")).toBe(true);
    // Uncurated leagues are rejected
    expect(isCuratedLeague(186, "Ligue 1", "Algeria")).toBe(false);
  });
});
