import { NextRequest, NextResponse } from "next/server";
import { generatePredictionsForUpcoming, syncUpcomingFixtures, refreshRemainingLivePredictions } from "@/lib/sports/db";
import { ALL_LEAGUE_IDS } from "@/lib/sports/api-football";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    // If admin explicitly requested to search and append new alerts for remaining today matches
    if (body.refreshRemaining) {
      const result = await refreshRemainingLivePredictions();
      return NextResponse.json({
        success: true,
        message: result.count > 0 
          ? `✓ Se agregaron ${result.count} nuevas alertas para los partidos restantes del día. Total actual: ${result.totalAlerts}`
          : `✓ El mercado actual está al día con ${result.totalAlerts} alertas. No hay partidos nuevos adicionales por comenzar.`,
        count: result.count,
        totalAlerts: result.totalAlerts,
        predictions: result.predictions,
      });
    }

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
