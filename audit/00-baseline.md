# Этап 0 — Baseline и инвентаризация

Дата: 2026-05-24
Ветка: `main`, последний коммит `6be8785 Refactor CRM workflows and update UI flows`

## Зелёный baseline

| Проверка | Результат |
| --- | --- |
| `pnpm lint` | ✅ 4/4 пакетов (tsc --noEmit) |
| `pnpm test` (unit) | ✅ 23 теста (api 14, web 3, shared 6) |
| `pnpm build` | ✅ 3/3 пакетов, 25 маршрутов Next.js |
| `pnpm --filter @ecoplatform/api test:integration` | ✅ 79 тестов |
| `pnpm audit --prod` | ⚠️ 1 moderate (postcss < 8.5.10 — XSS) |

Все рабочие проверки проходят. Дальнейший аудит идёт по «чистой» базе.

## Инвентаризация

### apps/api (NestJS)

- **15 модулей**: auth, billing, content, files, moderation, notifications, support, prisma, scheduler + 5 admin (companies, journals, settings, staff, users).
- **12 контроллеров**: `auth`, `billing`, `content`, `files`, `moderation`, `notifications`, `support`, `admin-companies`, `admin-journals`, `admin-settings`, `admin-staff`, `admin-users`.
- Зависимости: NestJS 11, Prisma 6, JWT, bcryptjs, zod, isomorphic-dompurify, @aws-sdk/client-s3, sharp, @nestjs/schedule.

### apps/web (Next.js 16)

- **25 маршрутов**: главная, `/login`, `/register`, `/account`, `/notifications`, разделы `news`, `indices`, `education`, `knowledge-base`, `admin/*` (billing, companies, content/{education,indices,knowledge-base,news}, journals, moderation, settings, staff, support, users), динамические `[slug]`, `[moduleId]`, `[lessonId]`.
- Зависимости: React 19, Tiptap 3, dnd-kit, lucide-react, isomorphic-dompurify.

### packages/shared

- 8 файлов: статусы, DTO, demo/access-gating, slug, расчёт индексов цен, content blocks валидация.

### База данных (Prisma)

- **39 моделей**: User, Company, Subscription, Session, PlatformStaff, AdminActionLog, PlatformSetting, FileAsset, NewsPost (+Block/Tag/Like/Comment/Attachment), NomenclatureCategory, Nomenclature, PriceIndex(+Value), LearningModule (+Preview/Chapter/Lesson/Block/Attachment/Progress), KnowledgeBaseArticle(+Block), InAppNotification, UserNotificationPreferences, NotificationDelivery, ModerationCase, Complaint, ModerationDecision, Sanction, UserModuleRestriction, SupportTicket(+Message).
- **11 миграций**, схема 722 строки.

## Конфигурация окружения

- Docker Postgres 16 на `:5433`, БД `ecoplatform`, пользователь/пароль `ecoplatform/ecoplatform`.
- API на `:4000`, web на `:3000`.
- Целевая БД деплоя: Timeweb PostgreSQL 18.
- S3-хранилище: Timeweb Cloud (`s3.twcstorage.ru`).

## Замечания baseline (попадают в детальные этапы)

1. **🟡 `.env.example` рассинхронизирован с `docker-compose.yml`** — пример указывает `localhost:5432`, контейнер слушает `:5433`. Новый разработчик получит «connection refused» при копировании файла.
2. **🔴 PostCSS XSS** через транзитивную зависимость Next.js (`postcss < 8.5.10`). Сейчас не критично (мы не обрабатываем недоверенный CSS), но в любом случае требует апдейта Next.js / override версии.
3. **🟡 Реальные S3-ключи в локальном `.env`** — в git они не утекли (`.env` в `.gitignore`, история чистая), но физически лежат на диске разработчика в виде plaintext. Рекомендуется ротация перед продом и/или использование dev-bucket.
4. **🟢 Конфиг vitest** жалуется: `esbuild: false` устарел, нужно `oxc: false`. Не влияет на тесты, но шум в логах.
5. **🟢 PROJECT_STATUS.md устарел** — пишет о 10 integration-тестах, фактически 79.

Подробные находки — в отчётах следующих этапов.
