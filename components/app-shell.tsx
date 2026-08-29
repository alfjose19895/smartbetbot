import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { logoutAction } from "@/features/auth/actions";
import type { VerifiedIdentity } from "@/features/auth/lib/session";

const navigation = [
  { href: "/dashboard", label: "Resumen", icon: "⌁" },
  { href: "/live", label: "En vivo", icon: "◉" },
  { href: "/prematch", label: "Señales", icon: "↗" },
  { href: "/track-record", label: "Historial", icon: "◷" },
  { href: "/backtesting", label: "Backtest", icon: "⌬" },
  { href: "/settings", label: "Ajustes", icon: "◇" },
] as const;

type AppShellProps = {
  identity: VerifiedIdentity;
  currentPath: string;
  children: ReactNode;
};

function initials(identity: VerifiedIdentity): string {
  const source = identity.fullName || identity.email || "SB";
  return source
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppShell({ identity, currentPath, children }: AppShellProps) {
  return (
    <main className="application-shell">
      <aside className="app-sidebar">
        <Link className="brand app-brand" href="/dashboard">
          <BrandMark />
          <span>SmartBetBot</span>
        </Link>
        <nav className="app-navigation" aria-label="Aplicación">
          {navigation.map((item) => (
            <Link key={item.href} className={currentPath === item.href ? "active" : ""} href={item.href}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-foot">
          <div className="user-chip">
            <span>{initials(identity)}</span>
            <div><strong>{identity.fullName || "Cuenta personal"}</strong><small>{identity.email}</small></div>
          </div>
          <form action={logoutAction}>
            <button className="logout-button" type="submit">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <section className="app-content">{children}</section>
      <nav className="mobile-app-navigation" aria-label="Navegación móvil">
        {navigation.slice(0, 4).map((item) => (
          <Link key={item.href} className={currentPath === item.href ? "active" : ""} href={item.href}>
            <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
          </Link>
        ))}
        <Link className={currentPath === "/settings" ? "active" : ""} href="/settings">
          <span aria-hidden="true">◇</span><small>Perfil</small>
        </Link>
      </nav>
    </main>
  );
}
