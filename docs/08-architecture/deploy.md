---
title: Деплой на Timeweb Cloud
status: draft
updated: 2026-05-26
---

# Деплой ЭкоПлатформы на Timeweb

Стек развёртывания:

- **Timeweb Managed PostgreSQL 18** — продовая БД.
- **Timeweb Cloud Containers** (либо Apps) — для NestJS API и Next.js web.
- **Timeweb Cloud Storage (S3-совместимое)** — пользовательские файлы.

Если на момент чтения у Timeweb появилась managed-версия Redis или managed-cron — описание ниже не противоречит.

---

## 1. Переменные окружения

| Имя | Где задаётся | Пример |
| --- | --- | --- |
| `DATABASE_URL` | оба контейнера | `postgresql://USER:PASS@HOST:6432/db?schema=public&sslmode=require&connection_limit=20` |
| `JWT_ACCESS_SECRET` | api | минимум 32 символа, `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | api | минимум 32 символа, отдельный от access |
| `WEB_ORIGIN` | api | публичный URL фронта, например `https://app.eco-platform.ru` |
| `NEXT_PUBLIC_API_URL` | web (build-arg) | публичный URL API, `https://api.eco-platform.ru/api` |
| `S3_ENDPOINT` | api | `https://s3.twcstorage.ru` |
| `S3_REGION` | api | `ru-1` |
| `S3_BUCKET` | api | имя бакета |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | api | ключи доступа к бакету |
| `S3_PUBLIC_BASE_URL` | api | публичный CDN-домен (если есть) или сам endpoint |
| `API_PORT` | api | `4000` |
| `PORT`, `HOSTNAME` | web | `3000`, `0.0.0.0` |
| `TZ` | оба | `UTC` |
| `NODE_ENV` | оба | `production` (включает Secure-флаг cookie) |

> JWT-секреты обязательно ≥ 32 символов — `bootstrap()` проверяет в `assertSecret()` и не стартует с пустым/коротким значением (см. `apps/api/src/main.ts`).

---

## 2. Подключение к Timeweb Managed Postgres 18

1. Создайте кластер PostgreSQL 18 в панели Timeweb.
2. На вкладке «Доступ» возьмите host/port/credentials.
3. В `DATABASE_URL` обязательно добавьте `sslmode=require` — managed-Postgres у Timeweb требует TLS.
4. Держите `connection_limit=20` в `DATABASE_URL`: одна API-реплика держит до 20 соединений, поэтому при N репликах закладывайте примерно `N * 20` соединений плюс запас под миграции и ручные админские подключения.
5. Если тариф БД даёт маленький max connections, уменьшите `connection_limit` до 10 и масштабируйте API реплики после проверки метрик.
6. Если у кластера self-signed корневой сертификат, добавьте `&sslaccept=accept_invalid_certs` (Prisma).
7. Совместимость: Prisma 6 официально документирована до PG 17, но wire-protocol совместим. Прогоните integration-тесты против PG 18 локально (поднимите второй контейнер postgres:18 на :5434) перед первым прод-деплоем.

`PrismaService` дополнительно страхует конфигурацию: если в `DATABASE_URL` забыли `connection_limit`, он добавит значение `20` при создании `PrismaClient`. Клиент стартует с `errorFormat: "minimal"` и логами `warn/error`; query-логи в проде не включаем, чтобы не шуметь и не рисковать чувствительными данными в логах.

---

## 3. Docker-сборка

Корневые Dockerfile-ы лежат в `apps/api/Dockerfile` и `apps/web/Dockerfile`. Сборка идёт из корня репозитория — иначе pnpm-workspace не увидит `packages/shared`:

```bash
# API
docker build -f apps/api/Dockerfile -t ecoplatform-api:latest .

# Web (NEXT_PUBLIC_API_URL «зашивается» в бандл на build-time)
docker build \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.eco-platform.ru/api \
  -t ecoplatform-web:latest \
  .
```

Оба образа основаны на `node:24-alpine` + `tini` для корректной обработки SIGTERM.
Запуск — от пользователя `nodeapp` (не root).
Внутри API уже сконфигурированы Prisma `binaryTargets = ["native", "linux-musl-openssl-3.0.x", ...]`.

---

## 4. Миграции

При старте контейнера API в CMD прописано `pnpm prisma migrate deploy && node dist/main.js`. Это значит:

- На каждом старте проверяются и накатываются НОВЫЕ миграции. Уже применённые скипаются (idempotent).
- На rolling-deploy с несколькими репликами миграция идёт у того контейнера, который стартовал первым; второй увидит `No pending migrations` и продолжит.

### Rollback миграции
Prisma `migrate` — forward-only. Чтобы откатить, нужно:

1. Зайти в БД и вручную выполнить обратный SQL (`DROP COLUMN`, `ALTER TYPE` и т.п.).
2. Удалить запись в `_prisma_migrations` для откатываемой миграции.
3. Удалить папку миграции из `apps/api/prisma/migrations/`.
4. Перезапустить контейнер — он не найдёт «потерянную» миграцию и не упадёт.

### Правило: для каждой не-аддитивной миграции (drop/rename/тип) — заранее напишите ROLLBACK-черновик в `apps/api/prisma/migrations/_rollback/<timestamp>_<name>.sql`. Это сэкономит 30 минут при инциденте.

---

## 5. Бэкапы

Timeweb Managed Postgres делает автоматические снапшоты (стандартно — ежедневно). При создании кластера фиксируем:

- **Retention**: минимум 7 дней (рекомендуется 14).
- **Procedure**: восстановление из snapshot тестируется раз в квартал на отдельной dev-БД (поднять snapshot → подключить dev-API → пройти smoke-тест на login + listNews).
- **Ответственный**: записать конкретное имя/email в этом файле.

Дополнительно для критических точек (миграции, ручные правки) — `pg_dump` в S3 перед операцией:

```bash
pg_dump "$DATABASE_URL" | gzip > backup-$(date +%Y%m%d-%H%M).sql.gz
aws s3 cp backup-$(date +%Y%m%d-%H%M).sql.gz s3://ecoplatform-backups/
```

---

## 6. Health-check и пробы

API экспонирует два эндпоинта:

- `GET /api/health` → 200 всегда, пока процесс отвечает. **liveness**.
- `GET /api/ready` → 200 если Postgres-ping `SELECT 1` прошёл, 503 если нет. **readiness**.

Настройки для Timeweb Cloud Container:

| Параметр | Значение |
| --- | --- |
| Liveness path | `/api/health` |
| Liveness interval | 30 сек |
| Liveness timeout | 5 сек |
| Readiness path | `/api/ready` |
| Readiness interval | 10 сек |
| Readiness timeout | 5 сек |
| Initial delay | 10 сек (Prisma `$connect` укладывается) |

Эти эндпоинты вынесены из rate-limit (`@Throttle({ short: { limit: 0, ttl: 0 } })`), пробы не выбьют общий лимит.

---

## 7. Scheduler / cron

`apps/api/src/scheduler/scheduler.service.ts` — `@Cron(EVERY_HOUR)` для билинг-проверок.

- На одном инстансе работает «из коробки».
- При горизонтальном масштабировании поставьте `SCHEDULER_DISABLED=1` на «обычных» репликах и поднимите отдельный worker-контейнер без этой переменной.
- Альтернатива: вынести cron в Timeweb Cron Jobs (если используют его) и дёргать дедикейтед эндпоинт.

---

## 8. CDN и cache headers

Перед web-контейнером ставим CDN:

- **MVP-вариант**: Cloudflare Free перед доменом `app.eco-platform.ru`.
- **Timeweb-вариант**: Timeweb CDN перед web-инстансом, если он доступен в выбранной конфигурации.

Правила кеширования:

- HTML, `/api/*` и auth-роуты не кешируются на CDN.
- `/_next/static/*` Next.js отдаёт как immutable-ассеты с hash в имени файла; CDN должен уважать origin `Cache-Control`.
- Статичные файлы приложения из `apps/web/public/brand/*` и `apps/web/public/avatars/*` отдаются через `headers()` в `apps/web/next.config.ts` с `Cache-Control: public, max-age=31536000, immutable`.
- Пользовательские файлы идут через S3/CDN-домен из `S3_PUBLIC_BASE_URL`, а не через web-контейнер.

Если меняются файлы в `/brand` или `/avatars` без смены имени, при релизе нужно сделать purge соответствующих путей в CDN. Для новых публичных ассетов лучше добавлять версию в имени файла (`logo-v2.webp`) или переносить их в static import, чтобы Next.js сам дал hash.

---

## 9. Сжатие ответов

API включает Express middleware `compression()` в `apps/api/src/main.ts`. Он сжимает compressible-ответы при наличии `Accept-Encoding` у клиента: `br` для Brotli на поддерживаемых Node.js-версиях, `gzip`/`deflate` как fallback. Маленькие ответы ниже порога middleware могут уходить без `Content-Encoding`, это нормально.

Web-контейнер на `next start` оставляем с дефолтным `compress: true`: Next.js отдаёт gzip для rendered content и static files. Brotli для web-трафика включается на CDN/reverse-proxy слое (Cloudflare/Timeweb CDN/nginx). Если отдельный reverse-proxy полностью берёт gzip/Brotli на себя, тогда в `apps/web/next.config.ts` можно явно поставить `compress: false`, чтобы не делать двойную работу.

Проверка после деплоя:

```bash
curl -I -H 'Accept-Encoding: br,gzip' https://api.eco-platform.ru/api/news
curl -I -H 'Accept-Encoding: br,gzip' https://app.eco-platform.ru/
```

В ответе должен быть `Content-Encoding: br` или `Content-Encoding: gzip` для достаточно больших compressible-ответов.

---

## 10. CORS и cookie

- `WEB_ORIGIN` должен указывать на ПУБЛИЧНЫЙ URL фронта.
- На прод-домене (HTTPS) refresh-cookie получает флаги `HttpOnly + Secure + SameSite=lax + Path=/api/auth`.
- Если API и web на разных поддоменах одного корня (например, `api.eco-platform.ru` и `app.eco-platform.ru`), `SameSite=lax` работает. Если домены разные — нужен `SameSite=none + Secure`, поправить в `auth.controller.ts:setRefreshCookie`.

---

## 11. Чек-лист перед первым деплоем

- [ ] Прогнали `pnpm --filter @ecoplatform/api test:integration` против postgres:18 локально.
- [ ] Сгенерили новые `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` (НЕ переиспользуем dev-значения).
- [ ] Бакет S3 в Timeweb создан, его ключи добавлены в env-переменные API.
- [ ] CORS: `WEB_ORIGIN` подставлен.
- [ ] CDN перед web-доменом включён и уважает origin `Cache-Control`.
- [ ] CDN/reverse-proxy отдаёт `Content-Encoding: br` или `gzip` для web-ответов с `Accept-Encoding: br,gzip`.
- [ ] API отдаёт `Content-Encoding: br` или `gzip` для больших JSON/HTML-ответов с `Accept-Encoding: br,gzip`.
- [ ] `/brand/logo.webp` и `/avatars/*` отдают `Cache-Control: public, max-age=31536000, immutable`.
- [ ] Health-пробы настроены на `/api/health` и `/api/ready`.
- [ ] DNS и SSL-сертификаты Timeweb выпустил.
- [ ] Записан владелец бэкапов и расписание тестового восстановления.
- [ ] Прод-БД и dev/test-БД физически разные кластеры (или хотя бы разные db-имена).
- [ ] Команда знает rollback-процедуру миграции.
