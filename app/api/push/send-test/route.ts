import { NextRequest, NextResponse } from "next/server";
import {
  broadcastPushNotification,
  sendNotificationToSubscription,
  PushNotificationPayload,
} from "@/lib/push/web-push-sender";
import {
  getAllPushSubscriptions,
  savePushSubscription,
  StoredPushSubscription,
} from "@/lib/push/push-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint, keys, subscription, title, message, url } = body;

    const subEndpoint = endpoint || subscription?.endpoint;
    const subKeys = keys || subscription?.keys;

    const payload: PushNotificationPayload = {
      title: title || "🔔 SmartBetBot: ¡Alerta Push Activa!",
      body:
        message ||
        "⭐ Tu teléfono está listo. Recibirás las mejores alertas de Ganador Local, Over 2.5 y los 3 Parleys diarios.",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      url: url || "/signals",
      id: `test-push-${Date.now()}`,
    };

    // If client provided both endpoint and crypto keys, send directly and ensure it is saved
    if (subEndpoint && subKeys && subKeys.p256dh && subKeys.auth) {
      const userAgent = req.headers.get("user-agent") || undefined;
      const stored = savePushSubscription({
        endpoint: subEndpoint,
        keys: subKeys,
        userAgent,
      });

      const directSub: StoredPushSubscription = {
        id: stored?.id || `sub_${Date.now()}`,
        endpoint: subEndpoint,
        keys: subKeys,
        userAgent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await sendNotificationToSubscription(directSub, payload);
      return NextResponse.json({
        success: res.success,
        singleDevice: true,
        error: res.error,
      });
    }

    // If only endpoint is provided, look up in stored subscriptions
    if (subEndpoint) {
      const all = getAllPushSubscriptions();
      const match = all.find((s) => s.endpoint === subEndpoint);
      if (!match) {
        return NextResponse.json(
          {
            success: false,
            error: "Device subscription not found. Por favor pulsa 'Vincular y Activar Alertas' primero.",
          },
          { status: 404 }
        );
      }
      const res = await sendNotificationToSubscription(match, payload);
      return NextResponse.json({
        success: res.success,
        singleDevice: true,
        error: res.error,
      });
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
