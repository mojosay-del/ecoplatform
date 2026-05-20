"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

const categorySample = {
  name: "Макулатура",
  position: 0,
};

const nomenclatureSample = {
  categoryId: "ID категории",
  code: "МКР-КРТ-001",
  name: "Гофрокартон",
  unit: "₽/т",
  description: "Гофрированный картон, коробки, ящики.",
};

const priceIndexSample = {
  nomenclatureId: "ID номенклатуры",
  description: "Служебное описание индекса",
};

export function AdminIndicesView() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [result, setResult] = useState("");

  const priceIndices = useMemo(
    () =>
      categories.flatMap((category) =>
        (category.nomenclatures ?? []).map((item: any) => ({
          categoryName: category.name,
          nomenclature: item,
          priceIndex: item.priceIndex,
        })),
      ),
    [categories],
  );

  useEffect(() => {
    void loadIndices();
  }, [token]);

  async function loadIndices() {
    if (!token) {
      return;
    }

    try {
      setCategories(await apiFetch<any[]>("/admin/content/indices", { token }));
    } catch {
      setCategories([]);
    }
  }

  async function postJson(endpoint: string, value: unknown) {
    if (!token) {
      setResult("Сначала войдите как администратор или контент-менеджер.");
      return;
    }

    try {
      await apiFetch(endpoint, { method: "POST", token, body: value });
      setResult("Сохранено.");
      await loadIndices();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Ошибка сохранения.");
    }
  }

  async function publishIndex(id: string) {
    await postJson(`/admin/content/indices/${id}/publish`, {});
  }

  async function onValueSubmit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));
    const price = Number(form.get("price"));

    await postJson(`/admin/content/indices/${id}/values`, {
      date: `${date}T00:00:00.000Z`,
      price,
    });
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS / Индексы цен</h1>
          <p className="page-subtitle">Справочник категорий, номенклатура, значения индексов и публикация.</p>
        </header>
        {result ? <p className="status-pill">{result}</p> : null}
        <div className="indices-admin-layout">
          <div className="stack-list">
            <JsonPostForm title="Категория" sample={categorySample} onSubmit={(value) => postJson("/admin/content/indices/categories", value)} />
            <JsonPostForm
              title="Номенклатура"
              sample={nomenclatureSample}
              onSubmit={(value) => postJson("/admin/content/indices/nomenclature", value)}
            />
            <JsonPostForm title="Индекс" sample={priceIndexSample} onSubmit={(value) => postJson("/admin/content/indices", value)} />
          </div>
          <div className="stack-list">
            {priceIndices.length === 0 ? <article className="card">Индексы пока не заведены.</article> : null}
            {priceIndices.map(({ categoryName, nomenclature, priceIndex }) => (
              <article className="card support-ticket" key={nomenclature.id}>
                <div className="list-row">
                  <div>
                    <h2>{nomenclature.name}</h2>
                    <p className="page-subtitle">{categoryName} · {nomenclature.code}</p>
                  </div>
                  {priceIndex?.status ? <span className="status-pill">{priceIndex.status}</span> : <span className="status-pill">нет индекса</span>}
                </div>
                {priceIndex ? (
                  <>
                    <p>Значений: {priceIndex.values?.length ?? 0}</p>
                    <form className="reply-form" onSubmit={(event) => onValueSubmit(event, priceIndex.id)}>
                      <input className="input" name="date" type="date" required />
                      <input className="input" name="price" placeholder="Цена" type="number" min="1" required />
                      <button className="button secondary" type="submit">Добавить значение</button>
                    </form>
                    {priceIndex.status !== "published" ? (
                      <button className="button" type="button" onClick={() => publishIndex(priceIndex.id)}>
                        Опубликовать
                      </button>
                    ) : null}
                  </>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function JsonPostForm({ title, sample, onSubmit }: { title: string; sample: unknown; onSubmit: (value: unknown) => Promise<void> | void }) {
  const [text, setText] = useState(JSON.stringify(sample, null, 2));
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();

    try {
      setError("");
      void onSubmit(JSON.parse(text));
    } catch {
      setError("JSON заполнен неверно.");
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{title}</h2>
      <textarea className="textarea small" value={text} onChange={(event) => setText(event.target.value)} />
      <button className="button secondary" type="submit">Сохранить</button>
      {error ? <p style={{ color: "var(--red)" }}>{error}</p> : null}
    </form>
  );
}
