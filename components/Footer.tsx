"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";

export function Footer() {
  const pathname = usePathname();
  const { language, t } = useLanguage();

  const phone = "593964082483";
  const isHomePage = pathname === "/";

  let badgeText: string;
  let title: string;
  let subtitle: string;
  let btnText: string;
  let defaultMessage: string;

  if (isHomePage) {
    badgeText = language === "en" ? "Official VIP Assistance" : "Asesoría Personalizada VIP";
    title =
      language === "en"
        ? "¿Have questions or want to acquire SmartBetBot?"
        : "¿Tienes dudas o deseas adquirir SmartBetBot?";
    subtitle =
      language === "en"
        ? "Chat directly with our official support team on WhatsApp to get personalized guidance on access plans and instant activation."
        : "Escríbenos directamente a nuestro WhatsApp oficial para recibir asesoría personalizada sobre planes de acceso y activación inmediata.";
    btnText =
      language === "en"
        ? "Chat via WhatsApp (+593 964082483)"
        : "Chatear por WhatsApp (+593 964082483)";
    defaultMessage =
      language === "en"
        ? "Hello! ⚽🔥 I would like to get personalized guidance on how to acquire SmartBetBot and activate my VIP access. How can I get started?"
        : "¡Hola! ⚽🔥 Tengo dudas y me gustaría recibir asesoría sobre cómo adquirir SmartBetBot y activar mi acceso VIP. ¿Cómo puedo empezar?";
  } else {
    badgeText = language === "en" ? "24/7 Technical Support" : "Soporte Técnico Especializado";
    title =
      language === "en"
        ? "¿Need help or technical support with SmartBetBot?"
        : "¿Necesitas ayuda o soporte técnico con SmartBetBot?";
    subtitle =
      language === "en"
        ? "Contact our support team on WhatsApp to resolve any questions regarding your predictions, markets, or account."
        : "Escríbenos a nuestro canal de soporte en WhatsApp para resolver cualquier inquietud sobre tus pronósticos, mercados o cuenta.";
    btnText =
      language === "en"
        ? "Technical Support WhatsApp (+593 964082483)"
        : "Soporte WhatsApp (+593 964082483)";
    defaultMessage =
      language === "en"
        ? "Hello! ⚽ I need technical support / assistance with my SmartBetBot account and sports predictions."
        : "¡Hola! ⚽ Necesito soporte técnico / asistencia con mi cuenta de SmartBetBot y el uso de los pronósticos.";
  }

  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(defaultMessage)}`;

  return (
    <footer className="w-full min-w-full border-t border-slate-200 bg-white pt-12 pb-32 sm:pb-24 text-slate-700 transition-colors dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 flex flex-col items-center justify-center text-center">
        {/* Main WhatsApp Card */}
        <div className="w-full mx-auto relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white p-6 sm:p-10 text-center shadow-xl dark:border-emerald-500/20 dark:from-slate-900 dark:to-slate-950 flex flex-col items-center justify-center">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />

          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100/80 px-4 py-1.5 text-xs font-black text-emerald-900 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
            <span className="flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse dark:bg-emerald-400" />
            <span>{badgeText}</span>
          </div>

          {/* Title */}
          <h2 className="mt-4 text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight max-w-2xl mx-auto text-center">
            {title}
          </h2>

          {/* Subtitle */}
          <p className="mt-2.5 text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed text-center">
            {subtitle}
          </p>

          {/* WhatsApp Primary Button */}
          <div className="mt-6 w-full flex justify-center items-center">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: "#25D366" }}
              className="group inline-flex items-center justify-center gap-3 rounded-2xl px-8 py-4 text-sm sm:text-base font-black shadow-xl shadow-emerald-500/30 transition-all duration-300 hover:bg-[#20bd5a] hover:scale-105 active:scale-95 cursor-pointer no-underline mx-auto"
            >
              <svg
                className="h-6 w-6 fill-white shrink-0"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span style={{ color: "#FFFFFF" }} className="text-white font-black tracking-wide">
                {btnText}
              </span>
              <span style={{ color: "#FFFFFF" }} className="text-white font-black text-lg transition-transform group-hover:translate-x-1">
                →
              </span>
            </a>
          </div>
        </div>

        {/* Footer Navigation & Brand Row */}
        <div className="w-full max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800 pt-6">
          <Link href="/" className="flex items-center gap-2.5 mx-auto sm:mx-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-sm font-black text-slate-950 shadow-md">
              🎯
            </span>
            <span className="text-base font-black tracking-tight text-slate-900 dark:text-white">
              Smart<span className="text-emerald-600 dark:text-emerald-400">Bet</span>Bot
            </span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-5 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-400">
            <Link href="/dashboard" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navDashboard")}
            </Link>
            <Link href="/signals" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navPicks")}
            </Link>
            <Link href="/history" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navHistory")}
            </Link>
            <Link href="/responsible-gambling" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navResponsible")}
            </Link>
          </nav>
        </div>

        {/* Legal Disclaimer */}
        <div className="w-full max-w-3xl mx-auto border-t border-slate-100 dark:border-slate-900 pt-4 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-500 max-w-2xl mx-auto leading-relaxed font-medium text-center">
            {language === "en"
              ? "© " + new Date().getFullYear() + " SmartBetBot. Advanced football intelligence based on predictive Poisson models, Expected Goals (xG) and Elo ratings. Sports betting involves financial risk. Play responsibly (+18)."
              : "© " + new Date().getFullYear() + " SmartBetBot. Inteligencia predictiva deportiva basada en modelos Poisson, Goles Esperados (xG) y ratings Elo. Las apuestas deportivas implican riesgo financiero. Juega con responsabilidad (+18)."}
          </p>
        </div>
      </div>
    </footer>
  );
}
