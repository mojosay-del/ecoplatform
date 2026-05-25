"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, FileText, FolderOpen, Plus } from "lucide-react";
import { AppShell } from "./AppShell";
import { CmsTabs } from "./CmsTabs";
import { ALL_BLOCK_KINDS, Block, BlocksEditor } from "./BlocksEditor";
import { FileUploadField } from "./FileUploadField";
import { RowKebab, type ActionItem } from "./RowKebab";
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
  blocks: [{ type: "paragraph", payload: { html: "" } }],
};

export function AdminKnowledgeView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [items, setItems] = useState<Article[]>([]);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(items), [items]);

  // Авто-раскрытие предков выбранной статьи.
  useEffect(() => {
    if (!draft.id) return;
    const parents: string[] = [];
    let current = items.find((item) => item.id === draft.id);
    while (current?.parentId) {
      parents.push(current.parentId);
      current = items.find((item) => item.id === current!.parentId);
    }
    if (parents.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of parents) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [draft.id, items]);

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

  const original = useMemo(
    () => (draft.id ? items.find((item) => item.id === draft.id) ?? null : null),
    [draft.id, items],
  );

  const hasChanges = useMemo(() => {
    if (!draft.id) {
      return draft.title.trim().length > 0 || draft.blocks.length > 0;
    }
    if (!original) return false;
    if (draft.title !== original.title) return true;
    if (draft.subtitle !== (original.subtitle ?? "")) return true;
    if ((draft.coverImageId || "") !== (original.coverImageId ?? "")) return true;
    if ((draft.iconType || "") !== (original.iconType ?? "")) return true;
    if (draft.parentId !== original.parentId) return true;
    if (draft.position !== original.position) return true;
    if (
      JSON.stringify(draft.blocks) !==
      JSON.stringify(original.blocks.map((b) => ({ type: b.type, payload: b.payload })))
    ) {
      return true;
    }
    return false;
  }, [draft, original]);

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
    setDraft({ ...EMPTY_DRAFT, parentId, position: siblings.length });
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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
        coverImageId: draft.coverImageId.trim() || null,
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
        const orig = items.find((item) => item.id === draft.id);
        if (orig && (orig.parentId !== draft.parentId || orig.position !== draft.position)) {
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
    if (
      !confirm(
        `Удалить статью «${article.title}»? Если есть дочерние статьи — сначала переместите или удалите их.`,
      )
    )
      return;
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

  const isEditingNew = draft.id === null;

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS</h1>
          <p className="page-subtitle">Иерархическая структура статей — до 3 уровней.</p>
        </header>
        <CmsTabs />
        {message ? <p className="cms-flash">{message}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="education-tree">
            <div className="education-tree-header">
              <span className="education-tree-title">Все статьи</span>
              <button
                className="education-tree-add"
                type="button"
                onClick={() => startNew(null)}
                title="Новая статья"
                aria-label="Новая статья"
              >
                <Plus size={14} />
              </button>
            </div>
            {tree.length === 0 ? (
              <p className="education-tree-empty">Статей пока нет.</p>
            ) : null}
            <ul className="tree" role="tree">
              {tree.map((node) => (
                <KnowledgeNode
                  key={node.id}
                  node={node}
                  level={0}
                  draftId={draft.id}
                  expanded={expanded}
                  onToggle={toggleExpand}
                  onSelect={startEdit}
                  onPublishToggle={publishToggle}
                  onAddChild={(parentId) => startNew(parentId)}
                  onRemove={remove}
                />
              ))}
            </ul>
          </div>

          <div className="moderation-detail">
            <form className="form news-form" onSubmit={submit}>
              <div className="news-form-head">
                <span className="news-form-mode">
                  {isEditingNew ? "Новая статья" : "Редактирование"}
                </span>
              </div>

              {/* Секция 1 — основное содержимое статьи: то, что видит читатель. */}
              <fieldset className="form-fieldset">
                <legend className="form-legend">Основное</legend>
                <p className="form-legend-hint">
                  То, что увидит читатель в карточке статьи и на странице.
                </p>

                <FileUploadField
                  accept="image/*"
                  buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
                  imagePreset="cover"
                  label="Обложка статьи"
                  value={draft.coverImageId}
                  onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
                />

                <label className="form-field">
                  <span>Заголовок</span>
                  <input
                    className="news-form-title"
                    placeholder="Например: «Как сортировать стекло»"
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Подзаголовок</span>
                  <input
                    className="input"
                    placeholder="Короткое уточнение (необязательно)"
                    value={draft.subtitle}
                    onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                  />
                </label>
              </fieldset>

              {/* Секция 2 — куда положить статью в иерархии и как её показывать в каталоге. */}
              <fieldset className="form-fieldset">
                <legend className="form-legend">Размещение</legend>
                <p className="form-legend-hint">
                  Где статья будет жить в иерархии базы знаний и в каком порядке показываться.
                </p>

                <label className="form-field">
                  <span>Раздел</span>
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
                  <small className="form-field-hint">
                    «Верхний уровень» — статья появится в корне базы знаний.
                  </small>
                </label>

                <div className="form-grid-2">
                  <label className="form-field">
                    <span>Порядок в разделе</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={draft.position}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, position: Number(event.target.value) }))
                      }
                    />
                    <small className="form-field-hint">
                      Меньше — выше в списке. 0 — самая первая.
                    </small>
                  </label>
                  <label className="form-field">
                    <span>Тип материала</span>
                    <input
                      className="input"
                      list="knowledge-icon-types"
                      placeholder="Например: paper"
                      value={draft.iconType}
                      onChange={(event) => setDraft((prev) => ({ ...prev, iconType: event.target.value }))}
                    />
                    <datalist id="knowledge-icon-types">
                      <option value="paper" />
                      <option value="plastic" />
                      <option value="glass" />
                      <option value="metal" />
                      <option value="rubber" />
                      <option value="electronics" />
                      <option value="textile" />
                      <option value="organic" />
                    </datalist>
                    <small className="form-field-hint">
                      Подсказка для каталога. Можно оставить пустым.
                    </small>
                  </label>
                </div>
              </fieldset>

              {/* Секция 3 — само содержание (блоки). */}
              <fieldset className="form-fieldset">
                <legend className="form-legend">Содержание</legend>
                <p className="form-legend-hint">
                  Текст, изображения, видео — собирается из блоков.
                </p>
                <BlocksEditor
                  blocks={draft.blocks}
                  onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks }))}
                  allowedKinds={ALL_BLOCK_KINDS}
                />
              </fieldset>

              <div className="lesson-save-bar">
                <span className={`lesson-save-bar-status${hasChanges ? " has-changes" : ""}`}>
                  {submitting
                    ? "Сохраняю…"
                    : hasChanges
                      ? isEditingNew
                        ? "Новый черновик"
                        : "Есть несохранённые изменения"
                      : "Всё сохранено"}
                </span>
                <div className="lesson-save-bar-actions">
                  {!isEditingNew ? (
                    <button className="button secondary" type="button" onClick={() => startNew()}>
                      Отмена
                    </button>
                  ) : null}
                  {!isEditingNew && original ? (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => publishToggle(original)}
                    >
                      {original.status === "published" ? "Снять с публикации" : "Опубликовать"}
                    </button>
                  ) : null}
                  <button
                    className="button"
                    type="submit"
                    disabled={submitting || !hasChanges}
                  >
                    {submitting
                      ? "Сохраняю…"
                      : isEditingNew
                        ? "Создать черновик"
                        : "Сохранить"}
                  </button>
                </div>
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

function KnowledgeNode({
  node,
  level,
  draftId,
  expanded,
  onToggle,
  onSelect,
  onPublishToggle,
  onAddChild,
  onRemove,
}: {
  node: TreeNode;
  level: number;
  draftId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
  onAddChild: (parentId: string) => void;
  onRemove: (article: Article) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const Icon = level === 0 ? FolderOpen : level === 1 ? BookOpen : FileText;

  const actions: ActionItem[] = [
    {
      label: node.status === "published" ? "Снять с публикации" : "Опубликовать",
      onClick: () => onPublishToggle(node),
    },
  ];
  if (level < 2) {
    actions.push({
      label: "Добавить подстатью",
      onClick: () => {
        onAddChild(node.id);
        if (!isExpanded) onToggle(node.id);
      },
    });
  }
  actions.push({ label: "Удалить", onClick: () => onRemove(node), danger: true });

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div className={`tree-row depth-${level}${draftId === node.id ? " is-active" : ""}`}>
        <button
          type="button"
          className="tree-row-chevron"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.id);
          }}
          disabled={!hasChildren}
          aria-label={isExpanded ? "Свернуть" : "Развернуть"}
        >
          {hasChildren ? (
            <ChevronRight size={14} className={isExpanded ? "is-expanded" : ""} />
          ) : null}
        </button>
        <button type="button" className="tree-row-main" onClick={() => onSelect(node)}>
          <span className="tree-row-icon">
            <Icon size={16} />
          </span>
          <span
            className={`tree-row-dot${node.status === "published" ? " is-published" : ""}`}
            aria-hidden
          />
          <span className="tree-row-title">{node.title}</span>
          {node.subtitle ? <span className="tree-row-meta">{node.subtitle}</span> : null}
        </button>
        <RowKebab actions={actions} />
      </div>
      {hasChildren && isExpanded ? (
        <ul className="tree-children" role="group">
          {node.children.map((child) => (
            <KnowledgeNode
              key={child.id}
              node={child}
              level={level + 1}
              draftId={draftId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onPublishToggle={onPublishToggle}
              onAddChild={onAddChild}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
