"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type AdminJsonEditorProps = {
  title: string;
  endpoint: string;
  sample: unknown;
  listEndpoint?: string;
  publishEndpointTemplate?: string;
  listTitleKey?: string;
};

export function AdminJsonEditor({
  title,
  endpoint,
  sample,
  listEndpoint,
  publishEndpointTemplate,
  listTitleKey = "title",
}: AdminJsonEditorProps) {
  const { token } = useAuth();
  const [text, setText] = useState(JSON.stringify(sample, null, 2));
  const [result, setResult] = useState("");
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    void loadItems();
  }, [listEndpoint, token]);

  async function loadItems() {
    if (!token || !listEndpoint) {
      return;
    }

    try {
      const loaded = await apiFetch<any[]>(listEndpoint, { token });
      setItems(Array.isArray(loaded) ? loaded : []);
    } catch {
      setItems([]);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const json = JSON.parse(text) as unknown;
      await apiFetch(endpoint, { method: "POST", token, body: json });
      setResult("Сохранено.");
      await loadItems();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Ошибка сохранения.");
    }
  }

  async function publishItem(id: string) {
    if (!publishEndpointTemplate) {
      return;
    }

    try {
      await apiFetch(publishEndpointTemplate.replace(":id", id), { method: "POST", token });
      setResult("Опубликовано.");
      await loadItems();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Ошибка публикации.");
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
            <h2>Материалы</h2>
            {!listEndpoint ? <p>Список для этого действия не требуется.</p> : null}
            {listEndpoint && items.length === 0 ? <p>Список пуст или недоступен.</p> : null}
            <div className="stack-list">
              {items.map((item) => (
                <div className="list-row" key={item.id}>
                  <span>{String(item[listTitleKey] ?? item.organizationName ?? item.subject ?? item.id)}</span>
                  {item.status ? <span className="status-pill">{item.status}</span> : null}
                  {publishEndpointTemplate && item.status !== "published" ? (
                    <button className="button secondary" type="button" onClick={() => publishItem(item.id)}>
                      Опубликовать
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>
          <form className="card form" onSubmit={onSubmit}>
            <h2>Создание</h2>
            <textarea className="textarea" value={text} onChange={(event) => setText(event.target.value)} />
            <button className="button" type="submit">Сохранить</button>
            {result ? <p>{result}</p> : null}
          </form>
        </div>
      </section>
    </AppShell>
  );
}
