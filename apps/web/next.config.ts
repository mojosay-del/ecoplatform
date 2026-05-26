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

const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "img-src 'self' data: https://s3.twcstorage.ru https://*.s3.twcstorage.ru",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' http://localhost:4000 https://s3.twcstorage.ru",
  "font-src 'self'",
  "frame-src https://rutube.ru https://*.rutube.ru",
].join("; ");

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicyReportOnly,
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
        source: "/(.*)",
        headers: securityHeaders,
      },
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
