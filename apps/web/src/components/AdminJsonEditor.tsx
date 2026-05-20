"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

export function AdminJsonEditor({ title, endpoint, sample }: { title: string; endpoint: string; sample: unknown }) {
  const { token } = useAuth();
  const [text, setText] = useState(JSON.stringify(sample, null, 2));
  const [result, setResult] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const json = JSON.parse(text) as unknown;
      await apiFetch(endpoint, { method: "POST", token, body: json });
      setResult("Сохранено. Если это черновик, опубликуйте его через API-кнопку/следующий шаг CMS.");
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Ошибка сохранения.");
    }
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Первый CMS-интерфейс: форма принимает JSON той же структуры, что и API.</p>
        </header>
        <div className="cms-layout">
          <aside className="card">
            <h2>Что делает экран</h2>
            <p>Эта форма нужна, чтобы контент-менеджер уже мог создавать материалы без правки кода.</p>
            <p>Следующий UX-этап заменит JSON на визуальный блочный редактор.</p>
          </aside>
          <form className="card form" onSubmit={onSubmit}>
            <textarea className="textarea" value={text} onChange={(event) => setText(event.target.value)} />
            <button className="button" type="submit">Сохранить</button>
            {result ? <p>{result}</p> : null}
          </form>
        </div>
      </section>
    </AppShell>
  );
}
