"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { MarketingShell } from "../src/components/MarketingShell";
import { StatusPill } from "../src/components/StatusPill";
import "../src/styles/tokens.css";
import "../src/styles/globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <MarketingShell>
          <div className="auth-card marketing-card marketing-card-centered">
            <h1 className="auth-card-title">Что-то пошло не так</h1>
            <p className="auth-card-sub">Приложение не смогло отрисоваться.</p>
            <p className="page-subtitle">Мы уже знаем о проблеме. Попробуйте обновить страницу.</p>
            {error.digest ? (
              <StatusPill as="p" className="marketing-incident">
                Код инцидента: {error.digest}
              </StatusPill>
            ) : null}
            <div className="auth-actions marketing-actions">
              <button className="button" type="button" onClick={reset}>
                Попробовать снова
              </button>
            </div>
          </div>
        </MarketingShell>
      </body>
    </html>
  );
}
