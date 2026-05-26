import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const immutablePublicAssetHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `standalone` собирает в `.next/standalone` минимальный набор файлов +
  // нужные node_modules. Образ Docker без него тащил бы весь node_modules
  // монорепы (~1 ГБ); со standalone — десятки мегабайт.
  output: "standalone",
  // Так как мы внутри Turborepo, standalone должен искать workspace-зависимости
  // относительно корня проекта, а не apps/web.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  // next/image сжимает на лету через /_next/image, но домены источников нужно
  // явно разрешить. Иначе Image-loader откажется проксировать.
  // `**` в hostname работает только в pathname-pattern; для wildcard-доменов
  // нужно отдельно прописать каждый поддомен.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "s3.twcstorage.ru", pathname: "/**" },
      // Кастомный CDN или прямой бакет-домен на Timeweb.
      { protocol: "https", hostname: "**.s3.twcstorage.ru", pathname: "/**" },
      // Локальная разработка с MinIO / mockup.
      { protocol: "http", hostname: "localhost", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/brand/:path*",
        headers: immutablePublicAssetHeaders,
      },
      {
        source: "/avatars/:path*",
        headers: immutablePublicAssetHeaders,
      },
    ];
  },
};

export default nextConfig;
