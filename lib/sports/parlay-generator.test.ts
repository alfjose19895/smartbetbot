import { describe, it, expect } from "vitest";
import { buildTripleExclusiveParlays, buildDualExclusiveParlays, getMarketCategory } from "./parlay-generator";
import { MarketOpportunity } from "./prediction-engine";

const createMockOpp = (partial: Partial<MarketOpportunity>): MarketOpportunity => ({
  id: "test",
  fixtureId: 100,
  match: "Team A vs Team B",
  homeTeam: "Team A",
  awayTeam: "Team B",
  league: "La Liga",
  country: "España",
  kickoff: new Date().toISOString(),
  market: "Ganador Local",
  selection: "Team A",
  odds: 1.80,
  fairOdds: 1.60,
  probability: 65,
  impliedProbability: 55.5,
  edge: 9.5,
  expectedValue: 17.0,
  confidence: "Alta",
  pickBadge: "estandar",
  smartScore: 82,
  explanation: "Mock explanation",
  status: "pending",
  ...partial,
});

const mock12Opportunities: MarketOpportunity[] = [
  createMockOpp({
    id: "opp-1",
    fixtureId: 101,
    match: "Real Madrid vs Real Betis",
    homeTeam: "Real Madrid",
    awayTeam: "Real Betis",
    league: "La Liga",
    market: "Ganador Local",
    selection: "Real Madrid",
    probability: 82.0,
    odds: 1.45,
    fairOdds: 1.22,
    edge: 15.0,
    expectedValue: 18.9,
    confidence: "Muy Alta",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-2",
    fixtureId: 102,
    match: "Barcelona vs Sevilla",
    homeTeam: "Barcelona",
    awayTeam: "Sevilla",
    league: "La Liga",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    probability: 78.0,
    odds: 1.60,
    fairOdds: 1.28,
    edge: 16.0,
    expectedValue: 24.8,
    confidence: "Muy Alta",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-3",
    fixtureId: 103,
    match: "Arsenal vs Chelsea",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    league: "Premier League",
    market: "Ambos Equipos Anotan",
    selection: "Sí",
    probability: 74.0,
    odds: 1.70,
    fairOdds: 1.35,
    edge: 15.2,
    expectedValue: 25.8,
    confidence: "Muy Alta",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-4",
    fixtureId: 104,
    match: "Bayern Munich vs Dortmund",
    homeTeam: "Bayern Munich",
    awayTeam: "Dortmund",
    league: "Bundesliga",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    probability: 69.0,
    odds: 1.95,
    fairOdds: 1.45,
    edge: 17.7,
    expectedValue: 34.5,
    confidence: "Alta",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-5",
    fixtureId: 105,
    match: "Inter vs Milan",
    homeTeam: "Inter",
    awayTeam: "Milan",
    league: "Serie A",
    market: "Ganador Local",
    selection: "Inter",
    probability: 65.0,
    odds: 2.10,
    fairOdds: 1.54,
    edge: 17.3,
    expectedValue: 36.5,
    confidence: "Alta",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-6",
    fixtureId: 106,
    match: "PSG vs Marseille",
    homeTeam: "PSG",
    awayTeam: "Marseille",
    league: "Ligue 1",
    market: "Ambos Equipos Anotan",
    selection: "Sí",
    probability: 64.0,
    odds: 1.90,
    fairOdds: 1.56,
    edge: 11.4,
    expectedValue: 21.6,
    confidence: "Alta",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-7",
    fixtureId: 107,
    match: "Liverpool vs Everton",
    homeTeam: "Liverpool",
    awayTeam: "Everton",
    league: "Premier League",
    market: "Ganador Local",
    selection: "Liverpool",
    probability: 58.0,
    odds: 2.65,
    fairOdds: 1.72,
    edge: 20.3,
    expectedValue: 53.7,
    confidence: "Alta",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-8",
    fixtureId: 108,
    match: "Juventus vs Roma",
    homeTeam: "Juventus",
    awayTeam: "Roma",
    league: "Serie A",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    probability: 52.0,
    odds: 2.50,
    fairOdds: 1.92,
    edge: 12.0,
    expectedValue: 30.0,
    confidence: "Media",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-9",
    fixtureId: 109,
    match: "Atletico Madrid vs Valencia",
    homeTeam: "Atletico Madrid",
    awayTeam: "Valencia",
    league: "La Liga",
    market: "Ambos Equipos Anotan",
    selection: "Sí",
    probability: 48.0,
    odds: 2.80,
    fairOdds: 2.08,
    edge: 12.3,
    expectedValue: 34.4,
    confidence: "Media",
    leagueTier: 1,
  }),
  createMockOpp({
    id: "opp-10",
    fixtureId: 110,
    match: "Ajax vs Feyenoord",
    homeTeam: "Ajax",
    awayTeam: "Feyenoord",
    league: "Eredivisie",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    probability: 60.0,
    odds: 1.80,
    fairOdds: 1.67,
    edge: 4.3,
    expectedValue: 8.0,
    confidence: "Media",
    leagueTier: 2,
  }),
];

describe("Parlay Generator - 3 Parlays of 3 Picks", () => {
  it("generates 3 parlays of 3 picks each with ZERO match repetition across all 9 picks", () => {
    const result = buildTripleExclusiveParlays(mock12Opportunities);
    expect(result).toBeDefined();

    // 3 picks in each parlay
    expect(result.parlay1.length).toBe(3);
    expect(result.parlay2.length).toBe(3);
    expect(result.parlay3.length).toBe(3);

    // Collect all fixture IDs across parlay1, parlay2, parlay3
    const allPicks = [...result.parlay1, ...result.parlay2, ...result.parlay3];
    expect(allPicks.length).toBe(9);

    const fixtureIds = allPicks.map((p) => p.fixtureId);
    const uniqueFixtureIds = new Set(fixtureIds);

    // ZERO repetition across all 9 picks!
    expect(uniqueFixtureIds.size).toBe(9);

    // Check match teams uniqueness as well
    const teamKeys = allPicks.map((p) => `${p.homeTeam}-${p.awayTeam}`);
    const uniqueTeamKeys = new Set(teamKeys);
    expect(uniqueTeamKeys.size).toBe(9);
  });

  it("maintains backward compatibility with elite3 and premium5 aliases", () => {
    const result = buildDualExclusiveParlays(mock12Opportunities);
    expect(result.elite3).toBeDefined();
    expect(result.premium5).toBeDefined();
    expect(result.elite3.length).toBe(3);
    expect(result.premium5.length).toBe(5);
  });

  it("classifies market categories properly", () => {
    expect(getMarketCategory("Ambos Equipos Anotan")).toBe("BTTS");
    expect(getMarketCategory("Over 2.5 Goles")).toBe("GOALS_OVER");
    expect(getMarketCategory("Menos de 2.5 Goles")).toBe("GOALS_UNDER");
    expect(getMarketCategory("Ganador Local")).toBe("MONEYLINE");
    expect(getMarketCategory("Doble Oportunidad 1X")).toBe("DOUBLE_CHANCE");
  });

  it("handles small pools gracefully without crashing or duplicating matches", () => {
    const smallPool = mock12Opportunities.slice(0, 5);
    const result = buildTripleExclusiveParlays(smallPool);

    const allPicks = [...result.parlay1, ...result.parlay2, ...result.parlay3];
    const fixtureIds = allPicks.map((p) => p.fixtureId);
    const uniqueFixtureIds = new Set(fixtureIds);

    // Must still be 100% mutually exclusive
    expect(fixtureIds.length).toBe(uniqueFixtureIds.size);
    expect(uniqueFixtureIds.size).toBeLessThanOrEqual(5);
  });
});
