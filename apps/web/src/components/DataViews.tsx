"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { demoIndices, demoKnowledge, demoModules, demoNews } from "../lib/demo-data";

function useApiData<T>(path: string, fallback: T) {
  const { token } = useAuth();
  const [data, setData] = useState<T>(fallback);
  const [isFallback, setIsFallback] = useState(true);

  useEffect(() => {
    if (!token) {
      return;
    }
    apiFetch<T>(path, { token })
      .then((result) => {
        setData(result);
        setIsFallback(false);
      })
      .catch(() => setIsFallback(true));
  }, [path, token]);

  return { data, isFallback };
}

export function NewsView() {
  const { data, isFallback } = useApiData("/news", demoNews);

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Последние обновления" subtitle="Новости рынка вторсырья и изменения в работе участников." fallback={isFallback} />
        <div className="card-grid">
          {data.map((post: any) => (
            <article className="card" key={post.id}>
              <p className="status-pill">Новости</p>
              <h2>{post.title}</h2>
              <p>{post.lead}</p>
              <p style={{ color: "var(--muted)" }}>👍 {post._count?.likes ?? 0} · 💬 {post._count?.comments ?? 0}</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function IndicesView() {
  const { data, isFallback } = useApiData("/indices", demoIndices);
  const [activeSlug, setActiveSlug] = useState(data[0]?.slug);
  const active = data.find((category: any) => category.slug === activeSlug) ?? data[0];

  useEffect(() => {
    setActiveSlug(data[0]?.slug);
  }, [data]);

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Индексы цен на вторсырьё" subtitle="Актуальные ценовые индексы по основным категориям сырья." fallback={isFallback} />
        <div className="tabs">
          {data.map((category: any) => (
            <button className={`tab ${category.slug === active?.slug ? "active" : ""}`} onClick={() => setActiveSlug(category.slug)} key={category.id}>
              {category.name}
            </button>
          ))}
        </div>
        <div className="card-grid">
          {active?.nomenclatures?.map((item: any) => (
            <article className="card" key={item.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <h2>{item.name}</h2>
                  <p style={{ color: "var(--muted)" }}>{item.code}</p>
                </div>
                <strong style={{ fontSize: 26 }}>{Number(item.summary.currentPrice).toLocaleString("ru-RU")} {item.unit}</strong>
              </div>
              <p style={{ color: item.summary.weeklyChange >= 0 ? "var(--green)" : "var(--red)", fontWeight: 800 }}>
                {item.summary.weeklyChange > 0 ? "+" : ""}{item.summary.weeklyChange}% за неделю
              </p>
              <MiniChart points={item.chart?.["3M"] ?? []} />
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function EducationView() {
  const { data, isFallback } = useApiData("/education/modules", demoModules);

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Обучение" subtitle="MVP-модули: закупка сырья и склад." fallback={isFallback} />
        <div className="card-grid">
          {data.map((module: any) => (
            <article className="card" key={module.id}>
              <p className="status-pill">{module.hasAccess ? "Доступен" : "Нужна подписка"}</p>
              <h2>{module.title}</h2>
              <p>{module.summary}</p>
              <p style={{ color: "var(--muted)" }}>Уроков: {module.chapters?.reduce((sum: number, chapter: any) => sum + (chapter.lessons?.length ?? 0), 0)}</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function KnowledgeBaseView() {
  const { data, isFallback } = useApiData("/knowledge-base", demoKnowledge);
  const [selectedId, setSelectedId] = useState(data[0]?.id);
  const selected = useMemo(() => data.find((article: any) => article.id === selectedId) ?? data[0], [data, selectedId]);

  useEffect(() => {
    setSelectedId(data[0]?.id);
  }, [data]);

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="База знаний" subtitle="Навигация по сырью и карточки номенклатуры." fallback={isFallback} />
        <div className="knowledge-layout">
          <aside className="card">
            <h3>Навигация по сырью</h3>
            {data.map((article: any) => (
              <button className={`tree-item ${article.id === selected?.id ? "active" : ""}`} onClick={() => setSelectedId(article.id)} key={article.id}>
                {article.title}
              </button>
            ))}
          </aside>
          <article className="card">
            <h1>{selected?.title}</h1>
            <p className="page-subtitle">{selected?.subtitle}</p>
            <ContentBlocks blocks={selected?.blocks ?? []} />
          </article>
        </div>
      </section>
    </AppShell>
  );
}

export function AccountView() {
  const { user, logout } = useAuth();

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Личный кабинет" subtitle="Профиль, подписка, реквизиты, уведомления и поддержка." />
        <div className="card-grid">
          <article className="card">
            <h2>Профиль</h2>
            <p>{user ? `${user.firstName} ${user.lastName}` : "Не авторизован"}</p>
            <p>{user?.email}</p>
            <button className="button secondary" onClick={logout}>Выйти</button>
          </article>
          <article className="card">
            <h2>Компания</h2>
            <p>{user?.company?.organizationName ?? "Демо-данные появятся после входа"}</p>
            <p className="status-pill">{user?.company?.status ?? "guest"}</p>
          </article>
          <article className="card">
            <h2>Подписка</h2>
            <p>Первый dev-этап использует ручную активацию через админ-панель.</p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}

function PageHeader({ title, subtitle, fallback }: { title: string; subtitle: string; fallback?: boolean }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
      {fallback ? <p className="status-pill">Показаны demo-данные, API пока недоступен или вход не выполнен</p> : null}
    </header>
  );
}

function ContentBlocks({ blocks }: { blocks: any[] }) {
  return (
    <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
      {blocks.map((block, index) => {
        if (block.type === "heading") return <h2 key={index}>{block.payload.text}</h2>;
        if (block.type === "paragraph") return <p key={index}>{block.payload.markdown}</p>;
        if (block.type === "checklist") {
          return (
            <div className="card" key={index} style={{ boxShadow: "none", borderColor: block.payload.style === "warning" ? "var(--yellow)" : "var(--green)" }}>
              <h3>{block.payload.title}</h3>
              <ul>{block.payload.items.map((item: string) => <li key={item}>{item}</li>)}</ul>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function MiniChart({ points }: { points: Array<{ price: number }> }) {
  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = values
    .map((value, index) => {
      const x = 20 + index * (320 / Math.max(values.length - 1, 1));
      const y = 120 - ((value - min) / Math.max(max - min, 1)) * 80;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 360 140" width="100%" height="150" role="img" aria-label="Мини-график индекса">
      <path d={`${path} L340,130 L20,130 Z`} fill="rgba(77, 115, 216, 0.16)" />
      <path d={path} fill="none" stroke="#4d73d8" strokeWidth="4" strokeLinecap="round" />
      <circle cx="340" cy="40" r="6" fill="#1e293b" />
    </svg>
  );
}
