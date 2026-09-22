import { describe, it, expect } from "vitest";
import { generateTeamRecentForm, generateH2HClashes } from "./prediction-engine";

describe("Corner History in Last 5 Matches & H2H", () => {
  it("generates complete corner statistics for team recent form", () => {
    const homeForm = generateTeamRecentForm("Barracas Central", "Liga Profesional Argentina", 1620, "2026-09-21T17:00:00Z");
    expect(homeForm).toHaveLength(5);

    homeForm.forEach((m) => {
      expect(m.teamCorners).toBeDefined();
      expect(m.opponentCorners).toBeDefined();
      expect(m.totalCorners).toBeDefined();
      expect(m.totalCorners).toBe((m.teamCorners ?? 0) + (m.opponentCorners ?? 0));
      expect(m.corners).toBeDefined();
      expect(m.corners).toContain("-");
      expect(typeof m.over85Corners).toBe("boolean");
      expect(m.over85Corners).toBe((m.totalCorners ?? 0) > 8.5);
    });
  });

  it("generates complete corner statistics for H2H clashes", () => {
    const h2h = generateH2HClashes("Barracas Central", "Independ. Rivadavia", "Liga Profesional Argentina", 1620, 1600, "2026-09-21T17:00:00Z");
    expect(h2h.length).toBeGreaterThanOrEqual(3);

    h2h.forEach((clash) => {
      expect(clash.homeCorners).toBeDefined();
      expect(clash.awayCorners).toBeDefined();
      expect(clash.totalCorners).toBeDefined();
      expect(clash.totalCorners).toBe((clash.homeCorners ?? 0) + (clash.awayCorners ?? 0));
      expect(clash.corners).toBeDefined();
    });
  });
});
