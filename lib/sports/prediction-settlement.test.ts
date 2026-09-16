import { describe, it, expect } from "vitest";
import { generatePredictionsForUpcoming, getHistoricalSettledPredictions } from "./db";

describe("Predictions Evaluation & Results", () => {
  it("evaluates finished matches and returns won and lost statuses", async () => {
    const preds = await generatePredictionsForUpcoming(undefined, true);
    expect(preds).toBeDefined();

    const history = await getHistoricalSettledPredictions();
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThan(0);

    const wonPicks = history.filter((p) => p.result === "WON");
    const lostPicks = history.filter((p) => p.result === "LOST");
    console.log(`Evaluated ${history.length} historical settled predictions: ${wonPicks.length} Won, ${lostPicks.length} Lost`);

    expect(wonPicks.length + lostPicks.length).toBeGreaterThan(0);
  }, 30000);
});
