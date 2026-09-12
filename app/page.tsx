import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PredictionCard } from "@/components/PredictionCard";
import { LaunchOfferSection } from "@/components/LaunchOfferSection";
import { getStoredPredictions } from "@/lib/sports/db";
import { MarketOpportunity, getFeaturedDailyPicks } from "@/lib/sports/prediction-engine";

export default async function HomePage() {
  const allPicks = getStoredPredictions();
  const featuredPicks: MarketOpportunity[] = allPicks.slice(0, 3);
  const { smartPick } = getFeaturedDailyPicks(allPicks);

  const waPhone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "593964082483";
  const cleanPhone = waPhone.replace(/[^0-9]/g, "");
  const waOfferUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    "¡Hola! ⚽🔥 Quiero aprovechar la oferta especial de lanzamiento de SmartBetBot por $19.99 USD (pago único antes del 31 de octubre del 2026) y activar mi acceso de por vida. ¿Cómo realizo el pago?"
  )}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white font-sans antialiased">
      {/* 1. Top Urgency Ribbon */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-4 py-2 text-center text-xs sm:text-sm font-black text-white shadow-md flex items-center justify-center gap-2 flex-wrap">
        <span className="flex h-2 w-2 rounded-full bg-white animate-pulse" />
        <span>🎉 OFERTA DE LANZAMIENTO: Acceso Vitalicio por solo $19.99 USD (Vence el 31 de Octubre de 2026)</span>
        <a
          href="#oferta-lanzamiento"
          className="underline hover:text-slate-950 transition font-extrabold ml-1"
        >
          Aprovechar ahora →
        </a>
      </div>

      {/* 2. Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 gap-2 sm:gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0 select-none min-w-0">
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-sm sm:text-base font-black text-slate-950 shadow-md shadow-emerald-500/20 shrink-0">
              🎯
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-base sm:text-xl font-black tracking-tight text-white leading-none truncate">
                Smart<span className="text-emerald-400">Bet</span>Bot
              </span>
              <span className="hidden md:block text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 leading-none">
                ANALIZA · IDENTIFICA · TU VENTAJA
              </span>
            </div>
          </Link>

          {/* Desktop Links */}
          <nav className="hidden lg:flex items-center gap-5 xl:gap-6 text-xs xl:text-sm font-bold text-slate-300">
            <a href="#caracteristicas" className="transition hover:text-emerald-400">
              Características
            </a>
            <a href="#picks-hoy" className="transition hover:text-emerald-400">
              Picks de Hoy
            </a>
            <a href="#comparativa" className="transition hover:text-emerald-400">
              ¿Por qué SmartBetBot?
            </a>
            <a href="#oferta-lanzamiento" className="text-emerald-400 transition hover:text-emerald-300 flex items-center gap-1">
              <span>🔥</span> Oferta $19.99
            </a>
            <a href="#preguntas" className="transition hover:text-emerald-400">
              Preguntas
            </a>
          </nav>

          {/* Actions: Always fully visible without clipping */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>

            {/* Iniciar Sesión Link */}
            <Link
              href="/login"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/90 hover:bg-slate-800 hover:border-slate-600 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold text-slate-200 hover:text-white transition shadow-xs whitespace-nowrap"
            >
              <span>🔑</span>
              <span>Iniciar Sesión</span>
            </Link>

            {/* Obtener Acceso CTA Button */}
            <a
              href="#oferta-lanzamiento"
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs font-black text-slate-950 shadow-md shadow-emerald-500/20 transition hover:scale-105 cursor-pointer whitespace-nowrap"
            >
              <span>🔥</span>
              <span className="hidden sm:inline">Obtener Acceso ($19.99)</span>
              <span className="sm:hidden">Acceso $19.99</span>
            </a>
          </div>
        </div>
      </header>

      {/* 3. Hero Section with Mockup Presentation */}
      <section className="relative overflow-hidden pt-10 pb-16 sm:pt-16 sm:pb-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(16,185,129,0.20),rgba(255,255,255,0))]" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10 text-center">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-4 py-1.5 text-xs font-black text-emerald-300 backdrop-blur-md shadow-lg shadow-emerald-950/40">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>MÁS QUE PRONÓSTICOS, ES INTELIGENCIA A TU FAVOR</span>
          </div>

          {/* Headline & Subtitle */}
          <div className="space-y-4 max-w-4xl mx-auto">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight sm:leading-[1.12]">
              Recibe pronósticos{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                automáticos y fáciles de entender
              </span>
            </h1>

            <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Enfocados en <strong className="text-emerald-400 font-bold">victorias locales</strong> y partidos con <strong className="text-emerald-400 font-bold">más de 2.5 goles</strong>, con análisis estadísticos claros para pre-match.
            </p>
          </div>

          {/* 3 Value Pillars Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-3xl mx-auto pt-1">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-2.5 text-xs sm:text-sm font-extrabold text-slate-200 shadow-md">
              <span className="text-emerald-400 text-base">🎯</span>
              <span>Análisis automático y confiable</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-2.5 text-xs sm:text-sm font-extrabold text-slate-200 shadow-md">
              <span className="text-emerald-400 text-base">⚡</span>
              <span>Enfocado en lo que realmente funciona</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-2.5 text-xs sm:text-sm font-extrabold text-slate-200 shadow-md">
              <span className="text-emerald-400 text-base">📊</span>
              <span>Más fútbol. Más oportunidades.</span>
            </div>
          </div>

          {/* Action CTAs & Price Callout */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href="#oferta-lanzamiento"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-8 py-4 text-base font-black text-slate-950 shadow-2xl shadow-emerald-500/30 transition-all duration-300 hover:scale-105 cursor-pointer"
            >
              <span>🔥 Acceso Vitalicio ($19.99 USD)</span>
              <span>→</span>
            </a>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/90 hover:bg-slate-800 px-6 py-4 text-sm sm:text-base font-bold text-slate-200 hover:text-white transition"
            >
              <span>🚀 Probar Dashboard Gratuito</span>
            </Link>
          </div>

          {/* Subtext urgency notice */}
          <p className="text-xs text-slate-400 font-medium">
            ⚡ Pago único de por vida si compras antes del <strong className="text-emerald-400">31 de Octubre del 2026</strong>. Sin cuotas mensuales.
          </p>

          {/* Visual Showcase: Tablet Mockup from Provided Image */}
          <div className="relative mx-auto max-w-5xl pt-4">
            <div className="relative rounded-3xl border border-emerald-500/30 bg-slate-900/50 p-2 sm:p-4 shadow-2xl shadow-emerald-950/60 backdrop-blur-xl group">
              {/* Image Frame */}
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-inner">
                <Image
                  src="/smartbetbot-hero-mockup.jpg"
                  alt="SmartBetBot - Tablet App Preview con Pronósticos Automáticos"
                  fill
                  priority
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.01]"
                  sizes="(max-width: 1200px) 100vw, 1200px"
                />
              </div>

              {/* Decorative Floating Badges */}
              <div className="hidden sm:flex absolute -bottom-5 -left-4 rounded-2xl bg-slate-900/95 border border-emerald-500/40 p-3.5 shadow-2xl items-center gap-3 backdrop-blur-md">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 text-xl font-black">
                  ⚽
                </span>
                <div className="text-left">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Filosofía Cuantitativa</span>
                  <span className="text-xs font-black text-white">DISCIPLINA HOY · RESULTADOS MAÑANA</span>
                </div>
              </div>

              <div className="hidden sm:flex absolute -top-5 -right-4 rounded-2xl bg-slate-900/95 border border-emerald-500/40 p-3.5 shadow-2xl items-center gap-3 backdrop-blur-md">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 text-xl font-black">
                  📈
                </span>
                <div className="text-left">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Verificación de Mercado</span>
                  <span className="text-xs font-black text-emerald-400">EL FÚTBOL TAMBIÉN SE ANALIZA</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Key Real Numbers Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto pt-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 text-center shadow-lg">
              <span className="text-2xl sm:text-4xl font-black text-emerald-400 block">80%</span>
              <span className="text-xs font-bold text-slate-300 mt-1 block">Victorias del Local</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">En selecciones top filtradas</span>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 text-center shadow-lg">
              <span className="text-2xl sm:text-4xl font-black text-teal-400 block">70%</span>
              <span className="text-xs font-bold text-slate-300 mt-1 block">Más de 2.5 Goles</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">En partidos de alta frecuencia</span>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 text-center shadow-lg">
              <span className="text-2xl sm:text-4xl font-black text-cyan-400 block">2.9</span>
              <span className="text-xs font-bold text-slate-300 mt-1 block">Goles por Partido</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Promedio de encuentros clave</span>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 text-center shadow-lg">
              <span className="text-2xl sm:text-4xl font-black text-purple-400 block">+50K</span>
              <span className="text-xs font-bold text-slate-300 mt-1 block">Comunidad Activa</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Confían en nuestras señales</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Features & Module Showcase (Matching Tablet UI Layout) */}
      <section id="caracteristicas" className="border-t border-slate-900 bg-slate-950/90 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              Ecosistema Integral
            </span>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
              Todo lo que necesitas para ganar con ventaja estadística
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Diseñado tanto para apostadores principiantes como avanzados que buscan consistencia sin perder horas analizando estadísticas manualmente.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Tile 1: Señales de Hoy */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-7 space-y-4 hover:border-emerald-500/50 transition group">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-2xl group-hover:scale-110 transition-transform">
                📅
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">Señales de Hoy</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Los 25 mejores pronósticos del día clasificados automáticamente con su cuota real, probabilidad matemática y grado de confianza.
                </p>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 border-t border-slate-800/80 pt-3">
                <li className="flex items-center gap-1.5"><span>✓</span> 60% Ganador Local (1)</li>
                <li className="flex items-center gap-1.5"><span>✓</span> 25% Over 2.5 Goles</li>
                <li className="flex items-center gap-1.5"><span>✓</span> 15% Doble Oportunidad & BTTS</li>
              </ul>
            </div>

            {/* Tile 2: Smart Pick del Día */}
            <div className="rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-950/30 to-slate-900/60 p-6 sm:p-7 space-y-4 hover:border-emerald-400 transition group shadow-xl shadow-emerald-950/30">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-slate-950 text-2xl font-black group-hover:scale-110 transition-transform">
                ⭐
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>Smart Pick del Día</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">Top 1</span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Nuestra selección individual con la mayor convicción estadística y valor esperado (+EV) respaldada por el modelo Dixon-Coles.
                </p>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 border-t border-slate-800/80 pt-3">
                <li className="flex items-center gap-1.5"><span>✓</span> Probabilidad superior al 65%</li>
                <li className="flex items-center gap-1.5"><span>✓</span> Análisis detallado de fortalezas</li>
              </ul>
            </div>

            {/* Tile 3: 3 Parleys Exclusivos */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-7 space-y-4 hover:border-emerald-500/50 transition group">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 text-2xl group-hover:scale-110 transition-transform">
                🎲
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">3 Parleys del Día</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Combinadas calculadas algorítmicamente para balancear riesgo y recompensa: Parley Seguro, Doble Valor y Bomba del Día.
                </p>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 border-t border-slate-800/80 pt-3">
                <li className="flex items-center gap-1.5"><span>✓</span> Sin repetir equipos entre parleys</li>
                <li className="flex items-center gap-1.5"><span>✓</span> Cuotas combinadas @2.00 a @8.00+</li>
              </ul>
            </div>

            {/* Tile 4: Alertas Push al Móvil */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-7 space-y-4 hover:border-emerald-500/50 transition group">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-400 text-2xl group-hover:scale-110 transition-transform">
                🔔
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">Alertas Push en tu Pantalla</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Recibe en tu pantalla de bloqueo cada pronóstico individual de alta confianza con su cuota y análisis justo a tiempo para apostar.
                </p>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 border-t border-slate-800/80 pt-3">
                <li className="flex items-center gap-1.5"><span>✓</span> Compatible con Android, iOS y Web</li>
                <li className="flex items-center gap-1.5"><span>✓</span> 100% automático sin retrasos</li>
              </ul>
            </div>

            {/* Tile 5: Generador Visual 1-Clic */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-7 space-y-4 hover:border-emerald-500/50 transition group">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 text-2xl group-hover:scale-110 transition-transform">
                📸
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">Tarjetas Visuales para Redes</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Genera imágenes de alta resolución en PNG con 1 clic para compartir pronósticos o parleys en tus historias de WhatsApp, Telegram o Instagram.
                </p>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 border-t border-slate-800/80 pt-3">
                <li className="flex items-center gap-1.5"><span>✓</span> Diseño profesional de ticket</li>
                <li className="flex items-center gap-1.5"><span>✓</span> Copia directa al portapapeles</li>
              </ul>
            </div>

            {/* Tile 6: Historial Transparente */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-7 space-y-4 hover:border-emerald-500/50 transition group">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/20 text-purple-400 text-2xl group-hover:scale-110 transition-transform">
                📜
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">Historial 100% Auditable</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Registro inmutable de todos los pronósticos resueltos con marcadores oficiales, tasa de acierto y balance neto verificado.
                </p>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 border-t border-slate-800/80 pt-3">
                <li className="flex items-center gap-1.5"><span>✓</span> Marcadores oficiales en tiempo real</li>
                <li className="flex items-center gap-1.5"><span>✓</span> Sin borrar jugadas perdidas</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Live Demonstration: Today's Featured Picks */}
      <section id="picks-hoy" className="border-t border-slate-900 bg-slate-950 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                Demostración Real
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
                Pronósticos Activos de la Jornada
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
                Estas son oportunidades generadas hoy por el motor MCP enfocadas en Ganador Local y Over 2.5 Goles:
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-slate-850 hover:border-emerald-500/40 transition"
            >
              <span>Ver todos en el Dashboard</span>
              <span>→</span>
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredPicks.map((pick: MarketOpportunity) => (
              <PredictionCard key={pick.id || pick.fixtureId} prediction={pick} />
            ))}
          </div>
        </div>
      </section>

      {/* 6. Comparison Table: Tipsters Tradicionales vs SmartBetBot */}
      <section id="comparativa" className="border-t border-slate-900 bg-slate-950/80 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              ¿Por qué SmartBetBot?
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              La diferencia entre apostar a ciegas y apostar con datos
            </h2>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-2xl">
            <div className="grid grid-cols-3 bg-slate-900 p-4 sm:p-5 border-b border-slate-800 text-xs sm:text-sm font-black text-slate-300">
              <div>Aspecto</div>
              <div className="text-rose-400 text-center">Grupos / Tipsters VIP</div>
              <div className="text-emerald-400 text-center">SmartBetBot MCP</div>
            </div>

            <div className="divide-y divide-slate-800/80 text-xs sm:text-sm">
              <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
                <span className="font-bold text-white">Método de Análisis</span>
                <span className="text-slate-400 text-center">Intuición y corazonadas</span>
                <span className="text-emerald-300 font-bold text-center">Modelos Poisson & Dixon-Coles</span>
              </div>

              <div className="grid grid-cols-3 p-4 sm:p-5 items-center bg-slate-950/40">
                <span className="font-bold text-white">Modelo de Cobro</span>
                <span className="text-slate-400 text-center">$30 a $100 USD cada mes</span>
                <span className="text-emerald-400 font-black text-center">$19.99 USD Pago Único</span>
              </div>

              <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
                <span className="font-bold text-white">Transparencia Historial</span>
                <span className="text-slate-400 text-center">Borran jugadas perdidas</span>
                <span className="text-emerald-300 font-bold text-center">100% Inmutable y Auditado</span>
              </div>

              <div className="grid grid-cols-3 p-4 sm:p-5 items-center bg-slate-950/40">
                <span className="font-bold text-white">Velocidad de Alertas</span>
                <span className="text-slate-400 text-center">Mensajes tardíos en chats</span>
                <span className="text-emerald-300 font-bold text-center">Push instantáneo a tu pantalla</span>
              </div>

              <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
                <span className="font-bold text-white">Gestión de Riesgo</span>
                <span className="text-slate-400 text-center">Te hacen sobre-apostar</span>
                <span className="text-emerald-300 font-bold text-center">Stake plano 1-2% recomendado</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. The Core Launch Offer Section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <LaunchOfferSection phoneNumber={waPhone} />
      </div>

      {/* 8. Frequently Asked Questions (FAQ) */}
      <section id="preguntas" className="border-t border-slate-900 bg-slate-950 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              Preguntas Frecuentes
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Todo lo que necesitas saber sobre la oferta
            </h2>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                ¿Qué incluye exactamente el pago único de $19.99 USD?
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Incluye acceso total e ilimitado de por vida a la plataforma SmartBetBot: los 25 pronósticos cuantitativos diarios (MCP), el Smart Pick del Día, los 3 Parleys calculados, alertas push móviles en tiempo real y el historial auditado, sin ninguna mensualidad futura.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                ¿Hasta cuándo está vigente la oferta de $19.99 USD?
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                La oferta de lanzamiento está disponible únicamente hasta el <strong>31 de octubre del 2026 a las 23:59:59</strong>. A partir del 1 de noviembre del 2026, el acceso pasará a costar <strong>$29.99 USD mensuales</strong> para nuevos usuarios.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                ¿Cómo realizo el pago y activo mi cuenta?
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Al pulsar cualquier botón de compra, te comunicarás directamente con nuestro canal oficial de WhatsApp donde recibirás los métodos de pago (transferencia, tarjeta, PayPal o cripto) y tu activación se realiza de forma inmediata en menos de 2 minutos.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                ¿Necesito ser un experto en apuestas para usar SmartBetBot?
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                No. SmartBetBot simplifica la complejidad matemática en tarjetas visuales listas para apostar: te muestra el partido, el mercado recomendado (como Ganador Local o Más de 2.5 goles), la cuota y el porcentaje de probabilidad estimado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Final Call to Action Strip */}
      <section className="border-t border-emerald-500/20 bg-gradient-to-b from-slate-950 via-emerald-950/20 to-slate-950 py-16 text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Tu próxima victoria puede estar a un clic.
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto">
            Únete a la comunidad de apostadores que operan con inteligencia cuantitativa y disciplina matemática.
          </p>
          <div className="pt-2">
            <a
              href={waOfferUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-8 py-4 text-base font-black text-slate-950 shadow-2xl shadow-emerald-500/30 transition-all duration-300 hover:scale-105 cursor-pointer"
            >
              <span>🔥 Adquirir Acceso por $19.99 USD</span>
              <span>→</span>
            </a>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Oferta válida hasta el 31 de Octubre de 2026 · Activación inmediata por WhatsApp
          </p>
        </div>
      </section>
    </div>
  );
}
