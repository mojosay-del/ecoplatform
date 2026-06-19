import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const immutablePublicAssetHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  },
];

// CSP включается в БОЕВОМ (блокирующем) режиме только в production-сборке.
// В dev остаётся report-only: webpack-HMR использует eval-сорсмапы и websocket,
// которые строгий script-src/connect-src заблокировал бы и сломал локальную
// разработку. NODE_ENV вычисляется на этапе `next build`/`next dev`, поэтому
// каждое окружение получает свой режим автоматически.
const isProduction = process.env.NODE_ENV === "production";

function buildContentSecurityPolicy(): string {
  const scriptSrc = [
    "'self'",
    ...(isProduction ? [] : ["'unsafe-inline'"]),
    "https://mapgl.2gis.com",
    "https://*.2gis.com",
  ];
  const styleSrc = ["'self'", ...(isProduction ? [] : ["'unsafe-inline'"]), "blob:"];
  const connectSrc = [
    "'self'",
    "https://s3.twcstorage.ru",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    // 2ГИС MapGL: тайлы, стили и шрифты карты (геокодер каталога дёргает бэкенд,
    // не браузер, но домены общие — *.2gis.com).
    "https://*.2gis.com",
  ];
  // Локальный dev ходит в API по http://localhost:4000. В проде API живёт на
  // том же origin (ecoplatform.pro/api → покрывается 'self'), внешний localhost
  // в боевую политику не пускаем.
  if (!isProduction) {
    connectSrc.push("http://localhost:4000");
  }

  return [
    "default-src 'self'",
    "img-src 'self' data: blob: https://s3.twcstorage.ru https://*.s3.twcstorage.ru https://*.2gis.com",
    // Видео/аудио уроков отдаются signed-URL с S3 (s3.twcstorage.ru). Без явного
    // media-src они наследовали default-src 'self', и в проде (блокирующая CSP)
    // браузер резал загрузку — Vidstack крутил спиннер бесконечно. Зеркалит img-src
    // по доменам, но без data:.
    "media-src 'self' https://s3.twcstorage.ru https://*.s3.twcstorage.ru",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    // В коде ещё есть управляемые React style-атрибуты (прогресс-бары, цвета
    // материалов, размеры графиков). Разрешаем только style-атрибуты, но не
    // общий inline <style>; убрать и это можно отдельной UI-волной.
    ...(isProduction ? ["style-src-attr 'unsafe-inline'"] : []),
    `connect-src ${connectSrc.join(" ")}`,
    "font-src 'self' https://*.2gis.com",
    // MapGL поднимает web-workers из blob: — без worker-src карта молча не стартует
    // (default-src 'self' заблокировал бы blob-воркер).
    "worker-src 'self' blob:",
    // Жёсткие запреты, которые не влияют на штатную работу приложения, но
    // закрывают классические XSS/clickjacking-векторы:
    "object-src 'none'", // нет <object>/<embed>/<applet> — режем плагины
    "base-uri 'self'", // запрет подмены <base> (перехват относительных ссылок)
    "form-action 'self'", // формы уходят только на свой origin
    "frame-ancestors 'none'", // нельзя встроить сайт в чужой iframe (как X-Frame-Options DENY)
  ].join("; ");
}

const contentSecurityPolicy = buildContentSecurityPolicy();

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
    // Prod — боевой блокирующий режим; dev — report-only (см. buildContentSecurityPolicy).
    key: isProduction ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicy,
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
  // Пакет анимированных иконок публикует JSX-файлы, поэтому Next должен
  // прогонять его через свой сборщик так же, как код приложения.
  transpilePackages: ["@animated-color-icons/lucide-react"],
  // DOMPurify на сервере поднимает jsdom. Next должен грузить эти пакеты как
  // обычные Node-зависимости, иначе dev/bundle может падать на страницах с HTML.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.GIT_SHA ?? "dev",
  },
  experimental: {
    clientTraceMetadata: ["baggage", "sentry-trace"],
    // SRI даёт hash-based CSP для скриптов App Router без перевода всех страниц
    // в dynamic rendering через per-request nonce.
    sri: {
      algorithm: "sha256",
    },
  },
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

const sentryBuildConfig = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_WEB ?? process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

const shouldEnableSentryBuildPlugin = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  (process.env.SENTRY_PROJECT_WEB ?? process.env.SENTRY_PROJECT),
);

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfigWithSentry = shouldEnableSentryBuildPlugin ? withSentryConfig(nextConfig, sentryBuildConfig) : nextConfig;

export default withBundleAnalyzer(nextConfigWithSentry);
