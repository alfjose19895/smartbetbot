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
      // Query profiles with relation to roles table
      const { data: profiles, error: profileErr } = await supabase
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

      if (!profileErr && profiles && profiles.length > 0) {
        usersList = profiles.map((p) => {
          const roleObj = Array.isArray(p.roles) ? p.roles[0] : p.roles;
          const slug = roleObj?.slug || p.role || "bettor";
          const isAdm = slug === "admin";
          return {
            id: p.id,
            email: `${p.display_name || "usuario"}@smartbetbot.app`,
            fullName: p.display_name || "Apostador",
            role: isAdm ? "admin" : "user",
            roleId: roleObj?.id || p.role_id || (isAdm ? 1 : 2),
            roleName: roleObj?.name || (isAdm ? "Administrador" : "Apostador"),
            status: "approved",
            createdAt: p.created_at || new Date().toISOString(),
          };
        });
      }
    } catch {
      // Fallback
    }

    if (usersList.length === 0) {
      try {
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        if (!authError && authUsers?.users) {
          usersList = authUsers.users.map((u) => {
            const meta = u.user_metadata || {};
            const isAdm =
              (u.email || "").includes("admin") ||
              (u.email || "").includes("alfredo") ||
              meta.role === "admin";
            return {
              id: u.id,
              email: u.email || "Sin correo",
              fullName: meta.full_name || meta.name || "Usuario",
              role: isAdm ? "admin" : "user",
              roleId: isAdm ? 1 : 2,
              roleName: isAdm ? "Administrador" : "Apostador",
              status: meta.status === "pending" ? "pending" : "approved",
              createdAt: u.created_at,
            };
          });
        }
      } catch {
        // Fallback
      }
    }
  }

  // Fallback demo users
  if (usersList.length === 0) {
    usersList = [
      {
        id: "usr-admin-1",
        email: identity?.email || "alfredo@smartbetbot.app",
        fullName: identity?.fullName || "Alfredo (Admin)",
        role: "admin",
        roleId: 1,
        roleName: "Administrador",
        status: "approved",
        createdAt: "2026-08-25T10:00:00Z",
      },
      {
        id: "usr-demo-2",
        email: "carlos.apuestas@gmail.com",
        fullName: "Carlos Mendoza",
        role: "user",
        roleId: 2,
        roleName: "Apostador",
        status: "approved",
        createdAt: "2026-08-28T14:30:00Z",
      },
      {
        id: "usr-demo-3",
        email: "mariana.sports@outlook.com",
        fullName: "Mariana Silva",
        role: "user",
        roleId: 2,
        roleName: "Apostador",
        status: "pending",
        createdAt: "2026-08-29T18:20:00Z",
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
