import { canAccessVipModule } from "@/lib/auth/vip-permissions";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import {
  generatePredictionsForUpcoming,
  getStoredPredictions,
  loadDailySnapshotAsync,
  getEcuadorDateString,
  settleAllSnapshotsWithRealScores,
} from "@/lib/sports/db";
import { MarketOpportunity, isPreMatchQualified } from "@/lib/sports/prediction-engine";
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

    // Guard: VIP modules check permissions (Admin or user with assigned permission)
    const VIP_SPORTS = ["corners_vip", "cards_vip", "shots_vip", "over25_vip", "btts_vip", "home_win_vip", "away_win_vip"];
    if (VIP_SPORTS.includes(sport)) {
      const identity = await getVerifiedIdentity();
      const hasAccess = canAccessVipModule(identity, sport);
      if (!hasAccess) {
        return NextResponse.json(
          { error: `Acceso no autorizado. Tu cuenta no tiene permiso asignado para el módulo VIP (${sport}).` },
          { status: 403 }
        );
      }
    }

    // 1. NBA SPORT SIGNALS (100% passive from immutable daily snapshot across 8 sub-modules)
    if (sport === "nba") {
      const { NBASyncEngine } = await import("@/lib/sports/nba/nba-sync");
      const dateParam = searchParams.get("date") || undefined;
      const nbaData = await NBASyncEngine.getTodayNBASignals(dateParam, forceRefresh);
      let signals = (nbaData.signals || []).map(multiSportSignalToOpportunity);

      const moduleFilter = searchParams.get("module");
      if (moduleFilter && moduleFilter !== "all") {
        signals = signals.filter((p: any) => p.subModule === moduleFilter);
      }
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
          gamesCount: nbaData.gamesCount,
          smartPick: nbaData.smartPick ? multiSportSignalToOpportunity(nbaData.smartPick) : null,
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

    // 1. NHL SPORT SIGNALS (100% passive from immutable daily snapshot)
    if (sport === "nhl") {
      const dateParam = searchParams.get("date") || undefined;
      const nhlData = await NHLSyncEngine.getTodayNHLSignals(dateParam, forceRefresh);
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
    const dateParam = searchParams.get("date") || undefined;
    const targetDateStr = dateParam || getEcuadorDateString(Date.now());

    // Note: Settlement is decoupled from client GET requests to guarantee fast response (<50ms)
    // and prevent Serverless Function Timeouts (10s Vercel limit). Settlement runs via Cron or Admin.
    let predictions: MarketOpportunity[] = [];

    if (forceRefresh) {
      try {
        await settleAllSnapshotsWithRealScores().catch(() => {});
        predictions = await generatePredictionsForUpcoming(undefined, true);
      } catch (genErr) {
        console.warn("[API /api/signals] Generation error on force refresh:", genErr);
        predictions = getStoredPredictions("football");
      }
    } else {
      predictions = (await loadDailySnapshotAsync(targetDateStr, "football")) || [];
      if ((!predictions || predictions.length === 0) && targetDateStr === getEcuadorDateString(Date.now())) {
        predictions = getStoredPredictions("football");
      }
    }

    // Strict football-only filter (Excludes other sports like NHL, NBA, NFL)
    const isPreMatchRequest = searchParams.get("prematch") === "true";
    predictions = predictions.filter((p) => {
      const c = (p.country || "").toUpperCase();
      const l = (p.league || "").toUpperCase();
      const sp = ((p as any).sport || "").toLowerCase();
      const isOtherSport = c === "NHL" || l.includes("NHL") || sp === "nhl" || c === "NBA" || l.includes("NBA") || sp === "nba" || c === "NFL" || sp === "nfl";
      return !isOtherSport;
    });

    if (isPreMatchRequest) {
      predictions = predictions.filter(isPreMatchQualified);
    }

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
