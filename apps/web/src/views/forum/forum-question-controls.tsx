"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { SendActionIcon } from "../../components/app-shell/nav-icons";

const DEFAULT_REPORT_REASON = "spam";
const FORUM_TEXTAREA_MAX_HEIGHT = 168;

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Спам" },
  { value: "offensive_content", label: "Оскорбления" },
  { value: "false_information", label: "Недостоверная информация" },
  { value: "contact_data", label: "Контакты / реклама" },
  { value: "illegal_content", label: "Противоправный контент" },
  { value: "other", label: "Другое" },
];

export function AutoSizeTextarea({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, FORUM_TEXTAREA_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > FORUM_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  return (
    <textarea
      id={id}
      className="forum-auto-textarea"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      ref={textareaRef}
      rows={1}
    />
  );
}

export function ReportControl({
  onSubmit,
  label,
}: {
  onSubmit: (reason: string, comment: string) => Promise<void>;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(DEFAULT_REPORT_REASON);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="forum-text-button" onClick={() => setOpen(true)}>
        <Flag size={15} /> {label}
      </button>
    );
  }

  const submit = async () => {
    if (reason === "other" && !comment.trim()) return;
    setBusy(true);
    try {
      await onSubmit(reason, comment.trim());
      setOpen(false);
      setComment("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="forum-report">
      <div className="forum-report__row">
        <select className="select" value={reason} onChange={(event) => setReason(event.target.value)}>
          {REPORT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="textarea"
        rows={2}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={reason === "other" ? "Опишите причину (обязательно)" : "Комментарий (необязательно)"}
      />
      <div className="forum-report__row">
        <button type="button" className="button" onClick={submit} disabled={busy}>
          <SendActionIcon size={18} />
          Отправить жалобу
        </button>
        <button type="button" className="forum-text-button" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}
