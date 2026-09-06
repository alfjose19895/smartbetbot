import { NextResponse } from "next/server";
import { getLiveInPlayPredictions } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const liveSignals = await getLiveInPlayPredictions();
    return NextResponse.json({
      success: true,
      count: liveSignals.length,
      signals: liveSignals,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load live signals";
    console.error("[API /api/live] Error:", error);
    return NextResponse.json(
      { success: false, error: message, count: 0, signals: [] },
      { status: 500 }
    );
  }
}
