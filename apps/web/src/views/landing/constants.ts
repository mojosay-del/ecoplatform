import { Clock, Layers, Sparkles, TrendingUp, Users } from "lucide-react";
import type {
  DocumentationTile,
  EducationCard,
  ForumExpert,
  ForumProfile,
  ForumTile,
  IndexCard,
  KnowledgeNavItem,
  Metric,
  NewsTile,
  WhyCard,
} from "./types";

export const LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/terms", label: "Соглашение" },
  { href: "/legal/personal-data", label: "152-ФЗ" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/offer", label: "Оферта" },
] as const;

export const MARQUEE = [
  "Индексы цен",
  "Новости отрасли",
  "Обучение",
  "База знаний по сырью",
  "Документация",
  "Форум",
  "Аналитика",
  "Инструменты",
  "Сообщество",
];

export const INDEX_CARDS: IndexCard[] = [
  {
    name: "Картон МС-5Б",
    code: "МС-5Б",
    price: "14 200",
    unit: "₽/т",
    change: "+2,4%",
    up: true,
    series: [11, 12, 11.5, 13, 12.6, 13.4, 14, 14.2],
  },
  {
    name: "Стретч вторичный",
    code: "LLDPE",
    price: "41 200",
    unit: "₽/т",
    change: "+0,8%",
    up: true,
    series: [40, 40.4, 40.2, 40.8, 40.6, 41, 41.1, 41.2],
  },
];

export const NEWS_TILES: NewsTile[] = [
  {
    title: "Картон дорожает: спрос на макулатуру растёт",
    lead: "Закупочные цены на МС-5Б обновили максимум.",
    date: "2 июня",
    tags: ["Макулатура"],
    photo: "/brand/landing/news-karton.webp",
  },
  {
    title: "В регионе запущен новый завод по переработке",
    lead: "Мощности рынка заметно выросли.",
    date: "30 мая",
    tags: ["Переработка"],
    photo: "/brand/landing/news-zavod.webp",
  },
  {
    title: "Рекордный сбор за I квартал 2026 года",
    lead: "Раздельный сбор — исторический максимум.",
    date: "27 мая",
    tags: ["Аналитика"],
    photo: "/brand/landing/news-record.webp",
  },
];

export const EDU_CARDS: EducationCard[] = [
  { title: "Юридический", lessons: 9, progress: 45, photo: "/brand/landing/edu-legal.webp" },
  { title: "Закупки", lessons: 11, progress: 70, photo: "/brand/landing/edu-zakupka.webp" },
  { title: "Экономика", lessons: 7, progress: 30, photo: "/brand/landing/edu-economics.webp" },
];

export const KB_NAV: KnowledgeNavItem[] = [
  { label: "Макулатура", head: true },
  { label: "Картон", active: true },
  { label: "Архив" },
  { label: "Газета" },
  { label: "Бумага" },
  { label: "Втулка" },
  { label: "Лоток" },
  { label: "+ ещё 14 материалов", muted: true },
];

export const KB_CHILDREN = ["Гофрокартон", "Короба", "Обрезь"];

export const DOC_TILES: DocumentationTile[] = [
  {
    title: "Договор поставки вторсырья",
    subtitle: "Базовый шаблон с реквизитами и спецификацией.",
    format: "DOCX",
    meta: "48 КБ",
    status: "updated",
  },
  {
    title: "Акт приёма-передачи отходов",
    subtitle: "Таблица с автоподсчётом массы по фракциям.",
    format: "XLSX",
    meta: "76 КБ",
    status: "updated",
  },
  {
    title: "Регламент качества сырья",
    subtitle: "Короткая памятка для отдела закупок и склада.",
    format: "PDF",
    meta: "1,2 МБ",
    status: "new",
  },
];

export const FORUM_TILES: ForumTile[] = [
  {
    title: "Как принять влажный картон без спора по весу?",
    excerpt: "Лучший ответ: фиксируйте влажность в акте и заранее согласуйте поправку к партии.",
    status: "solved",
    rawMaterial: "Картон",
    questionType: "Документы",
    answers: 8,
    views: 146,
  },
  {
    title: "Какой пресс подходит для небольшого склада?",
    excerpt: "Сравниваем вертикальный и горизонтальный пресс под объём до 60 тонн в месяц.",
    status: "open",
    rawMaterial: "Макулатура",
    questionType: "Оборудование",
    answers: 3,
    views: 92,
  },
  {
    title: "Что проверить перед первой поставкой переработчику?",
    excerpt: "Участники собрали чек-лист: договор, фото партии, график вывоза и условия приёмки.",
    status: "solved",
    rawMaterial: "Сделки",
    questionType: "Практика",
    answers: 12,
    views: 218,
  },
];

export const FORUM_PROFILE: ForumProfile = {
  name: "Иван Ф.",
  role: "Заготовитель",
  answers: 14,
  solved: 5,
};

export const FORUM_EXPERTS: ForumExpert[] = [
  { name: "Анна К.", role: "Переработчик", solved: 6 },
  { name: "Илья М.", role: "Заготовитель", solved: 4 },
  { name: "Мария С.", role: "ЭкоПлатформа", solved: 3 },
];

export const WHY: WhyCard[] = [
  {
    t: "Всё в одном месте",
    d: "Цены, обучение, нормативы и новости не нужно собирать по частям — одно рабочее пространство вместо десятка вкладок.",
    feature: true,
  },
  {
    icon: TrendingUp,
    t: "Данные вместо слухов",
    d: "Единый индекс цен — торгуйтесь с открытыми глазами.",
  },
  {
    icon: Clock,
    t: "Цены обновляются ежедневно",
    d: "Свежие котировки каждый рабочий день, а не раз в квартал.",
  },
  {
    icon: Layers,
    t: "Знания по сырью и документам",
    d: "От характеристик каждого вида вторсырья до нормативов и практик.",
  },
  {
    icon: Users,
    t: "Сообщество отрасли",
    d: "Заготовители, переработчики и эксперты в одном пространстве.",
  },
  {
    icon: Sparkles,
    t: "Просто начать",
    d: "Регистрация за минуту — и вы внутри.",
  },
];

export const METRICS: Metric[] = [
  { count: 20, suffix: "+", l: "позиций в индексе цен" },
  { count: 10, suffix: "+", l: "обучающих модулей" },
  { count: 50, suffix: "+", l: "разделов базы знаний" },
  { count: 5000, suffix: "", unit: "т/мес", l: "опыт работы с объёмами" },
];
