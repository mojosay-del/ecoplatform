import Link from "next/link";
import type { LegalDocumentDetail, LegalDocumentSummary, LegalDocumentType } from "@ecoplatform/shared";
import { sanitizeParagraphHtml } from "../lib/sanitize-html";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// Серверный fetch без проброса auth-cookie — страница публична.
async function fetchActive(type: LegalDocumentType): Promise<LegalDocumentSummary | null> {
  try {
    const res = await fetch(`${API_URL}/legal/documents?types=${encodeURIComponent(type)}`, {
      // На dev перезагружаем при каждом запросе; на проде Next.js закеширует.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const list = (await res.json()) as LegalDocumentSummary[];
    return list[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchDetail(type: LegalDocumentType, version: string): Promise<LegalDocumentDetail | null> {
  try {
    const res = await fetch(`${API_URL}/legal/documents/${encodeURIComponent(type)}/${encodeURIComponent(version)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as LegalDocumentDetail;
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

  // sanitize-html на сервере перед dangerouslySetInnerHTML — двойная защита:
  // body уже санитизирован на API при создании, но контент может прийти от
  // старых документов или из seed. Здесь — финальный фильтр.
  const safeHtml = sanitizeParagraphHtml(detail.body);
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
      <div className="legal-doc-body" dangerouslySetInnerHTML={{ __html: safeHtml }} />
    </section>
  );
}
