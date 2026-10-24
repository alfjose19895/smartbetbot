import { NextRequest, NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import {
  getOver25VipSlate,
  searchAndAddNewOver25VipAlerts,
} from "@/lib/sports/over25-vip-server";

export const dynamic = "force-dynamic";

/**
 * Endpoint de Over 2.5 VIP — Estrictamente restringido a administradores.
 */
export async function GET(request: NextRequest) {
  try {
    const identity = await getVerifiedIdentity();
    const isAdmin =
      identity &&
      (identity.role === "admin" || (identity.email || "").toLowerCase().includes("ajhs1589"));

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Acceso no autorizado. El módulo Over 2.5 VIP es exclusivo para administradores." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || undefined;
    const forceRefresh = searchParams.get("refresh") === "true";

    const slate = await getOver25VipSlate(date, forceRefresh);

    return NextResponse.json(
      {
        success: true,
        ...slate,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[API Over 2.5 VIP] Error en GET:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al cargar cartelera de Over 2.5 VIP" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getVerifiedIdentity();
    const isAdmin =
      identity &&
      (identity.role === "admin" || (identity.email || "").toLowerCase().includes("ajhs1589"));

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Acceso no autorizado. El escaneo de Over 2.5 VIP es exclusivo para administradores." },
        { status: 403 }
      );
    }

    let date: string | undefined = undefined;
    try {
      const body = await request.json();
      if (body?.date) date = String(body.date);
    } catch {
      // Body vacío o no-json es aceptable
    }

    const result = await searchAndAddNewOver25VipAlerts(date);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API Over 2.5 VIP] Error en POST búsqueda de alertas:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al buscar nuevas alertas de Over 2.5 VIP" },
      { status: 500 }
    );
  }
}
