import { NextRequest, NextResponse } from "next/server";
import {
  generatePredictionsForUpcoming,
  getStoredPredictions,
} from "@/lib/sports/db";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueFilter = searchParams.get("league");
    const marketFilter = searchParams.get("market");
    const minProb = parseFloat(searchParams.get("minProb") || "0");
    const forceRefresh = searchParams.get("refresh") === "true";

    let predictions: MarketOpportunity[] = [];

    try {
      // Always call generatePredictionsForUpcoming so it evaluates finished match scores & statuses (won/lost)
      predictions = await generatePredictionsForUpcoming(undefined, forceRefresh);
    } catch (genErr) {
      console.warn("[API /api/signals] Generation error, loading latest stored:", genErr);
      predictions = getStoredPredictions();
    }

    if (!predictions || predictions.length === 0) {
      predictions = getStoredPredictions();
    }

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
