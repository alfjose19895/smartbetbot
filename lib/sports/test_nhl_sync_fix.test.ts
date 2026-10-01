import { describe, it, expect } from "vitest";
import { NHLSyncEngine } from "./nhl/nhl-sync";
import { NHLStrategyEngine } from "./nhl/nhl-strategies";
import { NormalizedGame } from "./types";
import { NHLTeamStats, NHLMarketOdds } from "./nhl/nhl-types";

describe("NHL Sync and Selection Safety Tests", () => {
  const sampleHomeStats: NHLTeamStats = {
    teamId: 501,
    teamName: "Edmonton Oilers",
    gamesPlayed: 40,
    wins: 26,
    losses: 10,
    otLosses: 4,
    points: 56,
    goalsForPerGame: 3.65,
    goalsAgainstPerGame: 2.75,
    shotsForPerGame: 33.5,
    shotsAgainstPerGame: 28.2,
    shootingPct: 0.109,
    savePct: 0.902,
    powerPlayPct: 0.265,
    penaltyKillPct: 0.825,
    powerPlayOpportunitiesPerGame: 3.4,
    penaltyMinutesPerGame: 8.5,
    homeGpg: 3.85,
    homeGaa: 2.50,
    awayGpg: 3.45,
    awayGaa: 3.00,
    last5Gpg: 3.80,
    last5Gaa: 2.40,
    restDays: 2,
    isBackToBack: false,
  };

  const sampleAwayStats: NHLTeamStats = {
    teamId: 502,
    teamName: "Calgary Flames",
    gamesPlayed: 40,
    wins: 19,
    losses: 16,
    otLosses: 5,
    points: 43,
    goalsForPerGame: 2.95,
    goalsAgainstPerGame: 3.20,
    shotsForPerGame: 30.1,
    shotsAgainstPerGame: 31.0,
    shootingPct: 0.098,
    savePct: 0.897,
    powerPlayPct: 0.175,
    penaltyKillPct: 0.810,
    powerPlayOpportunitiesPerGame: 2.8,
    penaltyMinutesPerGame: 9.0,
    homeGpg: 3.10,
    homeGaa: 3.00,
    awayGpg: 2.80,
    awayGaa: 3.40,
    last5Gpg: 2.60,
    last5Gaa: 3.50,
    restDays: 1,
    isBackToBack: true,
  };

  const sampleGame: NormalizedGame = {
    id: "nhl_test_01",
    sport: "nhl",
    provider: "api-nhl",
    providerGameId: "66001",
    league: { id: "1", name: "NHL", season: "2026-2027" },
    homeTeam: { id: 501, name: "Edmonton Oilers" },
    awayTeam: { id: 502, name: "Calgary Flames" },
    startsAt: "2026-10-08T22:00:00Z",
    status: "SCHEDULED",
  };

  const sampleOdds: NHLMarketOdds = {
    gameId: "nhl_test_01",
    moneyline: { homeOdds: 1.55, awayOdds: 2.60, bookmaker: "Bet365" },
    puckLine: { homeLine: -1.5, homeOdds: 2.05, awayLine: 1.5, awayOdds: 1.80, bookmaker: "Bet365" },
    totalGoals: { line: 6.0, overOdds: 1.91, underOdds: 1.91, bookmaker: "Bet365" },
  };

  it("handles non-string odds selections safely and generates valid candidates", () => {
    const candidates = NHLStrategyEngine.evaluateGame({
      game: sampleGame,
      homeStats: sampleHomeStats,
      awayStats: sampleAwayStats,
      odds: sampleOdds,
    });

    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(typeof c.selection).toBe("string");
      expect(typeof c.market).toBe("string");
      expect(c.selection.length).toBeGreaterThan(0);
    }
  });

  it("executes getTodayNHLSignals without throwing any exception", async () => {
    const result = await NHLSyncEngine.getTodayNHLSignals();
    expect(result).toBeDefined();
    expect(Array.isArray(result.signals)).toBe(true);
    expect(typeof result.gamesCount).toBe("number");
  });
});
