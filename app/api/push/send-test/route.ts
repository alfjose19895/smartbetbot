import { NextRequest, NextResponse } from "next/server";
import {
  broadcastPushNotification,
  sendNotificationToSubscription,
  PushNotificationPayload,
} from "@/lib/push/web-push-sender";
import { getAllPushSubscriptions } from "@/lib/push/push-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint, title, message, url } = body;

    const payload: PushNotificationPayload = {
      title: title || "🔔 SmartBetBot: Prueba de Notificación Push",
      body:
        message ||
        "¡Excelente! Tu teléfono está correctamente vinculado para recibir las alertas diarias de Ganador Local, Over 2.5 y Parleys.",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      url: url || "/signals",
      id: `test-push-${Date.now()}`,
    };

    if (endpoint) {
      const all = getAllPushSubscriptions();
      const match = all.find((s) => s.endpoint === endpoint);
      if (!match) {
        return NextResponse.json(
          { success: false, error: "Device subscription not found" },
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

    // Broadcast to all devices
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
