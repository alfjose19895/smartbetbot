import { NextRequest, NextResponse } from "next/server";
import { generatePredictionsForUpcoming } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueFilter = searchParams.get("league");
    const marketFilter = searchParams.get("market");
    const minProb = parseFloat(searchParams.get("minProb") || "0");

    let predictions = await generatePredictionsForUpcoming();

    if (leagueFilter) {
      predictions = predictions.filter((p) =>
        p.league.toLowerCase().includes(leagueFilter.toLowerCase())
      );
    }

    if (marketFilter) {
      predictions = predictions.filter((p) =>
        p.market.toLowerCase().includes(marketFilter.toLowerCase())
      );
    }

    if (minProb > 0) {
      predictions = predictions.filter((p) => p.probability >= minProb);
    }

    return NextResponse.json({
      success: true,
      count: predictions.length,
      signals: predictions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load signals";
    console.error("[API /api/signals] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
