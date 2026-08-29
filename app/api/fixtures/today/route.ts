import { NextResponse } from "next/server";
import { apiFootball } from "@/lib/sports/api-football";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const live = await apiFootball.getLiveFixtures();
    const today = new Date().toISOString().split("T")[0];
    const upcoming = await apiFootball.getFixtures(39, 2026, today, today);

    return NextResponse.json({
      success: true,
      liveCount: live.length,
      todayCount: upcoming.length,
      live,
      upcoming,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch fixtures";
    console.error("[API /api/fixtures/today] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
