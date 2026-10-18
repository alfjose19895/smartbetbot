import { NextRequest, NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import {
  getShotsVipSlate,
  searchAndAddNewShotsVipAlerts,
} from "@/lib/sports/shots-vip-server";

export const dynamic = "force-dynamic";

/**
 * Endpoint de Disparos VIP — Estrictamente restringido a administradores.
 */
export async function GET(request: NextRequest) {
  try {
    const identity = await getVerifiedIdentity();
    const isAdmin =
      identity &&
      (identity.role === "admin" || (identity.email || "").toLowerCase().includes("ajhs1589"));

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Acceso no autorizado. El módulo Disparos VIP es exclusivo para administradores." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || undefined;
    const forceRefresh = searchParams.get("refresh") === "true";

    const slate = await getShotsVipSlate(date, forceRefresh);

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
    console.error("[API Disparos VIP] Error en GET:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al cargar cartelera de Disparos VIP" },
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
        { error: "Acceso no autorizado. El escaneo de Disparos VIP es exclusivo para administradores." },
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

    const result = await searchAndAddNewShotsVipAlerts(date);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API Disparos VIP] Error en POST búsqueda de alertas:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al buscar nuevas alertas de Disparos VIP" },
      { status: 500 }
    );
  }
}
