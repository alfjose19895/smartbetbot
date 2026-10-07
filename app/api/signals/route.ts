import { NextRequest, NextResponse } from "next/server";
import {
  generatePredictionsForUpcoming,
  getStoredPredictions,
  loadDailySnapshotAsync,
  getEcuadorDateString,
  settleAllSnapshotsWithRealScores,
} from "@/lib/sports/db";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { NHLSyncEngine } from "@/lib/sports/nhl/nhl-sync";
import { multiSportSignalToOpportunity } from "@/lib/sports/signal-adapters";
import { matchesMarketFilter } from "@/lib/sports/registry";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = (searchParams.get("sport") || "football").toLowerCase();
    const leagueFilter = searchParams.get("league");
    const marketFilter = searchParams.get("market");
    const minProb = parseFloat(searchParams.get("minProb") || "0");
    const forceRefresh = searchParams.get("refresh") === "true";

    // 1. NHL SPORT SIGNALS
    if (sport === "nhl") {
      const nhlData = await NHLSyncEngine.getTodayNHLSignals();
      let signals = (nhlData.signals || []).map(multiSportSignalToOpportunity);

      if (leagueFilter) {
        signals = signals.filter((p) =>
          (p.league || "").toLowerCase().includes(leagueFilter.toLowerCase())
        );
      }
      if (marketFilter) {
        signals = signals.filter((p) =>
          matchesMarketFilter(marketFilter, p.market, (p as any).selection)
        );
      }
      if (minProb > 0) {
        signals = signals.filter((p) => p.probability >= minProb);
      }

      return NextResponse.json(
        {
          success: true,
          count: signals.length,
          signals,
          gamesCount: nhlData.gamesCount,
          smartPick: nhlData.smartPick ? multiSportSignalToOpportunity(nhlData.smartPick) : null,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Vercel-CDN-Cache-Control": "no-store",
          },
        }
      );
    }

    // 2. FOOTBALL SPORT SIGNALS (STRICTLY ISOLATED)
    const todayDateStr = getEcuadorDateString(Date.now());

    await settleAllSnapshotsWithRealScores().catch((settleErr) => {
      console.warn("[API /api/signals] Auto-settlement non-fatal error:", settleErr);
    });

    let predictions: MarketOpportunity[] = [];

    if (forceRefresh) {
      try {
        predictions = await generatePredictionsForUpcoming(undefined, true);
      } catch (genErr) {
        console.warn("[API /api/signals] Generation error on force refresh:", genErr);
        predictions = getStoredPredictions("football");
      }
    } else {
      predictions = getStoredPredictions("football");
      if (!predictions || predictions.length === 0) {
        predictions = (await loadDailySnapshotAsync(todayDateStr, "football")) || [];
      }
      if (!predictions || predictions.length === 0) {
        try {
          predictions = await generatePredictionsForUpcoming(undefined, false);
        } catch {
          predictions = [];
        }
      }
    }

    // Strict football-only filter
    predictions = predictions.filter((p) => {
      const c = (p.country || "").toUpperCase();
      const l = (p.league || "").toUpperCase();
      const sp = ((p as any).sport || "").toLowerCase();
      return c !== "NHL" && !l.includes("NHL") && sp !== "nhl" && c !== "NBA" && !l.includes("NBA") && sp !== "nba" && c !== "NFL" && sp !== "nfl";
    });

    if (leagueFilter) {
      predictions = predictions.filter((p) =>
        (p.league || "").toLowerCase().includes(leagueFilter.toLowerCase())
      );
    }

    if (marketFilter) {
      predictions = predictions.filter((p) =>
        matchesMarketFilter(marketFilter, p.market, (p as any).selection)
      );
    }

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
