"use client";

// Инлайн-форма обращения в поддержку внутри модалки «Подписка».
// Критично для gate-режима: когда подписка закончилась, модалка блокирует
// сайт, а drawer поддержки открывается ПОД ней — пользователь должен иметь
// возможность написать в поддержку, не покидая это окно.

import { useState, type FormEvent } from "react";
import { supportTicketCategories } from "@ecoplatform/shared";
import { SendActionIcon } from "../../components/app-shell/nav-icons";
import { errorText, api } from "../../lib/api";
import { SUPPORT_CATEGORY_LABELS } from "../../lib/display-labels";

export function SubscriptionSupportForm() {
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSending(true);
    setErrorMessage(null);
    try {
      await api.support.createTicket({
        category: String(form.get("category")),
        subject: String(form.get("subject")),
        text: String(form.get("text")),
      });
      formElement.reset();
      setSentMessage("Обращение создано. Ответ придёт в уведомления и раздел «Поддержка».");
      // Кросс-компонентный мост: drawer и кабинет перечитают список обращений.
      window.dispatchEvent(new Event("support:changed"));
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось создать обращение."));
    } finally {
      setSending(false);
    }
  }

  if (sentMessage) {
    return (
      <div className="account-subscription-support-sent" role="status">
        <strong>Готово</strong>
        <span>{sentMessage}</span>
      </div>
    );
  }

  return (
    <form className="account-form account-subscription-support-form" onSubmit={onSubmit}>
      <div className="account-subscription-support-row">
        <label>
          <span>Категория</span>
          <select className="select" name="category" defaultValue="billing">
            {supportTicketCategories.map((category) => (
              <option key={category} value={category}>
                {SUPPORT_CATEGORY_LABELS[category] ?? category}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Тема</span>
          <input className="input" name="subject" placeholder="Коротко опишите вопрос" required minLength={3} />
        </label>
      </div>
      <label>
        <span>Сообщение</span>
        <textarea
          className="textarea"
          name="text"
          placeholder="Опишите ситуацию — мы ответим в ближайшее время"
          required
          minLength={5}
          rows={4}
        />
      </label>
      {errorMessage ? <p className="account-form-message account-form-message-error">{errorMessage}</p> : null}
      <button className="button" type="submit" disabled={sending}>
        <SendActionIcon size={18} />
        {sending ? "Отправляем…" : "Отправить обращение"}
      </button>
    </form>
  );
}
