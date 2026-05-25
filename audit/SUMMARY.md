# Сводный отчёт по полномасштабной проверке кода

Дата: 2026-05-24
Ветка: `main`, коммит `6be8785`
Аудитор: автоматический проход по 7 этапам с реальным запуском dev-серверов и сквозными сценариями.

> **Обновление 2026-05-25, после-аудит**: **Волна 1** ✅ 12/12 P0, **Волна 2** ✅ 7/7 фундамент деплоя, **Волна 3** ✅ 5/6 (расщеплены 2 god-файла, DTO-типы и API-клиент в shared), **Волна 4** ✅ 7/7: индексы БД (13 шт.), CORS-кеш, N+1-фикс `replaceNewsTags`, пагинация на 5 ключевых листингах, `loading.tsx` skeleton, `<img>` → `next/image`, **`FileReference` таблица** (cleanup из O(M) scan'а в O(1) count). **Волна 5 — 8/12**: GitHub Actions CI (`.github/workflows/ci.yml`) c prettier-check + auto-format 36 файлов, `findManyByIds` фильтр по public, единый `MIN_PASSWORD_LENGTH = 10` + `passwordSchema` в shared, `swallowAndLog` (13 silent-catch → logged), `GlobalExceptionFilter` + `unhandledRejection/uncaughtException` handlers, news-card `<button>` → `<a href>` (SEO + middle-click), hint про политику пароля в UI регистрации, rel="noopener noreferrer" (уже было в Волне 3). Отложены: 5.2 (split integration-tests), 5.3 (OpenAPI), 5.4 (pino), 5.10 (idempotency-key). Codex параллельно закрыл побочные пункты (rate-limit, health/ready, drag-drop уроков, Next-lesson + автозачёт прогресса). Проверки: lint 4/4, unit 23/23, integration **82/82**, build 3/3, format:check clean.

---

## TL;DR — состояние проекта одной фразой

**MVP-каркас в хорошей форме**: код читается, монорепо разложено правильно, 79 integration-тестов проходят, базовый сценарий «регистрация → demo → активация» работает в браузере. Но **до прод-деплоя нельзя выкатывать в текущем виде** — есть 5 блокирующих проблем: утечка `passwordHash` в admin API, JWT-секрет с фолбэком на дефолтную строку, access-токен в `localStorage`, отсутствие rate-limit, MIME-XSS через загрузку файлов. Плюс по мелочи — битая ссылка «забыли пароль», 404 на английском.

Архитектурно проблема одна и крупная: «god-файлы» (`DataViews.tsx` на 3244 строки, `content.service.ts` на 2054). Они притаскивают за собой почти все находки про производительность и типобезопасность. Один большой рефакторинг — и три-четыре пункта из других этапов уйдут сами.

---

## Зелёный baseline (что точно работает)

| Проверка | Результат |
| --- | --- |
| `pnpm lint` | ✅ 4/4 пакета (tsc --noEmit) |
| `pnpm test` | ✅ 23 unit-теста (api 14, web 3, shared 6) |
| `pnpm build` | ✅ все 3 пакета, 25 маршрутов Next.js |
| `pnpm test:integration` | ✅ 79 integration-тестов за 74с |
| `pnpm audit --prod` | ⚠️ 1 moderate (postcss транзитивно через Next.js) |
| Сквозной сценарий «admin login → /news → /account» | ✅ работает |
| Сквозной сценарий «demo login → /news → попытка admin → 403» | ✅ работает |

---

## 🔴 P0 — критические находки (12)

Это блокеры. Их нельзя оставлять в проде. Сгруппировал по тематике, чтобы видеть «один рефакторинг = несколько фиксов».

### Безопасность (5)

1. **JWT-секрет с фолбэком на литерал `"dev-access-secret"`** — `auth.service.ts:388`, `jwt-auth.guard.ts:28`. Если env не задан, любой может подделать токен. Бросать ошибку при старте.

2. **Дамп `passwordHash` всех пользователей в `GET /api/admin/billing/companies`** — `billing.service.ts:30`, `include: { users: true }` подтягивает все поля User. Заменить на `select` без `passwordHash`.

3. **Access-токен в `localStorage`** — `apps/web/src/lib/api.ts`. При любом stored-XSS уходит вместе с токеном. Хранить в памяти, восстанавливать через HttpOnly refresh-cookie.

4. **Нет rate-limit на `/auth/*`** — подбор пароля и массовая регистрация ботов открыты. Добавить `@nestjs/throttler` глобально, особенно строгий лимит на login.

5. **Stored-XSS через MIME-тип файла** — `files.service.ts:165`. Можно загрузить HTML с `mimeType: text/html`, S3 отдаст его браузеру с JS. Доверять mime только после реальной проверки магическим числом.

### Стабильность (3)

6. **Нет graceful shutdown** — `main.ts`. На rolling-deploy теряются Prisma-соединения. Добавить `app.enableShutdownHooks()`.

7. **Race при создании учебного модуля** — `content.service.ts:974`. `position` глобально-уникален, два параллельных create дают P2002. Завернуть в `$transaction` с serializable isolation.

8. **PostCSS XSS (транзитивно из Next.js)** — `pnpm audit`. Обновить Next.js или поставить override в pnpm.

### UX (2)

9. **`/forgot-password` 404** — ссылка есть в форме логина, маршрута нет. Либо реализовать, либо заглушить.

10. **Default Next.js 404 на английском без layout** — нет `app/not-found.tsx`. Любой битый URL даёт «This page could not be found.». Добавить локализованный not-found с навигацией.

### Деплой (2)

11. **Нет Dockerfile / CI** — на Timeweb деплоить нечем. Написать `Dockerfile` для api и web (multi-stage).

12. **`binaryTargets` для Prisma не указан** — в Linux-контейнере не найдёт engine. Добавить `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`.

---

## 🟡 P1 — серьёзные находки (28)

Не блокеры, но всё это «инцидент через 3 месяца» или «UX-боль каждый день».

### Безопасность

- Email-enumeration через тайминг login (1 мс vs 100 мс).
- `request.ip` без `trust proxy` (на Timeweb за nginx будем видеть IP балансировщика).
- Санитайзер разрешает `target="_blank"` без принудительного `rel="noopener"`.
- `GET /files?ids=` отдаёт metadata приватных файлов любому авторизованному.
- Минимальная длина пароля 8 при регистрации, 10 при change-password (рассинхрон).
- S3-ключи Timeweb лежат в локальном `.env` plaintext.
- Нет блокировки аккаунта после серии неудачных входов.

### Стабильность

- 13 мест `.catch(() => undefined)` молча подавляют сбои уведомлений.
- Нет глобального exception-filter / unhandled-rejection handler.
- Параллельная ручная активация подписки создаёт дубли.
- Cron сработает на всех репликах при масштабировании.
- Нет health-check эндпоинта.
- `findManyByIds` 500-ит на битом id вместо 400.

### UX

- `catch {}` в LoginForm/RegisterForm теряет осмысленные сообщения API.
- `/news/<плохой-slug>` показывает «Не удалось загрузить» вместо «не найдено».
- Demo-юзер на admin-URL остаётся на тупиковой странице без редиректа.
- Карточки новостей — `<button>` вместо `<a>` (нет Cmd-click в новую вкладку).
- UI не показывает реальную политику пароля (буква + цифра).

### Производительность

- `GET /api/news` без пагинации (и ещё 5 эндпоинтов).
- Нет индексов на NewsPost, Comment, SupportTicket, LearningModule, KnowledgeBaseArticle.
- CORS-preflight на каждом запросе (`Access-Control-Max-Age` не выставлен).
- `<img>` вместо `next/image` — нет resize, нет AVIF.
- `replaceNewsTags` — классический N+1.
- `deleteIfUnreferenced` сканирует все блоки платформы при удалении одного файла.

### Архитектура

- 56 `any` в типизированном коде (новости/комменты не описаны типами).
- `sanitize-html.ts` дублируется в web и api (рассинхрон ⇒ XSS-ловушка).
- 42 файла напрямую используют `apiFetch` с хардкод-URL.
- Тестовое покрытие неравномерное (billing — 0 тестов, web-компоненты — 0 тестов).

### Деплой

- `.env.example` указывает на 5432, docker-compose — на 5433.
- Нет SSL в DATABASE_URL (Timeweb Postgres требует TLS).
- Нет prod-логирования с JSON-форматом и log-уровнем.
- Нет описанной стратегии бэкапов и rollback миграций.

---

## 🟢 P2 — улучшения (20+)

Не описываю поштучно — список целиком в отдельных отчётах. Темы:

- Toast-уведомления вместо inline.
- ESLint + prettier-check в CI.
- OpenAPI-документация API.
- Skeleton-лоадеры вместо пустой страницы.
- Split `DataViews.tsx` на отдельные файлы (без этого упрямо болеть будут все).
- CDN перед `apps/web/public/*` (90+ статических файлов).
- `output: 'standalone'` для Next.js под Docker.
- `TZ=UTC` явно.

---

## Рекомендованный план исправлений

Я бы шёл волнами, не пытаясь починить всё разом. После каждой волны — прогон тестов + ручная проверка ключевых сценариев.

### Волна 1 — недопустимое в проде (1 итерация, ~1 день)

Закрыть всё P0, кроме архитектурно-крупных (Dockerfile делать позже).

1. JWT-секрет: бросать при старте, удалить фолбэк.
2. Заменить `include: { users: true }` на `select` без passwordHash. Грепнуть по проекту, поправить везде.
3. Access-токен — в памяти, не в localStorage.
4. `@nestjs/throttler` + лимит на `/auth/*`.
5. MIME-валидация для file upload (через `file-type` библиотеку + sharp для картинок).
6. `app.enableShutdownHooks()` и `app.set('trust proxy', 1)`.
7. Транзакция вокруг `learningModule.create` + retry на P2002.
8. PostCSS — обновить Next.js до версии с фиксом или override.
9. Заглушить ссылку `/forgot-password` (или сделать минимальную страницу).
10. Создать `app/not-found.tsx` с layout-ом и русским текстом. То же для `app/error.tsx`.

### Волна 2 — фундамент для деплоя (1 итерация, ~1 день)

1. Dockerfile для api + web (multi-stage).
2. `binaryTargets` в schema.prisma.
3. Health-check эндпоинт через `@nestjs/terminus`.
4. SSL в DATABASE_URL для прод.
5. `.env.example` — починить порт.
6. Описать процедуру миграций и бэкапов в `docs/08-architecture/deploy.md`.

### Волна 3 — большой рефакторинг (2–3 итерации)

Это снимает половину пунктов P1 и P2 сразу.

1. Разнести `DataViews.tsx` на 10 файлов.
2. Разнести `content.service.ts` на `NewsService`, `LearningService`, `KnowledgeBaseService`, `PriceIndexService`.
3. Описать DTO-типы (`NewsListItem`, `Comment`, …) в `packages/shared` и использовать на клиенте.
4. Единый `sanitize-html.ts` в `packages/shared`.
5. `lib/api/index.ts` с типизированными методами вместо хардкод-URL.

### Волна 4 — производительность (1 итерация)

1. Пагинация для `/news`, `/admin/*`, `/notifications`.
2. Индексы на 5 таблиц одной миграцией.
3. CORS `maxAge: 86400`.
4. Заменить `<img>` на `next/image`.
5. Skeleton-лоадеры и `loading.tsx` на ключевых маршрутах.

### Волна 5 — наведение порядка (1 итерация)

1. ESLint + prettier в CI.
2. Декомпозиция integration-тестов на доменные файлы.
3. OpenAPI-генерация (`@nestjs/swagger` или `nestjs-zod`).
4. Структурное логирование (`pino`).

---

## Где смотреть детали

| Отчёт | Покрывает |
| --- | --- |
| [audit/00-baseline.md](audit/00-baseline.md) | Инвентаризация проекта, проверка чистоты base |
| [audit/01-security.md](audit/01-security.md) | 5 P0 / 8 P1 / 6 P2 — безопасность |
| [audit/02-stability.md](audit/02-stability.md) | 3 P0 / 6 P1 / 5 P2 — стабильность |
| [audit/03-bugs.md](audit/03-bugs.md) | 3 P0 / 8 P1 / 7 P2 — UX и баги |
| [audit/04-performance.md](audit/04-performance.md) | 3 P0 / 6 P1 / 6 P2 — производительность |
| [audit/05-architecture.md](audit/05-architecture.md) | 3 P0 / 5 P1 / 9 P2 — архитектура |
| [audit/06-deploy.md](audit/06-deploy.md) | 6 P0 / 7 P1 / 7 P2 — деплой Timeweb |

---

## Что бы я НЕ стал делать сейчас

- **Не переписывать с нуля.** Каркас MVP в хорошей форме, его доводить, а не сжигать.
- **Не гнаться за 100% покрытия тестами.** Сначала закрыть P0/P1, потом — целенаправленно тесты на самые рискованные домены (billing, manual subscription, moderation).
- **Не подключать Redis сейчас.** В коде нет ни одной зависимости от него — это будущая итерация.
- **Не вводить ESM в shared «потому что современно».** Сейчас CommonJS работает, ESM-миграция упрётся в NestJS-настройки и съест день без бизнес-выхлопа.
- **Не делать кастомный реализованный UI-кит.** Все экраны уже стилизованы CSS-vanilla — переписывать на Tailwind/MUI не нужно ради переписывания.

---

## Финальная оценка

Если расставить субъективную оценку «как готов проект к проду» в трёх измерениях:

- **Безопасность**: 5 / 10. После Волны 1 — 8 / 10. Серьёзно не выкатывать без неё.
- **Стабильность**: 6 / 10. После Волн 1+2 — 9 / 10.
- **UX/качество**: 7 / 10. Работает, выглядит прилично. Шероховатости известны.
- **Готовность к Timeweb**: 4 / 10 (нет Dockerfile, нет SSL, нет health-check). После Волны 2 — 8 / 10.
- **Архитектура**: 6 / 10 (god-файлы). После Волны 3 — 9 / 10.

Суммарно: текущее состояние — крепкий каркас, выше среднего по российским MVP. Один-два спринта целенаправленной работы по плану выше — и можно спокойно показывать первым клиентам.
