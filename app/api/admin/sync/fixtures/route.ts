import { NextRequest, NextResponse } from "next/server";
import { syncUpcomingFixtures } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const leagueIds = body.leagueIds || [39, 140];
    const lookahead = body.lookaheadDays || 7;

    const result = await syncUpcomingFixtures(leagueIds, lookahead);

    return NextResponse.json({
      success: true,
      message: `Sincronización de partidos completada: ${result.fixturesSaved} partidos actualizados.`,
      result,
    });
  } catch (error: any) {
    console.error("[API /api/admin/sync/fixtures] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al sincronizar partidos" },
      { status: 500 }
    );
  }
}
