import { describe, it, expect } from "vitest";
import { extractMarketOddsFromBookmaker } from "./api-football";

describe("Strict Market Identification by Bet ID (No Text Coincidences / No Ghost Lines)", () => {
  it("strictly ignores Team Corners (Bet ID 48) and First Half Corners (Bet ID 46) even if they contain 'Over 6.5' or 'Corners'", () => {
    const mockOddsItem = {
      fixture: { id: 999123 },
      bookmakers: [
        {
          id: 8,
          name: "Bet365",
          bets: [
            // Bet 48 = Home Team Corners Over/Under (e.g. Rangers Over 6.5 Corners)
            {
              id: 48,
              name: "Rangers Total Corners",
              values: [
                { value: "Over 6.5", odd: "1.85" },
                { value: "Under 6.5", odd: "1.90" },
              ],
            },
            // Bet 46 = Corners Over/Under First Half
            {
              id: 46,
              name: "Corners Over/Under 1st Half",
              values: [
                { value: "Over 4.5", odd: "2.10" },
              ],
            },
            // Bet 45 = Match Total Corners Over/Under (The genuine match market)
            {
              id: 45,
              name: "Corners Over Under",
              values: [
                { value: "Over 8.5", odd: "1.50" },
                { value: "Under 8.5", odd: "2.40" },
                { value: "Over 9.5", odd: "1.85" },
                { value: "Under 9.5", odd: "1.95" },
                { value: "Over 10.5", odd: "2.35" },
                { value: "Under 10.5", odd: "1.55" },
              ],
            },
          ],
        },
      ],
    };

    const extracted = extractMarketOddsFromBookmaker(mockOddsItem as any);

    // CRITICAL: Over 6.5 from Rangers Team Corners (Bet 48) MUST NEVER be assigned to match corners!
    expect(extracted.cornersOver65).toBeUndefined();
    expect(extracted.cornersUnder65).toBeUndefined();

    // Genuine match lines from Bet 45 must be accurately extracted
    expect(extracted.cornersOver85).toBe(1.50);
    expect(extracted.cornersUnder85).toBe(2.40);
    expect(extracted.cornersOver95).toBe(1.85);
    expect(extracted.cornersUnder95).toBe(1.95);
    expect(extracted.cornersOver105).toBe(2.35);
    expect(extracted.cornersUnder105).toBe(1.55);
  });

  it("locks corner market lines strictly to the primary offering bookmaker (no cross-bookmaker ghost line mixing)", () => {
    const mockOddsItem = {
      fixture: { id: 999124 },
      bookmakers: [
        {
          id: 8,
          name: "Bet365",
          bets: [
            // Bet365 only offers standard playable lines (8.5, 9.5, 10.5)
            {
              id: 45,
              name: "Corners Over Under",
              values: [
                { value: "Over 8.5", odd: "1.45" },
                { value: "Over 9.5", odd: "1.80" },
                { value: "Over 10.5", odd: "2.25" },
              ],
            },
          ],
        },
        {
          id: 11,
          name: "1xBet",
          bets: [
            // Secondary bookmaker offers an obscure line of 6.5
            {
              id: 45,
              name: "Corners Over Under",
              values: [
                { value: "Over 6.5", odd: "1.12" },
                { value: "Over 8.5", odd: "1.42" },
              ],
            },
          ],
        },
      ],
    };

    const extracted = extractMarketOddsFromBookmaker(mockOddsItem as any);

    // Over 6.5 from 1xBet must NOT be Frankensteined into Bet365's lines
    expect(extracted.cornersOver65).toBeUndefined();
    expect(extracted.cornersOver85).toBe(1.45); // From Bet365, NOT 1.42 from 1xBet
    expect(extracted.cornersOver95).toBe(1.80);
    expect(extracted.cornersOver105).toBe(2.25);
  });
});
