import { NextRequest, NextResponse } from "next/server";
import {
  getStoredPredictions,
  generatePredictionsForUpcoming,
  getEcuadorDateString,
  loadDailySnapshot,
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

    const nowMs = Date.now();
    const todayDateStr = getEcuadorDateString(nowMs);

    let predictions: MarketOpportunity[] = [];

    if (forceRefresh) {
      try {
        predictions = await generatePredictionsForUpcoming(undefined, true);
      } catch (genErr) {
        console.warn("[API /api/signals] Force-generation error:", genErr);
      }
    }

    if (!predictions || predictions.length === 0) {
      // 1. Check if today's snapshot exists
      const todaySnapshot = loadDailySnapshot(todayDateStr);

      if (todaySnapshot && Array.isArray(todaySnapshot) && todaySnapshot.length > 0) {
        predictions = todaySnapshot;
      } else {
        // 2. Automatically generate fresh predictions for today
        try {
          predictions = await generatePredictionsForUpcoming();
        } catch (genErr) {
          console.warn("[API /api/signals] Auto-generation error, loading latest stored:", genErr);
        }
        if (!predictions || predictions.length === 0) {
          predictions = getStoredPredictions();
        }
      }
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
