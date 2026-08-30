import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Acceso Seguro | SmartBetBot",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Top navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8 gap-4">
          <Link href="/" className="flex items-center gap-2.5 mr-auto">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-lg font-black text-slate-950 shadow-lg shadow-emerald-500/20">
              ⚡
            </span>
            <span className="text-xl font-black tracking-tight text-white">
              Smart<span className="text-emerald-400">Bet</span>Bot
            </span>
          </Link>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <Link
              href="/"
              className="text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition"
            >
              ← Volver al Inicio
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Card */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-6 p-8 rounded-3xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950 border border-slate-800/80 shadow-2xl relative overflow-hidden">
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/50 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 w-fit">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Plataforma de Inteligencia Deportiva</span>
            </div>

            <h2 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
              Toma decisiones fundamentadas con{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Probabilidad & Modelos Poisson
              </span>
            </h2>

            <p className="text-sm leading-relaxed text-slate-400">
              Accede a cuotas con valor esperado positivo, análisis automatizado de cientos de ligas mundiales y generación de historias para tus redes.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/60 text-xs font-bold">✓</span>
                <span>Análisis en tiempo real de más de 40 ligas y copas</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/60 text-xs font-bold">✓</span>
                <span>Exportación de historias en PNG en alta resolución</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/60 text-xs font-bold">✓</span>
                <span>Registro y verificación de aciertos transparente</span>
              </div>
            </div>
          </div>

          {/* Right Form Card */}
          <div className="lg:col-span-6 flex justify-center">
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} SmartBetBot. Análisis estadístico sin promesas de rendimiento.</p>
      </footer>
    </div>
  );
}
