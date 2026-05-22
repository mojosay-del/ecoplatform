"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { CmsTabs } from "./CmsTabs";
import { ALL_BLOCK_KINDS, Block, BlocksEditor } from "./BlocksEditor";
import { FileUploadField } from "./FileUploadField";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type Article = {
  id: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  coverImageId: string | null;
  slug: string;
  position: number;
  iconType: string | null;
  status: "draft" | "published";
  firstPublishedAt: string | null;
  blocks: Block[];
  createdAt: string;
  updatedAt: string;
};

type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

type DraftState = {
  id: string | null;
  parentId: string | null;
  title: string;
  subtitle: string;
  coverImageId: string;
  iconType: string;
  position: number;
  blocks: Block[];
};

const EMPTY_DRAFT: DraftState = {
  id: null,
  parentId: null,
  title: "",
  subtitle: "",
  coverImageId: "",
  iconType: "",
  position: 0,
  blocks: [{ type: "paragraph", payload: { markdown: "" } }],
};

export function AdminKnowledgeView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [items, setItems] = useState<Article[]>([]);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Дерево статей: топ-уровень + детям детей; пока с глубиной до 3 в БД.
  const tree = useMemo(() => buildTree(items), [items]);

  // Все статьи доступны как parent (кроме самой редактируемой и её потомков).
  const parentOptions = useMemo(() => {
    const forbidden = new Set<string>();
    if (draft.id) {
      forbidden.add(draft.id);
      const stack = [draft.id];
      while (stack.length) {
        const current = stack.pop()!;
        for (const item of items) {
          if (item.parentId === current && !forbidden.has(item.id)) {
            forbidden.add(item.id);
            stack.push(item.id);
          }
        }
      }
    }
    return items.filter((item) => !forbidden.has(item.id));
  }, [items, draft.id]);

  async function loadList() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const data = await apiFetch<Article[]>("/admin/content/knowledge-base", { token });
      setItems(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить базу знаний");
    }
  }

  function startNew(parentId: string | null = null) {
    const siblings = items.filter((item) => item.parentId === parentId);
    setDraft({
      ...EMPTY_DRAFT,
      parentId,
      position: siblings.length,
    });
  }

  function startEdit(article: Article) {
    setDraft({
      id: article.id,
      parentId: article.parentId,
      title: article.title,
      subtitle: article.subtitle ?? "",
      coverImageId: article.coverImageId ?? "",
      iconType: article.iconType ?? "",
      position: article.position,
      blocks: article.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const body = {
        parentId: draft.parentId,
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() || undefined,
        coverImageId: draft.coverImageId.trim() || undefined,
        iconType: draft.iconType.trim() || undefined,
        position: draft.position,
        blocks: draft.blocks,
      };

      if (draft.id) {
        await apiFetch(`/admin/content/knowledge-base/${draft.id}`, {
          method: "PATCH",
          token,
          body,
        });
        // Если изменили parentId или position — нужен отдельный move-вызов.
        const original = items.find((item) => item.id === draft.id);
        if (original && (original.parentId !== draft.parentId || original.position !== draft.position)) {
          await apiFetch(`/admin/content/knowledge-base/${draft.id}/move`, {
            method: "PATCH",
            token,
            body: { parentId: draft.parentId, position: draft.position },
          });
        }
      } else {
        await apiFetch("/admin/content/knowledge-base", { method: "POST", token, body });
      }
      setMessage(draft.id ? "Статья обновлена." : "Статья создана как черновик.");
      await loadList();
      if (!draft.id) startNew(draft.parentId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить статью.");
    } finally {
      setSubmitting(false);
    }
  }

  async function publishToggle(article: Article) {
    if (!token) return;
    const path =
      article.status === "published"
        ? `/admin/content/knowledge-base/${article.id}/unpublish`
        : `/admin/content/knowledge-base/${article.id}/publish`;
    try {
      await apiFetch(path, { method: "POST", token });
      await loadList();
      setMessage(article.status === "published" ? "Снято с публикации." : "Опубликовано.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить статус.");
    }
  }

  async function remove(article: Article) {
    if (!token) return;
    if (!confirm(`Удалить статью «${article.title}»? Если есть дочерние статьи — сначала переместите или удалите их.`)) return;
    try {
      await apiFetch(`/admin/content/knowledge-base/${article.id}`, { method: "DELETE", token });
      await loadList();
      if (draft.id === article.id) startNew();
      setMessage("Статья удалена.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить статью.");
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / База знаний</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / База знаний</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS</h1>
          <p className="page-subtitle">Иерархическая структура статей. Глубина — до 3 уровней.</p>
        </header>
        <CmsTabs />
        {message ? <p className="status-pill">{message}</p> : null}

        <div className="moderation-layout">
          <div className="stack-list">
            <div className="auth-actions">
              <button className="button" type="button" onClick={() => startNew(null)}>
                + Новая статья на верхнем уровне
              </button>
            </div>
            {tree.length === 0 ? <p className="page-subtitle">Статей пока нет.</p> : null}
            <TreeView
              nodes={tree}
              activeId={draft.id}
              onSelect={startEdit}
              onPublishToggle={publishToggle}
              onRemove={remove}
              onAddChild={(parentId) => startNew(parentId)}
            />
          </div>

          <div className="moderation-detail">
            <form className="form" onSubmit={submit}>
              <h2>{draft.id ? "Редактирование статьи" : "Новая статья"}</h2>

              <label className="form-field">
                <span>Родительская статья</span>
                <select
                  className="select"
                  value={draft.parentId ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, parentId: event.target.value || null }))
                  }
                >
                  <option value="">— верхний уровень —</option>
                  {parentOptions.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {indentTitle(items, parent)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Заголовок</span>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </label>

              <label className="form-field">
                <span>Подзаголовок (необязательно)</span>
                <input
                  className="input"
                  value={draft.subtitle}
                  onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Позиция среди соседей</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={draft.position}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, position: Number(event.target.value) }))
                  }
                />
              </label>

              <label className="form-field">
                <span>Иконка (paper, plastic, glass, …)</span>
                <input
                  className="input"
                  value={draft.iconType}
                  onChange={(event) => setDraft((prev) => ({ ...prev, iconType: event.target.value }))}
                />
              </label>

              <FileUploadField
                accept="image/*"
                buttonLabel="Загрузить обложку"
                label="ID обложки (необязательно)"
                value={draft.coverImageId}
                onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
              />

              <div className="form-field">
                <span>Блоки контента</span>
                <BlocksEditor
                  blocks={draft.blocks}
                  onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks }))}
                  allowedKinds={ALL_BLOCK_KINDS}
                />
              </div>

              <div className="auth-actions">
                <button className="button" type="submit" disabled={submitting}>
                  {submitting ? "Сохраняю…" : draft.id ? "Сохранить" : "Создать черновик"}
                </button>
                {draft.id ? (
                  <button className="button secondary" type="button" onClick={() => startNew()}>
                    Отмена
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

type TreeNode = Article & { children: TreeNode[] };

function buildTree(items: Article[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const item of items) {
    byId.set(item.id, { ...item, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortByPosition = (a: TreeNode, b: TreeNode) => a.position - b.position;
  for (const node of byId.values()) node.children.sort(sortByPosition);
  roots.sort(sortByPosition);
  return roots;
}

function indentTitle(items: Article[], target: Article): string {
  let depth = 0;
  let current: Article | undefined = target;
  while (current?.parentId) {
    depth += 1;
    current = items.find((item) => item.id === current!.parentId);
    if (!current || depth > 5) break;
  }
  return `${"— ".repeat(depth)}${target.title}`;
}

function TreeView({
  nodes,
  activeId,
  onSelect,
  onPublishToggle,
  onRemove,
  onAddChild,
  level = 0,
}: {
  nodes: TreeNode[];
  activeId: string | null;
  onSelect: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
  onRemove: (article: Article) => void;
  onAddChild: (parentId: string) => void;
  level?: number;
}) {
  return (
    <div className="stack-list">
      {nodes.map((node) => (
        <div key={node.id} style={{ paddingLeft: level * 12 }}>
          <article className={`moderation-case-row ${activeId === node.id ? "active" : ""}`}>
            <button
              type="button"
              onClick={() => onSelect(node)}
              style={{ all: "unset", cursor: "pointer", width: "100%" }}
            >
              <span className="status-pill">{node.status === "published" ? "Опубликовано" : "Черновик"}</span>
              <strong style={{ display: "block", marginTop: 4 }}>{node.title}</strong>
              {node.subtitle ? <span style={{ display: "block" }}>{node.subtitle}</span> : null}
              <small>
                Позиция: {node.position} · /{node.slug}
              </small>
            </button>
            <div className="auth-actions" style={{ marginTop: 8 }}>
              <button className="button secondary" type="button" onClick={() => onPublishToggle(node)}>
                {node.status === "published" ? "Снять" : "Опубликовать"}
              </button>
              {level < 2 ? (
                <button className="button secondary" type="button" onClick={() => onAddChild(node.id)}>
                  + Подстатья
                </button>
              ) : null}
              <button className="button secondary" type="button" onClick={() => onRemove(node)}>
                Удалить
              </button>
            </div>
          </article>
          {node.children.length > 0 ? (
            <TreeView
              nodes={node.children}
              activeId={activeId}
              onSelect={onSelect}
              onPublishToggle={onPublishToggle}
              onRemove={onRemove}
              onAddChild={onAddChild}
              level={level + 1}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
