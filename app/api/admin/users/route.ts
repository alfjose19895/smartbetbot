import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;

  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

export async function GET() {
  const identity = await getVerifiedIdentity();
  if (identity && identity.role !== "admin") {
    return NextResponse.json({ error: "No autorizado. Requiere rol de administrador." }, { status: 403 });
  }

  const supabase = getAdminClient();
  let usersList: Array<{
    id: string;
    email: string;
    fullName: string;
    role: "admin" | "user";
    roleId?: number;
    roleName: string;
    status: "approved" | "pending";
    createdAt: string;
  }> = [];

  if (supabase) {
    try {
      // 1. Query genuine registered users directly from Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();

      // 2. Query profiles with normalized roles relation
      const { data: profiles } = await supabase
        .from("profiles")
        .select(`
          id,
          display_name,
          role,
          role_id,
          roles (
            id,
            slug,
            name
          ),
          created_at
        `);

      interface ProfileRow {
        id: string;
        display_name: string | null;
        role: string | null;
        role_id: number | null;
        roles: { id: number; slug: string; name: string } | { id: number; slug: string; name: string }[] | null;
        created_at: string | null;
      }

      const profileMap = new Map<string, ProfileRow>(
        (profiles || []).map((p) => [p.id, p as ProfileRow])
      );

      if (!authErr && authData?.users && authData.users.length > 0) {
        usersList = authData.users.map((u) => {
          const profile = profileMap.get(u.id);
          const roleObj = Array.isArray(profile?.roles) ? profile?.roles[0] : profile?.roles;
          const meta = u.user_metadata || {};

          const userEmail = (u.email || "").toLowerCase();
          const rawRole =
            roleObj?.slug ||
            profile?.role ||
            meta.role ||
            (userEmail.includes("admin") || userEmail.includes("alfredo") ? "admin" : "bettor");

          const isAdm = rawRole === "admin";
          const roleId = roleObj?.id || profile?.role_id || (isAdm ? 1 : 2);
          const roleName = roleObj?.name || (isAdm ? "Administrador" : "Apostador");
          const status = meta.status === "pending" ? "pending" : "approved";
          const fullName =
            profile?.display_name ||
            meta.full_name ||
            meta.name ||
            (u.email ? u.email.split("@")[0] : "Usuario");

          return {
            id: u.id,
            email: u.email || "Sin correo",
            fullName,
            role: isAdm ? "admin" : "user",
            roleId,
            roleName,
            status,
            createdAt: u.created_at,
          };
        });
      }
    } catch (err) {
      console.warn("[AdminUsers] Error querying auth.admin:", err);
    }
  }

  // Fallback only if no users found in DB
  if (usersList.length === 0 && identity) {
    usersList = [
      {
        id: identity.id,
        email: identity.email || "alfredo@smartbetbot.app",
        fullName: identity.fullName || "Alfredo (Admin)",
        role: "admin",
        roleId: 1,
        roleName: "Administrador",
        status: "approved",
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return NextResponse.json({ users: usersList });
}

export async function POST(request: Request) {
  const identity = await getVerifiedIdentity();
  if (identity && identity.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { userId, action, role, status } = body;

    const supabase = getAdminClient();
    if (supabase && userId) {
      if (action === "updateRole" && role) {
        const targetSlug = role === "admin" ? "admin" : "bettor";
        let targetRoleId = role === "admin" ? 1 : 2;

        try {
          const { data: rRow } = await supabase
            .from("roles")
            .select("id")
            .eq("slug", targetSlug)
            .single();
          if (rRow) targetRoleId = rRow.id;
        } catch {
          // Keep default
        }

        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { role, role_id: targetRoleId },
        });

        await supabase
          .from("profiles")
          .update({ role, role_id: targetRoleId })
          .eq("id", userId);
      } else if (action === "updateStatus" && status) {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { status },
        });
      }
    }

    return NextResponse.json({ success: true, message: "Usuario y rol normalizado actualizados" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
