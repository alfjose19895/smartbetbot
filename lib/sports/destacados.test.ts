import { describe, it, expect } from "vitest";
import {
  isDestacadoPick,
  getDestacadoRuleMatch,
  DESTACADOS_5_STARS_RULES,
  MarketOpportunity,
} from "./prediction-engine";

describe("Módulo Destacados (Filtro 5 Estrellas para Fútbol)", () => {
  it("defines the 5 official rules accurately according to user requirements", () => {
    expect(DESTACADOS_5_STARS_RULES).toHaveLength(5);

    const corners = DESTACADOS_5_STARS_RULES.find((r) => r.id === "corners");
    expect(corners?.minProb).toBe(70);

    const btts = DESTACADOS_5_STARS_RULES.find((r) => r.id === "btts");
    expect(btts?.minProb).toBe(58);

    const goals = DESTACADOS_5_STARS_RULES.find((r) => r.id === "goals");
    expect(goals?.minProb).toBe(72);

    const local = DESTACADOS_5_STARS_RULES.find((r) => r.id === "local");
    expect(local?.minProb).toBe(58);

    const away = DESTACADOS_5_STARS_RULES.find((r) => r.id === "away");
    expect(away?.minProb).toBe(71);
  });

  it("Rule 1: Alta de Córners qualifies strictly if probability >= 70%", () => {
    const validCorner = {
      sport: "football",
      market: "Córners",
      selection: "Over 8.5",
      probability: 70.0,
    };
    expect(isDestacadoPick(validCorner)).toBe(true);
    expect(getDestacadoRuleMatch(validCorner)?.ruleId).toBe("corners");

    const invalidCorner = {
      sport: "football",
      market: "Córners",
      selection: "Over 8.5",
      probability: 69.9,
    };
    expect(isDestacadoPick(invalidCorner)).toBe(false);

    // Under corners must never qualify
    const underCorner = {
      sport: "football",
      market: "Córners",
      selection: "Under 8.5",
      probability: 80.0,
    };
    expect(isDestacadoPick(underCorner)).toBe(false);
  });

  it("Rule 2: Ambos Anotan qualifies strictly if probability >= 58%", () => {
    const validBtts = {
      sport: "football",
      market: "Ambos Equipos Anotan",
      selection: "Sí",
      probability: 58.0,
    };
    expect(isDestacadoPick(validBtts)).toBe(true);
    expect(getDestacadoRuleMatch(validBtts)?.ruleId).toBe("btts");

    const invalidBtts = {
      sport: "football",
      market: "Ambos Equipos Anotan",
      selection: "Sí",
      probability: 57.9,
    };
    expect(isDestacadoPick(invalidBtts)).toBe(false);
  });

  it("Rule 3: Alta de Goles qualifies strictly if probability >= 72%", () => {
    const validGoals = {
      sport: "football",
      market: "Over 2.5 Goles",
      selection: "Over 2.5",
      probability: 72.0,
    };
    expect(isDestacadoPick(validGoals)).toBe(true);
    expect(getDestacadoRuleMatch(validGoals)?.ruleId).toBe("goals");

    const invalidGoals = {
      sport: "football",
      market: "Over 2.5 Goles",
      selection: "Over 2.5",
      probability: 71.9,
    };
    expect(isDestacadoPick(invalidGoals)).toBe(false);

    // Under goals must never qualify
    const underGoals = {
      sport: "football",
      market: "Under 2.5 Goles",
      selection: "Under 2.5",
      probability: 85.0,
    };
    expect(isDestacadoPick(underGoals)).toBe(false);
  });

  it("Rule 4: Ganador Local qualifies strictly if probability >= 58%", () => {
    const validLocal = {
      sport: "football",
      market: "Ganador Local",
      selection: "1",
      probability: 58.0,
    };
    expect(isDestacadoPick(validLocal)).toBe(true);
    expect(getDestacadoRuleMatch(validLocal)?.ruleId).toBe("local");

    const invalidLocal = {
      sport: "football",
      market: "Ganador Local",
      selection: "1",
      probability: 57.9,
    };
    expect(isDestacadoPick(invalidLocal)).toBe(false);
  });

  it("Rule 5: Ganador Visitante qualifies strictly if probability >= 71%", () => {
    const validAway = {
      sport: "football",
      market: "Ganador Visitante",
      selection: "2",
      probability: 71.0,
    };
    expect(isDestacadoPick(validAway)).toBe(true);
    expect(getDestacadoRuleMatch(validAway)?.ruleId).toBe("away");

    const invalidAway = {
      sport: "football",
      market: "Ganador Visitante",
      selection: "2",
      probability: 70.9,
    };
    expect(isDestacadoPick(invalidAway)).toBe(false);
  });

  it("Strictly excludes non-football sports even if criteria would be met", () => {
    const nhlPick = {
      sport: "nhl",
      market: "Over 5.5 Goles",
      selection: "Over 5.5",
      probability: 80.0,
    };
    expect(isDestacadoPick(nhlPick)).toBe(false);

    const nbaPick = {
      sport: "nba",
      market: "Ganador Local",
      selection: "1",
      probability: 80.0,
    };
    expect(isDestacadoPick(nbaPick)).toBe(false);
  });
});
