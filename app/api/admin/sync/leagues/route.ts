import { NextRequest, NextResponse } from "next/server";
import { syncLeaguesAndTeams } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const leagueIds = body.leagueIds || [39, 140];

    const result = await syncLeaguesAndTeams(leagueIds);

    return NextResponse.json({
      success: true,
      message: `Sincronización completada: ${result.leaguesSaved} ligas y ${result.teamsSaved} equipos actualizados.`,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al sincronizar ligas";
    console.error("[API /api/admin/sync/leagues] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
