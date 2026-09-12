import webpush from "web-push";
import { VAPID_CONFIG } from "./vapid-config";
import {
  getAllPushSubscriptions,
  removePushSubscription,
  StoredPushSubscription,
} from "./push-store";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { TripleExclusiveParlays } from "@/lib/sports/parlay-generator";

// Initialize VAPID
webpush.setVapidDetails(
  VAPID_CONFIG.subject,
  VAPID_CONFIG.publicKey,
  VAPID_CONFIG.privateKey
);

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  id?: string;
  data?: Record<string, any>;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a push notification to a single subscriber.
 * Automatically cleans up expired or unsubscribed endpoints (HTTP 404 / 410).
 */
export async function sendNotificationToSubscription(
  sub: StoredPushSubscription,
  payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string; expired?: boolean }> {
  try {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 86400, // 24 hours
        urgency: "high",
      }
    );

    return { success: true };
  } catch (error: any) {
    const statusCode = error?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      console.warn(`[WebPush] Subscription expired (${statusCode}), removing:`, sub.endpoint);
      removePushSubscription(sub.endpoint);
      return { success: false, expired: true, error: "Subscription expired" };
    }
    console.error("[WebPush] Error sending notification:", error?.message || error);
    return { success: false, error: error?.message || "Send failed" };
  }
}

/**
 * Broadcasts a push notification to all registered devices.
 */
export async function broadcastPushNotification(
  payload: PushNotificationPayload
): Promise<{
  totalSubscribers: number;
  sentCount: number;
  failedCount: number;
  cleanedExpired: number;
}> {
  const subscriptions = getAllPushSubscriptions();
  if (subscriptions.length === 0) {
    return { totalSubscribers: 0, sentCount: 0, failedCount: 0, cleanedExpired: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;
  let cleanedExpired = 0;

  for (const sub of subscriptions) {
    const res = await sendNotificationToSubscription(sub, payload);
    if (res.success) {
      sentCount++;
    } else {
      failedCount++;
      if (res.expired) cleanedExpired++;
    }
  }

  return {
    totalSubscribers: subscriptions.length,
    sentCount,
    failedCount,
    cleanedExpired,
  };
}

/**
 * Sends individual push notification alerts for all high-confidence / high-probability matches of the day.
 * Dispatches sequentially with a small delay so every notification pops up individually on phone screens.
 */
export async function sendIndividualHighConfidenceAlerts(
  predictions: MarketOpportunity[],
  targetSubscription?: StoredPushSubscription
): Promise<{
  totalEligible: number;
  sentCount: number;
  failedCount: number;
  alerts: PushNotificationPayload[];
}> {
  if (!predictions || predictions.length === 0) {
    return { totalEligible: 0, sentCount: 0, failedCount: 0, alerts: [] };
  }

  // 1. Filter for High Confidence and High Probability picks focusing on Ganador Local & Over 2.5
  const eligiblePicks = predictions.filter((p) => {
    const isFocusMarket = p.market === "Ganador Local" || p.market === "Over 2.5 Goles";
    const isVeryHighConfidence =
      p.confidence === "Muy Alta" ||
      (p.confidenceScore && p.confidenceScore >= 70) ||
      (p.probability && p.probability >= 65);
    return isVeryHighConfidence || (isFocusMarket && p.probability >= 58);
  });

  // Sort by probability and edge descending
  const sortedPicks = (eligiblePicks.length > 0 ? eligiblePicks : predictions)
    .sort((a, b) => {
      if ((b.probability || 0) !== (a.probability || 0)) {
        return (b.probability || 0) - (a.probability || 0);
      }
      return (b.edge || 0) - (a.edge || 0);
    })
    .slice(0, 6); // Top 6 high confidence picks

  const payloads: PushNotificationPayload[] = sortedPicks.map((pick, idx) => {
    const marketEmoji = pick.market === "Ganador Local" ? "🏠" : pick.market === "Over 2.5 Goles" ? "⚽" : "🎯";
    const confidenceBadge = pick.confidence || (pick.probability >= 70 ? "Muy Alta" : "Alta");
    const leagueStr = pick.league ? `[${pick.league}]` : "";

    const matchTitle = `🔥 ${pick.homeTeam} vs ${pick.awayTeam} ${leagueStr}`.trim();
    const alertBody = `${marketEmoji} Pronóstico: ${pick.market} @${(pick.odds ?? 1.5).toFixed(2)} | Confianza: ${confidenceBadge} (${pick.probability}% Prob.)\n💡 ${pick.explanation ? pick.explanation.slice(0, 85) : "Valor cuantitativo +EV detectado por MCP"}`;

    return {
      title: matchTitle,
      body: alertBody,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      url: `/signals?id=${pick.id || pick.fixtureId}`,
      id: `pick-${pick.id || pick.fixtureId}-${idx}`,
      data: {
        type: "individual_high_confidence_alert",
        fixtureId: pick.fixtureId,
        match: pick.match,
        market: pick.market,
        odds: pick.odds,
        probability: pick.probability,
        confidence: pick.confidence,
      },
    };
  });

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    if (targetSubscription) {
      const res = await sendNotificationToSubscription(targetSubscription, payload);
      if (res.success) sentCount++;
      else failedCount++;
    } else {
      const res = await broadcastPushNotification(payload);
      sentCount += res.sentCount;
      failedCount += res.failedCount;
    }
    // Small delay between pushes to ensure individual delivery on devices
    if (i < payloads.length - 1) {
      await delay(250);
    }
  }

  return {
    totalEligible: sortedPicks.length,
    sentCount,
    failedCount,
    alerts: payloads,
  };
}

/**
 * Sends the daily morning MCP Sports Intelligence Push Notification with top Ganador Local & Over 2.5 picks.
 */
export async function sendDailyMcpPushNotification(
  topPicks: MarketOpportunity[],
  parlays?: TripleExclusiveParlays
): Promise<{
  broadcastResult: {
    totalSubscribers: number;
    sentCount: number;
    failedCount: number;
  };
  payload: PushNotificationPayload;
}> {
  const focusPicks = topPicks.filter(
    (p) => p.market === "Ganador Local" || p.market === "Over 2.5 Goles"
  );
  const bestPicks = focusPicks.length >= 2 ? focusPicks : topPicks;
  const pick1 = bestPicks[0];
  const pick2 = bestPicks[1];

  let bodyText = "";
  if (pick1 && pick2) {
    bodyText = `⭐ ${pick1.homeTeam} (${pick1.market} @${pick1.odds}) | ⭐ ${pick2.homeTeam} (${pick2.market} @${pick2.odds}) + 3 Parleys Exclusivos listos.`;
  } else if (pick1) {
    bodyText = `⭐ ${pick1.match}: ${pick1.market} @${pick1.odds} (Prob: ${pick1.probability}%). Entra a ver los 3 Parleys del día.`;
  } else {
    bodyText = "Las mejores oportunidades de Ganador Local y Over 2.5 Goles con valor matemático (+EV) están listas en la app.";
  }

  const payload: PushNotificationPayload = {
    title: "⚽ SmartBetBot MCP: Pronósticos y Parleys de Hoy",
    body: bodyText,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    url: "/signals",
    id: `daily-summary-${new Date().toISOString().split("T")[0]}`,
    data: {
      type: "daily_mcp_alert",
      picksCount: topPicks.length,
      parlaysAvailable: Boolean(parlays),
    },
  };

  const broadcastResult = await broadcastPushNotification(payload);

  return {
    broadcastResult,
    payload,
  };
}
