import { NextRequest, NextResponse } from "next/server";
import { syncUpcomingFixtures, generatePredictionsForUpcoming, getHistoricalSettledPredictions } from "@/lib/sports/db";
import { ALL_LEAGUE_IDS } from "@/lib/sports/api-football";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[CRON /api/cron/sync] Executing 2-hour automatic synchronization...");

    // 1. Sync upcoming fixtures across all active leagues
    const fixturesResult = await syncUpcomingFixtures(ALL_LEAGUE_IDS, 7);

    // 2. Generate curated high-precision predictions
    const predictions = await generatePredictionsForUpcoming(ALL_LEAGUE_IDS);

    // 3. Settle and transition finished matches into history
    const history = await getHistoricalSettledPredictions();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      fixturesSaved: fixturesResult.fixturesSaved,
      predictionsGenerated: predictions.length,
      historySettled: history.length,
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
