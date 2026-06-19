"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { MarketingShell } from "../src/components/MarketingShell";
import { StatusPill } from "../src/components/StatusPill";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <MarketingShell>
      <div className="ui-card marketing-card marketing-card-centered">
        <h1 className="ui-card-title">Что-то пошло не так</h1>
        <p className="ui-card-sub">Страница не смогла отрисоваться.</p>
        <p className="page-subtitle">
          Мы уже знаем о проблеме. Попробуйте обновить страницу — если ошибка повторится, напишите в поддержку из
          кабинета.
        </p>
        {error.digest ? (
          <StatusPill as="p" className="marketing-incident">
            Код инцидента: {error.digest}
          </StatusPill>
        ) : null}
        <div className="auth-actions marketing-actions">
          <button className="button" type="button" onClick={reset}>
            Попробовать снова
          </button>
          <Link className="button secondary" href="/news">
            К новостям
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
