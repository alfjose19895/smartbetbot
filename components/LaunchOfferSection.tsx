"use client";

import React from "react";
import Link from "next/link";
import { SalesCountdown } from "./SalesCountdown";
import { useLanguage } from "@/context/LanguageContext";

interface LaunchOfferSectionProps {
  className?: string;
  phoneNumber?: string;
}

export function LaunchOfferSection({
  className = "",
  phoneNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "593964082483",
}: LaunchOfferSectionProps) {
  const { language } = useLanguage();
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");

  const checkoutMessage = encodeURIComponent(
    language === "en"
      ? "Hello! ⚽🔥 I want to take advantage of the SmartBetBot Launch Offer for $19.99 USD (one-time lifetime payment before Oct 31, 2026) and activate my VIP access. How do I proceed with payment?"
      : "¡Hola! ⚽🔥 Quiero aprovechar la oferta especial de lanzamiento de SmartBetBot por $19.99 USD (pago único antes del 31 de octubre del 2026) y activar mi acceso de por vida. ¿Cómo realizo el pago?"
  );

  const waCheckoutUrl = `https://wa.me/${cleanPhone}?text=${checkoutMessage}`;

  return (
    <section
      id="oferta-lanzamiento"
      className={`relative overflow-hidden rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 p-6 sm:p-10 lg:p-12 text-white shadow-2xl shadow-emerald-950/50 ${className}`}
    >
      {/* Background glow effects */}
      <div className="absolute top-0 right-1/4 -mt-20 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 -mb-20 h-72 w-72 rounded-full bg-teal-500/15 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto space-y-8 text-center">
        {/* Top Urgency Badge */}
        <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-1.5 text-xs sm:text-sm font-black text-emerald-300 shadow-lg shadow-emerald-950/40 backdrop-blur-md">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>🔥 OFERTA EXCLUSIVA DE LANZAMIENTO · PAGO ÚNICO DE POR VIDA</span>
        </div>

        {/* Main Pitch Title */}
        <div className="space-y-3">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
            Acceso Total a SmartBetBot por{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              $19.99 USD
            </span>{" "}
            (Pago Único)
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Asegura tu membresía de por vida antes de que pase a suscripción recurrente.{" "}
            <strong className="text-emerald-400">Esta oferta especial vence el 31 de octubre del 2026.</strong> Luego costará{" "}
            <span className="line-through text-slate-400">$29.99 USD mensuales</span>.
          </p>
        </div>

        {/* Live Countdown Box */}
        <div className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-emerald-500/30 max-w-md mx-auto shadow-inner">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <span>⏰</span> La oferta de $19.99 finaliza en:
          </span>
          <SalesCountdown targetDate="2026-10-31T23:59:59" />
          <span className="text-[11px] font-semibold text-emerald-400/90 mt-2.5">
            📅 Fecha límite inamovible: 31 de Octubre de 2026
          </span>
        </div>

        {/* Pricing Cards Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left pt-2 max-w-4xl mx-auto">
          {/* Card 1: Launch Special (Featured) */}
          <div className="relative rounded-3xl border-2 border-emerald-400 bg-gradient-to-b from-emerald-950/60 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl flex flex-col justify-between">
            <div className="absolute -top-3.5 right-6 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 px-3.5 py-1 text-[11px] font-black text-slate-950 uppercase tracking-wider shadow-md">
              ⭐ Mejor Valor · Pago Único
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 block">
                  Pase Vitalicio de Lanzamiento
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                    $19.99
                  </span>
                  <span className="text-xs font-extrabold uppercase text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/30">
                    USD · Pago Único
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  Pagas una sola vez hoy y disfrutas para siempre.
                </p>
              </div>

              {/* Feature Checklist */}
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-200 border-t border-slate-800 pt-4">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>25 pronósticos automáticos diarios</strong> con valor esperado (+EV)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Enfoque prioritario</strong> en Ganador Local (1) y Over 2.5 Goles</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>3 Parleys exclusivos diarios</strong> calculados algorítmicamente</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Alertas Push individuales</strong> directo a tu pantalla de móvil</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Generador de imágenes para historias</strong> en WhatsApp/Telegram</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Historial transparente</strong> con marcadores y balance auditado</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Garantía de cero mensualidades</strong> si compras antes del 31/10/2026</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800">
              <a
                href={waCheckoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-6 py-4 text-sm sm:text-base font-black text-slate-950 shadow-xl shadow-emerald-500/25 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
              >
                <span>🚀 Aprovechar Oferta ($19.99 USD)</span>
                <span>→</span>
              </a>
              <p className="mt-2 text-[11px] text-center text-slate-400">
                💬 Activación inmediata por WhatsApp oficial
              </p>
            </div>
          </div>

          {/* Card 2: Regular Future Price */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 flex flex-col justify-between opacity-80 hover:opacity-100 transition">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block">
                  Precio Regular Posterior
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-slate-300 tracking-tight">
                    $29.99
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    USD / Mes
                  </span>
                </div>
                <p className="mt-1 text-xs text-rose-400/90 font-medium">
                  Aplica a partir del 1 de Noviembre del 2026
                </p>
              </div>

              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-400 border-t border-slate-800/80 pt-4">
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 font-bold shrink-0">•</span>
                  <span>Cobro recurrente mensual sin fin</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 font-bold shrink-0">•</span>
                  <span>Costo anual acumulado de $359.88 USD/año</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-500 font-bold shrink-0">•</span>
                  <span>Mismos pronósticos pero pagando 18x más</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80">
              <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300 text-center font-medium">
                ⚠️ Evita pagar $29.99 cada mes. Asegura hoy el pago único de <strong>$19.99</strong>.
              </div>
            </div>
          </div>
        </div>

        {/* Reassurance footer strip */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 border-t border-slate-800/80">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">🛡️</span> Sin cobros automáticos sorpresa
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">⚡</span> Activación en menos de 2 minutos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">📱</span> Compatible con Móvil, Tablet y PC
          </span>
        </div>
      </div>
    </section>
  );
}
