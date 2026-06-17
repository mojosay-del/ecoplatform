"use client";

// «Пожаловаться» на объявление или отзыв площадки. Жалоба уходит в общую очередь
// модерации (POST /moderation/complaints, entityType=marketplace_listing|review).
// Пост-модерация: контент остаётся виден, пока модератор не примет решение.

import { FormEvent, useState } from "react";
import { Flag } from "lucide-react";
import { SendActionIcon } from "../../components/app-shell/nav-icons";
import { api, ApiError } from "../../lib/api";

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "contact_data", label: "Контакты в обход площадки" },
  { value: "false_information", label: "Недостоверная информация" },
  { value: "offensive_content", label: "Оскорбительный контент" },
  { value: "spam", label: "Спам" },
  { value: "illegal_content", label: "Запрещённый товар или контент" },
  { value: "other", label: "Другое" },
];

export function ReportControl({
  entityType,
  entityId,
  label = "Пожаловаться",
}: {
  entityType: "marketplace_listing" | "marketplace_review";
  entityId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("spam");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reasonCode === "other" && !comment.trim()) {
      setError("Для причины «Другое» укажите комментарий.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      await api.moderation.createComplaint({
        entityType,
        entityId,
        reasonCode,
        comment: comment.trim() || undefined,
      });
      setStatus("done");
      setOpen(false);
      setComment("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Не удалось отправить жалобу.");
    }
  }

  if (status === "done") {
    return <span className="mp-report-done">Жалоба отправлена на модерацию</span>;
  }

  return (
    <div className="mp-report">
      <button
        type="button"
        className="mp-report-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Flag aria-hidden="true" size={14} /> {label}
      </button>
      {open ? (
        <form className="mp-report-form" onSubmit={submit}>
          <label className="mp-report-label">
            Причина жалобы
            <select className="select" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
              {REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className="textarea small"
            placeholder="Комментарий (обязателен для «Другое»)"
            value={comment}
            maxLength={500}
            onChange={(event) => setComment(event.target.value)}
          />
          {error ? <p className="mp-report-error">{error}</p> : null}
          <div className="mp-report-actions">
            <button type="button" className="button ghost" onClick={() => setOpen(false)}>
              Отмена
            </button>
            <button type="submit" className="button secondary" disabled={status === "submitting"}>
              <SendActionIcon size={18} />
              {status === "submitting" ? "Отправка…" : "Отправить"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
