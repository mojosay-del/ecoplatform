"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Heading2, Heading3, List, ListOrdered, Quote, Type } from "lucide-react";
import { ATOMIC_BLOCK_NODE_NAME, type AtomicBlockKind } from "../../lib/editor/block-mapping";
import { ATOMIC_BLOCK_ICONS, ATOMIC_BLOCK_LABELS, atomicDefaultPayload } from "./atomic-nodes";

export type SlashItem = {
  title: string;
  keywords: string[];
  icon: React.ReactNode;
  run: (editor: Editor, range: Range) => void;
};

// Базовые текстовые команды доступны всегда.
const TEXT_ITEMS: SlashItem[] = [
  {
    title: "Текст",
    keywords: ["текст", "абзац", "paragraph", "text"],
    icon: <Type size={16} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Заголовок",
    keywords: ["заголовок", "h2", "heading", "title"],
    icon: <Heading2 size={16} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Подзаголовок",
    keywords: ["подзаголовок", "h3", "subheading"],
    icon: <Heading3 size={16} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Маркированный список",
    keywords: ["список", "маркированный", "bullet", "ul"],
    icon: <List size={16} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Нумерованный список",
    keywords: ["список", "нумерованный", "ordered", "ol", "число"],
    icon: <ListOrdered size={16} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Цитата",
    keywords: ["цитата", "quote", "blockquote"],
    icon: <Quote size={16} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
];

function atomicItem(kind: AtomicBlockKind): SlashItem {
  return {
    title: ATOMIC_BLOCK_LABELS[kind],
    keywords: [ATOMIC_BLOCK_LABELS[kind].toLowerCase(), kind],
    icon: ATOMIC_BLOCK_ICONS[kind],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: ATOMIC_BLOCK_NODE_NAME[kind], attrs: { payload: atomicDefaultPayload(kind) } })
        .run(),
  };
}

function buildItems(allowedAtomicKinds: AtomicBlockKind[]): SlashItem[] {
  return [...TEXT_ITEMS, ...allowedAtomicKinds.map(atomicItem)];
}

function filterItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.title.toLowerCase().includes(q) || item.keywords.some((keyword) => keyword.includes(q)),
  );
}

// --- Всплывающее меню (React) ----------------------------------------------

type SlashMenuProps = { items: SlashItem[]; command: (item: SlashItem) => void };
type SlashMenuHandle = { onKeyDown: (props: { event: KeyboardEvent }) => boolean };

const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu({ items, command }, ref) {
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  selectedRef.current = selected;

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          setSelected((value) => (value + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((value) => (value + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selectedRef.current];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }),
    [items, command],
  );

  if (items.length === 0) {
    return (
      <div className="slash-menu">
        <div className="slash-empty">Ничего не найдено</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" role="listbox">
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={index === selected}
          className={`slash-item${index === selected ? " is-active" : ""}`}
          onMouseEnter={() => setSelected(index)}
          onClick={() => command(item)}
        >
          <span className="slash-item-icon">{item.icon}</span>
          <span className="slash-item-title">{item.title}</span>
        </button>
      ))}
    </div>
  );
});

function positionMenu(element: HTMLElement, clientRect: () => DOMRect | null) {
  const rect = clientRect();
  if (!rect) return;
  const virtual = { getBoundingClientRect: () => rect };
  void computePosition(virtual, element, {
    placement: "bottom-start",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    Object.assign(element.style, { left: `${x}px`, top: `${y}px` });
  });
}

// --- Расширение --------------------------------------------------------------

const slashPluginKey = new PluginKey("slashCommand");

export function createSlashCommand(allowedAtomicKinds: AtomicBlockKind[]) {
  const items = buildItems(allowedAtomicKinds);

  const suggestion: Omit<SuggestionOptions<SlashItem>, "editor"> = {
    char: "/",
    pluginKey: slashPluginKey,
    // «/» срабатывает в любом месте строки (а не только после пробела).
    allowedPrefixes: null,
    items: ({ query }) => filterItems(items, query),
    command: ({ editor, range, props }) => props.run(editor, range),
    render: () => {
      let component: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(SlashMenu, {
            props: { items: props.items, command: (item: SlashItem) => props.command(item) },
            editor: props.editor,
          });
          const element = component.element as HTMLElement;
          element.classList.add("slash-popup");
          document.body.appendChild(element);
          positionMenu(element, props.clientRect ?? (() => null));
        },
        onUpdate: (props) => {
          component?.updateProps({ items: props.items, command: (item: SlashItem) => props.command(item) });
          if (component) positionMenu(component.element as HTMLElement, props.clientRect ?? (() => null));
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") return false;
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          component?.element.remove();
          component?.destroy();
          component = null;
        },
      };
    },
  };

  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [Suggestion<SlashItem>({ editor: this.editor, ...suggestion })];
    },
  });
}
