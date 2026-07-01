"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Columns3,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Plus,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from "lucide-react";
import { ATOMIC_BLOCK_ICONS, ATOMIC_BLOCK_LABELS, atomicDefaultPayload } from "../../lib/editor/atomic-block-metadata";
import { ATOMIC_BLOCK_NODE_NAME, type AtomicBlockKind } from "../../lib/editor/block-mapping";
import { setLinkPrompt } from "../../lib/editor/document-editor-commands";
import styles from "./document-editor.module.css";

const TEXT_COLORS = [
  { value: "#1a202e", label: "Чёрный" },
  { value: "#8a8f9b", label: "Серый" },
  { value: "#f5773e", label: "Оранжевый" },
  { value: "#5da45c", label: "Зелёный" },
  { value: "#4d73d8", label: "Синий" },
  { value: "#ef6b5b", label: "Красный" },
  { value: "#e9b949", label: "Жёлтый" },
];

const FONT_SIZES = [
  { value: "13px", label: "Мелкий" },
  { value: "16px", label: "Обычный" },
  { value: "18px", label: "Крупный" },
  { value: "22px", label: "Большой" },
];

export function DocumentEditorToolbar({
  editor,
  allowedAtomicKinds,
}: {
  editor: Editor;
  allowedAtomicKinds: AtomicBlockKind[];
}) {
  const activeFontSize = (editor.getAttributes("textStyle") as { fontSize?: string }).fontSize ?? "";
  const activeColor = (editor.getAttributes("textStyle") as { color?: string }).color ?? "#1a202e";

  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label="Форматирование">
      <div className="rich-text-toolbar-group">
        <InsertMenu editor={editor} allowedAtomicKinds={allowedAtomicKinds} />
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Жирный (Ctrl+B)"
          ariaLabel="Жирный"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Курсив (Ctrl+I)"
          ariaLabel="Курсив"
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Подчёркнутый (Ctrl+U)"
          ariaLabel="Подчёркнутый"
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <select
          className="rich-text-select"
          aria-label="Размер шрифта"
          value={activeFontSize}
          onChange={(event) => {
            const next = event.target.value;
            if (!next) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(next).run();
          }}
        >
          <option value="">Размер</option>
          {FONT_SIZES.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>

        <div className="rich-text-color-picker" role="group" aria-label="Цвет текста">
          {TEXT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className={`rich-text-color-swatch${activeColor.toLowerCase() === color.value.toLowerCase() ? " is-active" : ""}`}
              style={{ background: color.value }}
              onClick={() => {
                if (color.value === "#1a202e") editor.chain().focus().unsetColor().run();
                else editor.chain().focus().setColor(color.value).run();
              }}
              title={color.label}
              aria-label={`Цвет: ${color.label}`}
            />
          ))}
        </div>
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Заголовок"
          ariaLabel="Заголовок"
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Подзаголовок"
          ariaLabel="Подзаголовок"
        >
          <Heading3 size={16} />
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Маркированный список"
          ariaLabel="Маркированный список"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Нумерованный список"
          ariaLabel="Нумерованный список"
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Цитата"
          ariaLabel="Цитата"
        >
          <Quote size={16} />
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("table")}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Вставить таблицу"
          ariaLabel="Вставить таблицу"
        >
          <TableIcon size={16} />
        </ToolbarButton>
        {editor.isActive("table") ? (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="Добавить строку ниже"
              ariaLabel="Добавить строку ниже"
            >
              <BetweenHorizontalEnd size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title="Добавить столбец справа"
              ariaLabel="Добавить столбец справа"
            >
              <BetweenVerticalEnd size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteRow().run()}
              title="Удалить строку"
              ariaLabel="Удалить строку"
            >
              <Rows3 size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteColumn().run()}
              title="Удалить столбец"
              ariaLabel="Удалить столбец"
            >
              <Columns3 size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="Удалить таблицу"
              ariaLabel="Удалить таблицу"
            >
              <Trash2 size={16} />
            </ToolbarButton>
          </>
        ) : null}
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("link")}
          onClick={() => setLinkPrompt(editor, window.prompt)}
          title="Ссылка"
          ariaLabel="Ссылка"
        >
          <LinkIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Убрать ссылку"
          ariaLabel="Убрать ссылку"
        >
          <Unlink size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
          title="Очистить форматирование"
          ariaLabel="Очистить форматирование"
        >
          <RemoveFormatting size={16} />
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
          title="Отменить (Ctrl+Z)"
          ariaLabel="Отменить"
        >
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          title="Повторить (Ctrl+Shift+Z)"
          ariaLabel="Повторить"
        >
          <Redo2 size={16} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function InsertMenu({ editor, allowedAtomicKinds }: { editor: Editor; allowedAtomicKinds: AtomicBlockKind[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function insert(kind: AtomicBlockKind) {
    setOpen(false);
    editor
      .chain()
      .focus()
      .insertContent({ type: ATOMIC_BLOCK_NODE_NAME[kind], attrs: { payload: atomicDefaultPayload(kind) } })
      .run();
  }

  return (
    <div className={styles.insert} ref={ref}>
      <button
        type="button"
        className={`rich-text-button${open ? " is-active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Вставить блок"
        aria-label="Вставить блок"
      >
        <Plus size={16} />
      </button>
      {open ? (
        <div className={styles.insertMenu} role="menu">
          {allowedAtomicKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className={styles.insertMenuItem}
              onClick={() => insert(kind)}
            >
              <span className={styles.insertMenuIcon}>{ATOMIC_BLOCK_ICONS[kind]}</span>
              {ATOMIC_BLOCK_LABELS[kind]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
  ariaLabel,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`rich-text-button${active ? " is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active ? true : undefined}
    >
      {children}
    </button>
  );
}
