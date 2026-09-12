import { NextRequest, NextResponse } from "next/server";
import { generatePredictionsForUpcoming, syncUpcomingFixtures, refreshRemainingLivePredictions, reconcileAndSettleAllSnapshots } from "@/lib/sports/db";
import { ALL_LEAGUE_IDS } from "@/lib/sports/api-football";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    // If admin explicitly requested to search and append new alerts for remaining matches
    if (body.refreshRemaining) {
      const result = await refreshRemainingLivePredictions();
      return NextResponse.json({
        success: true,
        message: result.count > 0 
          ? `✓ Se agregaron ${result.count} nuevas alertas para los partidos restantes. Total actual: ${result.totalAlerts}`
          : `✓ El mercado actual está al día con ${result.totalAlerts} alertas.`,
        count: result.count,
        totalAlerts: result.totalAlerts,
        predictions: result.predictions,
      });
    }

    const leagueIds = body.leagueIds || ALL_LEAGUE_IDS;

    // 1. First ensure upcoming fixtures are synchronized
    await syncUpcomingFixtures(leagueIds, 7).catch((err) => {
      console.warn("[API /api/admin/sync/predictions] Fixture sync warning:", err);
    });

    // 2. Generate predictions across all target leagues with forceRefresh: true
    const predictions = await generatePredictionsForUpcoming(leagueIds, true);

    // 3. Reconcile and settle finished matches into immutable history
    await reconcileAndSettleAllSnapshots().catch(() => ({ settledCount: 0 }));

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
