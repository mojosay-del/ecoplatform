import { describe, expect, it } from "vitest";
import { blocksToDoc, docToBlocks, type EditorBlock } from "./serializer";

// helper: блоки → документ → блоки
function roundTrip(blocks: EditorBlock[]): EditorBlock[] {
  return docToBlocks(blocksToDoc(blocks));
}

describe("сериализатор: атомарные блоки сохраняют payload без потерь", () => {
  const atomicCases: EditorBlock[] = [
    { type: "image", payload: { fileId: "f1", caption: "Подпись", altText: "alt" } },
    {
      type: "gallery",
      payload: {
        images: [
          { fileId: "a", caption: "1", altText: "x" },
          { fileId: "b", caption: "2", altText: "y" },
        ],
      },
    },
    { type: "video", payload: { fileId: "v1", caption: "Видео" } },
    { type: "audio", payload: { fileId: "au1", episodeTitle: "Эпизод", caption: "c" } },
    { type: "file", payload: { fileId: "doc1", displayName: "Регламент.pdf", description: "опис" } },
    { type: "checklist", payload: { title: "Чек", style: "positive", items: ["раз", "два"] } },
    {
      type: "image_checklist",
      payload: { title: "Чек", style: "warning", image: { fileId: "i1", caption: "c", altText: "a" }, items: ["раз"] },
    },
    { type: "lesson_tasks", payload: { tasks: [{ title: "Задача", description: "подсказка" }] } },
    {
      type: "quiz",
      payload: {
        question: "Какой контейнер для бумаги?",
        multiple: false,
        options: [
          { text: "Синий", correct: true },
          { text: "Зелёный", correct: false },
        ],
        explanation: "Синий — для бумаги.",
      },
    },
    {
      type: "matching",
      payload: {
        instruction: "Соедините",
        pairs: [
          { left: "Бумага", right: "Синий" },
          { left: "Стекло", right: "Зелёный" },
        ],
      },
    },
  ];

  for (const block of atomicCases) {
    it(`round-trip блока «${block.type}»`, () => {
      expect(roundTrip([block])).toEqual([block]);
    });
  }
});

describe("сериализатор: заголовки", () => {
  it("heading → h2, subheading → h3 и обратно", () => {
    const blocks: EditorBlock[] = [
      { type: "heading", payload: { text: "Главный заголовок" } },
      { type: "subheading", payload: { text: "Подзаголовок" } },
    ];
    const doc = blocksToDoc(blocks);
    expect(doc.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(doc.content?.[1]).toMatchObject({ type: "heading", attrs: { level: 3 } });
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("пустой заголовок отбрасывается", () => {
    expect(roundTrip([{ type: "heading", payload: { text: "   " } }])).toEqual([]);
  });
});

describe("сериализатор: абзацы и форматирование", () => {
  it("сохраняет жирный/курсив/ссылку", () => {
    const blocks: EditorBlock[] = [
      { type: "paragraph", payload: { html: "<p>Привет <strong>мир</strong> и <em>курсив</em></p>" } },
    ];
    const [block] = roundTrip(blocks);
    expect(block?.type).toBe("paragraph");
    const html = String(block?.payload.html);
    expect(html).toContain("<strong>мир</strong>");
    expect(html).toContain("<em>курсив</em>");
  });

  it("сохраняет подчёркивание, зачёркивание и список", () => {
    const blocks: EditorBlock[] = [
      { type: "paragraph", payload: { html: "<p><u>подчёркнуто</u> <s>зачёркнуто</s></p>" } },
      { type: "paragraph", payload: { html: "<ul><li>пункт</li></ul>" } },
    ];
    const result = roundTrip(blocks);
    const allHtml = result.map((b) => String(b.payload.html)).join("");
    expect(allHtml).toContain("<u>подчёркнуто</u>");
    expect(allHtml).toContain("<s>зачёркнуто</s>");
    // TipTap оборачивает содержимое пункта в <p> — санитайзер это пропускает.
    expect(allHtml).toContain("<ul>");
    expect(allHtml).toContain("пункт");
  });

  it("сохраняет цвет и размер шрифта (whitelist санитайзера)", () => {
    const blocks: EditorBlock[] = [
      { type: "paragraph", payload: { html: '<p><span style="color: #f5773e; font-size: 18px">текст</span></p>' } },
    ];
    const html = String(roundTrip(blocks)[0]?.payload.html);
    expect(html).toContain("color");
    expect(html).toContain("font-size");
  });

  it("соседние абзацы склеиваются в один блок (рендер не меняется)", () => {
    const blocks: EditorBlock[] = [
      { type: "paragraph", payload: { html: "<p>Первый</p>" } },
      { type: "paragraph", payload: { html: "<p>Второй</p>" } },
    ];
    const result = roundTrip(blocks);
    expect(result).toHaveLength(1);
    expect(String(result[0]?.payload.html)).toContain("Первый");
    expect(String(result[0]?.payload.html)).toContain("Второй");
  });

  it("пустой абзац отбрасывается", () => {
    expect(roundTrip([{ type: "paragraph", payload: { html: "<p></p>" } }])).toEqual([]);
    expect(roundTrip([{ type: "paragraph", payload: { html: "" } }])).toEqual([]);
  });
});

describe("сериализатор: смешанный документ", () => {
  const mixed: EditorBlock[] = [
    { type: "heading", payload: { text: "Урок 1" } },
    { type: "paragraph", payload: { html: "<p>Вступление с <strong>акцентом</strong>.</p>" } },
    { type: "image", payload: { fileId: "img1", caption: "Схема", altText: "схема" } },
    { type: "subheading", payload: { text: "Проверь себя" } },
    {
      type: "quiz",
      payload: {
        question: "Вопрос?",
        multiple: true,
        options: [
          { text: "A", correct: true },
          { text: "B", correct: true },
          { text: "C", correct: false },
        ],
      },
    },
  ];

  it("структура сохраняется и операция идемпотентна", () => {
    const once = roundTrip(mixed);
    const twice = roundTrip(once);
    expect(twice).toEqual(once);
    expect(once.map((b) => b.type)).toEqual(["heading", "paragraph", "image", "subheading", "quiz"]);
  });

  it("атомарный блок разрывает склейку абзацев", () => {
    const blocks: EditorBlock[] = [
      { type: "paragraph", payload: { html: "<p>До</p>" } },
      { type: "image", payload: { fileId: "x" } },
      { type: "paragraph", payload: { html: "<p>После</p>" } },
    ];
    const result = roundTrip(blocks);
    expect(result.map((b) => b.type)).toEqual(["paragraph", "image", "paragraph"]);
  });
});

describe("сериализатор: пустой документ", () => {
  it("пустой список блоков даёт документ с одним абзацем, но обратно — пусто", () => {
    const doc = blocksToDoc([]);
    expect(doc.content).toHaveLength(1);
    expect(docToBlocks(doc)).toEqual([]);
  });
});
