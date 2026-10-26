import { NextRequest, NextResponse } from "next/server";
import { searchAndAddNewAlerts, syncUpcomingFixtures, reconcileAndSettleAllSnapshots } from "@/lib/sports/db";
import { ALL_LEAGUE_IDS } from "@/lib/sports/api-football";
import { sendIndividualHighConfidenceAlerts } from "@/lib/push/web-push-sender";
import { NHLSyncEngine } from "@/lib/sports/nhl/nhl-sync";
import { NBASyncEngine } from "@/lib/sports/nba/nba-sync";
import { isSportFeatureEnabled } from "@/lib/sports/config";
import { SportProviderRouter } from "@/lib/sports/provider-router";
import { SupportedSport } from "@/lib/sports/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sport = (body.sport || "all").toLowerCase();
    const leagueIds = body.leagueIds || ALL_LEAGUE_IDS;

    // 1. NHL SPECIFIC SYNC
    if (sport === "nhl") {
      const nhlResult = await NHLSyncEngine.getTodayNHLSignals();
      const mappedPredictions = nhlResult.signals.map((s) => ({
        id: `nhl-${s.id}`,
        fixtureId: s.game.id,
        match: `${s.game.homeTeam.name} vs ${s.game.awayTeam.name}`,
        homeTeam: s.game.homeTeam.name,
        awayTeam: s.game.awayTeam.name,
        league: "NHL",
        country: "USA / Canadá",
        market: s.market,
        selection: s.selection,
        odds: s.decimalOdds,
        fairOdds: Number((1 / (s.modelProbability || 0.55)).toFixed(2)),
        probability: Math.round(s.modelProbability * 100),
        smartScore: s.smartScore,
        edge: s.expectedValue,
        expectedValue: s.expectedValue,
        confidence: (s.classification === "TOP PICK" ? "Muy Alta" : "Alta") as any,
        explanation: s.explanation || "Análisis cuantitativo xG y porteros titulares NHL.",
        kickoff: s.game.startsAt,
        status: "pending" as const,
        bookmaker: "Bet365",
        bookmakerOdds: s.decimalOdds,
        pickBadge: (s.classification === "TOP PICK" ? "bomba" : "valor") as any,
        source: "nhl_engine",
      }));

      return NextResponse.json({
        success: true,
        sport: "nhl",
        message: `Sincronización NHL completada: ${nhlResult.signals.length} señales generadas.`,
        count: nhlResult.signals.length,
        newCount: nhlResult.signals.length,
        smartPick: nhlResult.smartPick,
        totalGames: nhlResult.gamesCount,
        signals: nhlResult.signals,
        predictions: mappedPredictions,
      });
    }

    // 2. NBA SPECIFIC SYNC
    if (sport === "nba") {
      const nbaResult = await NBASyncEngine.getTodayNBASignals();
      const mappedPredictions = nbaResult.signals.map((s) => ({
        id: `nba-${s.id}`,
        fixtureId: s.game.id,
        match: `${s.game.homeTeam.name} vs ${s.game.awayTeam.name}`,
        homeTeam: s.game.homeTeam.name,
        awayTeam: s.game.awayTeam.name,
        league: "NBA",
        country: "USA / Canadá",
        market: s.market,
        selection: s.selection,
        odds: s.decimalOdds,
        fairOdds: Number((1 / (s.modelProbability || 0.55)).toFixed(2)),
        probability: Math.round(s.modelProbability * 100),
        smartScore: s.smartScore,
        edge: s.expectedValue,
        expectedValue: s.expectedValue,
        confidence: (s.classification === "TOP PICK" ? "Muy Alta" : "Alta") as any,
        explanation: s.explanation || "Análisis cuantitativo de ratings ofensivos/defensivos y boxscores NBA.",
        kickoff: s.game.startsAt,
        status: "pending" as const,
        bookmaker: "Bet365",
        bookmakerOdds: s.decimalOdds,
        pickBadge: (s.classification === "TOP PICK" ? "bomba" : "valor") as any,
        source: "nba_engine",
        sport: "nba",
      }));

      return NextResponse.json({
        success: true,
        sport: "nba",
        message: `Sincronización NBA completada: ${nbaResult.signals.length} señales generadas.`,
        count: nbaResult.signals.length,
        newCount: nbaResult.signals.length,
        smartPick: nbaResult.smartPick,
        totalGames: nbaResult.gamesCount,
        signals: nbaResult.signals,
        predictions: mappedPredictions,
      });
    }

    // 3. NFL / NCAAF SYNC
    if (sport === "nfl" || sport === "ncaaf") {
      const provider = SportProviderRouter.getProvider(sport as SupportedSport);
      const todayIso = new Date().toISOString().split("T")[0];
      const schedule = provider ? await provider.getSchedule(todayIso) : [];

      return NextResponse.json({
        success: true,
        sport,
        message: `Sincronización ${sport.toUpperCase()} completada (${schedule.length} partidos programados).`,
        count: schedule.length,
        newCount: schedule.length,
        totalGames: schedule.length,
        predictions: [],
      });
    }

    // 3. FOOTBALL SYNC (Default or Football specific)
    // 1. Ensure upcoming fixtures are synchronized
    await syncUpcomingFixtures(leagueIds, 7).catch((err) => {
      console.warn("[API /api/admin/sync/predictions] Fixture sync warning:", err);
    });

    // 2. Search and append new alerts into daily snapshot preserving all existing picks
    const result = await searchAndAddNewAlerts(leagueIds);

    // 3. Reconcile and settle finished matches into immutable history
    await reconcileAndSettleAllSnapshots().catch(() => ({ settledCount: 0 }));

    // 4. Dispatch push notifications to all registered subscribers if new alerts were found
    if (result.newAlerts && result.newAlerts.length > 0) {
      sendIndividualHighConfidenceAlerts(result.newAlerts).catch((pushErr) => {
        console.warn("[API /api/admin/sync/predictions] Push notification broadcast warning:", pushErr);
      });
    }

    // If 'all' was requested, also include NHL and NBA counts
    let nhlSignalsCount = 0;
    if (sport === "all" && isSportFeatureEnabled("nhl")) {
      try {
        const nhlRes = await NHLSyncEngine.getTodayNHLSignals();
        nhlSignalsCount = nhlRes.signals.length;
      } catch (nhlErr) {
        console.warn("[API /api/admin/sync/predictions] NHL sync warning:", nhlErr);
      }
    }

    let nbaSignalsCount = 0;
    if (sport === "all" && isSportFeatureEnabled("nba")) {
      try {
        const nbaRes = await NBASyncEngine.getTodayNBASignals();
        nbaSignalsCount = nbaRes.signals.length;
      } catch (nbaErr) {
        console.warn("[API /api/admin/sync/predictions] NBA sync warning:", nbaErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        sport,
        message: sport === "all"
          ? `${result.message} (+ ${nhlSignalsCount} señales NHL, + ${nbaSignalsCount} señales NBA)`
          : result.message,
        count: result.totalAlerts + nhlSignalsCount + nbaSignalsCount,
        newCount: result.newCount + nhlSignalsCount + nbaSignalsCount,
        newAlerts: result.newAlerts,
        predictions: result.predictions,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al buscar alertas de hoy";
    console.error("[API /api/admin/sync/predictions] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
