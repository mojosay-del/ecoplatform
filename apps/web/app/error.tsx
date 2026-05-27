"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { StatusPill } from "../src/components/StatusPill";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <div className="auth-form-panel">
          <div className="auth-card" style={{ textAlign: "center" }}>
            <h1 className="auth-card-title">Что-то пошло не так</h1>
            <p className="auth-card-sub">Страница не смогла отрисоваться.</p>
            <p className="page-subtitle">
              Мы уже знаем о проблеме. Попробуйте обновить страницу — если ошибка повторится, напишите в поддержку из
              кабинета.
            </p>
            {error.digest ? (
              <StatusPill as="p" style={{ marginTop: "12px" }}>
                Код инцидента: {error.digest}
              </StatusPill>
            ) : null}
            <div className="auth-actions" style={{ marginTop: "24px" }}>
              <button className="button" type="button" onClick={reset}>
                Попробовать снова
              </button>
              <Link className="button secondary" href="/news">
                К новостям
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
