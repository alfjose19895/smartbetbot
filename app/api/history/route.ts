import { NextRequest, NextResponse } from "next/server";
import { getHistoricalSettledPredictions } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const league = searchParams.get("league");
    const result = searchParams.get("result");

    const history = await getHistoricalSettledPredictions();

    let filtered = history;
    if (league && league !== "all") {
      filtered = filtered.filter((h) => h.league.toLowerCase().includes(league.toLowerCase()));
    }
    if (result && result !== "ALL") {
      filtered = filtered.filter((h) => h.result === result);
    }

    return NextResponse.json({
      success: true,
      count: filtered.length,
      history: filtered,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al cargar historial";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
