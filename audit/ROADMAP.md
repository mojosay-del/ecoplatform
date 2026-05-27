# План реализации ЭкоПлатформы — волна за волной

Дата: 2026-05-25
Основа: `audit/IMPROVEMENT-PLAN.md` + поправки пользователя от 2026-05-25.
Принцип: **«сразу сделать как надо»** — не оставляем технический долг на потом, чтобы при росте до тысяч посетителей не пришлось переделывать.

## Философия плана

1. **Disabled-разделы в сайдбаре — остаются**. Они работают как тизер будущих фич, а не как «полупустое меню». В Волне 11 их визуально докрутим: badge «Скоро · Q3 2026», tooltip с описанием, лёгкая стилевая дифференциация.
2. **Инфраструктура сразу на 1000+ посетителей**. Redis, infinite scroll, distributed cron, CDN, Prisma connection-pool, gzip/brotli, structured logs, error tracking, метрики — закладываются в фундамент сразу.
3. **Юридический фундамент сразу**. Cookie-banner, consent-чекбоксы при регистрации, страницы политик с UI (текст можно докрутить позже), модель `ConsentRecord` с версионированием — всё с самого начала.
4. **Поля «на вырост»**. Если знаем, что для торговой площадки понадобится адрес — добавляем `Address` сейчас. Если для магазина решений нужны платёжные методы — модель ставим сейчас, UI заглушкой.
5. **Каждая волна закрывается полным циклом проверок**: lint + unit + integration + build + ручной обход в браузере + обновление `audit/PROGRESS.md`.

---

## Содержание

Закрытые (детали в `archive/2026-05-24/roadmap-closed-waves.md`):
- ~~Волна 6~~ — Юридический фундамент и согласия ✅
- ~~Волна 7~~ — Архитектурный фундамент данных ✅
- ~~Волна 8~~ — Высоконагрузочная инфраструктура ✅
- ~~Волна 9~~ — Безопасность и 152-ФЗ ✅

В работе и впереди:
- **Волна 10** — Наблюдаемость и операции (pino, Sentry, Prometheus, distributed cron, prod smoke-test)
- **Волна 11** — UX, дизайн-система и сайдбар (tokens, типографика, цвет, состояния, регистрация в 2 шага, докрутка disabled-пунктов)
- **Волна 12** — CMS-полишинг и админ-таблицы (плотность, локализация enum, breadcrumbs, скрытие cuid)
- **Волна 13** — Финал MVP (контент 2 курсов, чистка пост-MVP-модулей из публичной выдачи, прод smoke, бэкапы)

Примерная длительность: 2 спринта по 1–2 недели на волну = **3–4 месяца полной работы**. Это и есть «спокойно, как надо».

---

## Общие правила работы (важно)

- **Простой язык в коммитах и комментах**. Пользователь — не разработчик. PR-описания и сообщения коммитов — на русском, без жаргона.
- **Каждая задача — отдельный PR/коммит**. Не сваливать волну одним мега-коммитом.
- **После каждой задачи**: `pnpm lint && pnpm test && pnpm test:integration && pnpm build` — все 4 должны быть зелёные.
- **После задачи**: обновить `audit/PROGRESS.md` (✅ + ссылка на файлы) и журнал работы.
- **Если задача оказывается сложнее, чем казалась** — остановиться, не лепить как попало, обсудить.
- **Не повторять закрытое в Волнах 1–5** — сверять с `audit/PROGRESS.md` каждый раз.
- **Тесты пишутся вместе с фичей**, не «потом». Минимум — integration-тест на новый endpoint, unit-тест на новый сервис-метод с логикой.

---

## Закрытые волны (1–8)

Волны 1–5 — пост-аудитные исправления Волн P0/P1 (см. краткую сводку в `audit/PROGRESS.md`, детальные отчёты — в `audit/archive/2026-05-24/`).

Волны 6, 7, 8 закрыты в формате полноценного плана:

- **Волна 6** — Юридический фундамент и согласия (8/8 закрыто 2026-05-26).
- **Волна 7** — Архитектурный фундамент данных (9/9 закрыто 2026-05-26).
- **Волна 8** — Высоконагрузочная инфраструктура (10/10 закрыто 2026-05-26).

Детальные описания того, что делалось в каждой волне 6–8, — в [archive/2026-05-24/roadmap-closed-waves.md](archive/2026-05-24/roadmap-closed-waves.md).

---

# Волна 9 — Безопасность и 152-ФЗ

**Цель**: пройти security-аудит. Без этой волны MVP технически нельзя выкатывать на платных клиентов в РФ.

## 9.1. HTTP security headers

API (`apps/api/src/main.ts`):
```ts
import helmet from 'helmet';
app.use(helmet({ 
  contentSecurityPolicy: false, // CSP делаем на web-стороне
  crossOriginEmbedderPolicy: false, // мешает iframe-видео Rutube
}));
```

Web (`apps/web/next.config.ts`):
```ts
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; img-src 'self' data: https://s3.twcstorage.ru https://*.s3.twcstorage.ru; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:4000 https://s3.twcstorage.ru; font-src 'self'; frame-src https://rutube.ru https://*.rutube.ru;" },
    ],
  }];
}
```

CSP начинаем в **report-only mode**, после недели наблюдений в Sentry — переводим на enforced.

## 9.2. CSRF на mutating endpoints

Double-submit cookie pattern:
- Cookie `csrf-token` (НЕ HttpOnly, SameSite=Strict, secure в проде).
- Frontend читает cookie и шлёт в заголовке `X-CSRF-Token`.
- Бэк проверяет совпадение на `/auth/refresh`, `/auth/logout`, `/auth/change-password`, всех `POST/PATCH/DELETE` ручках, кроме `/auth/login`, `/auth/register` (там CSRF не нужен — нет cookie на сессии).

Реализация: NestJS `CsrfGuard` + middleware установки cookie.

## 9.3. Email-enumeration timing fix

`auth.service.ts:71-91`:
```ts
const dummyHash = '$2a$12$abcdefghijklmnopqrstuv.WkOaBPyDV7c9o6XhOuLNS8tIeS5wXa';
const user = await this.prisma.user.findUnique({ where: { email }, include: { company: true } });
const ok = await compare(input.password, user?.passwordHash ?? dummyHash);
if (!user || !ok) throw new UnauthorizedException('Неверный email или пароль.');
```

Аналогично — в `forgot-password` (когда будет реализован) — отвечать одинаково «Если такой email есть, мы отправили ссылку», не подтверждая существование.

## 9.4. Lockout после серии неудачных логинов

`Session.failedLoginAttempts` (новое поле в `User`):
- При неудачном login — counter++.
- При 10 неудачных подряд за 15 минут — `User.lockedUntil = NOW + 15 min`. Login возвращает «Учётная запись временно заблокирована за слишком много попыток. Попробуйте через N минут».
- При успешном login — counter=0.

## 9.5. 152-ФЗ: экспорт «моих данных»

`POST /api/auth/me/export-data` — асинхронный экспорт:
- Создаёт `DataExportRequest(userId, status='pending', createdAt)`.
- Воркер собирает все таблицы с `userId` или `companyId` → формирует ZIP (JSON-файлы + бинарные файлы из S3).
- ZIP кладётся в `FileAsset` с `accessLevel=conversation_private`, ссылка-токен с TTL 7 дней.
- Уведомление: «Ваш экспорт готов. Скачать (доступно до …).».

Для MVP реализовать синхронно (без воркера) — пользователь жмёт «Скачать» в /account → Безопасность, бэк формирует JSON-zip за <5 сек.

## 9.6. 152-ФЗ: запрос удаления аккаунта

`POST /api/auth/me/request-deletion`:
- `User.deletionRequestedAt = NOW`, `Company.status = 'pending_deletion'`.
- Email-уведомление + in-app: «Удаление запланировано на …. Передумали? Войдите в кабинет».
- Cron-задача `cleanup-deleted-accounts` каждые сутки — удаляет всё, что `deletionRequestedAt < NOW - 30 days`.
- Кнопка «Передумал» — `POST /api/auth/me/cancel-deletion` — сбрасывает.

UI в `/account → Безопасность → Опасная зона`.

## 9.7. Audit-trail с before/after

Хелпер в `apps/api/src/common/audit-log.service.ts`:
```ts
recordChange(actorId, entityType, entityId, action, before, after) {
  const diff = computeDiff(before, after);
  this.prisma.adminActionLog.create({
    data: { actorId, action, entityType, entityId, payload: { before, after, diff } },
  });
}
```

Применить в местах изменений:
- `billing.service.activateManually` — before/after Company состояния.
- `admin/users → block/unblock` — before/after User.status.
- `admin/staff → updateRoles` — before/after PlatformStaff.roles.
- `admin/settings.updateValue` — before/after value.
- `admin/companies → setStatus` — before/after Company.status.
- Любая модерация → санкция.

В `/admin/journals` — отображать diff как «было `basic` → стало `extended`», цвета: красный (старое), зелёное (новое).

## 9.8. Лимиты файлового аплоадера

`apps/api/src/files/files.controller.ts → upload`:
```ts
@Throttle({ default: { limit: 20, ttl: 60_000 } })
```

В сервисе — daily-quota на companyId: за сутки одна компания не больше 500MB upload'а суммарно. Проверка через сумму `FileAsset.sizeBytes WHERE uploadedById IN (company users) AND createdAt > NOW - 1d`.

При превышении — 429 «Дневной лимит загрузок исчерпан. Будет сброшен через N часов».

## 9.9. Защита cover-image от чужих файлов

Сейчас в редакторах news/lesson/kb пользователь может ввести `coverImageId` любого FileAsset, в том числе чужого. Хотя `accessLevel: public` это нивелирует, всё же лучше валидировать: cover может быть только из файлов, загруженных текущим пользователем (или admin для CMS).

## 9.10. Password policy: длина 12 + проверка по haveibeenpwned-pwned-passwords API

`MIN_PASSWORD_LENGTH=12` (сейчас 10). Это просто и безопасно.

Опционально (после MVP): integration с `https://api.pwnedpasswords.com/range/{hash5}` для проверки утечек.

## 9.11. Документирование политики безопасности

В `docs/08-architecture/security.md` (новый файл): описать
- Хранение паролей (bcrypt cost=12).
- Хранение токенов (access в памяти, refresh в HttpOnly cookie).
- CSP/CSRF/HSTS.
- Lockout-политика.
- 152-ФЗ-флоу.
- Логирование audit-событий.

## Проверки Волны 9

- [ ] Curl `-I https://localhost:3000` показывает все security headers.
- [ ] CSP-отчёты приходят в Sentry (если есть).
- [ ] После 10 неверных паролей login заблокирован на 15 минут.
- [ ] Экспорт данных скачивается, в zip — JSON + файлы.
- [ ] Запрос на удаление → через 30 дней (для теста — секунд) — данные удалены, FK CASCADE отработал.
- [ ] `/admin/journals` показывает before/after.


---

# Волна 10 — Наблюдаемость и операции

**Цель**: на прод-сервере точно знать, что происходит и что сломалось.

## 10.1. Структурное логирование (pino)

`nestjs-pino` подключить:
- В dev — `pino-pretty` с цветами.
- В prod — JSON-формат.
- Поля: `userId`, `sessionId`, `companyId`, `actorRole`, `traceId`, `path`, `method`, `statusCode`, `durationMs`.
- `traceId` генерируется в middleware (или через `als` async context).

Заменить все `console.log` / `console.error` на инжектированный `Logger`.

## 10.2. Sentry для error tracking

- `@sentry/nextjs` на web.
- `@sentry/node` на API через `nestjs-sentry` или вручную.
- DSN из env (`SENTRY_DSN_API`, `SENTRY_DSN_WEB`).
- `release: process.env.GIT_SHA || 'dev'`.
- Игнорировать 4xx (только 5xx идёт в Sentry).
- `beforeSend` — вырезать токены, пароли, persistent данные из payload.

## 10.3. Prometheus метрики

`prom-client` на API. Endpoint `/api/metrics` (basic-auth в проде).

Метрики:
- HTTP — `http_request_duration_seconds{method,route,status}`, histogram.
- Prisma — `prisma_query_duration_seconds`.
- JwtAuthGuard cache — `auth_cache_hit/miss`.
- Бизнес — `users_registered_total`, `subscriptions_active`, `notifications_sent_total`.

## 10.4. Distributed tracing (опционально)

OpenTelemetry-spans через `@opentelemetry/sdk-node`. Экспорт в Jaeger или Tempo. На MVP можно отложить, добавить когда станет интересно «почему запрос медленный».

**Решение 2026-05-26:** отложено. После 10.1–10.3 у MVP уже есть единый `X-Request-Id` в ответах, API-логах, Sentry-контексте и HTTP-метриках. Полноценный OpenTelemetry с Jaeger/Tempo добавим после появления реальной multi-service/multi-replica диагностики, чтобы не вводить лишнюю инфраструктуру перед MVP.

## 10.5. Backup и runbook

В `docs/08-architecture/deploy.md` — секция «Резервное копирование»:
- Timeweb Managed PG: включить daily backups, retention 30 дней.
- Manual: ежедневный `pg_dump` в Timeweb Cloud Storage с retention 90 дней.
- Runbook «Откат миграции»: команды `prisma migrate resolve --rolled-back <migration>`, восстановление из бэкапа.

## 10.6. Smoke-test на проде через Playwright

`apps/web/tests/smoke.spec.ts`:
- Регистрация нового тестового пользователя (с UNIQUE-email).
- Логин.
- Открыть /news — лента подгружается, видна минимум 1 запись.
- Открыть /indices — графики загружаются.
- Logout.
- В `package.json` — скрипт `test:smoke`, в CI — отдельный job, запускающийся после деплоя в staging.

## 10.7. Health-check расширенный

`/api/health` — есть (Волна 2). Расширить:
- `/api/health` — liveness (всегда 200, пока процесс жив).
- `/api/ready` — readiness: проверка БД, Redis, S3 (быстрый PING).
- `/api/health/deep` — детальная диагностика для админов (auth required).

**Решение 2026-05-26:** закрыто. `/api/health` проверяет только живой процесс, `/api/ready` проверяет Postgres `SELECT 1`, Redis `PING` при заданном `REDIS_URL` и S3 `HeadBucket` при настроенном S3, а `/api/health/deep` доступен только JWT-пользователю с ролью `admin` и показывает безопасные детали без секретов.

## 10.8. Алерты

Sentry — алерт «5xx > 10/мин» в Telegram-чат (или email).

Prometheus + AlertManager (если развернём Grafana) — alerts:
- p95 latency > 1s на 5 мин — warning.
- cache hit rate < 50% на 10 мин — investigate.
- DB connection pool > 80% — critical.

**Решение 2026-05-27:** закрыто. Sentry alert настраивается в Sentry-проекте API как «больше 10 error events за 1 минуту» (API уже отправляет туда только 5xx), отдельный web-rule ловит render errors. Для Prometheus добавлен rules-файл `ops/monitoring/ecoplatform-alerts.yml`: 5xx-rate, p95 latency, низкий auth session-cache hit rate и высокая занятость Postgres-соединений. API расширил `/api/metrics` метрикой `db_connections{state="used|max"}`; Alertmanager example лежит в `ops/monitoring/alertmanager.example.yml`, реальные Telegram/email секреты хранятся вне git.

## Проверки Волны 10

- [x] Логи в проде — JSON с полями userId/traceId.
- [x] Sentry получает 5xx ошибки.
- [x] /api/metrics возвращает prometheus-формат.
- [x] Smoke-test проходит локально и подключён к staging deployment_status.
- [x] Prometheus alert rules для 5xx/latency/cache/DB готовы к подключению, Alertmanager example не содержит секретов.
- [ ] Runbook откатывает миграцию на dev-стенде.


---

# Волна 11 — UX, дизайн-система и сайдбар

**Цель**: визуально и тактильно выровнять платформу, оставить disabled-разделы в сайдбаре как тизер, докрутить их вид.

## 11.1. Дизайн-токены (`tokens.css`)

`apps/web/src/styles/tokens.css` — переменные:

```css
:root {
  /* Палитра */
  --brand: #f5773e;            /* оранжевый — primary CTA */
  --brand-hover: #e8682e;
  --brand-active: #d35922;
  --success: #2da44e;          /* зелёный — «Активна», «Доступен» */
  --warning: #d97706;          /* янтарь — «В разработке», «Скоро истечёт» */
  --danger: #d73a49;           /* красный — «Заблокирована», «Просрочена» */
  --neutral: #6b7280;          /* серый — disabled, draft */
  --surface: #fdf9f4;          /* бежевый фон */
  --surface-elevated: #ffffff;
  --text: #1a202e;
  --text-muted: #6b7280;
  --border: #e5e7eb;

  /* Типография */
  --text-xs: 12px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 34px;

  /* Радиусы */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;

  /* Тени */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.12);

  /* Состояния */
  --focus-ring: 0 0 0 3px rgba(245, 119, 62, 0.25);
}
```

Применить через рефакторинг `globals.css` — заменить хардкод-цвета на токены.

## 11.2. Типографическая иерархия

Все `<h1>` — `font-size: var(--text-2xl)` (28pt) или `--text-3xl` (34pt) для главных hero. По левому краю, никаких центрированных текстов.

«Последние обновления» (`.news-feed-header h1`) → «Новости рынка», ~28px, выровнено по левому краю.

## 11.3. Цветовая семантика pill'ов

`StatusPill` — компонент с пропом `variant: 'success' | 'warning' | 'danger' | 'neutral' | 'brand'`. Использует токены.

Применить везде:
- Модули обучения «Доступен» → success (зелёный).
- «В разработке» → warning (жёлтый).
- «Нужна подписка» → brand (оранжевый).
- Компании «past_due» → danger.
- «demo» → warning.

## 11.4. Состояния hover/focus/active/disabled

Базовый `.button` — 4 состояния через токены. `:focus-visible` — outline через `--focus-ring` (важно для keyboard-only).

## 11.5. Сайдбар: докрутка disabled-пунктов

Disabled-пункты остаются, но визуально изменяются:
- Иконка с пониженной opacity (0.5).
- Под названием — мелкий badge `Скоро · Q3 2026` (опираясь на пользовательский roadmap).
- На hover — tooltip с описанием: «Торговая площадка — закрытый аукцион на объявлениях», «Форум — обсуждения участников рынка», и т.д.
- Cursor — `not-allowed` (не `pointer`).
- aria-disabled="true".

## 11.6. Регистрация в 2 шага

`RegisterForm` — рефактор на multistep:
- **Шаг 1**: О компании (название + тип + ИНН). Прогресс «1 из 2».
- **Шаг 2**: О вас (фамилия/имя, пол, телефон, email, пароль) + consent-чекбоксы.
- Между шагами — кнопка «Назад» (data сохраняется в state).
- Visual: тонкий progress-bar сверху.

## 11.7. Демо-баннер sticky

Компонент `DemoBanner` в `AppShell`. Показывается если `user.company?.status === 'demo'` и `demoEndsAt` есть.

Полоса 36px под топбаром, янтарного цвета:
- «Демо-доступ закончится через **N ч N мин**.» → countdown обновляется каждую минуту.
- Кнопка «Активировать подписку» — primary, маленькая, справа.
- За 2ч до конца — фон краснее, текст «Демо закончится через **N мин**».
- На admin-страницах не показывать.

## 11.8. Onboarding-card для нового пользователя

В `/news` сверху ленты — карточка приветствия после регистрации:
- «Добро пожаловать, [Имя]! Демо до [дата].»
- «Что попробовать в первую очередь:» → 3 ссылки: «Свежие новости», «Индексы цен», «Курс "Закупка сырья"».
- Кнопка «Закрыть».
- Состояние `localStorage.eco_onboarding_v1_dismissed = '1'`.

## 11.9. Сводная таблица движений индексов

В `/indices` над сеткой графиков — таблица «За неделю»: top-3 растущих и top-3 падающих, с цветом и процентом. Якорь-ссылки на карточки в сетке.

## 11.10. Сетка `auto-fit, minmax(...)` для индексов

`.indices-grid` — `grid-template-columns: repeat(auto-fit, minmax(360px, 1fr))`. Период-tabs — одной строкой с короткими лейблами или горизонтальный скролл.

## 11.11. /news — chip-row тегов + фильтрация

Бэк из 8.8 готов. UI:
- Над лентой — `<nav class="news-tags">` с top-N тегами.
- Активные теги — выделены, в URL `?tag=рынок&tag=пластик`.
- Кнопка «Все теги» — открывает dropdown.
- Тег на карточке — кликабелен (добавляет к фильтру).
- При смене фильтра — `setData` сбрасывается, `useInfiniteApiQuery` начинает с offset=0.

## 11.12. Микро-копирайтинг (по списку из IMPROVEMENT-PLAN A10)

Точечные правки текстов: «организация» → «компания», «awaiting_user» → «Ждёт ответа», и т.д.

## 11.13. /forgot-password и /404 — починить layout

Сейчас правая колонка AuthShell пустая на /forgot-password и /404 — потому что эти страницы реюзают AuthShell, но не пропускают `<AuthVisual>`.

Сделать общий `MarketingShell` (логотип сверху по центру, контент посередине, footer внизу) для всех публичных не-form страниц.

## 11.14. Доступность

- `<aside>` — `role="navigation"`.
- Skip-link «К содержимому» в начале `<body>`.
- Иконки-кнопки — `aria-label`.
- Чекбоксы — `focus-visible` на видимом боксе.
- Контраст muted-текста — поднять до WCAG AA.

## Проверки Волны 11

- [x] Lighthouse Accessibility ≥ 90.
- [x] Disabled-пункты в сайдбаре выглядят «премиум-тизером», не «полузакрытым меню».
- [x] Регистрация работает в 2 шага, кнопка «Назад» сохраняет данные.
- [x] Демо-баннер виден на /news, не виден на /admin/*.
- [x] /indices показывает сводную таблицу + сетку.


---

# Волна 12 — CMS-полишинг и админ-таблицы

**Цель**: контент-менеджер и админ могут эффективно работать с большими объёмами данных.

## 12.1. Админ-листинги → таблицы

Заменить карточки на компактные таблицы с фиксированной шапкой:
- /admin/companies — таблица 7 колонок.
- /admin/users — таблица.
- /admin/staff — таблица.
- /admin/journals — таблица.
- /admin/support/tickets (список слева) — компактные строки.

Сортировка по колонке (клик на header). Фильтры остаются — но в виде компактного фильтр-бара сверху.

## 12.2. Скрыть техн-cuid из UI модерации и журналов

В `/admin/moderation/cases/:id` — заголовок «Жалоба на комментарий А.С. от 25.05.2026, 14:32», cuid в углу мелким.

В `/admin/journals` — то же с lesson/news IDs.

## 12.3. Локализация enum-статусов везде

Расширить маппинги (`COMPANY_STATUS_LABELS`, `COMPANY_TYPE_LABELS`, и т.д.) и применить в админ-views. Сейчас они есть в `account-view.tsx`, но не везде используются.

## 12.4. Хлебные крошки на админ-страницах

Расширить `nav` массив в AppShell нестомым маппингом `pathname → breadcrumb` для админских child-routes.

## 12.5. CMS — preview новостей в админке

В `/admin/content/news` — каждая строка показывает: иконка статуса (draft/published), заголовок, лид, теги, дату публикации, действия (kebab). Сейчас в превью нет даты и статуса.

## 12.6. CMS — drag-and-drop для блоков в редакторе

`BlocksEditor` — добавить drag-handle на каждом блоке, drag-and-drop изменение порядка (через `@dnd-kit/core`, уже используется в admin-education).

Реализация 2026-05-27: общий `BlocksEditor` уже переведён на `@dnd-kit`, поэтому пункт закрыт browser-check'ом на реальном редакторе урока без дополнительной новой разработки.

## 12.7. CMS — auto-save черновика

При редактировании новости/урока/КБ — каждые 30 сек или при потере фокуса — `PATCH /…` отправляет текущее состояние как draft.

В углу — индикатор «Сохранено» / «Сохраняется…» / «Не сохранено» (если ошибка).

## 12.8. CMS — превью «как видит пользователь»

В редакторе новости/урока — кнопка «Предпросмотр» → открывает в новой вкладке `/news/<slug>?preview=1` с временным токеном (только для author/admin).

Реализация 2026-05-27: preview защищён текущей авторизованной JWT-сессией вместо отдельного временного токена. Доступ есть только автору, admin или content-manager; обычный пользователь получает 404.

## 12.9. Сводный дашборд админа

`/admin` (главная админ-страница уже показывает центр быстрых переходов; осталось добавить KPI-слой):
- KPI-карточки: пользователей сегодня, регистраций сегодня, активных подписок, открытых жалоб, активных тикетов.
- График регистраций за 30 дней.
- Список последних 5 событий аудита.

## Проверки Волны 12

- [ ] /admin/companies — таблица, сортировка работает.
- [ ] /admin/journals — таблица, видны diff'ы из Волны 9.7.
- [ ] /admin — дашборд с KPI.
- [ ] CMS auto-save срабатывает.


---

# Волна 13 — Финал MVP

**Цель**: перед showtime'ом — отгрузить чистый, наполненный, проверенный продукт.

## 13.1. Контент для двух MVP-курсов

Контент-задача, разработка проверяет CMS-флоу:
- «Закупка сырья» — 2–3 главы по 3–5 уроков с реальным текстом, картинками, attachments.
- «Склад» — то же.

Контент-менеджер пишет через CMS, выявляет проблемы редактора (drag-n-drop, auto-save, превью).

## 13.2. Скрыть из публичной выдачи 4 пост-MVP-модуля

Добавить в `LearningModule` флаг `hiddenFromPublic: Boolean @default(false)`.

Модули «Экономика и учет», «Юридический», «Автоматизация», «Как устроен рынок» — устанавливаются `hiddenFromPublic=true` через админку. В /education не показываются, но в /admin/content/education — видны как draft-stub'ы.

## 13.3. Реальные данные для индексов

Контент-менеджер заводит хотя бы 5–8 номенклатур с историей цен за 6+ месяцев. Без этого /indices смотрится демо-стендом.

## 13.4. Тестирование demo-флоу end-to-end

Сценарий: новый посетитель → лендинг → /register → принял consent → /news → читает новости → /education → проходит первый урок «Закупка сырья» → /indices → видит график → demo-таймер истекает → видит «Demo истёк» → /account → выбирает тариф → счёт.

Все эти шаги проходят руками (с записью), баги фиксируются в Sentry, чинятся.

## 13.5. Прод smoke-test полный

После деплоя в прод — запуск smoke-теста (Волна 10.6). Если не прошёл — rollback.

## 13.6. Bug-bash день

Внутренний bug-bash: команда (или один тестер) специально ищет баги. Минимум 4 часа на платформу.

## 13.7. Документация для пользователя

В /knowledge-base — статья «Как начать работу с ЭкоПлатформой» (контент-менеджер пишет).

## 13.8. Финальная проверка бэкапов

Делаем `pg_dump` на проде, восстанавливаем на staging, проверяем — всё на месте.

## Проверки Волны 13

- [ ] 2 курса доступны и пройдены тестовым пользователем целиком.
- [ ] /indices — 5+ номенклатур.
- [ ] Smoke-test проходит на проде.
- [ ] Bug-bash закрыт — все P0/P1 баги исправлены.
- [ ] Бэкап восстанавливается.

---

# Что НЕ делаем даже сейчас

(подтверждение из IMPROVEMENT-PLAN §6, с поправкой)

1. **Не реализуем UI торговой площадки, форума, магазина, калькуляторов, карт, документации**. Только инфраструктурный фундамент (Волна 7).
2. **Не пишем свой UI-кит с нуля**. CSS-токены + 5 базовых компонентов.
3. **Не подключаем что-то экзотическое** — оставайся в рамках стека `docs/08-architecture/tech-stack.md`.
4. **Не делаем дашборд админа сложным** — только KPI на главной (13.9 → 12.9). Без BI-инструментов.
5. **Не пытаемся реализовать всё одним PR'ом**. Каждая задача каждой волны — отдельная feature-ветка, отдельный обзор.
6. **Не оптимизируем bundle вслепую**. Lighthouse — baseline и регрессия, не самоцель.
7. **Не выгружаем `passwordHash`** нигде. Eslint-правило (либо явный `select`-only в Prisma extension).
8. **Не торопимся**. У нас 3–4 месяца на 8 волн. Лучше волна качества, чем три волны хаоса.

---

# Финал

После Волны 13 — MVP готов к выкатке на платных клиентов. Все 13 волн зафиксированы в `audit/PROGRESS.md`. Следующий большой блок — Торговая площадка как отдельная feature (3–4 спринта на свой план).
