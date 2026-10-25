import { canAccessVipModule } from "@/lib/auth/vip-permissions";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import {
  getHomeWinVipSlate,
  searchAndAddNewHomeWinVipAlerts,
} from "@/lib/sports/home-win-vip-server";

export const dynamic = "force-dynamic";

/**
 * Endpoint de Ganador Local VIP — Estrictamente restringido a administradores.
 */
export async function GET(request: NextRequest) {
  try {
    const identity = await getVerifiedIdentity();
    const hasAccess = canAccessVipModule(identity, "home_win_vip");

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Tu cuenta no tiene permiso asignado para el módulo Ganador Local VIP." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || undefined;
    const forceRefresh = searchParams.get("refresh") === "true";

    const slate = await getHomeWinVipSlate(date, forceRefresh);

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
    console.error("[API Ganador Local VIP] Error en GET:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al cargar cartelera de Ganador Local VIP" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getVerifiedIdentity();
    const hasAccess = canAccessVipModule(identity, "home_win_vip");

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Tu cuenta no tiene permiso asignado para el módulo Ganador Local VIP." },
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

    const result = await searchAndAddNewHomeWinVipAlerts(date);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API Ganador Local VIP] Error en POST búsqueda de alertas:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al buscar nuevas alertas de Ganador Local VIP" },
      { status: 500 }
    );
  }
}
