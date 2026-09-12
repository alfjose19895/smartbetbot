import { describe, it, expect } from "vitest";
import { buildDualExclusiveParlays, getMarketCategory } from "./parlay-generator";
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

const mockOpportunities: MarketOpportunity[] = [
  createMockOpp({
    id: "opp-1",
    fixtureId: 101,
    match: "Real Madrid vs Real Betis",
    homeTeam: "Real Madrid",
    awayTeam: "Real Betis",
    league: "La Liga",
    country: "España",
    kickoff: "2026-03-30T19:00:00Z",
    market: "Ganador Local",
    selection: "Real Madrid",
    probability: 72.5,
    odds: 1.55,
    fairOdds: 1.38,
    edge: 8.0,
    confidence: "Muy Alta",
    pickBadge: "valor",
  }),
  createMockOpp({
    id: "opp-2",
    fixtureId: 102,
    match: "Barcelona vs Sevilla",
    homeTeam: "Barcelona",
    awayTeam: "Sevilla",
    league: "La Liga",
    country: "España",
    kickoff: "2026-03-30T21:00:00Z",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    probability: 75.0,
    odds: 1.62,
    fairOdds: 1.33,
    edge: 13.3,
    confidence: "Muy Alta",
    pickBadge: "valor",
  }),
  createMockOpp({
    id: "opp-3",
    fixtureId: 103,
    match: "Arsenal vs Chelsea",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    league: "Premier League",
    country: "Inglaterra",
    kickoff: "2026-03-30T16:30:00Z",
    market: "Ambos Equipos Anotan",
    selection: "Sí",
    probability: 70.0,
    odds: 1.70,
    fairOdds: 1.43,
    edge: 11.2,
    confidence: "Muy Alta",
  }),
  createMockOpp({
    id: "opp-4",
    fixtureId: 104,
    match: "Bayern Munich vs Dortmund",
    homeTeam: "Bayern Munich",
    awayTeam: "Dortmund",
    league: "Bundesliga",
    country: "Alemania",
    kickoff: "2026-03-30T17:30:00Z",
    market: "Over 2.5 Goles",
    selection: "Over 2.5",
    probability: 68.0,
    odds: 1.50,
    fairOdds: 1.47,
    edge: 1.3,
    confidence: "Alta",
  }),
  createMockOpp({
    id: "opp-5",
    fixtureId: 105,
    match: "Inter vs Milan",
    homeTeam: "Inter",
    awayTeam: "Milan",
    league: "Serie A",
    country: "Italia",
    kickoff: "2026-03-30T19:45:00Z",
    market: "Ganador Local",
    selection: "Inter",
    probability: 60.0,
    odds: 2.15,
    fairOdds: 1.67,
    edge: 5.9,
    confidence: "Alta",
    pickBadge: "bomba",
  }),
  createMockOpp({
    id: "opp-6",
    fixtureId: 106,
    match: "PSG vs Marseille",
    homeTeam: "PSG",
    awayTeam: "Marseille",
    league: "Ligue 1",
    country: "Francia",
    kickoff: "2026-03-30T20:00:00Z",
    market: "Ganador Local",
    selection: "PSG",
    probability: 66.0,
    odds: 1.60,
    fairOdds: 1.52,
    edge: 3.5,
    confidence: "Alta",
  }),
];

describe("Parlay Generator", () => {
  it("generates dual exclusive parlays with sufficient candidates", () => {
    const result = buildDualExclusiveParlays(mockOpportunities);
    expect(result).toBeDefined();
    expect(Array.isArray(result.elite3)).toBe(true);
    expect(Array.isArray(result.premium5)).toBe(true);
  });

  it("classifies market categories properly", () => {
    expect(getMarketCategory("Ambos Equipos Anotan")).toBe("BTTS");
    expect(getMarketCategory("Over 2.5 Goles")).toBe("GOALS_OVER");
    expect(getMarketCategory("Ganador Local")).toBe("MONEYLINE");
  });
});
