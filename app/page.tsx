import Link from "next/link";

import { AnalyticsPreview } from "@/features/landing/analytics-preview";
import { BrandMark } from "@/components/brand-mark";

const capabilities = [
  {
    number: "01",
    title: "Datos deportivos",
    description: "Fixtures, incidencias, estadísticas y cuotas normalizadas en una sola capa.",
  },
  {
    number: "02",
    title: "Modelos propios",
    description: "Probabilidades calculadas con modelos estadísticos versionados y medibles.",
  },
  {
    number: "03",
    title: "Señales explicables",
    description: "Cada señal muestra probabilidad, edge, calidad de datos y razones verificables.",
  },
] as const;

const trustPoints = ["Sin promesas de ganancias", "Track record íntegro", "Modelos auditables"] as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M3 12h4l2.2-5 4.1 10 2.1-5H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="SmartBetBot, inicio">
          <BrandMark />
          <span>SmartBetBot</span>
        </Link>

        <nav className="desktop-nav" aria-label="Navegación principal">
          <a href="#plataforma">Plataforma</a>
          <a href="#metodologia">Metodología</a>
          <a href="#transparencia">Transparencia</a>
        </nav>

        <Link className="header-action" href="/login">
          Acceder <ArrowIcon />
        </Link>
      </header>

      <section className="hero" id="plataforma">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" />
            Inteligencia deportiva en tiempo real
          </div>

          <h1>
            Detecta el valor.
            <span>Entiende el porqué.</span>
          </h1>

          <p className="hero-description">
            Convertimos datos de fútbol, probabilidades y movimientos de mercado en señales claras,
            medibles y explicables.
          </p>

          <div className="hero-actions">
            <Link className="primary-action" href="/register">
              Crear cuenta <ArrowIcon />
            </Link>
            <a className="secondary-action" href="#metodologia">
              <PulseIcon /> Cómo funciona
            </a>
          </div>

          <ul className="trust-list" aria-label="Compromisos del producto">
            {trustPoints.map((point) => (
              <li key={point}>
                <span>✓</span> {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-visual" id="demo">
          <div className="visual-glow" />
          <AnalyticsPreview />
        </div>
      </section>

      <section className="method" id="metodologia">
        <div className="section-heading">
          <p>De datos a decisiones</p>
          <h2>Una lectura más inteligente del partido.</h2>
        </div>

        <div className="capability-grid">
          {capabilities.map((capability) => (
            <article key={capability.number} className="capability-card">
              <span className="capability-number">{capability.number}</span>
              <div>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="principle" id="transparencia">
        <div className="principle-mark">S</div>
        <div>
          <p className="principle-label">Nuestro principio</p>
          <h2>Las probabilidades son estimaciones. Los resultados reales se demuestran con datos.</h2>
        </div>
        <p className="principle-copy">
          SmartBetBot no garantiza resultados ni oculta pérdidas. El rendimiento se mide mediante
          señales históricas, settlement, ROI, yield y calibración fuera de muestra.
        </p>
      </section>

      <footer>
        <Link className="brand footer-brand" href="/">
          <BrandMark />
          <span>SmartBetBot</span>
        </Link>
        <p>Información estadística, no asesoramiento financiero. Apostar implica riesgo.</p>
        <span>© 2026 SmartBetBot</span>
      </footer>
    </main>
  );
}
