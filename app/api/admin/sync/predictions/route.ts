import { NextRequest, NextResponse } from "next/server";
import { generatePredictionsForUpcoming, syncUpcomingFixtures } from "@/lib/sports/db";
import { ALL_LEAGUE_IDS } from "@/lib/sports/api-football";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const leagueIds = body.leagueIds || ALL_LEAGUE_IDS;

    // 1. First ensure upcoming fixtures are synchronized
    await syncUpcomingFixtures(leagueIds, 7);

    // 2. Generate predictions across all target leagues
    const predictions = await generatePredictionsForUpcoming(leagueIds);

    return NextResponse.json({
      success: true,
      message: `Generación completada: ${predictions.length} pronósticos reales procesados para hoy y los próximos días.`,
      count: predictions.length,
      predictions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al generar predicciones";
    console.error("[API /api/admin/sync/predictions] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
