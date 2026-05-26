import * as Sentry from "@sentry/nextjs";
import { beforeSendWebEvent, resolveSentryTraceSampleRate } from "./sentry.shared";

Sentry.init({
  dsn: process.env.SENTRY_DSN_WEB ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.GIT_SHA ?? process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
  environment:
    process.env.SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NODE_ENV ??
    "development",
  sendDefaultPii: false,
  tracesSampleRate: resolveSentryTraceSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  ),
  beforeSend: beforeSendWebEvent,
  normalizeDepth: 5,
});
