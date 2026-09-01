import { NextResponse } from "next/server";
import { apiFootball } from "@/lib/sports/api-football";
import { getEcuadorDateString } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = getEcuadorDateString();
    const [live, todayFixtures] = await Promise.all([
      apiFootball.getLiveFixtures(),
      apiFootball.getFixturesByDate(today),
    ]);

    return NextResponse.json({
      success: true,
      liveCount: live.length,
      todayCount: todayFixtures.length,
      live,
      todayFixtures,
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
