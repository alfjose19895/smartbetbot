import { NextRequest, NextResponse } from "next/server";
import { syncUpcomingFixtures, generatePredictionsForUpcoming, getHistoricalSettledPredictions, reconcileAndSettleAllSnapshots } from "@/lib/sports/db";
import { ALL_LEAGUE_IDS } from "@/lib/sports/api-football";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[CRON /api/cron/sync] Executing automatic synchronization...");

    // 1. Sync upcoming fixtures across all active leagues
    const fixturesResult = await syncUpcomingFixtures(ALL_LEAGUE_IDS, 7);

    // 2. Generate curated high-precision predictions
    const predictions = await generatePredictionsForUpcoming(ALL_LEAGUE_IDS);

    // 3. Sincronización y generación automática de todos los módulos VIP
    const vipResults = await Promise.allSettled([
      import("@/lib/sports/corners-vip-server").then((m) => m.getCornersVipSlate(undefined, true)),
      import("@/lib/sports/cards-vip-server").then((m) => m.getCardsVipSlate(undefined, true)),
      import("@/lib/sports/shots-vip-server").then((m) => m.getShotsVipSlate(undefined, true)),
      import("@/lib/sports/home-win-vip-server").then((m) => m.getHomeWinVipSlate(undefined, true)),
      import("@/lib/sports/away-win-vip-server").then((m) => m.getAwayWinVipSlate(undefined, true)),
      import("@/lib/sports/btts-vip-server").then((m) => m.getBttsVipSlate(undefined, true)),
      import("@/lib/sports/over25-vip-server").then((m) => m.getOver25VipSlate(undefined, true)),
    ]);

    const vipSuccessCount = vipResults.filter((r) => r.status === "fulfilled").length;

    // 4. Master immutable settlement and dual persistence
    const settlement = await reconcileAndSettleAllSnapshots();
    const history = await getHistoricalSettledPredictions();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      fixturesSaved: fixturesResult.fixturesSaved,
      predictionsGenerated: predictions.length,
      vipModulesSynced: vipSuccessCount,
      historySettled: history.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cron sync error";
    console.error("[CRON /api/cron/sync] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
