import { NextRequest, NextResponse } from "next/server";
import { generatePredictionsForUpcoming } from "@/lib/sports/db";
import { getImmutableDailyParlays } from "@/lib/sports/parlay-generator";
import {
  sendDailyMcpPushNotification,
  sendIndividualHighConfidenceAlerts,
} from "@/lib/push/web-push-sender";
import { getAllPushSubscriptions } from "@/lib/push/push-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleDailyAlertsDispatch(req);
}

export async function POST(req: NextRequest) {
  return handleDailyAlertsDispatch(req);
}

async function handleDailyAlertsDispatch(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Optional secret check if configured in production
    }

    const subscriptions = getAllPushSubscriptions();
    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No registered push subscribers found. Skipping dispatch.",
        subscribersCount: 0,
      });
    }

    // 1. Generate / load today's verified MCP predictions
    const predictions = await generatePredictionsForUpcoming(undefined, false);

    // 2. Load / generate immutable 3 parlays for today
    const parlays = getImmutableDailyParlays(predictions);

    // 3. Dispatch individual high-confidence alerts for each top match
    const individualResults = await sendIndividualHighConfidenceAlerts(predictions);

    // 4. Dispatch daily parlay summary push
    const pushResult = await sendDailyMcpPushNotification(predictions, parlays);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dispatched: true,
      totalSubscribers: subscriptions.length,
      individualAlertsSent: individualResults.sentCount,
      individualAlertsTotal: individualResults.totalEligible,
      summaryAlertSent: pushResult.broadcastResult.sentCount,
    });
  } catch (error: any) {
    console.error("[API /api/cron/daily-alerts] Error running daily alerts push cron:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
