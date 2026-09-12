import { NextRequest, NextResponse } from "next/server";
import { searchAndAddNewAlerts, syncUpcomingFixtures, reconcileAndSettleAllSnapshots } from "@/lib/sports/db";
import { ALL_LEAGUE_IDS } from "@/lib/sports/api-football";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const leagueIds = body.leagueIds || ALL_LEAGUE_IDS;

    // 1. First ensure upcoming fixtures are synchronized
    await syncUpcomingFixtures(leagueIds, 7).catch((err) => {
      console.warn("[API /api/admin/sync/predictions] Fixture sync warning:", err);
    });

    // 2. Search and append new alerts into daily snapshot preserving all existing picks
    const result = await searchAndAddNewAlerts(leagueIds);

    // 3. Reconcile and settle finished matches into immutable history
    await reconcileAndSettleAllSnapshots().catch(() => ({ settledCount: 0 }));

    return NextResponse.json({
      success: true,
      message: result.message,
      count: result.totalAlerts,
      newCount: result.newCount,
      newAlerts: result.newAlerts,
      predictions: result.predictions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al buscar nuevas alertas";
    console.error("[API /api/admin/sync/predictions] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
