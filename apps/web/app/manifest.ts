import type { MetadataRoute } from "next";

// PWA-манифест: позволяет «Поделиться → На экран Домой» с иконкой, именем
// и запуском в режиме приложения (без адресной строки браузера).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ЭкоПлатформа",
    short_name: "ЭкоПлатформа",
    description: "Платформа для рынка вторсырья: новости, индексы цен, обучение, база знаний.",
    lang: "ru",
    dir: "ltr",
    start_url: "/news",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "productivity", "news"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
