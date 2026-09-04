import { refreshRemainingLivePredictions } from "../lib/sports/db";

async function main() {
  console.log("Testing refreshRemainingLivePredictions()...");
  const result = await refreshRemainingLivePredictions();
  console.log("RESULT:", result.count, "added | Total:", result.totalAlerts);
  console.log("Sample predictions:", result.predictions.slice(0, 3));
}

main().catch(console.error);
