import { describe, it, expect, vi } from "vitest";
import {
  loadHomeWinVipSnapshot,
  loadHomeWinVipSnapshotAsync,
  saveHomeWinVipSnapshotAsync,
  getHomeWinVipSlate,
} from "./home-win-vip-server";
import { MarketOpportunity } from "./prediction-engine";
import { isSportMatch, evaluateMarketResult, isCuratedLeague } from "./db";

describe("Ganador Local VIP Module Suite (Decoupled, Strict Prob >= 58%)", () => {
  const mockHomeWinPick: MarketOpportunity = {
    fixtureId: 888201,
    match: "Real Madrid vs Valencia",
    homeTeam: "Real Madrid",
    awayTeam: "Valencia",
    homeTeamId: 541,
    awayTeamId: 532,
    league: "La Liga",
    leagueId: 140,
    country: "Spain",
    kickoff: "2026-10-24T19:00:00Z",
    market: "Ganador Local",
    selection: "Real Madrid",
    odds: 1.55,
    probability: 64.0,
    fairOdds: 1.56,
    edge: 3.2,
    expectedValue: 4.5,
    confidence: "Alta",
    pickBadge: "valor",
    isElite: true,
    isDestacado: true,
    destacadoRule: "Ganador Local (≥ 58%)",
    smartScore: 88,
    explanation: "Alta convicción estadística y cuotas oficiales de casas de apuestas.",
    status: "pending",
  };

  it("ensures that Ganador Local VIP picks are tagged and decoupled from general football", async () => {
    const testDate = "2026-10-24";
    const saved = await saveHomeWinVipSnapshotAsync(testDate, [mockHomeWinPick], true);

    expect(saved).toBeDefined();
    expect(saved.length).toBe(1);
    const pick = saved[0];

    expect(pick.sport).toBe("home_win_vip");
    expect(pick.source).toBe("home_win_vip");
    expect(pick.isHomeWinVip).toBe(true);
    expect(pick.vipBadge).toBe("Ganador Local VIP");
    expect(pick.probability).toBeGreaterThanOrEqual(58.0);
  });

  it("evaluates Ganador Local market correctly as won when home goals exceed away goals", () => {
    const evalWon = evaluateMarketResult("Ganador Local", 2, 0, {
      selection: "Real Madrid",
      homeTeam: "Real Madrid",
      awayTeam: "Valencia",
    });
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("2 - 0");

    const evalLost = evaluateMarketResult("Ganador Local", 1, 1, {
      selection: "Real Madrid",
      homeTeam: "Real Madrid",
      awayTeam: "Valencia",
    });
    expect(evalLost.isWon).toBe(false);
  });

  it("getHomeWinVipSlate strictly enforces the >= 58% probability threshold", async () => {
    const testDate = "2026-10-24";
    const sub58Pick: MarketOpportunity = {
      ...mockHomeWinPick,
      fixtureId: 888202,
      probability: 52.0, // Fails strict threshold
      match: "Team A vs Team B",
    };
    const valid58Pick: MarketOpportunity = {
      ...mockHomeWinPick,
      fixtureId: 888203,
      probability: 61.0, // Passes strict threshold
      match: "Team C vs Team D",
    };

    await saveHomeWinVipSnapshotAsync(testDate, [sub58Pick, valid58Pick], true);
    const slate = await getHomeWinVipSlate(testDate);

    expect(slate).toBeDefined();
    expect(slate.predictions.some((p) => p.fixtureId === 888202)).toBe(false);
    expect(slate.predictions.some((p) => p.fixtureId === 888203)).toBe(true);
    expect(slate.predictions.every((p) => p.probability >= 58.0)).toBe(true);
    expect(slate.predictions.every((p) => p.isHomeWinVip === true)).toBe(true);

    // Clean up
    await saveHomeWinVipSnapshotAsync(testDate, [], true);
  });
});
