import { NextResponse } from "next/server";
import { generatePredictionsForUpcoming } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const predictions = await generatePredictionsForUpcoming();

    return NextResponse.json({
      success: true,
      message: `Generación completada: ${predictions.length} pronósticos de valor procesados.`,
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
