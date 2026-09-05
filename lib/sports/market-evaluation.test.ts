import { describe, it, expect } from "vitest";
import { evaluateMarketResult } from "./db";

describe("Exhaustive Market Evaluation Suite (All Core Markets)", () => {
  describe("1. Ganador Local / Gana Local", () => {
    it("wins when home goals are strictly greater than away goals (Ganador Local)", () => {
      const res = evaluateMarketResult("Ganador Local", 4, 0);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("4 - 0");
    });

    it("wins when home goals are strictly greater than away goals (Gana Local)", () => {
      const res = evaluateMarketResult("Gana Local", 2, 1);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("2 - 1");
    });

    it("loses when match ends in a draw", () => {
      const res = evaluateMarketResult("Ganador Local", 1, 1);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe("1 - 1");
    });

    it("loses when away team wins", () => {
      const res = evaluateMarketResult("Ganador Local", 0, 2);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe("0 - 2");
    });
  });

  describe("2. Ganador Visitante / Gana Visitante", () => {
    it("wins when away goals are strictly greater than home goals (Ganador Visitante)", () => {
      const res = evaluateMarketResult("Ganador Visitante", 1, 3);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("1 - 3");
    });

    it("wins when away goals are strictly greater than home goals (Gana Visitante)", () => {
      const res = evaluateMarketResult("Gana Visitante", 0, 4);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("0 - 4");
    });

    it("loses when match ends in a draw", () => {
      const res = evaluateMarketResult("Ganador Visitante", 0, 0);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe("0 - 0");
    });

    it("loses when home team wins", () => {
      const res = evaluateMarketResult("Ganador Visitante", 2, 0);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe("2 - 0");
    });
  });

  describe("3. Empate (X)", () => {
    it("wins when match ends in a goalless draw (0 - 0)", () => {
      const res = evaluateMarketResult("Empate (X)", 0, 0);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("0 - 0");
    });

    it("wins when match ends in a score draw (2 - 2)", () => {
      const res = evaluateMarketResult("Empate (X)", 2, 2);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("2 - 2");
    });

    it("loses when home team wins (1 - 0)", () => {
      const res = evaluateMarketResult("Empate (X)", 1, 0);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe("1 - 0");
    });
  });

  describe("4. Over 2.5 Goles", () => {
    it("wins when total goals is 3 or more", () => {
      const res = evaluateMarketResult("Over 2.5 Goles", 2, 1);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("2 - 1 (3 Goles)");
    });

    it("loses when total goals is 2 or less", () => {
      const res = evaluateMarketResult("Over 2.5 Goles", 1, 1);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe("1 - 1 (2 Goles)");
    });
  });

  describe("5. Under 2.5 Goles", () => {
    it("wins when total goals is 2 or less", () => {
      const res = evaluateMarketResult("Under 2.5 Goles", 1, 0);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("1 - 0 (1 Goles)");
    });

    it("loses when total goals is 3 or more", () => {
      const res = evaluateMarketResult("Under 2.5 Goles", 2, 2);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe("2 - 2 (4 Goles)");
    });
  });

  describe("6. Ambos Equipos Anotan / BTTS", () => {
    it("wins when both teams score at least 1 goal with Ambos Equipos Anotan", () => {
      const res = evaluateMarketResult("Ambos Equipos Anotan", 3, 4);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe("3 - 4 (Ambos Sí)");
    });

    it("loses when one or both teams score 0 goals with Ambos Equipos Anotan", () => {
      const res1 = evaluateMarketResult("Ambos Equipos Anotan", 4, 0);
      expect(res1.isWon).toBe(false);
      expect(res1.actualScoreText).toBe("4 - 0 (No)");

      const res2 = evaluateMarketResult("Ambos Equipos Anotan", 0, 0);
      expect(res2.isWon).toBe(false);
      expect(res2.actualScoreText).toBe("0 - 0 (No)");
    });
  });
});
