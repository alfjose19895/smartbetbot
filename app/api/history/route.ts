import { NextRequest, NextResponse } from "next/server";
import { getHistoricalSettledPredictions, getHistoricalSettledParlays, settleAllSnapshotsWithRealScores } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = (searchParams.get("sport") || "").toLowerCase().trim();
    const league = searchParams.get("league");
    const result = searchParams.get("result");
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const minProb = searchParams.get("minProb");
    const maxProb = searchParams.get("maxProb");
    const type = searchParams.get("type"); // "picks" | "parlays" | "all"

    // Auto-liquidar todas las alertas finalizadas antes de servir historial
    await settleAllSnapshotsWithRealScores().catch(() => {});

    const [history, parlays] = await Promise.all([
      getHistoricalSettledPredictions(true),
      getHistoricalSettledParlays(),
    ]);

    let filteredHistory = history;
    let filteredParlays = parlays;

    // Strict Sport Isolation
    if (sport) {
      if (sport === "football") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          const isNhl = c === "NHL" || l.includes("NHL") || s === "nhl";
          const isNba = c === "NBA" || l.includes("NBA") || s === "nba";
          const isNfl = c === "NFL" || c === "NCAAF" || l.includes("NFL") || l.includes("NCAA") || s === "nfl" || s === "ncaaf";
          return !isNhl && !isNba && !isNfl;
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.every((l) => {
            const c = (l.country || "").toUpperCase();
            const lg = (l.league || "").toUpperCase();
            const s = ((l as any).sport || "").toLowerCase();
            return c !== "NHL" && !lg.includes("NHL") && c !== "NBA" && !lg.includes("NBA") && c !== "NFL" && s !== "nhl";
          })
        );
      } else if (sport === "nhl") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          return c === "NHL" || l.includes("NHL") || s === "nhl";
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.some((l) => (l.country || "").toUpperCase() === "NHL" || l.league.toUpperCase().includes("NHL") || ((l as any).sport || "").toLowerCase() === "nhl")
        );
      } else if (sport === "nba") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          return c === "NBA" || l.includes("NBA") || s === "nba";
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.some((l) => (l.country || "").toUpperCase() === "NBA" || l.league.toUpperCase().includes("NBA") || ((l as any).sport || "").toLowerCase() === "nba")
        );
      } else if (sport === "nfl") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          return (c === "NFL" || l.includes("NFL") || s === "nfl") && !l.includes("NCAA") && s !== "ncaaf";
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.some((l) => (l.country || "").toUpperCase() === "NFL" || l.league.toUpperCase().includes("NFL") || ((l as any).sport || "").toLowerCase() === "nfl")
        );
      } else if (sport === "ncaaf") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          return c === "NCAAF" || l.includes("NCAA") || s === "ncaaf";
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.some((l) => (l.country || "").toUpperCase() === "NCAAF" || l.league.toUpperCase().includes("NCAA") || ((l as any).sport || "").toLowerCase() === "ncaaf")
        );
      } else if (sport === "corners_vip") {
        filteredHistory = filteredHistory.filter((h) => h.isCornersVip || h.source === "corners_vip" || h.pickBadge === "corners_vip" || ((h as any).sport || "") === "corners_vip");
        filteredParlays = [];
      } else if (sport === "cards_vip") {
        filteredHistory = filteredHistory.filter((h) => h.isCardsVip || h.source === "cards_vip" || h.pickBadge === "cards_vip" || ((h as any).sport || "") === "cards_vip");
        filteredParlays = [];
      } else if (sport === "shots_vip") {
        filteredHistory = filteredHistory.filter((h) => h.isShotsVip || h.source === "shots_vip" || h.pickBadge === "shots_vip" || ((h as any).sport || "") === "shots_vip");
        filteredParlays = [];
      } else if (sport === "over25_vip") {
        filteredHistory = filteredHistory.filter((h) => h.isOver25Vip || h.source === "over25_vip" || h.pickBadge === "over25_vip" || ((h as any).sport || "") === "over25_vip");
        filteredParlays = [];
      } else if (sport === "btts_vip") {
        filteredHistory = filteredHistory.filter((h) => h.isBttsVip || h.source === "btts_vip" || h.pickBadge === "btts_vip" || ((h as any).sport || "") === "btts_vip");
        filteredParlays = [];
      }
    }

    // Single Date Filter
    if (date && date !== "all") {
      filteredHistory = filteredHistory.filter((h) => h.date === date || (h.kickoff && h.kickoff.startsWith(date)));
      filteredParlays = filteredParlays.filter((p) => p.date === date);
    }

    // Date Range Filter
    if (startDate) {
      filteredHistory = filteredHistory.filter((h) => {
        const d = h.date || (h.kickoff ? h.kickoff.split("T")[0] : "");
        return d >= startDate;
      });
      filteredParlays = filteredParlays.filter((p) => p.date >= startDate);
    }
    if (endDate) {
      filteredHistory = filteredHistory.filter((h) => {
        const d = h.date || (h.kickoff ? h.kickoff.split("T")[0] : "");
        return d <= endDate;
      });
      filteredParlays = filteredParlays.filter((p) => p.date <= endDate);
    }

    // Probability Range Filter
    if (minProb) {
      const minVal = parseFloat(minProb);
      if (!isNaN(minVal)) {
        filteredHistory = filteredHistory.filter((h) => (h.probability ?? 50) >= minVal);
      }
    }
    if (maxProb) {
      const maxVal = parseFloat(maxProb);
      if (!isNaN(maxVal)) {
        filteredHistory = filteredHistory.filter((h) => (h.probability ?? 50) <= maxVal);
      }
    }

    if (league && league !== "all") {
      filteredHistory = filteredHistory.filter((h) => h.league.toLowerCase().includes(league.toLowerCase()));
      filteredParlays = filteredParlays.filter((p) =>
        p.legs.some((l) => l.league.toLowerCase().includes(league.toLowerCase()))
      );
    }

    if (result && result !== "ALL") {
      filteredHistory = filteredHistory.filter((h) => h.result === result);
      filteredParlays = filteredParlays.filter((p) => p.result === result);
    }

    return NextResponse.json({
      success: true,
      count: filteredHistory.length,
      history: filteredHistory,
      parlays: filteredParlays,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al cargar historial";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
