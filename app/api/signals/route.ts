import { NextRequest, NextResponse } from "next/server";
import {
  generatePredictionsForUpcoming,
  getStoredPredictions,
  getEcuadorDateString,
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

    // Cache-first: Read from stored disk/memory snapshot unless explicitly told to refresh
    if (forceRefresh) {
      try {
        predictions = await generatePredictionsForUpcoming(undefined, true);
      } catch (genErr) {
        console.warn("[API /api/signals] Generation error on force refresh:", genErr);
        predictions = getStoredPredictions();
      }
    } else {
      predictions = getStoredPredictions();
      // If store is completely empty, initialize once
      if (!predictions || predictions.length === 0) {
        try {
          predictions = await generatePredictionsForUpcoming(undefined, false);
        } catch {
          predictions = [];
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

    // REGLA ESTRICTA: Filtrar exclusivamente pronósticos de la fecha actual en Ecuador (UTC-5)
    const todayDateStr = getEcuadorDateString(Date.now());
    predictions = predictions.filter((p) => {
      const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
      return pDate === todayDateStr;
    });

    if (minProb > 0) {
      predictions = predictions.filter((p) => p.probability >= minProb);
    }

    return NextResponse.json(
      {
        success: true,
        count: predictions.length,
        signals: predictions,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load signals";
    console.error("[API /api/signals] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
