import { NextRequest, NextResponse } from "next/server";
import { VAPID_CONFIG } from "@/lib/push/vapid-config";
import {
  savePushSubscription,
  removePushSubscription,
  getAllPushSubscriptions,
} from "@/lib/push/push-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const subscriptions = getAllPushSubscriptions();
  return NextResponse.json({
    success: true,
    vapidPublicKey: VAPID_CONFIG.publicKey,
    totalSubscribers: subscriptions.length,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return NextResponse.json(
        { success: false, error: "Invalid subscription payload (missing endpoint or keys)" },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get("user-agent") || undefined;

    const saved = savePushSubscription({
      endpoint,
      keys,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: "Push subscription registered successfully",
      subscriptionId: saved.id,
      deviceType: saved.deviceType,
    });
  } catch (error: any) {
    console.error("[API /api/push/subscribe] Error saving subscription:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Missing endpoint parameter" },
        { status: 400 }
      );
    }

    const removed = removePushSubscription(endpoint);

    return NextResponse.json({
      success: true,
      removed,
      message: removed ? "Subscription removed" : "Subscription not found",
    });
  } catch (error: any) {
    console.error("[API /api/push/subscribe] Error removing subscription:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
