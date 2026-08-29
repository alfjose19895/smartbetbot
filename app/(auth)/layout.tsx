import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Acceso",
  robots: { index: false, follow: false },
};

const authPrinciples = [
  "Sesiones seguras y persistentes",
  "Datos protegidos por usuario",
  "Sin promesas de rentabilidad",
] as const;

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <Link className="brand" href="/" aria-label="SmartBetBot, volver al inicio">
          <BrandMark />
          <span>SmartBetBot</span>
        </Link>
        <Link className="auth-back" href="/">← Volver al inicio</Link>
      </header>

      <div className="auth-grid">
        <aside className="auth-context" aria-label="Principios de SmartBetBot">
          <div className="auth-orbit" aria-hidden="true">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-core"><BrandMark /></div>
            <span className="orbit-node node-one" />
            <span className="orbit-node node-two" />
            <span className="orbit-node node-three" />
          </div>
          <div className="auth-context-copy">
            <p>Tu espacio de análisis</p>
            <h2>Decisiones deportivas con más contexto y menos ruido.</h2>
            <ul>
              {authPrinciples.map((principle) => <li key={principle}><span>✓</span>{principle}</li>)}
            </ul>
          </div>
        </aside>
        <section className="auth-panel">{children}</section>
      </div>
    </main>
  );
}
