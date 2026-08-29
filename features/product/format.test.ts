import { describe, expect, it } from "vitest";

import { marketLabel, odds, percent, score, units } from "./format";

describe("product display formatting", () => {
  it("keeps probabilities as readable percentages", () => {
    expect(percent(0.81)).toBe("81.0%");
    expect(percent(null)).toBe("—");
  });

  it("formats real odds, score and units without fake defaults", () => {
    expect(odds(1.65)).toBe("1.65");
    expect(score(80.6)).toBe("81");
    expect(units(0.65)).toBe("+0.65 u");
    expect(units(-1)).toBe("-1.00 u");
  });

  it("labels canonical markets", () => {
    expect(marketLabel("total_goals", "over", 1.5)).toBe("Total de goles · OVER 1.5");
  });
});
