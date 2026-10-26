import { canAccessVipModule } from "@/lib/auth/vip-permissions";
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
    const hasAccess = canAccessVipModule(identity, "over25_vip");

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Tu cuenta no tiene permiso asignado para el módulo Over 2.5 VIP." },
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
    const hasAccess = canAccessVipModule(identity, "over25_vip");

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Acceso no autorizado. Tu cuenta no tiene permiso asignado para el módulo Over 2.5 VIP." },
        { status: 403 }
      );
    }

    let date: string | undefined = undefined;
    let forceRefresh = false;
    try {
      const body = await request.json();
      if (body?.date) date = String(body.date);
      if (body?.forceRefresh || body?.refresh) forceRefresh = true;
    } catch {
      // Body vacío o no-json es aceptable
    }

    const result = await searchAndAddNewOver25VipAlerts(date, forceRefresh);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API Over 2.5 VIP] Error en POST búsqueda de alertas:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error al buscar nuevas alertas de Over 2.5 VIP" },
      { status: 500 }
    );
  }
}
