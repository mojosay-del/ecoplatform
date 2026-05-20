export const demoNews = [
  {
    id: "demo-news-1",
    title: "Завод приостанавливает работу на майские праздники",
    lead: "Компания предупредила поставщиков о временной остановке приёмки сырья.",
    firstPublishedAt: new Date().toISOString(),
    _count: { likes: 315, comments: 6 },
  },
  {
    id: "demo-news-2",
    title: "Переработчики пересматривают требования к влажности",
    lead: "На рынке усиливается контроль качества партий макулатуры и плёнки.",
    firstPublishedAt: new Date().toISOString(),
    _count: { likes: 84, comments: 3 },
  },
];

export const demoIndices = [
  {
    id: "cat-paper",
    name: "Макулатура",
    slug: "makulatura",
    nomenclatures: [
      {
        id: "gofro",
        name: "Гофрокартон",
        code: "МКР-КРТ-001",
        unit: "₽/т",
        summary: { currentPrice: 14250, weeklyChange: 1.8, trend: "growth" },
        chart: {
          "3M": [
            { date: "2026-03-01", price: 12600 },
            { date: "2026-04-01", price: 13300 },
            { date: "2026-05-01", price: 14250 },
          ],
        },
      },
      {
        id: "archive",
        name: "Архив",
        code: "МКР-АРХ-005",
        unit: "₽/т",
        summary: { currentPrice: 11900, weeklyChange: -2.1, trend: "fall" },
        chart: {
          "3M": [
            { date: "2026-03-01", price: 12400 },
            { date: "2026-04-01", price: 12200 },
            { date: "2026-05-01", price: 11900 },
          ],
        },
      },
    ],
  },
];

export const demoModules = [
  {
    id: "zakupka",
    title: "Закупка сырья",
    summary: "Базовые правила закупки вторсырья без типичных ошибок новичков.",
    hasAccess: true,
    chapters: [{ lessons: [{ id: "lesson-1", title: "Что проверить до покупки" }] }],
  },
  {
    id: "sklad",
    title: "Склад",
    summary: "Как организовать склад, сортировку и хранение сырья.",
    hasAccess: true,
    chapters: [{ lessons: [{ id: "lesson-2", title: "Зоны хранения" }] }],
  },
];

export const demoKnowledge = [
  {
    id: "kb-gofro",
    title: "Гофрокартон",
    slug: "gofrokarton",
    subtitle: "Гофрированный картон, коробки, ящики",
    children: [],
    blocks: [
      { type: "heading", payload: { text: "ГОСТы" } },
      { type: "paragraph", payload: { markdown: "Ориентируйтесь на требования конкретного завода и внутренний регламент приёмки." } },
      { type: "checklist", payload: { title: "Принимается", style: "positive", items: ["Сухой чистый картон", "Без плёнки", "Прессованные кипы"] } },
      { type: "checklist", payload: { title: "Риски", style: "warning", items: ["Повышенная влажность", "Снижение стоимости за засор"] } },
    ],
  },
];
