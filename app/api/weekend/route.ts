import { NextRequest, NextResponse } from "next/server";
import {
  getWeekendExclusiveSlate,
  getWeekendCycleInfo,
  listWeekendEditions,
  WeekendExclusivePick,
} from "@/lib/sports/weekend-exclusive";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";
    const dayFilter = (searchParams.get("day") || "all").toLowerCase();
    const ruleFilter = (searchParams.get("rule") || "all").toLowerCase();
    const archiveDate = searchParams.get("archive");

    let slateDate: Date | undefined = undefined;
    if (archiveDate && /^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) {
      slateDate = new Date(`${archiveDate}T12:00:00Z`);
    }

    const slate = await getWeekendExclusiveSlate({
      forceRefresh,
      refDate: slateDate,
    });

    let filteredPicks: WeekendExclusivePick[] = slate.picks;

    if (dayFilter !== "all") {
      filteredPicks = filteredPicks.filter((p) => p.dayOfWeek === dayFilter);
    }

    if (ruleFilter !== "all") {
      filteredPicks = filteredPicks.filter(
        (p) => p.ruleMatch && p.ruleMatch.ruleId === ruleFilter
      );
    }

    const editions = listWeekendEditions();

    return NextResponse.json(
      {
        success: true,
        cycle: slate.cycle,
        targetCount: slate.targetCount,
        stats: slate.stats,
        picks: filteredPicks,
        totalPicksInSlate: slate.picks.length,
        editions,
        generatedAt: slate.generatedAt,
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
    const msg = error instanceof Error ? error.message : "Failed to load weekend exclusives";
    console.error("[API /api/weekend] Error in GET handler:", error);
    const fallbackCycle = getWeekendCycleInfo();
    return NextResponse.json(
      {
        success: false,
        error: msg,
        cycle: fallbackCycle,
        picks: [],
        stats: {
          totalPicks: 0,
          avgProbability: 0,
          avgOdds: 0,
          byRule: { corners: 0, btts: 0, goals: 0, local: 0, away: 0 },
          byDay: { friday: 0, saturday: 0, sunday: 0 },
        },
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const slate = await getWeekendExclusiveSlate({ forceRefresh: true });
    return NextResponse.json({
      success: true,
      message: "Weekend exclusive slate refreshed successfully",
      count: slate.picks.length,
      cycle: slate.cycle,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to refresh weekend slate";
    console.error("[API /api/weekend] Error in POST refresh:", error);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
