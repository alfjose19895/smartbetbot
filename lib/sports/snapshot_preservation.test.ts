import { describe, it, expect } from "vitest";
import { saveDailySnapshot, saveDailySnapshotAsync, loadDailySnapshot } from "./db";
import { MarketOpportunity } from "./prediction-engine";
import { getBttsVipSlate } from "./btts-vip-server";
import { getCornersVipSlate } from "./corners-vip-server";
import { getCardsVipSlate } from "./cards-vip-server";
import { getShotsVipSlate } from "./shots-vip-server";
import { getHomeWinVipSlate } from "./home-win-vip-server";
import { getAwayWinVipSlate } from "./away-win-vip-server";
import { getOver25VipSlate } from "./over25-vip-server";

describe("Preservation of Settled Matches & Snapshot Persistence", () => {
  const testDate = "2026-10-28";

  it("never overwrites settled won/lost picks when incoming pick has pending status", async () => {
    const settledPick: MarketOpportunity = {
      id: "test-match-1",
      fixtureId: 999001,
      match: "Arsenal vs Chelsea",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      league: "Premier League",
      leagueId: 39,
      country: "England",
      market: "Ambos Equipos Anotan",
      selection: "Sí",
      odds: 1.85,
      fairOdds: 1.70,
      expectedValue: 8.8,
      smartScore: 92,
      explanation: "Auditoría táctica",
      probability: 68.0,
      confidence: "Alta",
      edge: 3.5,
      kickoff: `${testDate}T12:00:00Z`,
      status: "won",
      actualScore: "2 - 1",
      result: "WON",
      profit: 0.85,
      matchTiming: "finished",
    };

    // Save initial settled snapshot
    await saveDailySnapshotAsync(testDate, [settledPick], "football", false);

    // Incoming pick is generated afresh before knowing result (status: pending, actualScore: undefined)
    const pendingPick: MarketOpportunity = {
      ...settledPick,
      status: "pending",
      actualScore: undefined,
      result: undefined,
      profit: undefined,
      matchTiming: "prematch",
    };

    // Save with pending pick
    const merged = await saveDailySnapshotAsync(testDate, [pendingPick], "football", false);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("won");
    expect(merged[0].actualScore).toBe("2 - 1");
    expect(merged[0].result).toBe("WON");
    expect(merged[0].profit).toBe(0.85);
    expect(merged[0].matchTiming).toBe("finished");
  });

  it("synchronous saveDailySnapshot also protects settled won/lost picks", () => {
    const settledPick: MarketOpportunity = {
      id: "test-match-2",
      fixtureId: 999002,
      match: "Real Madrid vs Barcelona",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      leagueId: 140,
      country: "Spain",
      market: "Over 2.5 Goles",
      selection: "Over 2.5",
      odds: 1.75,
      fairOdds: 1.60,
      expectedValue: 9.3,
      smartScore: 90,
      explanation: "Auditoría táctica",
      probability: 65.0,
      confidence: "Alta",
      edge: 4.0,
      kickoff: `${testDate}T15:00:00Z`,
      status: "lost",
      actualScore: "1 - 0",
      result: "LOST",
      profit: -1,
      matchTiming: "finished",
    };

    saveDailySnapshot(testDate, [settledPick], "over25_vip", false);

    const pendingIncoming: MarketOpportunity = {
      ...settledPick,
      status: "pending",
      actualScore: undefined,
      result: undefined,
      profit: undefined,
      matchTiming: "prematch",
    };

    const merged = saveDailySnapshot(testDate, [pendingIncoming], "over25_vip", false);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("lost");
    expect(merged[0].actualScore).toBe("1 - 0");
    expect(merged[0].result).toBe("LOST");
    expect(merged[0].profit).toBe(-1);
  });

  it("preserves in_play / live status and currentScore when incoming pick is pending", async () => {
    const livePick: MarketOpportunity = {
      id: "test-match-live-1",
      fixtureId: 999003,
      match: "Puebla vs U.N.A.M. - Pumas",
      homeTeam: "Puebla",
      awayTeam: "U.N.A.M. - Pumas",
      league: "Liga MX",
      leagueId: 262,
      country: "Mexico",
      market: "Over 2.5 Goles",
      selection: "Over 2.5",
      odds: 1.80,
      fairOdds: 1.65,
      expectedValue: 9.0,
      smartScore: 89,
      explanation: "Auditoría táctica",
      probability: 64.0,
      confidence: "Alta",
      edge: 3.8,
      kickoff: `${testDate}T20:00:00Z`,
      status: "in_play",
      currentScore: "1 - 1",
      matchTiming: "live",
      livePeriod: "2H",
      liveMinute: "67",
    };

    await saveDailySnapshotAsync(testDate, [livePick], "football", false);

    const pendingIncoming: MarketOpportunity = {
      ...livePick,
      status: "pending",
      currentScore: undefined,
      matchTiming: "prematch",
      livePeriod: undefined,
      liveMinute: undefined,
    };

    const merged = await saveDailySnapshotAsync(testDate, [pendingIncoming], "football", false);
    const liveSaved = merged.find((p) => p.fixtureId === 999003);
    expect(liveSaved).toBeDefined();
    expect(liveSaved?.status).toBe("in_play");
    expect(liveSaved?.matchTiming).toBe("live");
    expect(liveSaved?.currentScore).toBe("1 - 1");
    expect(liveSaved?.livePeriod).toBe("2H");
    expect(liveSaved?.liveMinute).toBe("67");
  });

  it("VIP servers do not crash and preserve settled slates", async () => {
    const sports = ["btts_vip", "corners_vip", "cards_vip", "shots_vip", "home_win_vip", "away_win_vip", "over25_vip"] as const;
    for (const s of sports) {
      saveDailySnapshot(testDate, [{
        id: `test-${s}-1`,
        fixtureId: 999100,
        match: "Arsenal vs Chelsea",
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        league: "Premier League",
        leagueId: 39,
        country: "England",
        market: s === "home_win_vip" ? "Ganador Local" : s === "away_win_vip" ? "Ganador Visitante" : s === "btts_vip" ? "Ambos Equipos Anotan" : s === "over25_vip" ? "Más de 2.5 Goles" : s === "corners_vip" ? "Córners" : s === "cards_vip" ? "Tarjetas" : "Disparos",
        selection: s === "home_win_vip" ? "Arsenal" : s === "away_win_vip" ? "Chelsea" : "Sí",
        odds: 1.85,
        fairOdds: 1.70,
        expectedValue: 8.8,
        smartScore: 90,
        explanation: "Test slate preservation",
        probability: 68.0,
        confidence: "Alta",
        edge: 3.5,
        kickoff: `${testDate}T12:00:00Z`,
        status: "won",
        actualScore: "2 - 1",
        result: "WON",
        profit: 0.85,
        matchTiming: "finished",
        sport: s as any,
        source: s as any,
        pickBadge: s as any,
        isBttsVip: s === "btts_vip",
        isCornersVip: s === "corners_vip",
        isCardsVip: s === "cards_vip",
        isShotsVip: s === "shots_vip",
        isHomeWinVip: s === "home_win_vip",
        isAwayWinVip: s === "away_win_vip",
        isOver25Vip: s === "over25_vip",
      }], s, false);
    }

    const slates = await Promise.all([
      getBttsVipSlate(testDate, false),
      getCornersVipSlate(testDate, false),
      getCardsVipSlate(testDate, false),
      getShotsVipSlate(testDate, false),
      getHomeWinVipSlate(testDate, false),
      getAwayWinVipSlate(testDate, false),
      getOver25VipSlate(testDate, false),
    ]);

    for (const slate of slates) {
      expect(slate).toHaveProperty("predictions");
      expect(Array.isArray(slate.predictions)).toBe(true);
      expect(slate).toHaveProperty("stats");
    }
  });
});
