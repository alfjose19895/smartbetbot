import { describe, it, expect, vi } from "vitest";
import {
  loadAwayWinVipSnapshot,
  loadAwayWinVipSnapshotAsync,
  saveAwayWinVipSnapshotAsync,
  getAwayWinVipSlate,
} from "./away-win-vip-server";
import { MarketOpportunity } from "./prediction-engine";
import { isSportMatch, evaluateMarketResult, isCuratedLeague } from "./db";

describe("Ganador Visitante VIP Module Suite (Decoupled, Strict Prob >= 65%)", () => {
  const mockAwayWinPick: MarketOpportunity = {
    fixtureId: 888301,
    match: "Getafe vs Barcelona",
    homeTeam: "Getafe",
    awayTeam: "Barcelona",
    homeTeamId: 546,
    awayTeamId: 529,
    league: "La Liga",
    leagueId: 140,
    country: "Spain",
    kickoff: "2026-10-24T20:00:00Z",
    market: "Ganador Visitante",
    selection: "Barcelona",
    odds: 1.62,
    probability: 68.0,
    fairOdds: 1.47,
    edge: 4.1,
    expectedValue: 6.2,
    confidence: "Muy Alta",
    pickBadge: "valor",
    isElite: true,
    isDestacado: true,
    destacadoRule: "Ganador Visitante (≥ 65%)",
    smartScore: 88,
    explanation: "Alta convicción estadística y cuotas oficiales de casas de apuestas.",
    status: "pending",
  };

  it("ensures that Ganador Visitante VIP picks are tagged and decoupled from general football", async () => {
    const testDate = "2026-10-24";
    const saved = await saveAwayWinVipSnapshotAsync(testDate, [mockAwayWinPick], true);

    expect(saved).toBeDefined();
    expect(saved.length).toBe(1);
    const pick = saved[0];

    expect(pick.sport).toBe("away_win_vip");
    expect(pick.source).toBe("away_win_vip");
    expect(pick.isAwayWinVip).toBe(true);
    expect(pick.vipBadge).toBe("Ganador Visitante VIP");
    expect(pick.probability).toBeGreaterThanOrEqual(65.0);
  });

  it("evaluates Ganador Visitante market correctly as won when away goals exceed home goals", () => {
    const evalWon = evaluateMarketResult("Ganador Visitante", 0, 3, {
      selection: "Barcelona",
      homeTeam: "Getafe",
      awayTeam: "Barcelona",
    });
    expect(evalWon.isWon).toBe(true);
    expect(evalWon.actualScoreText).toContain("0 - 3");

    const evalLost = evaluateMarketResult("Ganador Visitante", 1, 1, {
      selection: "Barcelona",
      homeTeam: "Getafe",
      awayTeam: "Barcelona",
    });
    expect(evalLost.isWon).toBe(false);
  });

  it("getAwayWinVipSlate strictly enforces the >= 65% probability threshold", async () => {
    const testDate = "2026-10-24";
    const sub65Pick: MarketOpportunity = {
      ...mockAwayWinPick,
      fixtureId: 888302,
      probability: 61.0, // Fails strict threshold
      match: "Team A vs Team B",
    };
    const valid65Pick: MarketOpportunity = {
      ...mockAwayWinPick,
      fixtureId: 888303,
      probability: 69.0, // Passes strict threshold
      match: "Team C vs Team D",
    };

    await saveAwayWinVipSnapshotAsync(testDate, [sub65Pick, valid65Pick], true);
    const slate = await getAwayWinVipSlate(testDate);

    expect(slate).toBeDefined();
    expect(slate.predictions.some((p) => p.fixtureId === 888302)).toBe(false);
    expect(slate.predictions.some((p) => p.fixtureId === 888303)).toBe(true);
    expect(slate.predictions.every((p) => p.probability >= 65.0)).toBe(true);
    expect(slate.predictions.every((p) => p.isAwayWinVip === true)).toBe(true);

    // Clean up
    await saveAwayWinVipSnapshotAsync(testDate, [], true);
  });
});
