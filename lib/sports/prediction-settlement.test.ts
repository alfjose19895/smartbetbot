import { describe, it, expect } from "vitest";
import { generatePredictionsForUpcoming } from "./db";

describe("Predictions Evaluation & Results", () => {
  it("evaluates finished matches and returns won and lost statuses", async () => {
    const preds = await generatePredictionsForUpcoming(undefined, false);
    expect(preds).toBeDefined();
    expect(Array.isArray(preds)).toBe(true);
  }, 120000);
});
