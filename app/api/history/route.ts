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
          const isNhl = c === "NHL" || l.includes("NHL");
          const isNba = c === "NBA" || l.includes("NBA");
          const isNfl = c === "NFL" || c === "NCAAF" || l.includes("NFL") || l.includes("NCAA");
          return !isNhl && !isNba && !isNfl;
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.every((l) => {
            const c = (l.country || "").toUpperCase();
            const lg = (l.league || "").toUpperCase();
            return c !== "NHL" && !lg.includes("NHL") && c !== "NBA" && !lg.includes("NBA") && c !== "NFL";
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
          p.legs.some((l) => (l.country || "").toUpperCase() === "NHL" || l.league.toUpperCase().includes("NHL"))
        );
      } else if (sport === "nba") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          return c === "NBA" || l.includes("NBA") || s === "nba";
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.some((l) => (l.country || "").toUpperCase() === "NBA" || l.league.toUpperCase().includes("NBA"))
        );
      } else if (sport === "nfl") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          return (c === "NFL" || l.includes("NFL") || s === "nfl") && !l.includes("NCAA") && s !== "ncaaf";
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.some((l) => (l.country || "").toUpperCase() === "NFL" || l.league.toUpperCase().includes("NFL"))
        );
      } else if (sport === "ncaaf") {
        filteredHistory = filteredHistory.filter((h) => {
          const c = (h.country || "").toUpperCase();
          const l = (h.league || "").toUpperCase();
          const s = ((h as any).sport || "").toLowerCase();
          return c === "NCAAF" || l.includes("NCAA") || s === "ncaaf";
        });
        filteredParlays = filteredParlays.filter((p) =>
          p.legs.some((l) => (l.country || "").toUpperCase() === "NCAAF" || l.league.toUpperCase().includes("NCAA"))
        );
      }
    }

    if (date && date !== "all") {
      filteredHistory = filteredHistory.filter((h) => h.date === date || (h.kickoff && h.kickoff.startsWith(date)));
      filteredParlays = filteredParlays.filter((p) => p.date === date);
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
