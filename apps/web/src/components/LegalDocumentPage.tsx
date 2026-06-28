import Link from "next/link";
import type { LegalDocumentDetail, LegalDocumentSummary, LegalDocumentType } from "@ecoplatform/shared";
import { api } from "../lib/api";
import "./legal-document.css";

// Публичная страница: активный документ и его текст тянем через общий
// типизированный клиент (api.legal) — единый источник путей и типов. Ошибка
// или отсутствие документа → null, ниже показываем заглушку «ещё не опубликован».
async function fetchActive(type: LegalDocumentType): Promise<LegalDocumentSummary | null> {
  try {
    const list = await api.legal.list([type]);
    return list[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchDetail(type: LegalDocumentType, version: string): Promise<LegalDocumentDetail | null> {
  try {
    return await api.legal.get(type, version);
  } catch {
    return null;
  }
}

const FALLBACK_TITLES: Record<LegalDocumentType, string> = {
  privacy_policy: "Политика конфиденциальности",
  terms_of_service: "Пользовательское соглашение",
  personal_data_consent: "Согласие на обработку персональных данных (152-ФЗ)",
  cookie_policy: "Политика использования cookies",
  marketing_consent: "Согласие на маркетинговые рассылки",
  offer_agreement: "Публичная оферта",
};

export async function LegalDocumentPage({ type }: { type: LegalDocumentType }) {
  const summary = await fetchActive(type);
  const detail = summary ? await fetchDetail(type, summary.version) : null;

  if (!detail) {
    return (
      <section className="legal-doc">
        <h1>{FALLBACK_TITLES[type]}</h1>
        <p className="legal-doc-empty">
          Документ ещё не опубликован. Пожалуйста, попробуйте позже или обратитесь в поддержку.
        </p>
        <Link className="button" href="/">
          На главную
        </Link>
      </section>
    );
  }

  // body приходит из API уже после shared DOMPurify sanitizer.
  const publishedDate = detail.publishedAt ? new Date(detail.publishedAt).toLocaleDateString("ru-RU") : null;

  return (
    <section className="legal-doc">
      <header className="legal-doc-head">
        <h1>{detail.title}</h1>
        <div className="legal-doc-meta">
          <span>Версия {detail.version}</span>
          {publishedDate ? <span>Опубликовано: {publishedDate}</span> : null}
        </div>
        {detail.summary ? <p className="legal-doc-summary">{detail.summary}</p> : null}
      </header>
      {/* eslint-disable-next-line react/no-danger -- API отдаёт body после shared DOMPurify sanitizer. */}
      <div className="legal-doc-body" dangerouslySetInnerHTML={{ __html: detail.body }} />
    </section>
  );
}
