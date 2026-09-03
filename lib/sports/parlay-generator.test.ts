import { describe, it, expect } from "vitest";
import { buildDualExclusiveParlays, getMarketCategory } from "./parlay-generator";
import { MarketOpportunity } from "./prediction-engine";

describe("Parlay Generator - Dual Exclusive Parlays", () => {
  const mockPredictions: MarketOpportunity[] = [
    {
      id: "1",
      fixtureId: 101,
      match: "Real Madrid vs Barcelona",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      country: "Spain",
      kickoff: new Date().toISOString(),
      market: "Gana Local",
      probability: 82,
      odds: 1.75,
      fairOdds: 1.22,
      edge: 43.4,
      confidence: "Muy Alta",
      pickBadge: "valor",
      reasoning: "High ELO superiority",
    },
    {
      id: "2",
      fixtureId: 102,
      match: "Arsenal vs Chelsea",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      league: "Premier League",
      country: "England",
      kickoff: new Date().toISOString(),
      market: "Over 2.5 Goles",
      probability: 80,
      odds: 1.65,
      fairOdds: 1.25,
      edge: 32.0,
      confidence: "Muy Alta",
      pickBadge: "valor",
      reasoning: "High xG expectation",
    },
    {
      id: "3",
      fixtureId: 103,
      match: "Bayern Munich vs Dortmund",
      homeTeam: "Bayern Munich",
      awayTeam: "Dortmund",
      league: "Bundesliga",
      country: "Germany",
      kickoff: new Date().toISOString(),
      market: "Ambos Marcan (BTTS)",
      probability: 79,
      odds: 1.55,
      fairOdds: 1.27,
      edge: 22.0,
      confidence: "Muy Alta",
      reasoning: "Mutual attacking potency",
    },
    {
      id: "4",
      fixtureId: 104,
      match: "PSG vs Marseille",
      homeTeam: "PSG",
      awayTeam: "Marseille",
      league: "Ligue 1",
      country: "France",
      kickoff: new Date().toISOString(),
      market: "Doble Oportunidad 1X",
      probability: 78,
      odds: 1.45,
      fairOdds: 1.28,
      edge: 13.0,
      confidence: "Alta",
      reasoning: "PSG unbeaten at home",
    },
    {
      id: "5",
      fixtureId: 105,
      match: "Inter vs Milan",
      homeTeam: "Inter",
      awayTeam: "Milan",
      league: "Serie A",
      country: "Italy",
      kickoff: new Date().toISOString(),
      market: "Under 2.5 Goles",
      probability: 77,
      odds: 1.80,
      fairOdds: 1.30,
      edge: 38.0,
      confidence: "Alta",
      reasoning: "Tactical derby",
    },
    {
      id: "6",
      fixtureId: 106,
      match: "Liverpool vs Everton",
      homeTeam: "Liverpool",
      awayTeam: "Everton",
      league: "Premier League",
      country: "England",
      kickoff: new Date().toISOString(),
      market: "Gana Local",
      probability: 76,
      odds: 1.50,
      fairOdds: 1.32,
      edge: 13.6,
      confidence: "Alta",
      reasoning: "Home form",
    },
    {
      id: "7",
      fixtureId: 107,
      match: "Juventus vs Roma",
      homeTeam: "Juventus",
      awayTeam: "Roma",
      league: "Serie A",
      country: "Italy",
      kickoff: new Date().toISOString(),
      market: "Over 1.5 Goles",
      probability: 75,
      odds: 1.40,
      fairOdds: 1.33,
      edge: 5.2,
      confidence: "Alta",
      reasoning: "Goal trend",
    },
    {
      id: "8",
      fixtureId: 108,
      match: "Ajax vs Feyenoord",
      homeTeam: "Ajax",
      awayTeam: "Feyenoord",
      league: "Eredivisie",
      country: "Netherlands",
      kickoff: new Date().toISOString(),
      market: "Ambos Marcan (BTTS)",
      probability: 74,
      odds: 1.60,
      fairOdds: 1.35,
      edge: 18.5,
      confidence: "Alta",
      reasoning: "Classic high scoring",
    },
    {
      id: "9",
      fixtureId: 109,
      match: "Porto vs Benfica",
      homeTeam: "Porto",
      awayTeam: "Benfica",
      league: "Primeira Liga",
      country: "Portugal",
      kickoff: new Date().toISOString(),
      market: "Doble Oportunidad 1X",
      probability: 73,
      odds: 1.42,
      fairOdds: 1.37,
      edge: 3.6,
      confidence: "Alta",
      reasoning: "Solid home record",
    },
  ];

  it("classifies market categories correctly", () => {
    expect(getMarketCategory("Gana Local")).toBe("MONEYLINE");
    expect(getMarketCategory("Over 2.5 Goles")).toBe("GOALS_OVER");
    expect(getMarketCategory("Under 2.5 Goles")).toBe("GOALS_UNDER");
    expect(getMarketCategory("Ambos Marcan (BTTS)")).toBe("BTTS");
    expect(getMarketCategory("Doble Oportunidad 1X")).toBe("DOUBLE_CHANCE");
  });

  it("creates two parleys (3 and 5 picks) with ZERO match overlap", () => {
    const { elite3, premium5 } = buildDualExclusiveParlays(mockPredictions);

    expect(elite3).toHaveLength(3);
    expect(premium5).toHaveLength(5);

    const eliteMatches = new Set(elite3.map((p) => p.match));
    const premiumMatches = new Set(premium5.map((p) => p.match));

    // Verify zero intersection
    for (const match of eliteMatches) {
      expect(premiumMatches.has(match)).toBe(false);
    }

    // Verify market diversity in elite3
    const eliteMarkets = new Set(elite3.map((p) => getMarketCategory(p.market)));
    expect(eliteMarkets.size).toBe(3); // All 3 legs have different market categories!
  });
});
