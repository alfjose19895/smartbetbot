"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";

export function Footer() {
  const pathname = usePathname();
  const { language, t } = useLanguage();
  const phone = "593964082483";

  const isLandingPage = pathname === "/" || pathname === "/login" || pathname === "/register";

  let title = "";
  let subtitle = "";
  let badgeText = "";
  let btnText = "";
  let defaultMessage = "";

  if (isLandingPage) {
    badgeText = language === "en" ? "VIP Sales & Access" : "Asesoría Directa & Ventas";
    title =
      language === "en"
        ? "¿Have questions about how to acquire SmartBetBot?"
        : "¿Tienes dudas o preguntas sobre cómo adquirir SmartBetBot?";
    subtitle =
      language === "en"
        ? "Chat directly with our team on WhatsApp for instant guidance, membership plans, and instant account activation."
        : "Escríbenos directamente a nuestro WhatsApp oficial para recibir asesoría personalizada, planes de acceso y activación inmediata.";
    btnText =
      language === "en"
        ? "Acquire via WhatsApp (+593 964082483)"
        : "Chatear por WhatsApp (+593 964082483)";
    defaultMessage =
      language === "en"
        ? "Hello! ⚽🔥 I would like to get personalized guidance on how to acquire SmartBetBot and activate my VIP access. How can I get started?"
        : "¡Hola! ⚽🔥 Tengo dudas y me gustaría recibir asesoría sobre cómo adquirir SmartBetBot y activar mi acceso VIP. ¿Cómo puedo empezar?";
  } else {
    badgeText = language === "en" ? "24/7 Technical Support" : "Soporte Técnico & Ayuda";
    title =
      language === "en"
        ? "¿Need help or technical support with SmartBetBot?"
        : "¿Necesitas ayuda o soporte con el uso de SmartBetBot?";
    subtitle =
      language === "en"
        ? "Contact our technical support desk on WhatsApp for any questions regarding your predictions, markets, or account."
        : "Escríbenos a nuestro WhatsApp de soporte técnico para resolver cualquier inquietud sobre tus pronósticos, mercados o cuenta.";
    btnText =
      language === "en"
        ? "Support WhatsApp (+593 964082483)"
        : "Soporte WhatsApp (+593 964082483)";
    defaultMessage =
      language === "en"
        ? "Hello! ⚽ I need technical support / assistance with my SmartBetBot account and sports predictions."
        : "¡Hola! ⚽ Necesito soporte técnico / asistencia con mi cuenta de SmartBetBot y el uso de los pronósticos.";
  }

  // Universal WhatsApp URL scheme for mobile apps and web
  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(defaultMessage)}`;

  return (
    <footer className="w-full border-t border-slate-200 bg-slate-50 pt-10 pb-28 sm:pb-20 text-slate-600 transition-colors dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 space-y-6">
        {/* Support / Sales Callout Box */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/30">
            <span>💬</span>
            <span>{badgeText}</span>
          </div>

          <h3 className="mt-3 text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
            {title}
          </h3>

          <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {subtitle}
          </p>

          <div className="mt-5 flex justify-center">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: "#25D366", color: "#FFFFFF" }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl px-7 py-3.5 text-xs sm:text-sm font-black shadow-xl shadow-emerald-500/25 transition-all hover:bg-[#20bd5a] hover:scale-105 active:scale-95 cursor-pointer no-underline"
            >
              <svg
                className="h-5 w-5 fill-white shrink-0"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span style={{ color: "#FFFFFF" }} className="font-black text-white text-center">
                {btnText}
              </span>
              <span style={{ color: "#FFFFFF" }} className="font-black text-white">
                →
              </span>
            </a>
          </div>
        </div>

        {/* Brand & Footer Nav */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800/80 pt-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xs font-black text-slate-950 shadow-sm">
              🎯
            </span>
            <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white">
              Smart<span className="text-emerald-600 dark:text-emerald-400">Bet</span>Bot
            </span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-700 dark:text-slate-400">
            <Link href="/dashboard" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navDashboard")}
            </Link>
            <Link href="/signals" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navPicks")}
            </Link>
            <Link href="/history" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navHistory")}
            </Link>
            <Link href="/settings" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition">
              {t("navProfile")}
            </Link>
          </nav>
        </div>

        {/* Legal Disclaimer */}
        <p className="text-[10px] text-center text-slate-500 dark:text-slate-500 max-w-md mx-auto leading-relaxed">
          {language === "en"
            ? "© " + new Date().getFullYear() + " SmartBetBot. Sports statistical intelligence based on mathematical models and probability. Play responsibly (+18)."
            : "© " + new Date().getFullYear() + " SmartBetBot. Inteligencia estadística deportiva basada en modelos matemáticos y probabilidad. Juega con responsabilidad (+18)."}
        </p>
      </div>
    </footer>
  );
}
