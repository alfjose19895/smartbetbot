import { NextRequest, NextResponse } from "next/server";
import { addPredictionsToDailySnapshotAsync } from "@/lib/sports/db";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const identity = await getVerifiedIdentity();
    if (identity && identity.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "No autorizado. Requiere rol de administrador." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawPredictions = body.predictions;
    if (!Array.isArray(rawPredictions) || rawPredictions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere un arreglo de pronósticos para publicar." },
        { status: 400 }
      );
    }

    const result = await addPredictionsToDailySnapshotAsync(rawPredictions as MarketOpportunity[]);

    return NextResponse.json({
      success: true,
      addedCount: result.addedCount,
      totalAlerts: result.totalAlerts,
      predictions: result.predictions,
      message: `✓ Se publicaron exitosamente ${result.addedCount} pronóstico(s) en los módulos de Dashboard y Alertas.`,
    });
  } catch (error: any) {
    console.error("[API /api/mcp/publish] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al publicar pronósticos." },
      { status: 500 }
    );
  }
}
