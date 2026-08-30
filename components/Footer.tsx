"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export function Footer() {
  const { language } = useLanguage();
  const phone = "5934082483";
  const defaultMessage =
    language === "en"
      ? "Hello! ⚽🔥 I would like to get personalized guidance on SmartBetBot sports predictions and VIP access. How can I get started today?"
      : "¡Hola! ⚽🔥 Quiero recibir asesoría personalizada sobre los pronósticos deportivos y membresías VIP de SmartBetBot. ¿Cómo puedo empezar a ganar hoy mismo?";

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(defaultMessage)}`;

  return (
    <footer className="border-t border-slate-200 bg-white/80 py-8 text-center text-xs text-slate-600 transition-colors dark:border-slate-850 dark:bg-slate-950/80 dark:text-slate-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
        {/* WhatsApp Help Banner */}
        <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-50/60 px-4 py-2 text-xs font-bold text-slate-800 shadow-sm dark:bg-emerald-950/40 dark:border-emerald-700/50 dark:text-emerald-300">
          <span>💬</span>
          <span>
            {language === "en"
              ? "¿Have questions or need assistance?"
              : "¿Tienes dudas o preguntas sobre los pronósticos?"}
          </span>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-xl bg-[#25D366] px-3 py-1 font-black text-white shadow-sm transition hover:scale-105 hover:bg-[#20bd5a] cursor-pointer"
          >
            <span>WhatsApp (+593 4082483)</span>
            <span>→</span>
          </a>
        </div>

        {/* Legal Disclaimer */}
        <p className="text-[11px] text-slate-500 dark:text-slate-500 max-w-3xl mx-auto leading-relaxed">
          {language === "en"
            ? "© " + new Date().getFullYear() + " SmartBetBot. Sports statistical intelligence based on mathematical models and probability. Play responsibly (+18)."
            : "© " + new Date().getFullYear() + " SmartBetBot. Inteligencia estadística deportiva basada en modelos matemáticos y probabilidad. Juega con responsabilidad (+18)."}
        </p>
      </div>
    </footer>
  );
}
