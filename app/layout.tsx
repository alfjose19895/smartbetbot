import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { ServiceWorkerRegistration } from "@/features/notifications/service-worker-registration";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { Footer } from "@/components/Footer";
import { LanguageProvider } from "@/context/LanguageContext";

export const metadata: Metadata = {
  title: {
    default: "SmartBetBot — Inteligencia deportiva en tiempo real",
    template: "%s | SmartBetBot",
  },
  description:
    "Plataforma de inteligencia deportiva que analiza datos, probabilidades y mercados para detectar oportunidades estadísticas.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className="dark w-full" data-theme="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  document.documentElement.classList.remove('light');
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('data-theme', 'dark');
                  document.documentElement.style.colorScheme = 'dark';
                  localStorage.setItem('smartbetbot_theme', 'dark');
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="w-full min-h-screen flex flex-col items-stretch m-0 p-0 overflow-x-hidden bg-slate-950 text-slate-100">
        <LanguageProvider>
          <ServiceWorkerRegistration />
          <div className="w-full flex-1 flex flex-col">
            {children}
          </div>
          <Footer />
          <WhatsAppButton />
          <PushNotificationManager />
        </LanguageProvider>
      </body>
    </html>
  );
}
