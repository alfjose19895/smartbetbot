import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Juego responsable" };

export default function ResponsibleGamblingPage() {
  return <main className="legal-page"><section className="product-panel"><span className="auth-kicker">Uso responsable</span><h1>Las probabilidades no son certezas.</h1><p>SmartBetBot es una herramienta de análisis estadístico. No realiza apuestas automáticas, no promete ganancias y no debe usarse para recuperar pérdidas.</p><h2>Principios de uso</h2><ul><li>Define antes un presupuesto que puedas perder.</li><li>No aumentes el stake por una racha negativa.</li><li>Usa límites de tiempo y dinero del operador.</li><li>Detente si apostar afecta tu bienestar o tus obligaciones.</li><li>Respeta siempre la edad mínima y las leyes de tu jurisdicción.</li></ul><p>El track record incluye ganancias, pérdidas, void y push. Los filtros no borran resultados desfavorables.</p><Link href="/dashboard">Volver al dashboard</Link></section></main>;
}
