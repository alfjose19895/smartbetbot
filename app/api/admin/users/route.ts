import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import { getAuditLogs, logAuditEvent } from "@/lib/audit/audit-logger";

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

function formatEcuadorDateString(isoString?: string | null): string {
  if (!isoString) return "Sin registros";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Sin registros";
    return new Intl.DateTimeFormat("es-EC", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "Sin registros";
  }
}

export async function GET(request: NextRequest) {
  const identity = await getVerifiedIdentity();
  if (identity && identity.role !== "admin") {
    return NextResponse.json({ error: "No autorizado. Requiere rol de administrador." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "audit") {
    const auditLogs = await getAuditLogs({ limit: 500 });
    return NextResponse.json({ auditLogs });
  }

  const supabase = getAdminClient();
  const allAuditLogs = await getAuditLogs();

  let usersList: Array<{
    id: string;
    email: string;
    fullName: string;
    role: "admin" | "user";
    roleId?: number;
    roleName: string;
    status: "approved" | "paused" | "pending";
    createdAt: string;
    lastSignInAt?: string | null;
    lastSignInFormatted: string;
    loginCount: number;
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
            (userEmail.includes("ajhs1589") || userEmail.includes("admin") ? "admin" : "bettor");

          const isAdm = rawRole === "admin" || userEmail.includes("ajhs1589") || userEmail.includes("admin");
          const roleId = roleObj?.id || profile?.role_id || (isAdm ? 1 : 2);
          const roleName = isAdm ? "Administrador" : (roleObj?.name || "Apostador");

          let status: "approved" | "paused" | "pending" = "approved";
          if (u.banned_until || meta.status === "paused") {
            status = "paused";
          } else if (meta.status === "pending") {
            status = "pending";
          }

          const fullName =
            profile?.display_name ||
            meta.full_name ||
            meta.name ||
            (u.email ? u.email.split("@")[0] : "Usuario");

          // Calculate connection statistics from auth metadata & audit logs
          const userLogins = allAuditLogs.filter(
            (l) => l.action === "login_success" && (l.email.toLowerCase() === userEmail || l.userId === u.id)
          );

          const lastLoginIso = u.last_sign_in_at || (userLogins[0] ? userLogins[0].timestamp : null);
          const loginCount = Math.max(u.last_sign_in_at ? 1 : 0, userLogins.length);

          return {
            id: u.id,
            email: u.email || "Sin correo",
            fullName,
            role: isAdm ? "admin" : "user",
            roleId,
            roleName,
            status,
            createdAt: u.created_at,
            lastSignInAt: lastLoginIso,
            lastSignInFormatted: formatEcuadorDateString(lastLoginIso),
            loginCount,
          };
        });
      }
    } catch (err) {
      console.warn("[AdminUsers] Error querying auth.admin:", err);
    }
  }

  const auditLogs = await getAuditLogs({ limit: 100 });
  return NextResponse.json({ users: usersList, auditLogs });
}

export async function POST(request: Request) {
  const identity = await getVerifiedIdentity();
  if (identity && identity.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { userId, action, role, status, fullName, email, password } = body;

    const supabase = getAdminClient();
    if (!supabase || !userId) {
      return NextResponse.json({ error: "Parámetros inválidos o cliente no configurado" }, { status: 400 });
    }

    if (action === "updateStatus" && status) {
      const isPaused = status === "paused";
      const isApproved = status === "approved";
      
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { status },
        ban_duration: isPaused ? "876000h" : "none",
      });

      return NextResponse.json({
        success: true,
        message: isApproved
          ? "Usuario aprobado con éxito. Ahora tiene acceso total al sistema."
          : isPaused
          ? "Usuario pausado con éxito."
          : "Estado de usuario actualizado.",
      });
    }

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
        // Fallback
      }

      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { role, role_id: targetRoleId },
      });

      await supabase
        .from("profiles")
        .update({ role, role_id: targetRoleId })
        .eq("id", userId);

      return NextResponse.json({ success: true, message: "Rol actualizado correctamente" });
    }

    if (action === "editUser") {
      const updatePayload: {
        email?: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
        ban_duration?: string;
      } = {
        user_metadata: {},
      };

      if (email && email.includes("@")) {
        updatePayload.email = email;
        updatePayload.email_confirm = true;
      }

      if (password && password.trim().length >= 6) {
        updatePayload.password = password.trim();
      }

      if (fullName) {
        updatePayload.user_metadata = {
          ...updatePayload.user_metadata,
          full_name: fullName,
        };
        await supabase
          .from("profiles")
          .update({ display_name: fullName })
          .eq("id", userId);
      }

      if (role) {
        const targetSlug = role === "admin" ? "admin" : (role === "analyst" ? "analyst" : "bettor");
        let targetRoleId = role === "admin" ? 1 : (role === "analyst" ? 4 : 2);
        try {
          const { data: rRow } = await supabase.from("roles").select("id").eq("slug", targetSlug).single();
          if (rRow) targetRoleId = rRow.id;
        } catch {}

        updatePayload.user_metadata = {
          ...updatePayload.user_metadata,
          role,
          role_id: targetRoleId,
        };

        await supabase
          .from("profiles")
          .update({ role, role_id: targetRoleId })
          .eq("id", userId);
      }

      if (status) {
        const isPaused = status === "paused";
        updatePayload.user_metadata = {
          ...updatePayload.user_metadata,
          status,
        };
        updatePayload.ban_duration = isPaused ? "876000h" : "none";
      }

      await supabase.auth.admin.updateUserById(userId, updatePayload);

      return NextResponse.json({ success: true, message: "Datos de usuario actualizados correctamente" });
    }

    if (action === "deleteUser") {
      // 1. Delete from profiles
      await supabase.from("profiles").delete().eq("id", userId);
      // 2. Delete from auth.users
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Usuario eliminado definitivamente" });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
