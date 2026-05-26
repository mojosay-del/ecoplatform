import * as Sentry from "@sentry/nextjs";
import { beforeSendWebEvent, resolveSentryTraceSampleRate } from "./sentry.shared";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: resolveSentryTraceSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
  beforeSend: beforeSendWebEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
