import { NextRequest, NextResponse } from "next/server";
import { syncUpcomingFixtures, generatePredictionsForUpcoming } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fixturesResult = await syncUpcomingFixtures([39, 140], 7);
    const predictions = await generatePredictionsForUpcoming();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      fixturesSaved: fixturesResult.fixturesSaved,
      predictionsGenerated: predictions.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cron sync error";
    console.error("[CRON /api/cron/sync] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
