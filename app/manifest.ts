import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SmartBetBot",
    short_name: "SmartBetBot",
    description: "Inteligencia deportiva, probabilidades y señales explicables.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#06100e",
    theme_color: "#06100e",
    lang: "es",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
