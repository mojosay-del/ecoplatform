"use client";

// Общие хелперы и базовые состояния для views.
// Раньше всё лежало в одном 3000-строчном DataViews.tsx; здесь — то, что
// нужно нескольким view-файлам (NewsView, AccountView, KnowledgeArticleView, ...).

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { type LucideIcon } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

export type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

export type LikeResult = {
  liked: boolean;
  likesCount: number;
};

export function formatNewsDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatCommentDate(value: string | Date) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getCommentAuthor(user: { firstName?: string; lastName?: string } | null | undefined) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || "Участник";
}

export function getCommentInitials(user: { firstName?: string; lastName?: string } | null | undefined) {
  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase();
  return initials || "У";
}

export function CommentAvatar({
  user,
  current = false,
}: {
  user: { avatarUrl?: string | null; firstName?: string; lastName?: string } | null | undefined;
  current?: boolean;
}) {
  return (
    <div
      className={`comment-avatar ${current ? "is-current" : ""} ${user?.avatarUrl ? "has-image" : ""}`}
      aria-hidden="true"
    >
      {user?.avatarUrl ? (
        <Image alt="" src={user.avatarUrl} width={42} height={42} />
      ) : current ? (
        "Вы"
      ) : (
        getCommentInitials(user)
      )}
    </div>
  );
}

// Каждое из этих обновлений возвращает новую структуру вместо мутации —
// State-обновления React требуют новой ссылки.
export function withUpdatedNewsLike<T extends { _count?: Record<string, unknown> }>(post: T, result: LikeResult): T {
  return {
    ...post,
    likedByMe: result.liked,
    _count: {
      ...(post._count ?? {}),
      likes: result.likesCount,
    },
  } as T;
}

type CommentLikeNode = {
  id: string;
  likedByMe?: boolean;
  _count?: Record<string, unknown>;
  replies?: CommentLikeNode[];
};

export function updateCommentLikeInList<T extends CommentLikeNode>(
  comments: T[],
  commentId: string,
  result: LikeResult,
): T[] {
  return comments.map((comment) => {
    const next: T =
      comment.id === commentId
        ? ({
            ...comment,
            likedByMe: result.liked,
            _count: {
              ...(comment._count ?? {}),
              likes: result.likesCount,
            },
          } as T)
        : comment;

    if (!next.replies?.length) {
      return next;
    }

    return {
      ...next,
      replies: updateCommentLikeInList(next.replies, commentId, result),
    } as T;
  });
}

export function withUpdatedCommentLike<P extends { comments?: CommentLikeNode[] }>(
  post: P,
  commentId: string,
  result: LikeResult,
): P {
  return {
    ...post,
    comments: updateCommentLikeInList(post.comments ?? [], commentId, result),
  } as P;
}

export function NewsMetaItem({ count, icon: Icon, label }: { count: number; icon: LucideIcon; label: string }) {
  return (
    <span className="news-meta-item" aria-label={`${label}: ${count}`}>
      <Icon aria-hidden="true" size={14} strokeWidth={2} />
      <span>{count}</span>
    </span>
  );
}

// Возвращает только поля, которые могут поменяться при лайке/комменте:
// после обновления одной новости в ленте перезатираем именно их. Generic
// сохраняет точный тип `_count`, чтобы вернувшийся объект можно было
// «накатить» на NewsListItem без потери типа.
export function getNewsFeedSnapshot<C, L extends boolean>(post: { _count: C; likedByMe: L }) {
  return {
    _count: post._count,
    likedByMe: post.likedByMe,
  };
}

// Версия useApiData, принимающая fetcher-функцию (типизированный
// `api.news.get`, `api.learning.getModule`, …). Параметр `key` — стабильная
// строка, в которой кодируются все переменные fetcher'а (id/slug). Когда key
// меняется — перезапрашиваем; идентичность fetcher НЕ имеет значения.
//
// Это вторая версия рядом с useApiData, чтобы можно было мигрировать views
// постепенно. После полного перехода старый useApiData(path) можно удалить.
export function useApiQuery<T>(key: string | null, fetcher: () => Promise<T>, initial: T) {
  const { token } = useAuth();
  const initialRef = useRef(initial);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
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
    if (!key) {
      setData(initialRef.current);
      setState("ready");
      setErrorMessage(null);
      return;
    }
    setState("loading");
    setErrorMessage(null);
    fetcherRef
      .current()
      .then((result) => {
        if (!isActive) return;
        setData(result);
        setState("ready");
      })
      .catch((error) => {
        if (!isActive) return;
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
  }, [key, token]);

  return { data, setData, state, errorMessage };
}

// Хук одной ручкой берёт данные через apiFetch и держит четыре состояния:
// loading / ready / forbidden / error. unauthenticated отдельно — для случая
// когда токен ещё не прогружен.
export function useApiData<T>(path: string | null, initial: T) {
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

    // path=null означает «не дёргать API» (например, у платформенного
    // сотрудника нет компании, /billing/status вернул бы 500).
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

  return { data, setData, state, errorMessage };
}

// Базовые экраны состояний — одинаковые на всех страницах, поэтому удобно
// держать в одном месте. Каждый кладёт себя внутрь AppShell, чтобы пользователь
// видел сайдбар, а не «голый» экран.
export function AuthRequired({ title }: { title: string }) {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Раздел доступен после входа и активного demo или подписки.</p>
        </header>
        <div className="auth-actions">
          <Link className="button" href="/login">
            Войти
          </Link>
          <Link className="button secondary" href="/register">
            Создать demo
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

export function AccessClosed({ title }: { title: string }) {
  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">
            Demo истёк или подписка не активна. Личный кабинет, биллинг и поддержка остаются доступны.
          </p>
        </header>
        <div className="auth-actions">
          <Link className="button" href="/account">
            Открыть кабинет
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </header>
  );
}

export function pluralizeRu(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// CTA «обновить тариф» — показываем поверх контента, к которому у текущей
// компании нет доступа. Возвращает null, если апгрейд не нужен (extended-план,
// сотрудник платформы и т.п.).
export function resolveUpgradeCta(
  user: ReturnType<typeof useAuth>["user"],
): { title: string; description: string; buttonLabel: string } | null {
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

export function ErrorState({ title, message }: { title: string; message: string | null }) {
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
