import Link from "next/link";
import { Unbounded } from "next/font/google";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  GraduationCap,
  Layers,
  Newspaper,
  ShieldCheck,
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

const MARQUEE = [
  "Индексы цен",
  "Обучение",
  "База знаний",
  "Новости отрасли",
  "Аналитика",
  "Котировки",
  "152-ФЗ",
];

const PROBLEMS = [
  {
    n: "01",
    t: "Цены живут в чужих головах",
    d: "Стоимость партии узнают по звонкам и слухам. Нет единой точки правды — каждый торгуется вслепую.",
  },
  {
    n: "02",
    t: "Знания разбросаны",
    d: "Нормативы, 152-ФЗ, практики переработки и обучение — в десятках разрозненных источников и личных переписок.",
  },
  {
    n: "03",
    t: "Важное тонет в шуме",
    d: "Отраслевые новости перемешаны с информационным мусором. Решения принимаются с опозданием.",
  },
];

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
    d: "Нормативы, требования 152-ФЗ, гайды и проверенные практики — структурировано и всегда под рукой.",
  },
  {
    icon: Newspaper,
    t: "Новости",
    d: "Только отраслевое и только важное. Лента, очищенная от шума, чтобы вы первыми узнавали о переменах.",
  },
];

const METRICS = [
  { count: 1200, suffix: "+", l: "позиций в индексе цен" },
  { count: 40, suffix: "+", l: "обучающих модулей" },
  { count: 15, suffix: "", l: "разделов базы знаний" },
  { count: 98, suffix: "%", l: "доверяют точности данных" },
];

const QUOTES = [
  {
    text: "«Раньше я обзванивал пятерых, чтобы понять справедливую цену. Теперь просто открываю индекс».",
    name: "Игорь Левченко",
    role: "Заготовитель вторсырья",
    initials: "ИЛ",
  },
  {
    text: "«Обучение помогло собрать команду с нуля за месяц. Люди приходят и сразу понимают рынок».",
    name: "Марина Соколова",
    role: "Операционный директор",
    initials: "МС",
  },
];

const PREVIEW = [
  { k: "ПЭТ прозрачный", v: "42 300 ₽/т", trend: "+3.4%", down: false, bars: [40, 55, 48, 70, 62, 88] },
  { k: "Картон МС-5Б", v: "11 800 ₽/т", trend: "−1.2%", down: true, bars: [70, 64, 72, 58, 60, 52] },
  { k: "Алюминий лом", v: "168 ₽/кг", trend: "+0.8%", down: false, bars: [50, 52, 60, 58, 66, 72] },
  { k: "Стеклобой", v: "4 950 ₽/т", trend: "+2.1%", down: false, bars: [44, 50, 46, 58, 64, 70] },
];

export function LandingView() {
  return (
    <div className={`lp ${display.variable}`}>
      <LandingClient />

      {/* Живой фон */}
      <div className="lp-bg" aria-hidden="true">
        <div className="lp-bg__mesh" />
        <div className="lp-orb lp-orb--1" />
        <div className="lp-orb lp-orb--2" />
        <div className="lp-orb lp-orb--3" />
        <div className="lp-bg__grain" />
      </div>

      {/* Прогресс-бар */}
      <div className="lp-progress" aria-hidden="true">
        <div className="lp-progress__bar" />
      </div>

      {/* Навбар */}
      <nav className="lp-nav" aria-label="Главная навигация">
        <span className="lp-nav__brand">
          <span className="lp-nav__spark" aria-hidden="true" />
          ЭкоПлатформа
        </span>
        <span className="lp-nav__links">
          <Link className="lp-nav__link" href="#how">
            Как это работает
          </Link>
          <Link className="lp-nav__link" href="#why">
            Возможности
          </Link>
          <Link className="lp-btn lp-btn--primary lp-btn--sm" href="/login">
            Войти
          </Link>
        </span>
      </nav>

      <main className="lp-main" id="main-content" tabIndex={-1}>
        {/* Hero */}
        <header className="lp-hero">
          <span className="lp-eyebrow" data-reveal>
            <span className="lp-eyebrow__dot" aria-hidden="true" />
            Платформа рынка вторсырья
          </span>
          <h1 className="lp-hero__title" data-reveal style={{ "--reveal-delay": "80ms" } as React.CSSProperties}>
            Рынок вторсырья, который наконец <em>понятен</em>
          </h1>
          <p className="lp-hero__sub" data-reveal style={{ "--reveal-delay": "160ms" } as React.CSSProperties}>
            Индексы цен, обучение, база знаний и отраслевые новости — в одном
            рабочем пространстве. Принимайте решения на данных, а не на слухах.
          </p>
          <div className="lp-hero__cta" data-reveal style={{ "--reveal-delay": "240ms" } as React.CSSProperties}>
            <Link className="lp-btn lp-btn--primary lp-btn--lg" href="/login">
              Войти в платформу
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="lp-btn lp-btn--ghost lp-btn--lg" href="#how">
              Как это работает
            </Link>
          </div>
          <span className="lp-hero__scroll" aria-hidden="true">
            Листайте вниз
            <ArrowDown size={18} />
          </span>

          {/* Превью продукта */}
          <div className="lp-hero__preview" data-parallax data-reveal>
            <div className="lp-hero__chrome" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="lp-preview-grid">
              {PREVIEW.map((tile) => (
                <div className="lp-preview-tile" key={tile.k}>
                  <div>
                    <div className="lp-preview-tile__k">{tile.k}</div>
                    <div className="lp-preview-tile__v">{tile.v}</div>
                  </div>
                  <div className="lp-spark" aria-hidden="true">
                    {tile.bars.map((h, i) => (
                      <i key={i} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div
                    className={`lp-preview-tile__trend${tile.down ? " is-down" : ""}`}
                  >
                    {tile.trend}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </header>

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

        {/* Глава 1 — Проблема */}
        <section className="lp-section lp-shell">
          <div className="lp-problem">
            <div className="lp-problem__sticky">
              <span className="lp-chapter-label" data-reveal>
                01 — Проблема
              </span>
              <h2 className="lp-section__title" data-reveal>
                Сегодня рынок вторсырья живёт на слухах
              </h2>
              <p className="lp-section__lead" data-reveal>
                Отрасль растёт, но работает вслепую. Нет общего языка цен, знаний
                и новостей — и каждый теряет на этом время и деньги.
              </p>
            </div>
            <div className="lp-problem__list">
              {PROBLEMS.map((p, i) => (
                <article
                  className="lp-problem-card"
                  key={p.n}
                  data-reveal
                  style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
                >
                  <span className="lp-problem-card__n">{p.n}</span>
                  <h3 className="lp-problem-card__t">{p.t}</h3>
                  <p className="lp-problem-card__d">{p.d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Глава 2 — Горизонтальная лента модулей */}
        <section className="lp-horizontal" id="how">
          <div className="lp-horizontal__viewport">
            <div className="lp-horizontal__head">
              <span className="lp-chapter-label" data-reveal>
                02 — Как это работает
              </span>
              <h2 className="lp-section__title" data-reveal>
                Четыре модуля. Одно рабочее пространство.
              </h2>
            </div>
            <div className="lp-horizontal__track">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <article className="lp-feature" key={f.t}>
                    <span className="lp-feature__num">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="lp-feature__icon" aria-hidden="true">
                      <Icon size={26} />
                    </span>
                    <h3 className="lp-feature__t">{f.t}</h3>
                    <p className="lp-feature__d">{f.d}</p>
                    <span className="lp-feature__more">
                      Подробнее
                      <ArrowRight size={16} aria-hidden="true" />
                    </span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Глава 3 — Почему это работает (bento) */}
        <section className="lp-section lp-shell" id="why">
          <div className="lp-section__head">
            <span className="lp-chapter-label" data-reveal>
              03 — Решение
            </span>
            <h2 className="lp-section__title" data-reveal>
              Почему на ЭкоПлатформе удобнее
            </h2>
          </div>
          <div className="lp-bento">
            <article className="lp-bento-card lp-bento-card--feature" data-reveal>
              <h3 className="lp-bento-card__t">Данные вместо слухов</h3>
              <p className="lp-bento-card__d">
                Единый индекс цен по видам вторсырья. Вы видите рынок целиком и
                торгуетесь с открытыми глазами.
              </p>
            </article>
            <article
              className="lp-bento-card lp-bento-card--std"
              data-reveal
              style={{ "--reveal-delay": "80ms" } as React.CSSProperties}
            >
              <span className="lp-bento-card__icon" aria-hidden="true">
                <Layers size={24} />
              </span>
              <h3 className="lp-bento-card__t">Всё в одном месте</h3>
              <p className="lp-bento-card__d">
                Цены, обучение и нормативы не нужно собирать по частям.
              </p>
            </article>
            <article
              className="lp-bento-card lp-bento-card--tall"
              data-reveal
              style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
            >
              <span className="lp-bento-card__icon" aria-hidden="true">
                <ShieldCheck size={24} />
              </span>
              <h3 className="lp-bento-card__t">Соответствие 152-ФЗ</h3>
              <p className="lp-bento-card__d">
                Требования закона о персональных данных учтены на уровне
                платформы — работайте спокойно.
              </p>
            </article>
            <article
              className="lp-bento-card lp-bento-card--wide"
              data-reveal
              style={{ "--reveal-delay": "60ms" } as React.CSSProperties}
            >
              <span className="lp-bento-card__icon" aria-hidden="true">
                <Users size={24} />
              </span>
              <h3 className="lp-bento-card__t">Растущее сообщество отрасли</h3>
              <p className="lp-bento-card__d">
                Заготовители, переработчики и эксперты в одном пространстве —
                рынок, который учится и крепнет вместе.
              </p>
            </article>
            <article
              className="lp-bento-card lp-bento-card--std"
              data-reveal
              style={{ "--reveal-delay": "140ms" } as React.CSSProperties}
            >
              <span className="lp-bento-card__icon" aria-hidden="true">
                <Sparkles size={24} />
              </span>
              <h3 className="lp-bento-card__t">Просто начать</h3>
              <p className="lp-bento-card__d">
                Регистрация за минуту — и вы внутри.
              </p>
            </article>
          </div>
        </section>

        {/* Метрики */}
        <section className="lp-shell">
          <div className="lp-metrics">
            {METRICS.map((m) => (
              <div className="lp-metric" key={m.l} data-reveal>
                <div
                  className="lp-metric__v"
                  data-count={m.count}
                  data-suffix={m.suffix}
                >
                  0{m.suffix}
                </div>
                <div className="lp-metric__l">{m.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Отзывы */}
        <section className="lp-section lp-shell">
          <div className="lp-section__head">
            <span className="lp-chapter-label" data-reveal>
              Отзывы
            </span>
            <h2 className="lp-section__title" data-reveal>
              Тем, кто уже работает на данных
            </h2>
          </div>
          <div className="lp-quotes">
            {QUOTES.map((q, i) => (
              <figure
                className="lp-quote"
                key={q.name}
                data-reveal
                style={{ "--reveal-delay": `${i * 100}ms` } as React.CSSProperties}
              >
                <blockquote className="lp-quote__text">{q.text}</blockquote>
                <figcaption className="lp-quote__by">
                  <span className="lp-quote__avatar" aria-hidden="true">
                    {q.initials}
                  </span>
                  <span>
                    <span className="lp-quote__name">{q.name}</span>
                    <br />
                    <span className="lp-quote__role">{q.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Climax CTA */}
        <section className="lp-section">
          <div className="lp-cta" data-reveal>
            <div className="lp-cta__inner">
              <h2 className="lp-cta__title">Готовы работать на данных?</h2>
              <p className="lp-cta__sub">
                Присоединяйтесь к ЭкоПлатформе — и увидите рынок вторсырья таким,
                каким он должен быть: прозрачным, понятным и удобным.
              </p>
              <Link className="lp-btn lp-btn--lg lp-cta__btn" href="/login">
                Войти в платформу
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Подвал */}
        <footer className="lp-footer lp-shell">
          <div className="lp-footer__brand">ЭкоПлатформа</div>
          <nav className="lp-footer__links" aria-label="Правовая информация">
            {LEGAL_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="lp-footer__copy">
            © {new Date().getFullYear()} ЭкоПлатформа. Рынок вторсырья на данных.
          </div>
        </footer>
      </main>
    </div>
  );
}
