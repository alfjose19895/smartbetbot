import { describe, it, expect } from "vitest";
import { extractMatchDetails } from "./api-football";

describe("Corner History and H2H Real Data Integrity", () => {
  it("strictly detects when authentic corner statistics are present vs missing", () => {
    const mockStatsWithCorners = [
      {
        team: { id: 1, name: "Home", logo: "" },
        statistics: [
          { type: "Corner Kicks", value: 6 },
          { type: "Shots on Goal", value: 4 },
        ],
      },
      {
        team: { id: 2, name: "Away", logo: "" },
        statistics: [
          { type: "Corner Kicks", value: 3 },
          { type: "Shots on Goal", value: 2 },
        ],
      },
    ];

    const details = extractMatchDetails(mockStatsWithCorners);
    expect(details.hasCornerStats).toBe(true);
    expect(details.homeCorners).toBe(6);
    expect(details.awayCorners).toBe(3);
    expect(details.totalCorners).toBe(9);

    // Mock stats without corner kicks (e.g. only cards/fouls recorded)
    const mockStatsWithoutCorners = [
      {
        team: { id: 1, name: "Home", logo: "" },
        statistics: [{ type: "Yellow Cards", value: 2 }],
      },
      {
        team: { id: 2, name: "Away", logo: "" },
        statistics: [{ type: "Yellow Cards", value: 1 }],
      },
    ];

    const detailsWithoutCorners = extractMatchDetails(mockStatsWithoutCorners);
    expect(detailsWithoutCorners.hasCornerStats).toBe(false);
    expect(detailsWithoutCorners.hasStats).toBe(true);
  });
});
