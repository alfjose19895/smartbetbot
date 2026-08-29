import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { ServiceWorkerRegistration } from "@/features/notifications/service-worker-registration";

export const metadata: Metadata = {
  title: {
    default: "SmartBetBot — Inteligencia deportiva en tiempo real",
    template: "%s | SmartBetBot",
  },
  description:
    "Plataforma de inteligencia deportiva que analiza datos, probabilidades y mercados para detectar oportunidades estadísticas.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07110f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}
