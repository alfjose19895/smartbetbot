import { describe, it, expect } from "vitest";
import {
  loadDailySnapshotAsync,
  getAllDailySnapshotsAsync,
  getHistoricalSettledPredictions,
  getHistoricalSettledParlays,
} from "./db";

describe("Supabase Cloud Database Resilience Test", () => {
  it("loads all historical snapshots seamlessly including Supabase cloud records", async () => {
    const allSnapshots = await getAllDailySnapshotsAsync();
    console.log("Found snapshot dates:", Object.keys(allSnapshots).sort());

    expect(allSnapshots["2026-09-15"]).toBeDefined();
    expect(allSnapshots["2026-09-16"]).toBeDefined();

    // Verify loading specific date asynchronously
    const snap15 = await loadDailySnapshotAsync("2026-09-15");
    expect(snap15).not.toBeNull();
    expect(snap15!.length).toBeGreaterThan(15);

    const snap16 = await loadDailySnapshotAsync("2026-09-16");
    expect(snap16).not.toBeNull();
    expect(snap16!.length).toBeGreaterThan(15);

    // Verify historical settled predictions
    const history = await getHistoricalSettledPredictions(true);
    expect(history.length).toBeGreaterThan(100);

    const history15 = history.filter((h) => h.date === "2026-09-15");
    const history16 = history.filter((h) => h.date === "2026-09-16");
    expect(history15.length).toBe(26);
    expect(history16.length).toBeGreaterThanOrEqual(23);

    console.log(`History 2026-09-15: ${history15.length} picks`);
    console.log(`History 2026-09-16: ${history16.length} picks`);

    // Verify historical parlays
    const parlays = await getHistoricalSettledParlays();
    const p15 = parlays.filter((p) => p.date === "2026-09-15");
    const p16 = parlays.filter((p) => p.date === "2026-09-16");
    expect(p15.length).toBe(3);
    expect(p16.length).toBe(3);
    console.log(`Parlays 2026-09-15: ${p15.length} parlays`);
    console.log(`Parlays 2026-09-16: ${p16.length} parlays`);
  }, 25000);
});