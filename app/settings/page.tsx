import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/features/api/server";
import type { Me } from "@/features/api/types";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import { NotificationSettings } from "@/features/notifications/notification-settings";

export const metadata: Metadata = { title: "Ajustes" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/settings");
  const response = await apiFetch<Me>("/me");
  const account = response.data;

  return <AppShell identity={identity} currentPath="/settings">
    <header className="app-page-header product-heading"><div><span className="auth-kicker">Cuenta y alertas</span><h1>Tu configuración</h1><p>Preferencias protegidas por usuario y registro push del dispositivo.</p></div>{account?.role === "admin" ? <Link className="admin-link" href="/admin">Abrir Admin →</Link> : null}</header>
    <section className="settings-card"><div className="settings-card-heading"><div className="settings-avatar">{(identity.fullName || identity.email || "S")[0]?.toUpperCase()}</div><div><h2>{account?.display_name || identity.fullName || "Cuenta SmartBetBot"}</h2><p>{identity.email} · {account?.role || "user"}</p></div></div></section>
    {account ? <NotificationSettings account={account} /> : <aside className="settings-note"><span>!</span><p>No se pudo cargar el perfil desde FastAPI. Comprueba que la API esté ejecutándose y el JWT siga vigente.</p></aside>}
  </AppShell>;
}
