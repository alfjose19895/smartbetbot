import { NextRequest, NextResponse } from "next/server";
import {
  broadcastPushNotification,
  sendNotificationToSubscription,
  sendIndividualHighConfidenceAlerts,
  PushNotificationPayload,
} from "@/lib/push/web-push-sender";
import {
  getAllPushSubscriptions,
  savePushSubscription,
  StoredPushSubscription,
} from "@/lib/push/push-store";
import { generatePredictionsForUpcoming } from "@/lib/sports/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint, keys, subscription, title, message, url, mode } = body;

    const subEndpoint = endpoint || subscription?.endpoint;
    const subKeys = keys || subscription?.keys;
    const userAgent = req.headers.get("user-agent") || undefined;

    let targetSub: StoredPushSubscription | undefined = undefined;

    if (subEndpoint && subKeys && subKeys.p256dh && subKeys.auth) {
      const stored = savePushSubscription({
        endpoint: subEndpoint,
        keys: subKeys,
        userAgent,
      });

      targetSub = {
        id: stored?.id || `sub_${Date.now()}`,
        endpoint: subEndpoint,
        keys: subKeys,
        userAgent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else if (subEndpoint) {
      const all = getAllPushSubscriptions();
      targetSub = all.find((s) => s.endpoint === subEndpoint);
    }

    // Mode: Individual high-confidence match alerts
    if (mode === "individual_picks" || body.individualPicks === true) {
      const predictions = await generatePredictionsForUpcoming(undefined, false);

      const alertResult = await sendIndividualHighConfidenceAlerts(
        predictions,
        targetSub
      );

      return NextResponse.json({
        success: alertResult.sentCount > 0 || alertResult.totalEligible > 0,
        mode: "individual_picks",
        totalPicks: alertResult.totalEligible,
        sentCount: alertResult.sentCount,
        failedCount: alertResult.failedCount,
        alerts: alertResult.alerts,
      });
    }

    // Single test push
    const payload: PushNotificationPayload = {
      title: title || "🔔 SmartBetBot: ¡Alerta Push Activa!",
      body:
        message ||
        "⭐ Tu teléfono está listo. Recibirás las alertas individuales de cada partido de alta confianza y los 3 Parleys diarios.",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      url: url || "/signals",
      id: `test-push-${Date.now()}`,
    };

    if (targetSub) {
      const res = await sendNotificationToSubscription(targetSub, payload);
      return NextResponse.json({
        success: res.success,
        singleDevice: true,
        error: res.error,
      });
    }

    if (subEndpoint && !targetSub) {
      return NextResponse.json(
        {
          success: false,
          error: "Device subscription not found. Por favor pulsa 'Vincular y Activar Alertas' primero.",
        },
        { status: 404 }
      );
    }

    // Broadcast to all registered devices
    const broadcastResult = await broadcastPushNotification(payload);

    return NextResponse.json({
      success: true,
      broadcast: true,
      result: broadcastResult,
    });
  } catch (error: any) {
    console.error("[API /api/push/send-test] Error sending test notification:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
