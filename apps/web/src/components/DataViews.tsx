"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch, type FileAsset } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sanitizeParagraphHtml } from "../lib/sanitize-html";
import { useCoverAssets } from "../lib/use-cover-assets";

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
        // 401 централизованно ловит apiFetch: чистит localStorage и редиректит
        // на /login, поэтому здесь обрабатываем только 403 — реальный отказ
        // в доступе (демо истекло, модуль не оплачен).
        if (error instanceof ApiError && error.status === 401) {
          setState("unauthenticated");
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
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

export function NewsView() {
  const { data, state, errorMessage } = useApiData<any[]>("/news", []);
  const covers = useCoverAssets(data);
  const router = useRouter();
  const searchParams = useSearchParams();
  const openedSlug = searchParams.get("post");

  // Модалка открывается через query ?post=slug — это даёт shareable URL,
  // back/forward в браузере и закрытие по Esc через router.replace('/news').
  function openPost(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("post", slug);
    router.push(`/news?${params.toString()}`, { scroll: false });
  }

  function closePost() {
    router.push("/news", { scroll: false });
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
                <button
                  className={`news-tile ${hasCover ? "news-tile-with-cover" : "news-tile-text"}`}
                  onClick={() => openPost(post.slug)}
                  key={post.id}
                  type="button"
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
                </button>
              );
            })}
          </div>
        )}
      </section>
      {openedSlug ? <NewsModal slug={openedSlug} onClose={closePost} /> : null}
    </AppShell>
  );
}

function NewsModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { token } = useAuth();
  const [post, setPost] = useState<any | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("offensive_content");
  const [reportComment, setReportComment] = useState("");

  async function load() {
    if (!token) {
      setState("forbidden");
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

  // Закрытие по Esc, блокируем прокрутку фона пока модалка открыта.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

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

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="news-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="news-modal">
        <button className="news-modal-close" onClick={onClose} type="button" aria-label="Закрыть">
          <X size={20} />
        </button>
        {state === "loading" ? (
          <div className="news-modal-loading">Загрузка…</div>
        ) : state === "error" ? (
          <div className="news-modal-loading">{errorMessage ?? "Ошибка."}</div>
        ) : state === "forbidden" || !post ? (
          <div className="news-modal-loading">Доступ ограничен.</div>
        ) : (
          <NewsArticleContent
            post={post}
            commentText={commentText}
            onCommentTextChange={setCommentText}
            onSubmitComment={submitComment}
            resultMessage={resultMessage}
            reportingCommentId={reportingCommentId}
            setReportingCommentId={setReportingCommentId}
            reportReason={reportReason}
            setReportReason={setReportReason}
            reportComment={reportComment}
            setReportComment={setReportComment}
            onSubmitComplaint={submitComplaint}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

type NewsArticleProps = {
  post: any;
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
  resultMessage: string | null;
  reportingCommentId: string | null;
  setReportingCommentId: (id: string | null) => void;
  reportReason: string;
  setReportReason: (value: string) => void;
  reportComment: string;
  setReportComment: (value: string) => void;
  onSubmitComplaint: (event: FormEvent<HTMLFormElement>) => void;
};

function NewsArticleContent({
  post,
  commentText,
  onCommentTextChange,
  onSubmitComment,
  resultMessage,
  reportingCommentId,
  setReportingCommentId,
  reportReason,
  setReportReason,
  reportComment,
  setReportComment,
  onSubmitComplaint,
}: NewsArticleProps) {
  const { token } = useAuth();
  const [cover, setCover] = useState<FileAsset | null>(null);
  useEffect(() => {
    if (!token || !post?.coverImageId) {
      setCover(null);
      return;
    }
    apiFetch<FileAsset[]>(`/files?ids=${encodeURIComponent(post.coverImageId)}`, { token })
      .then((result) => setCover(result[0] ?? null))
      .catch(() => setCover(null));
  }, [post?.coverImageId, token]);

  return (
    <div className="news-article">
      {cover?.publicUrl ? (
        <div className="news-article-cover">
          <img alt={cover.originalName ?? post.title} src={cover.publicUrl} />
        </div>
      ) : null}
      <div className="news-article-body">
        <span className="news-tile-category">Новости</span>
        <h1 className="news-article-title">{post.title}</h1>
        <p className="news-article-lead">{post.lead}</p>
        <div className="content-blocks">
          <ContentBlocks blocks={post.blocks ?? []} />
        </div>
        <div className="news-article-meta">
          {post.firstPublishedAt ? (
            <span>{new Date(post.firstPublishedAt).toLocaleString("ru-RU")}</span>
          ) : null}
          <span>👍 {post._count?.likes ?? 0}</span>
          <span>💬 {post._count?.comments ?? 0}</span>
        </div>

        <section className="comments-section">
          <h2>Комментарии</h2>
          {resultMessage ? <p className="status-pill">{resultMessage}</p> : null}
          <form className="reply-form" onSubmit={onSubmitComment}>
            <textarea
              className="textarea small"
              onChange={(event) => onCommentTextChange(event.target.value)}
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
                  <button
                    className="button secondary"
                    onClick={() => setReportingCommentId(comment.id)}
                    type="button"
                  >
                    Пожаловаться
                  </button>
                </div>
                <p>{comment.text}</p>
                {reportingCommentId === comment.id ? (
                  <form className="form report-form" onSubmit={onSubmitComplaint}>
                    <select
                      className="select"
                      onChange={(event) => setReportReason(event.target.value)}
                      value={reportReason}
                    >
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
                      <button
                        className="button secondary"
                        onClick={() => setReportingCommentId(null)}
                        type="button"
                      >
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
      </div>
    </div>
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

type IndexPeriod = "1M" | "3M" | "1Y";

const INDEX_PERIOD_LABELS: Record<IndexPeriod, string> = {
  "1M": "1 мес.",
  "3M": "3 мес.",
  "1Y": "1 год",
};

export function IndicesView() {
  const { data, state, errorMessage } = useApiData<any[]>("/indices", []);
  const [activeSlug, setActiveSlug] = useState<string | undefined>(undefined);
  const active = data.find((category: any) => category.slug === activeSlug) ?? data[0];

  useEffect(() => {
    if (!activeSlug && data[0]?.slug) {
      setActiveSlug(data[0].slug);
    }
  }, [data, activeSlug]);

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
        <PageHeader
          title="Индексы цен на вторсырьё"
          subtitle="Актуальные ценовые индексы по основным категориям сырья."
        />
        <div className="indices-categories">
          {data.map((category: any) => (
            <button
              className={`indices-category-tab ${category.slug === active?.slug ? "active" : ""}`}
              onClick={() => setActiveSlug(category.slug)}
              key={category.id}
              type="button"
            >
              {category.name}
            </button>
          ))}
        </div>
        {!active || (active.nomenclatures ?? []).length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            В этой категории пока нет опубликованных индексов.
          </p>
        ) : (
          <div className="indices-grid">
            {active.nomenclatures.map((item: any) => (
              <IndexCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function IndexCard({ item }: { item: any }) {
  const [period, setPeriod] = useState<IndexPeriod>("3M");

  // Если в выбранном периоде истории меньше, чем нужно (например, спросили
  // «1 год», а есть только 4 месяца), берём всё, что есть. На бэке
  // filterPriceIndexPoints уже отдаёт сколько накопилось — здесь только
  // фолбэк, если фронт получил пустой массив.
  const chart = item.chart ?? {};
  const points: Array<{ date: string | Date; price: number }> =
    chart[period]?.length > 0
      ? chart[period]
      : chart["1Y"]?.length > 0
        ? chart["1Y"]
        : chart["3M"]?.length > 0
          ? chart["3M"]
          : chart["1M"] ?? [];

  const currentPrice = Number(item.summary?.currentPrice ?? points[points.length - 1]?.price ?? 0);
  const weeklyChange = Number(item.summary?.weeklyChange ?? 0);

  return (
    <article className="index-card">
      <div className="index-card-head">
        <div className="index-period-tabs">
          {(Object.keys(INDEX_PERIOD_LABELS) as IndexPeriod[]).map((value) => (
            <button
              className={`index-period-tab ${period === value ? "active" : ""}`}
              key={value}
              onClick={() => setPeriod(value)}
              type="button"
            >
              {INDEX_PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
        <div className="index-current-price">
          <strong>{currentPrice.toLocaleString("ru-RU")}</strong>
          <span>{item.unit ?? "₽/т"}</span>
        </div>
      </div>

      <div className="index-card-body">
        <h2 className="index-card-title">{item.name}</h2>
        <p className="index-card-subtitle">
          {item.code}
          {weeklyChange !== 0 ? (
            <>
              {" · "}
              <span className={weeklyChange >= 0 ? "index-change-positive" : "index-change-negative"}>
                {weeklyChange > 0 ? "+" : ""}
                {weeklyChange}% за неделю
              </span>
            </>
          ) : null}
        </p>
      </div>

      <IndexChart points={points} period={period} />
    </article>
  );
}

const MONTH_LABELS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function IndexChart({
  points,
  period,
}: {
  points: Array<{ date: string | Date; price: number }>;
  period: IndexPeriod;
}) {
  // Хук всегда вызывается, до раннего return — иначе сломается порядок hooks.
  const gradientId = useMemo(() => `index-grad-${Math.random().toString(36).slice(2, 9)}`, []);

  if (points.length === 0) {
    return <div className="index-chart-empty">Нет данных для графика</div>;
  }

  const width = 720;
  const height = 200;
  const padding = { top: 24, right: 32, bottom: 32, left: 32 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || max || 1;

  const xs = points.map((_, i) =>
    points.length === 1 ? padding.left + innerWidth / 2 : padding.left + (i / (points.length - 1)) * innerWidth,
  );
  const ys = points.map((p) => padding.top + innerHeight - ((p.price - min) / range) * innerHeight);

  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" ");
  const lastIndex = points.length - 1;
  const areaPath = `${linePath} L${xs[lastIndex]!.toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${xs[0]!.toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`;

  // Подписи на оси X: для 1M примерно по неделям, для 3M раз в месяц, для 1Y раз в 2 месяца.
  const labelStep = period === "1M" ? Math.max(1, Math.floor(points.length / 4)) : period === "3M" ? Math.max(1, Math.floor(points.length / 4)) : Math.max(1, Math.floor(points.length / 6));
  const labels: Array<{ x: number; text: string }> = [];
  points.forEach((p, i) => {
    if (i % labelStep === 0 || i === lastIndex) {
      const date = new Date(p.date);
      const text = period === "1Y"
        ? `${MONTH_LABELS[date.getMonth()]}`
        : `${date.getDate()} ${MONTH_LABELS[date.getMonth()]}`;
      labels.push({ x: xs[i]!, text });
    }
  });

  const lastX = xs[lastIndex]!;
  const lastY = ys[lastIndex]!;
  const lastPrice = prices[lastIndex]!;

  return (
    <div className="index-chart-wrap">
      <svg className="index-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="5" fill="var(--primary)" stroke="white" strokeWidth="2" />

        {/* Метка с последним значением — небольшая тёмная плашка. */}
        <g transform={`translate(${lastX}, ${Math.max(lastY - 18, padding.top - 2)})`}>
          <rect x="-30" y="-18" width="60" height="22" rx="11" fill="#1a202e" />
          <text x="0" y="-3" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
            {Math.round(lastPrice).toLocaleString("ru-RU")}
          </text>
        </g>

        {labels.map((label, i) => (
          <text key={i} x={label.x} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function EducationView() {
  const { data, state, errorMessage } = useApiData<any[]>("/education/modules", []);
  const covers = useCoverAssets(data);

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
        <div className="education-grid">
          {data.map((module: any) => {
            const lessonsCount = module.chapters?.reduce(
              (sum: number, chapter: any) => sum + (chapter.lessons?.length ?? 0),
              0,
            ) ?? 0;
            const cover = module.coverImageId ? covers.get(module.coverImageId) : null;
            const coverUrl = cover?.publicUrl;
            return (
              <article className="education-card" key={module.id}>
                <Link className="education-card-link" href={`/education/${module.id}`}>
                  <div className="education-card-cover">
                    {coverUrl ? <img alt="" src={coverUrl} /> : <div className="education-card-cover-fallback" />}
                    <div className="education-card-cover-meta">
                      <h2 className="education-card-title-badge">{module.title}</h2>
                      <span className="education-card-lessons-badge">Уроков: {lessonsCount}</span>
                    </div>
                  </div>
                  <span className={`education-card-status ${module.hasAccess ? "" : "locked"}`}>
                    {module.hasAccess ? "Доступен" : "Нужна подписка"}
                  </span>
                  <div className="education-card-panel">
                    <p>{module.summary}</p>
                  </div>
                  <span className="education-card-open-overlay" aria-hidden="true">Открыть</span>
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
  // Используем тот же хук, что и каталог модулей, чтобы подтянуть URL обложки.
  const covers = useCoverAssets(data ? [data] : []);

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
  const coverUrl = data.coverImageId ? covers.get(data.coverImageId)?.publicUrl : null;
  const totalLessons =
    (data.chapters ?? []).reduce(
      (sum: number, chapter: any) => sum + (chapter.lessons?.length ?? 0),
      0,
    );
  const firstLessonHref = (() => {
    for (const chapter of data.chapters ?? []) {
      const first = chapter.lessons?.[0];
      if (first) return `/education/${moduleId}/${first.id}`;
    }
    return null;
  })();

  const accessLabel =
    data.accessLevel === "basic"
      ? "Базовая подписка"
      : data.accessLevel === "extended"
        ? "Расширенная подписка"
        : "Разовая покупка";

  return (
    <AppShell>
      <section className="page module-page">
        <header className={`module-hero${coverUrl ? "" : " no-cover"}`}>
          <div className="module-hero-cover">
            {coverUrl ? (
              <img alt={data.title} src={coverUrl} />
            ) : (
              <div className="module-hero-cover-fallback" />
            )}
          </div>
          <div className="module-hero-body">
            <span className={`module-hero-status${hasAccess ? " is-open" : " is-locked"}`}>
              {hasAccess ? "Доступен" : "Нужна подписка"}
              <span className="module-hero-status-sub">· {accessLabel}</span>
            </span>
            <h1 className="module-hero-title">{data.title}</h1>
            <p className="module-hero-summary">{data.summary}</p>
            <p className="module-hero-description">{data.description}</p>
            <div className="module-hero-meta">
              <span>
                {(data.chapters ?? []).length}{" "}
                {pluralizeRu((data.chapters ?? []).length, "глава", "главы", "глав")}
              </span>
              <span aria-hidden>·</span>
              <span>
                {totalLessons} {pluralizeRu(totalLessons, "урок", "урока", "уроков")}
              </span>
            </div>
            <div className="module-hero-actions">
              {hasAccess && firstLessonHref ? (
                <Link className="button" href={firstLessonHref}>
                  Начать обучение
                </Link>
              ) : !hasAccess ? (
                <Link className="button" href="/account">
                  Активировать подписку
                </Link>
              ) : null}
              <Link className="button secondary" href="/education">
                ← К курсам
              </Link>
            </div>
          </div>
        </header>

        {!hasAccess && data.preview ? (
          <section className="module-preview-card">
            <h2>Что внутри курса</h2>
            <p>{data.preview.promotionalDescription}</p>
            <ul className="module-preview-list">
              {data.preview.whatYouWillLearn.map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasAccess ? (
          <section className="module-chapters">
            <h2 className="module-chapters-title">Программа курса</h2>
            <div className="chapters-list">
              {(data.chapters ?? []).map((chapter: any, index: number) => (
                <article className="chapter-card" key={chapter.id}>
                  <header className="chapter-card-header">
                    <span className="chapter-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="chapter-card-info">
                      <h3 className="chapter-card-title">{chapter.title}</h3>
                      <p className="chapter-card-meta">
                        {(chapter.lessons ?? []).length}{" "}
                        {pluralizeRu((chapter.lessons ?? []).length, "урок", "урока", "уроков")}
                      </p>
                    </div>
                  </header>
                  {(chapter.lessons ?? []).length === 0 ? (
                    <p className="chapter-card-empty">В этой главе пока пусто.</p>
                  ) : (
                    <ol className="lesson-list">
                      {(chapter.lessons ?? []).map((lesson: any, lessonIndex: number) => (
                        <li className="lesson-item" key={lesson.id}>
                          <Link
                            className="lesson-item-link"
                            href={`/education/${moduleId}/${lesson.id}`}
                          >
                            <span className="lesson-item-index">
                              {index + 1}.{lessonIndex + 1}
                            </span>
                            <span className="lesson-item-title">{lesson.title}</span>
                            <span className="lesson-item-arrow" aria-hidden>
                              →
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}

export function LessonView({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const { token, user } = useAuth();
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

  const totalLessons = (data.chapters ?? []).reduce(
    (sum: number, ch: any) => sum + (ch.lessons ?? []).length,
    0,
  );
  // Реальный прогресс по урокам пока не отдаётся бэкендом — показываем
  // только текущий урок как «1 в работе». Когда появится LessonProgress в API,
  // здесь будет фактический счёт пройденных уроков пользователя.
  const completedLessons = completed ? 1 : 0;
  const progressPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

  const upgradeCta = resolveUpgradeCta(user);

  return (
    <AppShell>
      <section className="page lesson-page">
        <nav className="lesson-breadcrumb">
          <Link href="/education">Главная</Link>
          <span>/</span>
          <Link href="/education">Курсы</Link>
          <span>/</span>
          <Link href={`/education/${moduleId}`}>{data.title}</Link>
          <span>/</span>
          <span className="lesson-breadcrumb-current">{lesson.title}</span>
        </nav>

        {upgradeCta ? (
          <div className="lesson-upgrade-banner">
            <div>
              <strong>{upgradeCta.title}</strong>
              <p>{upgradeCta.description}</p>
            </div>
            <Link className="button" href="/account">
              {upgradeCta.buttonLabel}
            </Link>
          </div>
        ) : null}

        <div className="lesson-layout">
          <article className="lesson-main">
            <h1 className="lesson-title">{lesson.title}</h1>
            <div className="content-blocks lesson-blocks">
              <ContentBlocks blocks={lesson.blocks ?? []} />
            </div>
            <div className="auth-actions" style={{ marginTop: 24 }}>
              <button
                className="button"
                type="button"
                onClick={markCompleted}
                disabled={completed || completing}
              >
                {completed ? "Отмечено пройденным" : completing ? "Сохраняю…" : "Отметить пройденным"}
              </button>
              <Link className="button secondary" href={`/education/${moduleId}`}>
                ← К модулю
              </Link>
            </div>
          </article>

          <aside className="lesson-sidebar">
            <div className="lesson-side-card">
              <div className="lesson-side-card-header">Прогресс курса</div>
              <div className="lesson-progress">
                <div className="lesson-progress-ring" style={{ ["--progress" as any]: progressPercent }}>
                  <span>{progressPercent}%</span>
                </div>
                <div className="lesson-progress-meta">
                  <strong>{data.title}</strong>
                  <span>Уроки завершены: {completedLessons} из {totalLessons}</span>
                </div>
              </div>
            </div>

            <div className="lesson-side-card">
              <div className="lesson-side-card-header">Задания урока</div>
              <ul className="lesson-task-list">
                <li className={completed ? "done" : ""}>
                  <span className="lesson-task-icon">
                    {completed ? "✓" : "1"}
                  </span>
                  <div>
                    <strong>Посмотреть урок</strong>
                    <span>{completed ? "Урок завершён" : "Дочитайте до конца"}</span>
                  </div>
                </li>
                <li className={completed ? "done" : ""}>
                  <span className="lesson-task-icon">
                    {completed ? "✓" : "2"}
                  </span>
                  <div>
                    <strong>Отметить пройденным</strong>
                    <span>{completed ? "Готово" : "Кнопка под уроком"}</span>
                  </div>
                </li>
              </ul>
            </div>

            {(lesson.attachments ?? []).length > 0 ? (
              <div className="lesson-side-card">
                <div className="lesson-side-card-header">Материалы урока</div>
                <LessonAttachments attachments={lesson.attachments} />
              </div>
            ) : null}
          </aside>
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
  const activeNode = useMemo(() => findFirstKnowledgeNode(data), [data]);

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
    <KnowledgeBaseLayout tree={data} activeArticle={activeNode} activeSlug={activeNode?.slug} />
  );
}

export function KnowledgeArticleView({ slug }: { slug: string }) {
  const tree = useApiData<any[]>("/knowledge-base", []);
  const article = useApiData<any | null>(
    `/knowledge-base/${slug}`,
    null,
  );

  if (tree.state === "unauthenticated" || article.state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }
  if (tree.state === "forbidden" || article.state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }
  if (tree.state === "error" || article.state === "error") {
    return <ErrorState title="База знаний" message={tree.errorMessage ?? article.errorMessage} />;
  }
  if (!article.data) {
    return (
      <AppShell>
        <section className="page">
          <PageHeader title="База знаний" subtitle="Загружаем статью…" />
        </section>
      </AppShell>
    );
  }

  return (
    <KnowledgeBaseLayout tree={tree.data} activeArticle={article.data} activeSlug={slug} />
  );
}

function KnowledgeBaseLayout({
  tree,
  activeArticle,
  activeSlug,
}: {
  tree: any[];
  activeArticle?: any | null;
  activeSlug?: string;
}) {
  const fallbackActive = useMemo(() => findFirstKnowledgeNode(tree), [tree]);
  const active = activeArticle ?? fallbackActive;
  const activeChildren = (active?.children ?? []) as any[];
  const breadcrumbs = active ? buildKnowledgeBreadcrumbs(tree, active) : [];

  return (
    <AppShell>
      <section className="page knowledge-page">
        <div className="knowledge-workspace">
          <aside className="knowledge-nav-panel" aria-label="Навигация по базе знаний">
            <div className="knowledge-nav-heading">
              <span className="knowledge-nav-kicker">База знаний</span>
              <h1>Навигация по сырью</h1>
            </div>
            {tree.length === 0 ? (
              <p className="page-subtitle">Статей пока нет.</p>
            ) : (
              <nav className="knowledge-nav-list">
                {tree.map((node: any) => (
                  <KnowledgeNavNode key={node.id} node={node} activeSlug={activeSlug ?? active?.slug} />
                ))}
              </nav>
            )}
          </aside>

          <main className="knowledge-content-panel">
            {!active ? (
              <article className="knowledge-article-card">
                <p className="page-subtitle">Выберите материал в навигации слева.</p>
              </article>
            ) : (
              <>
                <div className="knowledge-content-head">
                  <div className="knowledge-title-row">
                    <span className="knowledge-material-icon" aria-hidden="true" />
                    <div>
                      {breadcrumbs.length > 0 ? (
                        <p className="knowledge-breadcrumbs">
                          {breadcrumbs.map((crumb, index) => (
                            <span key={crumb.slug}>
                              {index > 0 ? " / " : ""}
                              <Link href={`/knowledge-base/${crumb.slug}`}>{crumb.title}</Link>
                            </span>
                          ))}
                        </p>
                      ) : null}
                      <h1>{active.title}</h1>
                      {active.subtitle ? <p>{active.subtitle}</p> : null}
                    </div>
                  </div>
                </div>

                <article className="knowledge-article-card content-article">
                  {(active.blocks ?? []).length > 0 ? (
                    <ContentBlocks blocks={active.blocks ?? []} />
                  ) : (
                    <p className="page-subtitle">Описание появится после наполнения материала.</p>
                  )}
                </article>

                {activeChildren.length > 0 ? (
                  <section className="knowledge-child-section" aria-label="Материалы раздела">
                    <h2>Материалы раздела</h2>
                    <div className="knowledge-child-grid">
                      {activeChildren.map((child: any) => (
                        <Link className="knowledge-child-card" href={`/knowledge-base/${child.slug}`} key={child.id}>
                          <strong>{child.title}</strong>
                          {child.subtitle ? <span>{child.subtitle}</span> : null}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </main>
        </div>
      </section>
    </AppShell>
  );
}

function KnowledgeNavNode({ node, activeSlug }: { node: any; activeSlug?: string }) {
  const children = (node.children ?? []) as any[];
  const isActive = node.slug === activeSlug;
  const hasActiveChild = children.some((child) => knowledgeNodeContainsSlug(child, activeSlug));

  return (
    <div className={`knowledge-nav-group ${hasActiveChild ? "has-active-child" : ""}`}>
      <Link className={`knowledge-nav-link ${isActive ? "active" : ""}`} href={`/knowledge-base/${node.slug}`}>
        <span className={`knowledge-nav-dot ${children.length > 0 ? "category" : ""}`} aria-hidden="true" />
        <span>{node.title}</span>
      </Link>
      {children.length > 0 ? (
        <div className="knowledge-nav-children">
          {children.map((child) => (
            <KnowledgeNavNode activeSlug={activeSlug} key={child.id} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function findFirstKnowledgeNode(nodes: any[]): any | null {
  for (const node of nodes) {
    if ((node.blocks ?? []).length > 0 || (node.children ?? []).length === 0) {
      return node;
    }
    const child = findFirstKnowledgeNode(node.children ?? []);
    if (child) return child;
  }
  return nodes[0] ?? null;
}

function knowledgeNodeContainsSlug(node: any, slug?: string): boolean {
  if (!slug) return false;
  if (node.slug === slug) return true;
  return ((node.children ?? []) as any[]).some((child) => knowledgeNodeContainsSlug(child, slug));
}

function buildKnowledgeBreadcrumbs(nodes: any[], active: any): Array<{ title: string; slug: string }> {
  const path = findKnowledgePath(nodes, active.slug) ?? [];
  return path.slice(0, -1).map((node) => ({ title: node.title, slug: node.slug }));
}

function findKnowledgePath(nodes: any[], slug?: string): any[] | null {
  if (!slug) return null;
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const childPath = findKnowledgePath(node.children ?? [], slug);
    if (childPath) return [node, ...childPath];
  }
  return null;
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

const COMPANY_TYPE_LABELS: Record<string, string> = {
  collector: "Заготовитель",
  trader: "Трейдер",
  processor: "Переработчик",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Мужской",
  female: "Женский",
};

// Какую CTA «обновления тарифа» показывать сверху урока:
// — нет компании (стафф) или extended-подписка → ничего;
// — basic-подписка → предложить Расширенный доступ;
// — demo/past_due/blocked → предложить Полный доступ.
function resolveUpgradeCta(user: ReturnType<typeof useAuth>["user"]):
  | { title: string; description: string; buttonLabel: string }
  | null {
  if (!user || !user.company || (user.platformRoles?.length ?? 0) > 0) {
    return null;
  }
  const status = user.company.status;
  const plan = user.company.subscriptionPlan;
  if (status === "active" && plan === "extended") {
    return null;
  }
  if (status === "active" && plan === "basic") {
    return {
      title: "Расширенный доступ",
      description: "Откройте продвинутые модули обучения и дополнительные материалы.",
      buttonLabel: "Расширенный доступ",
    };
  }
  return {
    title: "Полный доступ",
    description: "Активируйте подписку, чтобы открыть все модули обучения.",
    buttonLabel: "Полный доступ",
  };
}

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
            <div className="profile-summary">
              {user?.avatarUrl ? (
                <img className="profile-avatar" alt="" src={user.avatarUrl} />
              ) : (
                <div className="profile-avatar profile-avatar-placeholder" aria-hidden="true" />
              )}
              <div>
                <p>{user ? `${user.firstName} ${user.lastName}` : "Не авторизован"}</p>
                <p>{user?.email}</p>
                {user?.gender ? <p className="page-subtitle">Пол: {GENDER_LABELS[user.gender] ?? user.gender}</p> : null}
              </div>
            </div>
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
                {user?.company?.type ? <p>{COMPANY_TYPE_LABELS[user.company.type] ?? user.company.type}</p> : null}
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
  | { type: "paragraph"; payload: { html: string } }
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

export function ContentBlocks({ blocks }: { blocks: RenderableBlock[] }) {
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
          const html = (block.payload as { html: string }).html;
          return (
            <div
              className="rendered-html"
              key={index}
              dangerouslySetInnerHTML={{ __html: sanitizeParagraphHtml(html) }}
            />
          );
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

function pluralizeRu(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
