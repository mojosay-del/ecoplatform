import { Extension, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";

// Величина абзацного отступа («красная строка»). Держим единственное значение
// и согласуем его с whitelist санитайзера (packages/shared/sanitize-html.ts:
// ALLOWED_TEXT_INDENTS), иначе отступ вырежется при сохранении/рендере.
export const PARAGRAPH_INDENT = "1.5em";

// Глобальный атрибут `indent` на абзацах: «красная строка» через style="text-indent".
// Сериализация (renderHTML) и парсинг (parseHTML) общие для редактора и
// serializer.ts, поэтому отступ переживает round-trip и публикацию.
const ParagraphIndent = Extension.create({
  name: "paragraphIndent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          indent: {
            default: false,
            parseHTML: (element) => ((element as HTMLElement).style?.textIndent ? true : false),
            renderHTML: (attributes) => (attributes.indent ? { style: `text-indent: ${PARAGRAPH_INDENT}` } : {}),
          },
        },
      },
    ];
  },
});

// Расширения «текстовой» части документа. Используются в ОДНОМ экземпляре и
// сериализатором (generateJSON/generateHTML), и самим редактором — чтобы
// парсинг и сериализация HTML были идентичны.
//
// Набор тегов держим строго внутри whitelist санитайзера абзацев
// (packages/shared/src/sanitize-html.ts): strong/em/u/s/code/a/h2/h3/
// ul/ol/li/blockquote/span[style]. Поэтому отключаем codeBlock (<pre>) и
// horizontalRule (<hr>) — их теги санитайзер сейчас вырезает; добавим их
// позже вместе с расширением whitelist, чтобы не терять контент при показе.
export type RichTextOptions = {
  headingLevels?: (1 | 2 | 3 | 4 | 5 | 6)[];
  placeholder?: string;
};

export function createRichTextExtensions(options: RichTextOptions = {}): Extensions {
  return [
    // Link уже входит в StarterKit v3 — настраиваем его здесь, отдельный
    // импорт расширения дал бы дубликат (предупреждение TipTap).
    StarterKit.configure({
      heading: { levels: options.headingLevels ?? [2, 3] },
      codeBlock: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TextStyle,
    FontSize,
    Color.configure({ types: [TextStyle.name] }),
    ParagraphIndent,
  ];
}

// Базовый набор для сериализатора (h2/h3 как top-level заголовки).
export const richTextExtensions = createRichTextExtensions();
