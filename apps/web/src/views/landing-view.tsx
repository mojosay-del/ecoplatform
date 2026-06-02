import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { Unbounded } from "next/font/google";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Boxes,
  Clock,
  GraduationCap,
  Layers,
  Newspaper,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import "../styles/landing.css";
import { LandingClient } from "../components/LandingClient";

// Display-шрифт только для заголовков лендинга (с кириллицей). Подключаем здесь,
// чтобы он не грузился на остальных страницах кабинета.
const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-display",
});

const LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/terms", label: "Соглашение" },
  { href: "/legal/personal-data", label: "152-ФЗ" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/offer", label: "Оферта" },
] as const;

const MARQUEE = ["Индексы цен", "Обучение", "База знаний", "Новости отрасли", "Аналитика", "Инструменты", "Сообщество"];

const FEATURES = [
  {
    icon: TrendingUp,
    t: "Индексы цен",
    d: "Ежедневные котировки по ключевым видам вторсырья. Динамика, тренды и история — чтобы видеть рынок целиком.",
  },
  {
    icon: GraduationCap,
    t: "Обучение",
    d: "Курсы и модули, которые превращают новичка в специалиста отрасли. От основ сортировки до экономики переработки.",
  },
  {
    icon: BookOpen,
    t: "База знаний",
    d: "Сначала — по каждому виду сырья: характеристики, требования, обработка. Затем — нормативы, 152-ФЗ и вся документация.",
  },
  {
    icon: Newspaper,
    t: "Новости",
    d: "Только отраслевое и только важное. Лента, очищенная от шума, чтобы вы первыми узнавали о переменах.",
  },
];

// Две самостоятельные карточки индексов для блока «Цены живут здесь».
type IndexCard = {
  name: string;
  code: string;
  price: string;
  unit: string;
  change: string;
  up: boolean;
  series: number[];
};
const INDEX_CARDS: IndexCard[] = [
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

const NEWS_TILES = [
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

const EDU_CARDS = [
  { title: "Юридический", lessons: 9, progress: 45, photo: "/brand/landing/edu-legal.webp" },
  { title: "Закупки", lessons: 11, progress: 70, photo: "/brand/landing/edu-zakupka.webp" },
  { title: "Экономика", lessons: 7, progress: 30, photo: "/brand/landing/edu-economics.webp" },
];

const KB_NAV = [
  { label: "Макулатура", head: true },
  { label: "Картон", active: true },
  { label: "Архив" },
  { label: "Газета" },
  { label: "Бумага" },
  { label: "Втулка" },
  { label: "Лоток" },
  { label: "+ ещё 14 материалов", muted: true },
];
const KB_CHILDREN = ["Гофрокартон", "Короба", "Обрезь"];

const WHY = [
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

const METRICS: {
  count: number;
  suffix: string;
  unit?: string;
  l: string;
}[] = [
  { count: 20, suffix: "+", l: "позиций в индексе цен" },
  { count: 10, suffix: "+", l: "обучающих модулей" },
  { count: 50, suffix: "+", l: "разделов базы знаний" },
  { count: 5000, suffix: "", unit: "т/мес", l: "опыт работы с объёмами" },
];

// Строит path для мини-графика индекса (линия + площадь под ней).
function sparkline(values: number[], w = 128, h = 40) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 4 - ((v - min) / range) * (h - 8)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}

const reveal = (delay: number): CSSProperties => ({ "--reveal-delay": `${delay}ms` }) as CSSProperties;

export function LandingView() {
  return (
    <div className={`lp ${display.variable}`}>
      <LandingClient />

      {/* Живой фон — белый, минималистичный */}
      <div className="lp-bg" aria-hidden="true">
        <div className="lp-bg__bloom" />
      </div>

      {/* Прогресс-бар */}
      <div className="lp-progress" aria-hidden="true">
        <div className="lp-progress__bar" />
      </div>

      {/* Навбар — логотип + разделы + Войти */}
      <nav className="lp-nav" aria-label="Главная навигация">
        <Link className="lp-nav__brand" href="/" aria-label="ЭкоПлатформа">
          <Image className="lp-nav__logo" src="/brand/logo.webp" alt="ЭкоПлатформа" width={34} height={34} priority />
        </Link>
        <span className="lp-nav__links">
          <Link className="lp-nav__link" href="#subscription">
            Подписка
          </Link>
          <Link className="lp-nav__link" href="#company">
            Компания
          </Link>
          <Link className="lp-nav__link" href="#contacts">
            Контакты
          </Link>
          <Link className="lp-btn lp-btn--primary lp-btn--sm" href="/login">
            Войти
          </Link>
        </span>
      </nav>

      <main className="lp-main" id="main-content" tabIndex={-1}>
        {/* Hero — большой вордмарк + слоган */}
        <header className="lp-hero">
          <h1 className="lp-hero__brand" data-reveal>
            ЭкоПлатформа
          </h1>
          <p className="lp-hero__slogan" data-reveal style={reveal(120)}>
            Рынок вторсырья,
            <br />
            который наконец <em>понятен</em>.
          </p>
          <span className="lp-hero__scroll" data-reveal style={reveal(220)}>
            Листайте вниз
            <ArrowDown size={18} aria-hidden="true" />
          </span>
        </header>

        {/* 01 — Одно рабочее пространство (горизонтальная лента модулей) */}
        <section className="lp-horizontal" id="how">
          <div className="lp-horizontal__viewport">
            <div className="lp-horizontal__head">
              <span className="lp-chapter-label" data-reveal>
                01
              </span>
              <h2 className="lp-section__title" data-reveal>
                Одно рабочее пространство
              </h2>
            </div>
            <div className="lp-horizontal__track">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <article className="lp-feature" key={f.t}>
                    <span className="lp-feature__num">{String(i + 1).padStart(2, "0")}</span>
                    <span className="lp-feature__icon" aria-hidden="true">
                      <Icon size={26} />
                    </span>
                    <h3 className="lp-feature__t">{f.t}</h3>
                    <p className="lp-feature__d">{f.d}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Бегущая строка */}
        <div className="lp-marquee" aria-hidden="true">
          <div className="lp-marquee__track">
            {[0, 1].map((dup) => (
              <span className="lp-marquee__item" key={dup}>
                {MARQUEE.map((word) => (
                  <span key={word}>{word}</span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* 02 — Индексы цен: карточки слева, описание справа */}
        <section className="lp-section lp-shell">
          <div className="lp-show lp-show--rev">
            <div className="lp-show__text" data-reveal>
              <span className="lp-chapter-label">02 · Индексы цен</span>
              <h3 className="lp-show__t">Цены живут здесь</h3>
              <p className="lp-show__d">
                Ежедневные котировки по ключевым видам вторсырья: динамика, тренды и история. Вы видите справедливую{" "}
                <span style={{ whiteSpace: "nowrap" }}>цену — и торгуетесь</span> на данных, а не на слухах.
              </p>
            </div>
            <div className="lp-show__mock" data-reveal style={reveal(120)}>
              <div className="lp-tilt" data-tilt>
                <div className="lp-idx-duo">
                  {INDEX_CARDS.map((row) => {
                    const sp = sparkline(row.series);
                    return (
                      <article className="lp-idx lp-idx--solo" key={row.code}>
                        <div className="lp-idx__top">
                          <span className="lp-idx__code">{row.code}</span>
                          <span className={`lp-idx__chg${row.up ? "" : " is-down"}`}>{row.change}</span>
                        </div>
                        <div className="lp-idx__name">{row.name}</div>
                        <svg
                          className="lp-idx__chart"
                          viewBox="0 0 128 40"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path className={`lp-idx__area${row.up ? "" : " is-down"}`} d={sp.area} />
                          <path className={`lp-idx__line${row.up ? "" : " is-down"}`} d={sp.line} />
                        </svg>
                        <div className="lp-idx__price">
                          {row.price} <span>{row.unit}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 03 — Новости */}
        <section className="lp-section lp-shell">
          <div className="lp-show">
            <div className="lp-show__text" data-reveal>
              <span className="lp-chapter-label">03 · Новости</span>
              <h3 className="lp-show__t">Главное в отрасли — без шума</h3>
              <p className="lp-show__d">
                Лента с обложками, тегами и удобным чтением: регулирование, цены, технологии. Будьте в курсе перемен за
                минуты, а не за часы.
              </p>
            </div>
            <div className="lp-show__mock" data-reveal style={reveal(120)}>
              <div className="lp-tilt" data-tilt>
                <div className="lp-news">
                  {NEWS_TILES.map((tile) => (
                    <article className="lp-news-tile" key={tile.title}>
                      <div className="lp-news-tile__cover lp-cover">
                        <Image
                          src={tile.photo}
                          alt=""
                          fill
                          sizes="(max-width: 980px) 90vw, 18vw"
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                      <div className="lp-news-tile__body">
                        <span className="lp-news-tile__cat">Новости</span>
                        <h4 className="lp-news-tile__title">{tile.title}</h4>
                        <p className="lp-news-tile__lead">{tile.lead}</p>
                        <div className="lp-news-tile__meta">
                          <time className="lp-news-tile__date">{tile.date}</time>
                          <span className="lp-news-tile__tags">
                            {tile.tags.map((t) => (
                              <span className="lp-tag" key={t}>
                                {t}
                              </span>
                            ))}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 04 — Обучение */}
        <section className="lp-section lp-shell">
          <div className="lp-show lp-show--rev">
            <div className="lp-show__text" data-reveal>
              <span className="lp-chapter-label">04 · Обучение</span>
              <h3 className="lp-show__t">Учитесь сами и обучайте команду</h3>
              <p className="lp-show__d">
                Курсы с уроками и понятным прогрессом. От основ рынка до экономики переработки — новый человек входит в
                отрасль за недели.
              </p>
            </div>
            <div className="lp-show__mock" data-reveal style={reveal(120)}>
              <div className="lp-tilt" data-tilt>
                <div className="lp-edu">
                  {EDU_CARDS.map((c) => (
                    <article className="lp-edu-card" key={c.title}>
                      <div className="lp-edu-card__cover">
                        <div className="lp-edu-card__photo">
                          <Image
                            src={c.photo}
                            alt=""
                            fill
                            sizes="(max-width: 980px) 90vw, 18vw"
                            style={{ objectFit: "cover" }}
                          />
                        </div>
                        <div className="lp-edu-card__overlay">
                          <h4 className="lp-edu-card__title">{c.title}</h4>
                          <span className="lp-edu-card__lessons">Уроков: {c.lessons}</span>
                        </div>
                      </div>
                      <div className="lp-edu-card__foot">
                        <span className="lp-edu-card__progress">
                          <i style={{ width: `${c.progress}%` }} />
                        </span>
                        <span className="lp-edu-card__cta" aria-hidden="true">
                          Продолжить
                          <ArrowRight size={14} />
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 05 — База знаний */}
        <section className="lp-section lp-shell">
          <div className="lp-show">
            <div className="lp-show__text" data-reveal>
              <span className="lp-chapter-label">05 · База знаний</span>
              <h3 className="lp-show__t">Сначала сырьё, потом документы</h3>
              <p className="lp-show__d">
                По каждому виду вторсырья: характеристики, требования, обработка. А затем — нормативы, 152-ФЗ и вся
                документация. Навигация слева, материалы — справа.
              </p>
            </div>
            <div className="lp-show__mock" data-reveal style={reveal(120)}>
              <div className="lp-tilt" data-tilt>
                <div className="lp-kb">
                  <aside className="lp-kb__nav" aria-hidden="true">
                    <span className="lp-kb__kicker">База знаний</span>
                    {KB_NAV.map((n) => (
                      <span
                        className={[
                          "lp-kb__navitem",
                          n.active ? "is-active" : "",
                          n.head ? "is-head" : "",
                          n.muted ? "is-muted" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={n.label}
                      >
                        {n.label}
                      </span>
                    ))}
                  </aside>
                  <div className="lp-kb__content" aria-hidden="true">
                    <span className="lp-kb__crumbs">База знаний / Макулатура / Картон</span>
                    <h4 className="lp-kb__title">Картон</h4>
                    <div className="lp-kb__cover lp-cover">
                      <Image
                        src="/brand/landing/kb-karton.webp"
                        alt=""
                        fill
                        sizes="(max-width: 980px) 90vw, 30vw"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                    <p className="lp-kb__lead">Виды, требования к приёму, влажность и подготовка к переработке.</p>
                    <div className="lp-kb__grid">
                      {KB_CHILDREN.map((c) => (
                        <span className="lp-kb__child" key={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 06 — Почему ЭкоПлатформа? (bento, 6 карточек) */}
        <section className="lp-section lp-shell" id="why">
          <div className="lp-section__head">
            <span className="lp-chapter-label" data-reveal>
              06
            </span>
            <h2 className="lp-section__title" data-reveal>
              Почему ЭкоПлатформа?
            </h2>
          </div>
          <div className="lp-bento">
            {WHY.map((card, i) => {
              const Icon = card.icon;
              return (
                <article
                  className={`lp-bento-card ${
                    card.feature ? "lp-bento-card--feature" : i < 3 ? "lp-bento-card--half" : "lp-bento-card--third"
                  }`}
                  key={card.t}
                  data-reveal
                  style={reveal(i * 70)}
                >
                  {Icon ? (
                    <span className="lp-bento-card__icon" aria-hidden="true">
                      <Icon size={24} />
                    </span>
                  ) : null}
                  <h3 className="lp-bento-card__t">{card.t}</h3>
                  <p className="lp-bento-card__d">{card.d}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Метрики */}
        <section className="lp-section lp-shell">
          <div className="lp-metrics">
            {METRICS.map((m, i) => (
              <div className="lp-metric" key={m.l} data-reveal style={reveal(i * 80)}>
                <div className="lp-metric__v">
                  <span data-count={m.count} data-suffix={m.suffix}>
                    {`0${m.suffix}`}
                  </span>
                  {m.unit ? <sup className="lp-metric__unit">{m.unit}</sup> : null}
                </div>
                <div className="lp-metric__l">{m.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Climax CTA */}
        <section className="lp-section">
          <div className="lp-cta" data-reveal>
            <div className="lp-cta__inner">
              <h2 className="lp-cta__title">Рынок вторсырья, каким он должен быть: прозрачным, понятным и удобным</h2>
              <p className="lp-cta__sub">
                Присоединяйтесь к ЭкоПлатформе — и увидите отрасль такой, какой она может быть уже сегодня.
              </p>
              <Link className="lp-btn lp-btn--lg lp-cta__btn" href="/login">
                Войти в платформу
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Подвал */}
        <footer className="lp-footer lp-shell" id="contacts">
          <div className="lp-footer__brand">
            <Boxes size={18} aria-hidden="true" />
            ЭкоПлатформа
          </div>
          <nav className="lp-footer__links" aria-label="Правовая информация">
            {LEGAL_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="lp-footer__copy">© {new Date().getFullYear()} ЭкоПлатформа. Рынок вторсырья на данных.</div>
        </footer>
      </main>
    </div>
  );
}
