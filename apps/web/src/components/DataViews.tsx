"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch, type FileAsset } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
const emptyTickets: any[] = [];

function useApiData<T>(path: string | null, initial: T) {
  const { token } = useAuth();
  const initialRef = useRef(initial);
  const [data, setData] = useState<T>(initial);
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!token) {
      setData(initialRef.current);
      setState("unauthenticated");
      setErrorMessage(null);
      return;
    }

    // path=null означает «не дёргать API» (например, для платформенного
    // сотрудника, у которого нет компании, — billing/status вернёт 500).
    if (!path) {
      setData(initialRef.current);
      setState("ready");
      setErrorMessage(null);
      return;
    }

    setState("loading");
    setErrorMessage(null);
    apiFetch<T>(path, { token })
      .then((result) => {
        if (!isActive) return;
        setData(result);
        setState("ready");
      })
      .catch((error) => {
        if (!isActive) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setState("forbidden");
          return;
        }

        setData(initialRef.current);
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить данные");
      });

    return () => {
      isActive = false;
    };
  }, [path, token]);

  return { data, state, errorMessage };
}

function useCoverAssets(items: Array<{ coverImageId?: string | null }>) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const ids = useMemo(
    () => Array.from(new Set(items.map((item) => item.coverImageId).filter((id): id is string => Boolean(id)))).sort(),
    [items],
  );
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      return;
    }
    apiFetch<FileAsset[]>(`/files?ids=${encodeURIComponent(idsKey)}`, { token })
      .then((result) => setAssets(new Map(result.map((asset) => [asset.id, asset]))))
      .catch(() => setAssets(new Map()));
  }, [idsKey, token, ids.length]);

  return assets;
}

export function NewsView() {
  const { data, state, errorMessage } = useApiData<any[]>("/news", []);
  const covers = useCoverAssets(data);

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
        <header className="news-feed-header">
          <h1>Последние обновления</h1>
        </header>

        {data.length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Пока нет публикаций.
          </p>
        ) : (
          <div className="news-masonry">
            {data.map((post: any) => {
              const cover = post.coverImageId ? covers.get(post.coverImageId) : null;
              const hasCover = Boolean(cover?.publicUrl);
              return (
                <Link
                  className={`news-tile ${hasCover ? "news-tile-with-cover" : "news-tile-text"}`}
                  href={`/news/${post.slug}`}
                  key={post.id}
                >
                  {hasCover ? (
                    <div className="news-tile-cover">
                      <img alt={cover?.originalName ?? post.title} src={cover!.publicUrl!} />
                    </div>
                  ) : null}
                  <div className="news-tile-body">
                    <span className="news-tile-category">Новости</span>
                    <h2 className="news-tile-title">{post.title}</h2>
                    <p className="news-tile-lead">{post.lead}</p>
                    <div className="news-tile-meta">
                      <span>👍 {post._count?.likes ?? 0}</span>
                      <span>💬 {post._count?.comments ?? 0}</span>
                      {post.firstPublishedAt ? (
                        <span className="news-tile-date">
                          {new Date(post.firstPublishedAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
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
        <Link className="button secondary page-back" href="/news">
          ← Назад к новостям
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
              <ContentBlocks blocks={post.blocks ?? []} />
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
          {data.map((module: any) => {
            const lessonsCount = module.chapters?.reduce(
              (sum: number, chapter: any) => sum + (chapter.lessons?.length ?? 0),
              0,
            );
            return (
              <article className="card" key={module.id}>
                <p className="status-pill">{module.hasAccess ? "Доступен" : "Нужна подписка"}</p>
                <h2>{module.title}</h2>
                <p>{module.summary}</p>
                <p style={{ color: "var(--muted)" }}>Уроков: {lessonsCount}</p>
                <Link className="button secondary" href={`/education/${module.id}`}>
                  Открыть
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

export function LearningModuleView({ moduleId }: { moduleId: string }) {
  const { data, state, errorMessage } = useApiData<any | null>(
    `/education/modules/${moduleId}`,
    null,
  );

  if (state === "unauthenticated") {
    return <AuthRequired title="Обучение" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Обучение" />;
  }
  if (state === "error") {
    return <ErrorState title="Обучение" message={errorMessage} />;
  }
  if (!data) {
    return (
      <AppShell>
        <section className="page">
          <PageHeader title="Обучение" subtitle="Загружаем модуль…" />
        </section>
      </AppShell>
    );
  }

  const hasAccess = Boolean(data.hasAccess);

  return (
    <AppShell>
      <section className="page">
        <PageHeader title={data.title} subtitle={data.summary} />
        <article className="card">
          <p className="status-pill">{hasAccess ? "Доступен" : "Нужна подписка"}</p>
          <p>{data.description}</p>
          {!hasAccess && data.preview ? (
            <div className="stack-list" style={{ marginTop: 16 }}>
              <h3>Что внутри</h3>
              <p>{data.preview.promotionalDescription}</p>
              <ul>
                {data.preview.whatYouWillLearn.map((item: string, index: number) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
              <Link className="button" href="/account">
                Активировать подписку
              </Link>
            </div>
          ) : null}
        </article>

        {hasAccess
          ? (data.chapters ?? []).map((chapter: any) => (
              <article className="card" key={chapter.id}>
                <h2>{chapter.title}</h2>
                <div className="stack-list">
                  {(chapter.lessons ?? []).length === 0 ? (
                    <p className="page-subtitle">В этой главе пока нет уроков.</p>
                  ) : null}
                  {(chapter.lessons ?? []).map((lesson: any) => (
                    <div className="list-row" key={lesson.id}>
                      <strong>{lesson.title}</strong>
                      <Link
                        className="button secondary"
                        href={`/education/${moduleId}/${lesson.id}`}
                      >
                        Открыть урок
                      </Link>
                    </div>
                  ))}
                </div>
              </article>
            ))
          : null}
      </section>
    </AppShell>
  );
}

export function LessonView({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const { token } = useAuth();
  const { data, state, errorMessage } = useApiData<any | null>(
    `/education/modules/${moduleId}`,
    null,
  );
  const [completed, setCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);

  if (state === "unauthenticated") {
    return <AuthRequired title="Урок" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Урок" />;
  }
  if (state === "error") {
    return <ErrorState title="Урок" message={errorMessage} />;
  }
  if (!data) {
    return (
      <AppShell>
        <section className="page">
          <PageHeader title="Урок" subtitle="Загружаем…" />
        </section>
      </AppShell>
    );
  }

  const chapter = (data.chapters ?? []).find((c: any) =>
    (c.lessons ?? []).some((l: any) => l.id === lessonId),
  );
  const lesson = chapter ? (chapter.lessons ?? []).find((l: any) => l.id === lessonId) : null;

  if (!lesson) {
    return <ErrorState title="Урок" message="Урок не найден или не опубликован." />;
  }

  if (!data.hasAccess) {
    return <AccessClosed title={lesson.title} />;
  }

  async function markCompleted() {
    if (!token || completing) return;
    setCompleting(true);
    try {
      await apiFetch(`/education/lessons/${lessonId}/complete`, { method: "POST", token });
      setCompleted(true);
    } catch {
      // молча — кнопка просто остаётся доступной
    } finally {
      setCompleting(false);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <p className="page-subtitle">
          <Link href="/education">Обучение</Link> /{" "}
          <Link href={`/education/${moduleId}`}>{data.title}</Link> / {chapter.title}
        </p>
        <PageHeader title={lesson.title} subtitle="" />

        <article className="card">
          <ContentBlocks blocks={lesson.blocks ?? []} />
        </article>

        {(lesson.attachments ?? []).length > 0 ? (
          <article className="card">
            <h3>Прикреплённые файлы</h3>
            <LessonAttachments attachments={lesson.attachments} />
          </article>
        ) : null}

        <div className="auth-actions">
          <button className="button" type="button" onClick={markCompleted} disabled={completed || completing}>
            {completed ? "Отмечено пройденным" : completing ? "Сохраняю…" : "Отметить пройденным"}
          </button>
          <Link className="button secondary" href={`/education/${moduleId}`}>
            ← К модулю
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function LessonAttachments({ attachments }: { attachments: Array<{ fileId: string; displayName: string }> }) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const ids = attachments.map((a) => a.fileId).filter(Boolean).sort();
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      return;
    }
    apiFetch<FileAsset[]>(`/files?ids=${encodeURIComponent(idsKey)}`, { token })
      .then((result) => setAssets(new Map(result.map((asset) => [asset.id, asset]))))
      .catch(() => setAssets(new Map()));
  }, [idsKey, ids.length, token]);

  return (
    <div className="stack-list">
      {attachments.map((attachment, index) => {
        const asset = assets.get(attachment.fileId);
        return (
          <div className="list-row" key={index}>
            <strong>{attachment.displayName}</strong>
            {asset?.publicUrl ? (
              <a className="button secondary" href={asset.publicUrl} rel="noreferrer" target="_blank">
                Скачать
              </a>
            ) : (
              <span className="page-subtitle">Файл недоступен</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function KnowledgeBaseView() {
  const { data, state, errorMessage } = useApiData<any[]>("/knowledge-base", []);

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
        <div className="card">
          {data.length === 0 ? (
            <p className="page-subtitle">Статей пока нет.</p>
          ) : (
            <KnowledgeTree nodes={data} depth={0} />
          )}
        </div>
      </section>
    </AppShell>
  );
}

function KnowledgeTree({ nodes, depth }: { nodes: any[]; depth: number }) {
  return (
    <ul className="kb-tree" style={{ paddingLeft: depth === 0 ? 0 : 16 }}>
      {nodes.map((node) => (
        <KnowledgeTreeNode key={node.id} node={node} depth={depth} />
      ))}
    </ul>
  );
}

function KnowledgeTreeNode({ node, depth }: { node: any; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const children = (node.children ?? []) as any[];
  const hasChildren = children.length > 0;

  return (
    <li>
      <div className="list-row" style={{ alignItems: "center" }}>
        {hasChildren ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => setOpen((v) => !v)}
            style={{ padding: "4px 8px", minWidth: 32 }}
            aria-label={open ? "Свернуть" : "Развернуть"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span style={{ display: "inline-block", width: 32 }} />
        )}
        <Link href={`/knowledge-base/${node.slug}`} style={{ flex: 1 }}>
          <strong>{node.title}</strong>
          {node.subtitle ? <small style={{ display: "block", color: "var(--muted)" }}>{node.subtitle}</small> : null}
        </Link>
      </div>
      {hasChildren && open ? <KnowledgeTree nodes={children} depth={depth + 1} /> : null}
    </li>
  );
}

export function KnowledgeArticleView({ slug }: { slug: string }) {
  const { data, state, errorMessage } = useApiData<any | null>(
    `/knowledge-base/${slug}`,
    null,
  );

  if (state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }
  if (state === "error") {
    return <ErrorState title="База знаний" message={errorMessage} />;
  }
  if (!data) {
    return (
      <AppShell>
        <section className="page">
          <PageHeader title="База знаний" subtitle="Загружаем статью…" />
        </section>
      </AppShell>
    );
  }

  const breadcrumbs: Array<{ title: string; slug: string }> = [];
  if (data.parent?.parent) {
    breadcrumbs.push({ title: data.parent.parent.title, slug: data.parent.parent.slug });
  }
  if (data.parent) {
    breadcrumbs.push({ title: data.parent.title, slug: data.parent.slug });
  }

  return (
    <AppShell>
      <section className="page">
        <p className="page-subtitle">
          <Link href="/knowledge-base">База знаний</Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.slug}>
              {" / "}
              <Link href={`/knowledge-base/${crumb.slug}`}>{crumb.title}</Link>
            </span>
          ))}
        </p>
        <PageHeader title={data.title} subtitle={data.subtitle ?? ""} />
        <article className="card">
          <ContentBlocks blocks={data.blocks ?? []} />
        </article>
        {(data.children ?? []).length > 0 ? (
          <article className="card">
            <h3>Подразделы</h3>
            <ul className="kb-tree">
              {(data.children ?? []).map((child: any) => (
                <li key={child.id}>
                  <Link href={`/knowledge-base/${child.slug}`}>{child.title}</Link>
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </section>
    </AppShell>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  moderator: "Модератор",
  content_manager: "Контент-менеджер",
};

const COMPANY_STATUS_LABELS: Record<string, string> = {
  demo: "Демо",
  active: "Активна",
  past_due: "Подписка просрочена",
  suspended: "Приостановлена",
  blocked: "Заблокирована",
  archived: "В архиве",
};

function describeSubscription(billing: { status?: string; subscriptionPlan?: string | null; demoEndsAt?: string | null; subscriptionEndsAt?: string | null } | null) {
  if (!billing) {
    return { tariff: "не активирован", note: "Подписка не активна" };
  }
  if (billing.status === "demo") {
    const endsAt = billing.demoEndsAt ? new Date(billing.demoEndsAt) : null;
    const expired = endsAt ? endsAt.getTime() <= Date.now() : false;
    return {
      tariff: "Демо-доступ",
      note: endsAt
        ? expired
          ? `Демо истёк ${endsAt.toLocaleString("ru-RU")}. Активируйте подписку.`
          : `Демо до ${endsAt.toLocaleString("ru-RU")}`
        : "Демо без срока",
    };
  }
  if (billing.status === "active" && billing.subscriptionPlan) {
    const endsAt = billing.subscriptionEndsAt ? new Date(billing.subscriptionEndsAt) : null;
    return {
      tariff: billing.subscriptionPlan === "basic" ? "Базовая подписка" : "Расширенная подписка",
      note: endsAt ? `Действует до ${endsAt.toLocaleString("ru-RU")}` : "Подписка активна",
    };
  }
  if (billing.status === "past_due") return { tariff: "Подписка просрочена", note: "Свяжитесь с поддержкой для продления." };
  if (billing.status === "suspended") return { tariff: "Приостановлена", note: "Доступ к разделам временно закрыт." };
  if (billing.status === "blocked") return { tariff: "Заблокирована", note: "Компания заблокирована." };
  return { tariff: "не активирован", note: "Подписка не активна" };
}

export function AccountView() {
  const { user, token, logout } = useAuth();
  const isPlatformStaff = (user?.platformRoles?.length ?? 0) > 0;
  const { data: billing } = useApiData<any | null>(isPlatformStaff ? null : "/billing/status", null);
  const { data: tickets } = useApiData<any[]>(isPlatformStaff ? null : "/support/tickets", emptyTickets);
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

  const subscription = describeSubscription(billing);
  const companyStatusLabel = billing?.status ? COMPANY_STATUS_LABELS[billing.status] ?? billing.status : null;

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
          {isPlatformStaff ? (
            <article className="card">
              <h2>Сотрудник платформы</h2>
              <p>Этот аккаунт не привязан к компании.</p>
              <div className="auth-actions" style={{ marginTop: 8 }}>
                {user?.platformRoles?.map((role) => (
                  <span className="status-pill" key={role}>{ROLE_LABELS[role] ?? role}</span>
                ))}
              </div>
            </article>
          ) : (
            <>
              <article className="card">
                <h2>Компания</h2>
                <p>{billing?.organizationName ?? user?.company?.organizationName ?? "Данные появятся после входа"}</p>
                {companyStatusLabel ? <p className="status-pill">{companyStatusLabel}</p> : null}
              </article>
              <article className="card">
                <h2>Подписка</h2>
                <p>Тариф: {subscription.tariff}</p>
                <p className="page-subtitle">{subscription.note}</p>
              </article>
            </>
          )}
        </div>
        {isPlatformStaff ? null : (
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
        )}
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

// Известные типы блоков из shared/content-blocks. Используем минимальные
// shape-типы вместо BaseContentBlock — здесь только то, что реально рендерим.
type RenderableBlock =
  | { type: "heading" | "subheading"; payload: { text: string } }
  | { type: "paragraph"; payload: { markdown: string } }
  | { type: "image"; payload: { fileId: string; caption?: string; altText?: string } }
  | { type: "gallery"; payload: { images: Array<{ fileId: string; caption?: string; altText?: string }> } }
  | { type: "video"; payload: { rutubeUrl: string; caption?: string } }
  | { type: "audio"; payload: { fileId: string; episodeTitle?: string; caption?: string; durationSeconds?: number } }
  | { type: "file"; payload: { fileId: string; displayName: string; description?: string } }
  | { type: "checklist"; payload: { title: string; style: string; items: string[] } }
  | {
      type: "image_checklist";
      payload: {
        title: string;
        style: string;
        image: { fileId: string; caption?: string; altText?: string };
        items: string[];
      };
    }
  | { type: string; payload: Record<string, unknown> };

function ContentBlocks({ blocks }: { blocks: RenderableBlock[] }) {
  const assets = useFileAssets(blocks);

  return (
    <div className="content-blocks">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h2 key={index}>{(block.payload as { text: string }).text}</h2>;
        }
        if (block.type === "subheading") {
          return <h3 key={index}>{(block.payload as { text: string }).text}</h3>;
        }
        if (block.type === "paragraph") {
          return <p key={index}>{(block.payload as { markdown: string }).markdown}</p>;
        }
        if (block.type === "image") {
          const payload = block.payload as { fileId: string; caption?: string; altText?: string };
          return <ImageBlock asset={assets.get(payload.fileId)} altText={payload.altText} caption={payload.caption} key={index} />;
        }
        if (block.type === "gallery") {
          const payload = block.payload as { images: Array<{ fileId: string; caption?: string; altText?: string }> };
          return (
            <div className="gallery-block" key={index}>
              {payload.images.map((image, imageIndex) => (
                <ImageBlock
                  asset={assets.get(image.fileId)}
                  altText={image.altText}
                  caption={image.caption}
                  key={`${image.fileId}-${imageIndex}`}
                />
              ))}
            </div>
          );
        }
        if (block.type === "video") {
          const payload = block.payload as { fileId?: string; rutubeUrl?: string; caption?: string };
          // Приоритет — собственный загруженный файл (без рекламы). Если файла
          // нет, fallback на старую rutube-ссылку для совместимости.
          const asset = payload.fileId ? assets.get(payload.fileId) : null;
          const embedUrl = payload.rutubeUrl ? rutubeEmbedUrl(payload.rutubeUrl) : null;
          return (
            <figure className="media-block" key={index}>
              {asset?.publicUrl ? (
                <video controls preload="metadata" src={asset.publicUrl} />
              ) : embedUrl ? (
                <iframe
                  allow="clipboard-write; autoplay"
                  allowFullScreen
                  src={embedUrl}
                  title={payload.caption ?? "Видео"}
                />
              ) : payload.rutubeUrl ? (
                <a className="button secondary" href={payload.rutubeUrl} rel="noreferrer" target="_blank">
                  Открыть видео
                </a>
              ) : (
                <MissingAsset />
              )}
              {payload.caption ? <figcaption>{payload.caption}</figcaption> : null}
            </figure>
          );
        }
        if (block.type === "audio") {
          const payload = block.payload as { fileId: string; episodeTitle?: string; caption?: string };
          const asset = assets.get(payload.fileId);
          return (
            <figure className="media-block" key={index}>
              {payload.episodeTitle ? <h3>{payload.episodeTitle}</h3> : null}
              {asset?.publicUrl ? <audio controls src={asset.publicUrl} /> : <MissingAsset />}
              {payload.caption ? <figcaption>{payload.caption}</figcaption> : null}
            </figure>
          );
        }
        if (block.type === "file") {
          const payload = block.payload as { fileId: string; displayName: string; description?: string };
          const asset = assets.get(payload.fileId);
          return (
            <div className="file-block" key={index}>
              <div>
                <strong>{payload.displayName}</strong>
                {payload.description ? <p>{payload.description}</p> : null}
              </div>
              {asset?.publicUrl ? (
                <a className="button secondary" href={asset.publicUrl} rel="noreferrer" target="_blank">
                  Скачать
                </a>
              ) : (
                <MissingAsset />
              )}
            </div>
          );
        }
        if (block.type === "checklist") {
          const payload = block.payload as { title: string; style: string; items: string[] };
          return (
            <div className={`checklist-block checklist-${payload.style}`} key={index}>
              <h3>{payload.title}</h3>
              <ul>
                {payload.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        }
        if (block.type === "image_checklist") {
          const payload = block.payload as {
            title: string;
            style: string;
            image: { fileId: string; caption?: string; altText?: string };
            items: string[];
          };
          return (
            <div className="image-checklist-block" key={index}>
              <ImageBlock
                asset={assets.get(payload.image.fileId)}
                altText={payload.image.altText}
                caption={payload.image.caption}
              />
              <div className={`checklist-block checklist-${payload.style}`}>
                <h3>{payload.title}</h3>
                <ul>
                  {payload.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function useFileAssets(blocks: RenderableBlock[]) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const ids = useMemo(() => collectFileIds(blocks), [blocks]);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      return;
    }

    apiFetch<FileAsset[]>(`/files?ids=${encodeURIComponent(idsKey)}`, { token })
      .then((result) => setAssets(new Map(result.map((asset) => [asset.id, asset]))))
      .catch(() => setAssets(new Map()));
  }, [ids.length, idsKey, token]);

  return assets;
}

function collectFileIds(blocks: RenderableBlock[]) {
  const ids = new Set<string>();
  for (const block of blocks) {
    const payload = block.payload as Record<string, unknown>;
    if (typeof payload.fileId === "string" && payload.fileId) {
      ids.add(payload.fileId);
    }
    if (Array.isArray(payload.images)) {
      for (const image of payload.images) {
        if (typeof image === "object" && image && "fileId" in image && typeof image.fileId === "string") {
          ids.add(image.fileId);
        }
      }
    }
    if (typeof payload.image === "object" && payload.image && "fileId" in payload.image && typeof payload.image.fileId === "string") {
      ids.add(payload.image.fileId);
    }
  }

  return Array.from(ids).sort();
}

function ImageBlock({ asset, altText, caption }: { asset: FileAsset | undefined; altText?: string; caption?: string }) {
  return (
    <figure className="media-block">
      {asset?.publicUrl ? <img alt={altText ?? asset.originalName} src={asset.publicUrl} /> : <MissingAsset />}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function MissingAsset() {
  return <p className="page-subtitle">Файл недоступен.</p>;
}

function rutubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("rutube.ru")) {
      return null;
    }

    const match = parsed.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
    return match?.[1] ? `https://rutube.ru/play/embed/${match[1]}` : null;
  } catch {
    return null;
  }
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
