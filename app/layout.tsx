import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { ServiceWorkerRegistration } from "@/features/notifications/service-worker-registration";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export const metadata: Metadata = {
  title: {
    default: "SmartBetBot — Inteligencia deportiva en tiempo real",
    template: "%s | SmartBetBot",
  },
  description:
    "Plataforma de inteligencia deportiva que analiza datos, probabilidades y mercados para detectar oportunidades estadísticas.",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#07110f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('smartbetbot_theme') || 'dark';
                  if (t === 'light') {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.classList.add('light');
                    document.documentElement.setAttribute('data-theme', 'light');
                    document.documentElement.style.colorScheme = 'light';
                  } else {
                    document.documentElement.classList.remove('light');
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.documentElement.style.colorScheme = 'dark';
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ServiceWorkerRegistration />
        {children}
        <WhatsAppButton />
      </body>
    </html>
  );
}
