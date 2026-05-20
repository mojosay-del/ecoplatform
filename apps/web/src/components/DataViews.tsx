"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
const emptyTickets: any[] = [];

function useApiData<T>(path: string, initial: T) {
  const { token } = useAuth();
  const [data, setData] = useState<T>(initial);
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setData(initial);
      setState("unauthenticated");
      setErrorMessage(null);
      return;
    }

    setState("loading");
    setErrorMessage(null);
    apiFetch<T>(path, { token })
      .then((result) => {
        setData(result);
        setState("ready");
      })
      .catch((error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setState("forbidden");
          return;
        }

        setData(initial);
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить данные");
      });
  }, [initial, path, token]);

  return { data, state, errorMessage };
}

export function NewsView() {
  const { data, state, errorMessage } = useApiData<any[]>("/news", []);

  if (state === "unauthenticated") {
    return <AuthRequired title="Новости" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Новости" />;
  }

  if (state === "error") {
    return <ErrorState title="Новости" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Последние обновления" subtitle="Новости рынка вторсырья и изменения в работе участников." />
        <div className="card-grid">
          {data.map((post: any) => (
            <article className="card" key={post.id}>
              <p className="status-pill">Новости</p>
              <h2>{post.title}</h2>
              <p>{post.lead}</p>
              <p style={{ color: "var(--muted)" }}>👍 {post._count?.likes ?? 0} · 💬 {post._count?.comments ?? 0}</p>
              <Link className="button secondary" href={`/news/${post.slug}`}>
                Открыть
              </Link>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

const complaintReasons = [
  ["contact_data", "Контактные данные"],
  ["false_information", "Недостоверная информация"],
  ["offensive_content", "Оскорбления"],
  ["spam", "Спам"],
  ["illegal_content", "Нарушает закон"],
  ["other", "Иное"],
] as const;

export function NewsPostView({ slug }: { slug: string }) {
  const { token } = useAuth();
  const [post, setPost] = useState<any | null>(null);
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("offensive_content");
  const [reportComment, setReportComment] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  async function load() {
    if (!token) {
      setState("unauthenticated");
      setPost(null);
      return;
    }

    setState("loading");
    setErrorMessage(null);
    try {
      const data = await apiFetch<any>(`/news/${slug}`, { token });
      setPost(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить новость");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !post || !commentText.trim()) return;

    await apiFetch(`/news/${post.id}/comments`, {
      method: "POST",
      token,
      body: { text: commentText.trim() },
    });
    setCommentText("");
    setResultMessage("Комментарий опубликован.");
    await load();
  }

  async function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reportingCommentId) return;

    await apiFetch("/moderation/complaints", {
      method: "POST",
      token,
      body: {
        entityType: "news_comment",
        entityId: reportingCommentId,
        reasonCode: reportReason,
        comment: reportComment.trim() || undefined,
      },
    });
    setReportingCommentId(null);
    setReportReason("offensive_content");
    setReportComment("");
    setResultMessage("Жалоба отправлена модератору.");
  }

  if (state === "unauthenticated") {
    return <AuthRequired title="Новости" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Новости" />;
  }

  if (state === "error") {
    return <ErrorState title="Новости" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <Link className="button secondary" href="/news">
          Назад
        </Link>
        {state === "loading" || !post ? (
          <p className="page-subtitle">Загрузка…</p>
        ) : (
          <>
            <header className="page-header">
              <h1 className="page-title">{post.title}</h1>
              <p className="page-subtitle">{post.lead}</p>
            </header>
            <article className="content-article">
              {post.blocks?.map((block: any) => (
                <div key={block.id}>
                  {block.type === "heading" ? <h2>{block.payload.text}</h2> : null}
                  {block.type === "paragraph" ? <p>{block.payload.markdown}</p> : null}
                  {block.type === "quote" ? <blockquote>{block.payload.text}</blockquote> : null}
                </div>
              ))}
            </article>
            <section className="comments-section">
              <h2>Комментарии</h2>
              {resultMessage ? <p className="status-pill">{resultMessage}</p> : null}
              <form className="reply-form" onSubmit={submitComment}>
                <textarea
                  className="textarea small"
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Написать комментарий"
                  value={commentText}
                />
                <button className="button" type="submit">
                  Отправить
                </button>
              </form>
              <div className="comment-list">
                {post.comments?.map((comment: any) => (
                  <article className="comment-item" key={comment.id}>
                    <div className="comment-head">
                      <strong>
                        {comment.user.firstName} {comment.user.lastName}
                      </strong>
                      <button className="button secondary" onClick={() => setReportingCommentId(comment.id)}>
                        Пожаловаться
                      </button>
                    </div>
                    <p>{comment.text}</p>
                    {reportingCommentId === comment.id ? (
                      <form className="form report-form" onSubmit={submitComplaint}>
                        <select className="select" onChange={(event) => setReportReason(event.target.value)} value={reportReason}>
                          {complaintReasons.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <textarea
                          className="textarea small"
                          onChange={(event) => setReportComment(event.target.value)}
                          placeholder="Комментарий к жалобе"
                          value={reportComment}
                        />
                        <div className="auth-actions">
                          <button className="button" type="submit">
                            Отправить жалобу
                          </button>
                          <button className="button secondary" onClick={() => setReportingCommentId(null)} type="button">
                            Отмена
                          </button>
                        </div>
                      </form>
                    ) : null}
                    {comment.replies?.map((reply: any) => (
                      <article className="comment-item reply" key={reply.id}>
                        <strong>
                          {reply.user.firstName} {reply.user.lastName}
                        </strong>
                        <p>{reply.text}</p>
                      </article>
                    ))}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </AppShell>
  );
}

export function IndicesView() {
  const { data, state, errorMessage } = useApiData<any[]>("/indices", []);
  const [activeSlug, setActiveSlug] = useState(data[0]?.slug);
  const active = data.find((category: any) => category.slug === activeSlug) ?? data[0];

  useEffect(() => {
    setActiveSlug(data[0]?.slug);
  }, [data]);

  if (state === "unauthenticated") {
    return <AuthRequired title="Индексы цен" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Индексы цен" />;
  }

  if (state === "error") {
    return <ErrorState title="Индексы цен" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Индексы цен на вторсырьё" subtitle="Актуальные ценовые индексы по основным категориям сырья." />
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
  const { data, state, errorMessage } = useApiData<any[]>("/education/modules", []);

  if (state === "unauthenticated") {
    return <AuthRequired title="Обучение" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Обучение" />;
  }

  if (state === "error") {
    return <ErrorState title="Обучение" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Обучение" subtitle="MVP-модули: закупка сырья и склад." />
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
  const { data, state, errorMessage } = useApiData<any[]>("/knowledge-base", []);
  const [selectedId, setSelectedId] = useState(data[0]?.id);
  const selected = useMemo(() => data.find((article: any) => article.id === selectedId) ?? data[0], [data, selectedId]);

  useEffect(() => {
    setSelectedId(data[0]?.id);
  }, [data]);

  if (state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }

  if (state === "error") {
    return <ErrorState title="База знаний" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader title="База знаний" subtitle="Навигация по сырью и карточки номенклатуры." />
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
  const { user, token, logout } = useAuth();
  const { data: billing } = useApiData<any | null>("/billing/status", null);
  const { data: tickets } = useApiData<any[]>("/support/tickets", emptyTickets);
  const [supportResult, setSupportResult] = useState("");

  async function onSupportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setSupportResult("Сначала войдите в аккаунт.");
      return;
    }

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/support/tickets", {
        method: "POST",
        token,
        body: {
          category: String(form.get("category")),
          subject: String(form.get("subject")),
          text: String(form.get("text")),
        },
      });
      event.currentTarget.reset();
      setSupportResult("Обращение создано. Оно появится в списке после обновления данных.");
    } catch (error) {
      setSupportResult(error instanceof Error ? error.message : "Не удалось создать обращение.");
    }
  }

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
            <p>{billing?.organizationName ?? user?.company?.organizationName ?? "Данные появятся после входа"}</p>
            <p className="status-pill">{billing?.status ?? user?.company?.status ?? "guest"}</p>
          </article>
          <article className="card">
            <h2>Подписка</h2>
            <p>Тариф: {billing?.subscriptionPlan ?? "не активирован"}</p>
            <p>Demo до: {billing?.demoEndsAt ? new Date(billing.demoEndsAt).toLocaleString("ru-RU") : "нет активного demo"}</p>
            <p>Подписка до: {billing?.subscriptionEndsAt ? new Date(billing.subscriptionEndsAt).toLocaleString("ru-RU") : "не задана"}</p>
          </article>
        </div>
        <div className="account-layout">
          <form className="card form" onSubmit={onSupportSubmit}>
            <h2>Новое обращение</h2>
            <select className="select" name="category" defaultValue="technical">
              <option value="billing">Биллинг</option>
              <option value="moderation_review">Модерация</option>
              <option value="company_management">Компания</option>
              <option value="technical">Технический вопрос</option>
              <option value="data_deletion">Удаление данных</option>
              <option value="other">Другое</option>
            </select>
            <input className="input" name="subject" placeholder="Тема" />
            <textarea className="textarea" name="text" placeholder="Опишите вопрос" />
            <button className="button" type="submit">Отправить</button>
            {supportResult ? <p>{supportResult}</p> : null}
          </form>
          <article className="card">
            <h2>Мои обращения</h2>
            <div className="stack-list">
              {tickets.length === 0 ? <p className="page-subtitle">Пока нет обращений.</p> : null}
              {tickets.map((ticket: any) => (
                <div className="list-row" key={ticket.id}>
                  <strong>{ticket.subject}</strong>
                  <span className="status-pill">{ticket.status}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}

function AuthRequired({ title }: { title: string }) {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Раздел доступен после входа и активного demo или подписки.</p>
        </header>
        <div className="auth-actions">
          <Link className="button" href="/login">Войти</Link>
          <Link className="button secondary" href="/register">Создать demo</Link>
        </div>
      </section>
    </AppShell>
  );
}

function AccessClosed({ title }: { title: string }) {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Demo истёк или подписка не активна. Личный кабинет, биллинг и поддержка остаются доступны.</p>
        </header>
        <div className="auth-actions">
          <Link className="button" href="/account">Открыть кабинет</Link>
        </div>
      </section>
    </AppShell>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
    </header>
  );
}

function ErrorState({ title, message }: { title: string; message: string | null }) {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Не удалось загрузить данные. Попробуйте обновить страницу позже.</p>
        </header>
        {message ? <p className="status-pill">{message}</p> : null}
      </section>
    </AppShell>
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
            <div className="checklist-block" key={index} style={{ borderColor: block.payload.style === "warning" ? "var(--yellow)" : "var(--green)" }}>
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

  if (values.length === 0) {
    return <div className="empty-chart">Нет данных для графика</div>;
  }

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
