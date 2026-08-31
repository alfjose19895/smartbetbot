import { NextRequest, NextResponse } from "next/server";
import { getHistoricalSettledPredictions, getHistoricalSettledParlays } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const league = searchParams.get("league");
    const result = searchParams.get("result");
    const date = searchParams.get("date");
    const type = searchParams.get("type"); // "picks" | "parlays" | "all"

    const [history, parlays] = await Promise.all([
      getHistoricalSettledPredictions(),
      getHistoricalSettledParlays(),
    ]);

    let filteredHistory = history;
    let filteredParlays = parlays;

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
