import { describe, it, expect } from "vitest";
import { generatePredictionsForUpcoming, loadDailySnapshot } from "./db";

describe("Predictions Evaluation & Results", () => {
  it("evaluates finished matches and returns won and lost statuses", async () => {
    const preds = await generatePredictionsForUpcoming(undefined, false);
    expect(preds).toBeDefined();
    expect(preds.length).toBeGreaterThan(0);

    const wonPicks = preds.filter((p) => p.status === "won");
    const lostPicks = preds.filter((p) => p.status === "lost");
    console.log(`Evaluated ${preds.length} predictions: ${wonPicks.length} Won, ${lostPicks.length} Lost`);

    expect(wonPicks.length + lostPicks.length).toBeGreaterThan(0);
  });
});
