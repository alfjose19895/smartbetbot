import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export async function GET() {
  const identity = await getVerifiedIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = await createClient();
  let displayName = identity.fullName;
  let roleName = identity.roleName || (identity.role === "admin" ? "Administrador" : "Apostador");
  let phone = "";

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select(`
        id,
        display_name,
        phone,
        role,
        role_id,
        roles (
          id,
          slug,
          name
        )
      `)
      .eq("id", identity.id)
      .single();

    if (profile) {
      displayName = profile.display_name || displayName;
      phone = profile.phone || "";
      const rObj = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
      if (rObj?.name) roleName = rObj.name;
    }
  } catch {
    // Fallback
  }

  return NextResponse.json({
    user: {
      id: identity.id,
      email: identity.email,
      fullName: displayName,
      phone,
      role: identity.role,
      roleName,
      roleId: identity.roleId || (identity.role === "admin" ? 1 : 2),
    },
  });
}

export async function POST(request: Request) {
  const identity = await getVerifiedIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fullName, email, password, phone } = body;

    const supabase = await createClient();

    // 1. Update display name & phone in public.profiles and auth metadata
    const updatePayload: Record<string, unknown> = {};
    if (fullName && typeof fullName === "string" && fullName.trim().length >= 2) {
      updatePayload.display_name = fullName.trim();
    }
    if (phone !== undefined && typeof phone === "string") {
      updatePayload.phone = phone.trim();
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await supabase
          .from("profiles")
          .update(updatePayload)
          .eq("id", identity.id);
      } catch (err) {
        console.warn("Could not update profiles table:", err);
      }

      await supabase.auth.updateUser({
        data: {
          full_name: fullName?.trim() || identity.fullName,
          phone: phone?.trim(),
          whatsapp: phone?.trim(),
        },
      });
    }

    // 2. Update email if changed
    if (email && typeof email === "string" && email.includes("@") && email !== identity.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email: email.trim() });
      if (emailErr) {
        return NextResponse.json({ error: `Error al actualizar correo: ${emailErr.message}` }, { status: 400 });
      }
    }

    // 3. Update password if provided
    if (password && typeof password === "string" && password.trim().length >= 6) {
      const { error: passErr } = await supabase.auth.updateUser({ password: password.trim() });
      if (passErr) {
        return NextResponse.json({ error: `Error al actualizar contraseña: ${passErr.message}` }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      message: "¡Tu perfil y WhatsApp han sido actualizados correctamente!",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
