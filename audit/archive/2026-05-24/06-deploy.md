# Этап 6 — Готовность к деплою на Timeweb

Покрыто: совместимость с Timeweb PostgreSQL 18 и Timeweb Cloud Apps/Containers, env-переменные для прод, миграции, бэкапы, логирование, CI/CD.

---

## 🔴 P0 — без этого деплой не запустится / не выживет первого инцидента

### 1. Нет Dockerfile / CI-сборки ✅ DONE 2026-05-24
> Созданы `apps/api/Dockerfile` и `apps/web/Dockerfile` (multi-stage, `node:24-alpine`, `tini`, non-root user). Web — со `output: "standalone"` в `next.config.ts`. Корневой `.dockerignore` тоже добавлен. CI пока не настроен — это пункт следующих волн.
- **Что**: ни одного `Dockerfile`, ни `.github/workflows`, ни `.gitlab-ci.yml`. Деплой на Timeweb потребует одного из:
  - Timeweb Cloud Apps (buildpack-сборка из git) — для NestJS+Next.js монорепы buildpack обычно не справляется, потому что нужно собирать оба `apps/*` и общий `packages/shared`.
  - Timeweb Cloud Containers — нужен `Dockerfile` per app + `docker-compose.yml` для оркестрации.
- **Чем чинить**: два Dockerfile (multi-stage):
  - `apps/api/Dockerfile`: `node:24-alpine` → `pnpm install --frozen-lockfile --filter @ecoplatform/api --filter @ecoplatform/shared` → `prisma generate` → `tsc -p apps/api` → `CMD ["node", "dist/main.js"]`. Не забыть `apk add openssl libc6-compat` для Prisma engine.
  - `apps/web/Dockerfile`: аналогично, но `next build` → standalone-режим (`output: 'standalone'` в `next.config.js`).
- Альтернатива «быстро»: использовать Timeweb управляемое приложение (если поддерживают pnpm + Turborepo), но monorepo обычно требует контейнерного подхода.

### 2. Нет SSL в `DATABASE_URL` ✅ DONE 2026-05-24
> В `docs/08-architecture/deploy.md` чётко прописано требование `?sslmode=require` для Timeweb Managed Postgres + комментарий в `.env.example`. Сам прод-URL подставляется во время деплоя.
- **Где**: [.env.example](.env.example), [.env](.env).
- **Что**: Timeweb Managed Postgres требует TLS-соединения для внешнего доступа. Локальный Postgres работает по plain TCP, поэтому `DATABASE_URL` сейчас без `?sslmode=require`. Без этого приложение в проде не подключится (или, хуже, подключится без шифрования, если Timeweb разрешает оба варианта).
- **Чем чинить**: для прода `DATABASE_URL="postgresql://USER:PASS@host:6432/db?schema=public&sslmode=require&sslaccept=accept_invalid_certs"` (последний параметр — если Timeweb использует self-signed корневой сертификат). Описать это явно в `docs/08-architecture/deploy.md`.

### 3. PG 18 — официально Prisma 6 поддерживает Postgres до 17
- **Где**: [apps/api/prisma/schema.prisma:6](apps/api/prisma/schema.prisma#L6) — `provider = "postgresql"`.
- **Что**: Prisma 6 в `package.json` (`^6.19.2`) официально документирована для PG 11–17. PG 18 включает изменения в `RANDOM()`, `unaccent`, JSONB, оптимизаторе. С большой вероятностью ВСЁ заведётся — Prisma общается с Postgres через стандартный wire-protocol. Но «work» не значит «supported».
- **Чем чинить**:
  - Поднять PG 18 в docker рядом с PG 16, прогнать integration-тесты на нём (полминуты).
  - Зафиксировать факт «проверено на PG 18» в `docs/`.
  - Если возникнут проблемы — выбрать PG 17 у Timeweb (если опция есть) или ждать Prisma 6.20+.

### 4. `binaryTargets` для Prisma не указан ✅ DONE 2026-05-24
> В `apps/api/prisma/schema.prisma` добавлен `binaryTargets = ["native", "linux-musl-openssl-3.0.x", "debian-openssl-3.0.x"]`. `prisma generate` пере-выполнен; integration-тесты прошли.
- **Где**: `generator client { provider = "prisma-client-js" }`.
- **Что**: при сборке в Docker (alpine или debian-slim) Prisma подтягивает binary engine. Если не указать целевую платформу, в `node_modules/.prisma/client/` лежит engine для текущей машины разработчика (macOS/darwin-arm64). При запуске в Linux-контейнере получим `Cannot find module '...query_engine-linux-musl-arm64.so.node'`.
- **Чем чинить**:
  ```prisma
  generator client {
    provider      = "prisma-client-js"
    binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
  }
  ```
  (`linux-musl-...` для alpine, `linux-arm64-openssl-3.0.x` для arm64 alpine, `debian-openssl-3.0.x` для bookworm-slim — выбрать под образ).

### 5. Нет health-check эндпоинта ✅ DONE 2026-05-24
> `@nestjs/terminus` подключён, добавлен `HealthModule` с двумя контроллерами:  `/api/health` (liveness, всегда 200) и `/api/ready` (readiness, проверяет Postgres `SELECT 1`). Оба эндпоинта исключены из rate-limit. Проверены curl-ом: 200 OK, `database: up`.
- См. Этап 2 #8. Без `/health` балансировщик Timeweb будет считать «живым» контейнер, который не подключился к БД.

### 6. Нет graceful shutdown ✅ DONE 2026-05-24 (см. Этап 2 #2)
> Закрыто в Волне 1: `app.enableShutdownHooks()` в `main.ts`. Plus tini в Dockerfile корректно форвардит SIGTERM в node-процесс.
- См. Этап 2 #2. На rolling-deploy Timeweb теряются соединения и подвисают сессии Postgres.

---

## 🟡 P1 — серьёзные пробелы

### 7. `.env.example` рассинхронизирован с `docker-compose.yml` ✅ DONE 2026-05-24
> Порт исправлен на 5433. Добавлены комментарии про требование 32+ символов для JWT-секретов, про `sslmode=require` для прода, про `WEB_ORIGIN`, и поля `THROTTLER_DISABLED` / `SCHEDULER_DISABLED` (только для тестов).
- **Где**: [.env.example:1](.env.example#L1) — `localhost:5432`. [docker-compose.yml:11](docker-compose.yml#L11) — `5433:5432`.
- **Что**: README обещает, что `.env.example` готов под docker-compose, но фактически порт там 5432 → новый разработчик копирует `.env.example` → получает `connection refused`. Уже отмечено в Этапе 0.
- **Чем чинить**: исправить `.env.example` на 5433.

### 8. Нет стратегии prod-логирования и ротации логов
- **Где**: API использует встроенный `Logger` от NestJS — пишет в stdout. На Timeweb stdout попадает в их журнал. Но:
  - нет log-уровня `production` (всегда `verbose`).
  - нет structured logging (JSON) — невозможно собирать в ELK / Loki.
  - PII (email, IP, userAgent) пишется в plain text.
- **Чем чинить**:
  - подключить `pino` или `winston` с JSON-форматом.
  - `LOG_LEVEL=info` для прод.
  - блок-лист полей: пароли, токены, IP (если правовое требование).
  - на Timeweb настроить sink в их log-агрегатор (если есть) либо в внешний (Logtail, Datadog).

### 9. Нет описанной стратегии бэкапов ✅ DONE 2026-05-24
> Раздел «Бэкапы» в `docs/08-architecture/deploy.md`: retention 7–14 дней, ежеквартальная проверка восстановимости на отдельной dev-БД, обязательное имя ответственного. Плюс пример `pg_dump`-в-S3 для критических операций (миграции).
- **Что**: Timeweb Managed Postgres делает автоматические бэкапы (обычно daily). Но в `docs/` нигде не зафиксировано: какая retention-политика, сколько дней хранится, кто проверяет восстановимость.
- **Чем чинить**: страница `docs/08-architecture/backups.md`: частота, retention, процедура восстановления, точка ответственности.

### 10. Миграции без rollback-плана ✅ DONE 2026-05-24
> В `docs/08-architecture/deploy.md` описана процедура rollback (ручной обратный SQL → удалить запись из `_prisma_migrations` → удалить папку миграции) и правило «для каждой не-аддитивной миграции — заранее писать ROLLBACK-черновик в `apps/api/prisma/migrations/_rollback/`».
- **Где**: 11 миграций в [apps/api/prisma/migrations](apps/api/prisma/migrations).
- **Что**: Prisma migrate — forward-only. Чтобы откатить, нужно писать `revert`-миграцию вручную. На прод-инциденте «миграция сломала прод» это +30 минут стресса.
- **Чем чинить**: правило для каждой не-аддитивной миграции (drop column, rename, change type) — заранее писать обратную миграцию-черновик и хранить её в `apps/api/prisma/migrations/_rollback/`.

### 11. Сборка `apps/web` пройдёт build-time без API
- **Что**: Next.js при `next build` пытается prerender 23 страницы. Если страницы дёргают `/api/auth/me` через клиент (CSR) — всё ок (без обращения на билд). Если когда-нибудь добавится `generateStaticParams` или серверный `fetch` без `force-dynamic` — build упадёт.
- **Чем чинить**: на этапе деплоя — `NEXT_PUBLIC_API_URL=https://api.eco-platform.ru/api`, и удостовериться, что компиляция не делает запросов. Сейчас проходит, но это case, который легко сломать.

### 12. Нет secret-rotation плана
- **Что**: `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` — статичные. Когда (а не если) понадобится ротация, придётся ронять все сессии. Стандартное решение — две версии секрета: `current` для подписи, `previous` для верификации старых токенов.
- **Чем чинить**: на этапе MVP можно оставить, но описать процедуру.

### 13. Нет CDN / static-cache для `/public`
- **Что**: 90+ файлов в `apps/web/public/avatars` и `/brand`. Без CDN они отдаются с node-сервера через Next.js — каждая иконка/аватар = round-trip.
- **Чем чинить**: за Timeweb Cloud — поставить их CDN перед статикой, или загрузить `public/` в S3 и отдавать оттуда через `next.config.js -> images.domains`.

---

## 🟢 P2 — улучшения

### 14. PROJECT_STATUS.md устарел
- Обещает 10 integration-тестов, по факту 79. README говорит, что `.env.example` на 5433, по факту 5432.

### 15. Нет автоматического запуска `pnpm audit` в CI
- Перед каждым merge стоило бы прогонять `pnpm audit --prod`. Сейчас известен 1 moderate (postcss), но новые CVE будут появляться.

### 16. Connection pooling
- На текущем масштабе один Prisma-клиент с дефолтным пулом 10 connections — норм. На Timeweb важно понимать лимит соединений у Managed Postgres (обычно 100). При горизонтальном масштабировании на 10+ инстансов нужен pgBouncer.

### 17. Нет `next.config.js`
- **Что**: проверил, файла нет → используются дефолты Next.js 16.
- При добавлении внешних доменов для `next/image` понадобится `next.config.js` с `images.remotePatterns`. На текущий момент `<img>` напрямую (см. Этап 4), так что не критично — но станет критично при миграции на `next/image`.

### 18. Redis запланирован, но не используется
- В `docs/08-architecture/tech-stack.md` упомянут Redis (кеш + очереди), но в коде ни одной зависимости. Это нормально — не провизить заранее. Но в `docs/` стоит поставить флаг «отложено» с триггером.

### 19. У `apps/web` `output` не настроен на `standalone` ✅ DONE 2026-05-24
> В `apps/web/next.config.ts` добавлен `output: "standalone"` и `outputFileTracingRoot: projectRoot`. `pnpm build` корректно создаёт `apps/web/.next/standalone`. Dockerfile web копирует из standalone — образ компактный.
- Для контейнерной сборки Next.js рекомендует `next.config.js -> output: 'standalone'` — на выходе получается минимальный набор файлов в `.next/standalone`. Сейчас деплой будет тащить весь `node_modules` (≈1 ГБ).
- Чинить: добавить, когда будем писать Dockerfile.

### 20. Time zone: бэкенд работает в UTC через `new Date()`, фронт форматирует через `toLocaleString("ru-RU")`
- Это правильно. Но если Timeweb-Postgres вернёт строки в локальном TZ контейнера (зависит от `TZ` env-переменной), могут поплыть. Явно ставить `TZ=UTC` в env-prod.

---

## ✅ Что готово к деплою

- **Build-выход чистый**: `pnpm build` производит `dist/` для api и `.next/` для web без ошибок (3/3 пакета).
- **Prisma migrate deploy** — `pnpm --filter @ecoplatform/api prisma:migrate` корректно работает с production-стилем (без `migrate dev`). На Timeweb запустить в качестве init-команды контейнера.
- **dotenv подгружается централизованно** из корневого `.env` (main.ts:7) и из seed (prisma/seed.ts). На Timeweb env-переменные подставляются нативно — `.env` файл не нужен.
- **SECURE-cookie уже завязан на `NODE_ENV === "production"`** ([auth.controller.ts:88](apps/api/src/auth/auth.controller.ts#L88)) — на проде refresh-cookie будет с `Secure`.
- **`CORS origin`** конфигурируется через `WEB_ORIGIN` (main.ts:19) — деплою достаточно `WEB_ORIGIN=https://app.eco-platform.ru`.
- **integration-тесты прогоняются за 74 секунды** — пригодны для запуска в CI перед мерджем.
- **PostgreSQL 16** в docker-compose повторяет prod-стек (PG-семейство) — schema гарантированно совместима.
- **S3-конфиг для Timeweb Storage уже встроен** (`S3_ENDPOINT=s3.twcstorage.ru`) — деплою останется только подставить prod-bucket и ключи.
- **Scheduler конфигурируем** через `SCHEDULER_DISABLED=1` — позволяет легко вынести cron в отдельный worker-контейнер (см. Этап 2 #7).
- **packages/shared** собирается в `dist/`, прод-импорты идут через готовый build, а не через TS-исходники — это правильный setup для контейнерной сборки.
