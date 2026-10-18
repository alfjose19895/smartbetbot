import { describe, it, expect } from "vitest";
import { sortByKickoff, MarketOpportunity } from "./prediction-engine";
import { getCornersVipSlate } from "./corners-vip-server";
import { getCardsVipSlate } from "./cards-vip-server";
import { getShotsVipSlate } from "./shots-vip-server";
import { getWeekendExclusiveSlate } from "./weekend-exclusive";

describe("Sort By Kickoff / Horario Suite across all modules", () => {
  it("sorts opportunities chronologically from earliest to latest", () => {
    const opps: Partial<MarketOpportunity>[] = [
      { kickoff: "2026-10-18T16:00:00-05:00", match: "Match 3 (4:00 PM)", probability: 70 },
      { kickoff: "2026-10-18T08:30:00-05:00", match: "Match 1 (8:30 AM)", probability: 65 },
      { kickoff: "2026-10-18T12:00:00-05:00", match: "Match 2 (12:00 PM)", probability: 80 },
    ];

    const sorted = sortByKickoff(opps, "asc");

    expect(sorted[0].match).toBe("Match 1 (8:30 AM)");
    expect(sorted[1].match).toBe("Match 2 (12:00 PM)");
    expect(sorted[2].match).toBe("Match 3 (4:00 PM)");
  });

  it("breaks ties in identical kickoff times by higher probability first", () => {
    const opps: Partial<MarketOpportunity>[] = [
      { kickoff: "2026-10-18T10:00:00-05:00", match: "Lower Prob", probability: 62, edge: 4 },
      { kickoff: "2026-10-18T10:00:00-05:00", match: "Higher Prob", probability: 78, edge: 2 },
    ];

    const sorted = sortByKickoff(opps, "asc");

    expect(sorted[0].match).toBe("Higher Prob");
    expect(sorted[1].match).toBe("Lower Prob");
  });

  it("breaks ties with identical kickoff and probability by higher edge (+EV)", () => {
    const opps: Partial<MarketOpportunity>[] = [
      { kickoff: "2026-10-18T10:00:00-05:00", match: "Lower Edge", probability: 75, edge: 3.5 },
      { kickoff: "2026-10-18T10:00:00-05:00", match: "Higher Edge", probability: 75, edge: 7.2 },
    ];

    const sorted = sortByKickoff(opps, "asc");

    expect(sorted[0].match).toBe("Higher Edge");
    expect(sorted[1].match).toBe("Lower Edge");
  });

  it("gracefully handles missing, invalid, or undefined kickoff without throwing", () => {
    const opps: Partial<MarketOpportunity>[] = [
      { kickoff: undefined, match: "No Kickoff 1", probability: 60 },
      { kickoff: "2026-10-18T11:00:00-05:00", match: "Valid Kickoff", probability: 70 },
      { kickoff: "invalid-date-string", match: "Invalid Kickoff", probability: 65 },
    ];

    const sorted = sortByKickoff(opps, "asc");

    expect(sorted[0].match).toBe("Valid Kickoff");
    expect(sorted.length).toBe(3);
  });

  it("supports descending order when requested (e.g. for history)", () => {
    const opps: Partial<MarketOpportunity>[] = [
      { kickoff: "2026-10-18T08:00:00-05:00", match: "Morning" },
      { kickoff: "2026-10-18T20:00:00-05:00", match: "Night" },
      { kickoff: "2026-10-18T14:00:00-05:00", match: "Afternoon" },
    ];

    const sorted = sortByKickoff(opps, "desc");

    expect(sorted[0].match).toBe("Night");
    expect(sorted[1].match).toBe("Afternoon");
    expect(sorted[2].match).toBe("Morning");
  });

  it("verifies Corners VIP slate returns matches ordered by kickoff time", async () => {
    const slate = await getCornersVipSlate("2026-10-18");
    expect(slate.predictions.length).toBeGreaterThan(0);

    for (let i = 0; i < slate.predictions.length - 1; i++) {
      const timeCurrent = new Date(slate.predictions[i].kickoff).getTime();
      const timeNext = new Date(slate.predictions[i + 1].kickoff).getTime();
      expect(timeCurrent).toBeLessThanOrEqual(timeNext);
    }
  });

  it("verifies Cards VIP slate returns matches ordered by kickoff time", async () => {
    const slate = await getCardsVipSlate("2026-10-18");
    expect(slate.predictions.length).toBeGreaterThan(0);

    for (let i = 0; i < slate.predictions.length - 1; i++) {
      const timeCurrent = new Date(slate.predictions[i].kickoff).getTime();
      const timeNext = new Date(slate.predictions[i + 1].kickoff).getTime();
      expect(timeCurrent).toBeLessThanOrEqual(timeNext);
    }
  });

  it("verifies Shots VIP slate returns matches ordered by kickoff time", async () => {
    const slate = await getShotsVipSlate("2026-10-18");
    expect(slate.predictions.length).toBeGreaterThan(0);

    for (let i = 0; i < slate.predictions.length - 1; i++) {
      const timeCurrent = new Date(slate.predictions[i].kickoff).getTime();
      const timeNext = new Date(slate.predictions[i + 1].kickoff).getTime();
      expect(timeCurrent).toBeLessThanOrEqual(timeNext);
    }
  });
});
