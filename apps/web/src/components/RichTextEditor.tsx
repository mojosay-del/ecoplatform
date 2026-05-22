"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Unlink,
  RemoveFormatting,
  Undo2,
  Redo2,
} from "lucide-react";

// Палитра цветов текста — взята из глобальных токенов проекта.
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

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontSize,
      Color.configure({ types: [TextStyle.name] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Начните вводить текст…" }),
    ],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rich-text-content",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // Пустой редактор отдаёт "<p></p>" — превращаем в пустую строку, чтобы
      // не сохранять блок без содержимого (zod валидация требует min(1)).
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Внешние обновления value (например при выборе другого урока) — синхронизируем.
  const lastSetValueRef = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value === lastSetValueRef.current) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
      lastSetValueRef.current = value;
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="rich-text-editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="rich-text-surface" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const activeFontSize = (editor.getAttributes("textStyle") as { fontSize?: string }).fontSize ?? "";
  const activeColor = (editor.getAttributes("textStyle") as { color?: string }).color ?? "#1a202e";

  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label="Форматирование">
      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Жирный (Ctrl+B)"
          aria-label="Жирный"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Курсив (Ctrl+I)"
          aria-label="Курсив"
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Подчёркнутый (Ctrl+U)"
          aria-label="Подчёркнутый"
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
            if (!next) {
              editor.chain().focus().unsetFontSize().run();
            } else {
              editor.chain().focus().setFontSize(next).run();
            }
          }}
        >
          <option value="">Размер</option>
          {FONT_SIZES.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>

        <ColorPicker
          value={activeColor}
          onChange={(color) => {
            if (color === "#1a202e") {
              editor.chain().focus().unsetColor().run();
            } else {
              editor.chain().focus().setColor(color).run();
            }
          }}
        />
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Заголовок 2"
          aria-label="Заголовок 2"
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Заголовок 3"
          aria-label="Заголовок 3"
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
          aria-label="Маркированный список"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Нумерованный список"
          aria-label="Нумерованный список"
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Цитата"
          aria-label="Цитата"
        >
          <Quote size={16} />
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-divider" aria-hidden />

      <div className="rich-text-toolbar-group">
        <ToolbarButton
          active={editor.isActive("link")}
          onClick={() => {
            const previous = (editor.getAttributes("link") as { href?: string }).href ?? "";
            const url = window.prompt("URL ссылки", previous);
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
          title="Ссылка"
          aria-label="Ссылка"
        >
          <LinkIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Убрать ссылку"
          aria-label="Убрать ссылку"
        >
          <Unlink size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title="Очистить форматирование"
          aria-label="Очистить форматирование"
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
          aria-label="Отменить"
        >
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          title="Повторить (Ctrl+Shift+Z)"
          aria-label="Повторить"
        >
          <Redo2 size={16} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
  "aria-label": ariaLabel,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  "aria-label"?: string;
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

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="rich-text-color-picker" role="group" aria-label="Цвет текста">
      {TEXT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          className={`rich-text-color-swatch${value.toLowerCase() === color.value.toLowerCase() ? " is-active" : ""}`}
          style={{ background: color.value }}
          onClick={() => onChange(color.value)}
          title={color.label}
          aria-label={`Цвет: ${color.label}`}
        />
      ))}
    </div>
  );
}
