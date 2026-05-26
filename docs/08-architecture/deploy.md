---
title: Деплой на Timeweb Cloud
status: draft
updated: 2026-05-27
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

## 4. Миграции и rollback-runbook

При старте контейнера API в CMD прописано `pnpm prisma migrate deploy && node dist/main.js`. Это значит:

- На каждом старте проверяются и накатываются НОВЫЕ миграции. Уже применённые скипаются (idempotent).
- На rolling-deploy с несколькими репликами миграция идёт у того контейнера, который стартовал первым; второй увидит `No pending migrations` и продолжит.

Prisma `migrate deploy` используется только для staging/prod. Он накатывает ожидающие миграции и не делает reset базы.

### Перед каждой prod-миграцией

1. Остановить новый deploy, если предыдущий ещё не полностью зелёный.
2. Проверить, что последний nightly backup есть в Timeweb и ежедневный `pg_dump` ушёл в S3.
3. Сделать ручной `pg_dump` по инструкции ниже и подписать файл номером релиза.
4. Для не-аддитивных миграций (drop/rename/тип) заранее написать rollback-черновик SQL в тикете релиза. В репозиторий его не кладём, если он содержит продовые имена, данные или ручные команды под конкретный инцидент.
5. Выполнить deploy только после зелёного `pnpm test:integration` на staging.

### Если миграция упала

1. Не перезапускать API в цикле и не удалять строки из `_prisma_migrations` руками.
2. Перевести web в maintenance-режим или временно остановить mutating-трафик на API.
3. Зафиксировать имя миграции и ошибку:

   ```bash
   cd apps/api
   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec prisma migrate status --schema=prisma/schema.prisma
   ```

4. Если миграция успела частично изменить схему, восстановить prod-БД из последнего проверенного backup на отдельный новый кластер/БД и прогнать smoke на нём. Менять `DATABASE_URL` прода на восстановленный кластер только после проверки `/api/ready`, login и ключевых листингов.
5. Если причина понятна и частичные изменения вручную отменены или база восстановлена до безопасного состояния, пометить именно упавшую миграцию как rolled back:

   ```bash
   cd apps/api
   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec prisma migrate resolve --rolled-back "<migration_name>" --schema=prisma/schema.prisma
   ```

6. Исправить миграцию новым коммитом или заменить релиз на предыдущий образ. После этого снова запустить:

   ```bash
   cd apps/api
   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
   ```

`prisma migrate resolve --rolled-back` применяем только к неуспешной миграции. Если миграция уже успешно применена, откат делаем либо новой forward-миграцией, либо восстановлением всей БД из backup на отдельный кластер.

---

## 5. Бэкапы

Цель для MVP: пережить ошибочную миграцию, случайное удаление данных и сбой кластера без потери больше суток данных.

### Политика

- **Managed backup Timeweb**: физический backup кластера каждый день, хранить 30 копий/дней. Если панель на выбранном тарифе ограничивает количество копий, ставим максимум и отдельно держим manual S3 backup 90 дней.
- **Manual backup**: ежедневный `pg_dump -x --no-owner` в приватный Timeweb Cloud Storage bucket, retention 90 дней через lifecycle rule.
- **Перед миграцией**: отдельный manual `pg_dump` с префиксом `pre-migration/`.
- **Проверка восстановления**: один раз в месяц восстановить последний S3 dump на dev/staging-БД и пройти smoke: `/api/ready`, login, `/news`, `/indices`, `/account`.
- **Ответственный**: владелец backup-процесса фиксируется в продовом runbook вместе с доступом к Timeweb-панели и приватному bucket.

### Timeweb Managed PostgreSQL

В панели Timeweb:

1. Открыть `Базы данных` → prod-кластер PostgreSQL.
2. На вкладке `Бэкапы` включить автоматические физические бэкапы.
3. Поставить ежедневное расписание и 30 хранимых копий/дней.
4. После первого backup создать test-restore в отдельный кластер или БД и не переключать prod, пока smoke не зелёный.

Физический backup нужен для быстрого восстановления всего кластера. Логические backups Timeweb пока не считаем единственным способом защиты: они полезны как дополнительная копия, но для нашего runbook базовый независимый слой — собственный `pg_dump` в S3.

### Daily pg_dump в Timeweb Cloud Storage

Запускать с отдельного ops-runner/cron-хоста, а не из API-контейнера. В логах не печатать `DATABASE_URL`, S3 secret и полный вывод `pg_dump`.

```bash
export PROD_DATABASE_URL="postgresql://USER:PASS@HOST:6432/DB?schema=public&sslmode=require"
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_DEFAULT_REGION="ru-1"
export AWS_ENDPOINT_URL="https://s3.twcstorage.ru"
export BACKUP_BUCKET="s3://ecoplatform-backups/prod-postgres"

backup_file="ecoplatform-prod-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

pg_dump -x --no-owner "$PROD_DATABASE_URL" | gzip -9 > "$backup_file"
aws s3 cp "$backup_file" "$BACKUP_BUCKET/daily/$backup_file" --endpoint-url "$AWS_ENDPOINT_URL"
rm -f "$backup_file"
```

Cron, каждый день в 02:15 UTC:

```cron
15 2 * * * /opt/ecoplatform/bin/backup-postgres-to-s3 >> /var/log/ecoplatform/postgres-backup.log 2>&1
```

S3 lifecycle для retention 90 дней:

```json
{
  "Rules": [
    {
      "ID": "delete-prod-postgres-backups-after-90-days",
      "Status": "Enabled",
      "Filter": { "Prefix": "prod-postgres/" },
      "Expiration": { "Days": 90 }
    }
  ]
}
```

Применение:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket ecoplatform-backups \
  --lifecycle-configuration file://lifecycle-backups-90d.json \
  --endpoint-url https://s3.twcstorage.ru
```

### Восстановление из manual S3 backup

Восстанавливаем сначала на отдельную пустую БД или новый Timeweb-кластер. Прямое восстановление поверх prod разрешено только после отдельного подтверждения владельца проекта.

```bash
export RESTORE_DATABASE_URL="postgresql://USER:PASS@HOST:6432/RESTORE_DB?schema=public&sslmode=require"
export AWS_ENDPOINT_URL="https://s3.twcstorage.ru"

aws s3 cp \
  s3://ecoplatform-backups/prod-postgres/daily/ecoplatform-prod-YYYYMMDDTHHMMSSZ.sql.gz \
  ./restore.sql.gz \
  --endpoint-url "$AWS_ENDPOINT_URL"

gzip -dc ./restore.sql.gz | psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1

cd apps/api
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm exec prisma migrate status --schema=prisma/schema.prisma
```

После restore:

- `GET /api/ready` должен вернуть 200.
- Login admin/demo должен пройти.
- `/news` и `/indices` должны вернуть данные.
- Если restore нужен для prod, сначала переключить staging/API на восстановленную БД, затем уже менять prod `DATABASE_URL`.

---

## 6. Health-check и пробы

API экспонирует три эндпоинта:

- `GET /api/health` → 200 всегда, пока процесс отвечает. **liveness**.
- `GET /api/ready` → 200 если Postgres, Redis и S3 готовы к работе, 503 если обязательная зависимость недоступна. **readiness**.
- `GET /api/health/deep` → детальная диагностика для админа: uptime процесса, latency Postgres, режим Redis, S3 bucket/endpoint без секретов.

Redis остаётся graceful fallback: если `REDIS_URL` не задан, readiness не падает и показывает `configured=false`. Если `REDIS_URL` задан, но `PING` не проходит, `/api/ready` возвращает 503. S3 вне production можно не задавать, но в production отсутствие S3-настроек считается ошибкой readiness.

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

Эти эндпоинты вынесены из rate-limit (`@SkipThrottle`), пробы не выбьют общий лимит.

---

## 7. Алерты

Цель MVP: не ждать ручной проверки логов. Прод должен сам сообщать о всплеске 5xx, высокой задержке API, проблемах с session-cache и приближении к лимиту соединений Postgres.

### Sentry

В Sentry настройте alert rule для API-проекта:

- Условие: больше 10 error events за 1 минуту.
- Фильтр: production environment. API уже отправляет в Sentry только 5xx и process-level сбои, поэтому 4xx не шумят.
- Канал: Telegram-чат команды или email `alerts@...`.
- Повтор: не чаще 1 раза в 30 минут, авто-resolve при исчезновении события.

Для web-проекта включите отдельный rule на render errors: больше 5 событий за 5 минут, канал тот же, severity `warning`. Это не блокирует деплой, но помогает быстро увидеть сломанную клиентскую страницу.

### Prometheus + Alertmanager

Правила лежат в [ops/monitoring/ecoplatform-alerts.yml](../../ops/monitoring/ecoplatform-alerts.yml):

- `EcoplatformApiHigh5xxRate` — 5xx больше 10 в минуту.
- `EcoplatformApiHighP95Latency` — p95 latency выше 1 секунды 5 минут.
- `EcoplatformAuthCacheHitRateLow` — hit rate session-cache ниже 50% 10 минут.
- `EcoplatformDatabaseConnectionsHigh` — занято больше 80% Postgres-соединений 5 минут.

`/api/metrics` должен скрапиться Prometheus с Basic Auth из `METRICS_BASIC_USER` / `METRICS_BASIC_PASSWORD`. В Prometheus добавьте rules-файл:

```yaml
rule_files:
  - /etc/prometheus/rules/ecoplatform-alerts.yml
```

Проверка правил перед деплоем:

```bash
promtool check rules /etc/prometheus/rules/ecoplatform-alerts.yml
```

Пример Alertmanager-конфига лежит в [ops/monitoring/alertmanager.example.yml](../../ops/monitoring/alertmanager.example.yml). Реальный `ops/monitoring/alertmanager.yml` не коммитим: он в `.gitignore`, а SMTP-пароль, Telegram bot token и chat id читаются из secret-файлов `/run/secrets/...`.

Проверка Alertmanager-конфига перед стартом:

```bash
amtool check-config /etc/alertmanager/alertmanager.yml
```

Smoke после подключения:

```bash
curl -fsS -u "$METRICS_BASIC_USER:$METRICS_BASIC_PASSWORD" \
  https://api.eco-platform.ru/api/metrics | rg "http_request_duration_seconds|auth_cache_hit_total|db_connections"
```

---

## 8. Scheduler / cron

`apps/api/src/scheduler/scheduler.service.ts` — `@Cron(EVERY_HOUR)` для билинг-проверок.

- На одном инстансе работает «из коробки».
- При горизонтальном масштабировании поставьте `SCHEDULER_DISABLED=1` на «обычных» репликах и поднимите отдельный worker-контейнер без этой переменной.
- Альтернатива: вынести cron в Timeweb Cron Jobs (если используют его) и дёргать дедикейтед эндпоинт.

---

## 9. CDN и cache headers

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

## 10. Сжатие ответов

API включает Express middleware `compression()` в `apps/api/src/main.ts`. Он сжимает compressible-ответы при наличии `Accept-Encoding` у клиента: `br` для Brotli на поддерживаемых Node.js-версиях, `gzip`/`deflate` как fallback. Маленькие ответы ниже порога middleware могут уходить без `Content-Encoding`, это нормально.

Web-контейнер на `next start` оставляем с дефолтным `compress: true`: Next.js отдаёт gzip для rendered content и static files. Brotli для web-трафика включается на CDN/reverse-proxy слое (Cloudflare/Timeweb CDN/nginx). Если отдельный reverse-proxy полностью берёт gzip/Brotli на себя, тогда в `apps/web/next.config.ts` можно явно поставить `compress: false`, чтобы не делать двойную работу.

Проверка после деплоя:

```bash
curl -I -H 'Accept-Encoding: br,gzip' https://api.eco-platform.ru/api/news
curl -I -H 'Accept-Encoding: br,gzip' https://app.eco-platform.ru/
```

В ответе должен быть `Content-Encoding: br` или `Content-Encoding: gzip` для достаточно больших compressible-ответов.

---

## 11. CORS и cookie

- `WEB_ORIGIN` должен указывать на ПУБЛИЧНЫЙ URL фронта.
- На прод-домене (HTTPS) refresh-cookie получает флаги `HttpOnly + Secure + SameSite=lax + Path=/api/auth`.
- CSRF-защита использует double-submit: API выдаёт cookie `csrf-token` (`Secure + SameSite=Strict + Path=/`, не HttpOnly), web читает cookie там, где домен это позволяет, либо получает токен через `GET /api/auth/csrf`, затем шлёт его в `X-CSRF-Token` на `/auth/refresh`, `/auth/logout`, `/auth/change-password` и все `POST/PATCH/DELETE` ручки, кроме `/auth/login` и `/auth/register`.
- CORS должен пропускать заголовки `Authorization`, `Idempotency-Key` и `X-CSRF-Token`.
- Если API и web на разных поддоменах одного корня (например, `api.eco-platform.ru` и `app.eco-platform.ru`), `SameSite=lax` работает. Если домены разные — нужен `SameSite=none + Secure`, поправить в `auth.controller.ts:setRefreshCookie`.

---

## 12. Чек-лист перед первым деплоем

- [ ] Прогнали `pnpm --filter @ecoplatform/api test:integration` против postgres:18 локально.
- [ ] Сгенерили новые `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` (НЕ переиспользуем dev-значения).
- [ ] Бакет S3 в Timeweb создан, его ключи добавлены в env-переменные API.
- [ ] CORS: `WEB_ORIGIN` подставлен.
- [ ] CSRF smoke: `GET /api/auth/csrf` отдаёт `csrf-token`, а mutating-запрос без `X-CSRF-Token` получает 403.
- [ ] CDN перед web-доменом включён и уважает origin `Cache-Control`.
- [ ] CDN/reverse-proxy отдаёт `Content-Encoding: br` или `gzip` для web-ответов с `Accept-Encoding: br,gzip`.
- [ ] API отдаёт `Content-Encoding: br` или `gzip` для больших JSON/HTML-ответов с `Accept-Encoding: br,gzip`.
- [ ] `/brand/logo.webp` и `/avatars/*` отдают `Cache-Control: public, max-age=31536000, immutable`.
- [ ] Health-пробы настроены на `/api/health` и `/api/ready`.
- [ ] Sentry alerts включены для API 5xx и web render errors.
- [ ] Prometheus загружает `ops/monitoring/ecoplatform-alerts.yml`, Alertmanager отправляет critical-alerts в Telegram/email.
- [ ] DNS и SSL-сертификаты Timeweb выпустил.
- [ ] Timeweb physical backups включены: daily, 30 копий/дней или максимум тарифа.
- [ ] Daily `pg_dump` уходит в приватный S3 bucket, lifecycle удаляет `prod-postgres/` через 90 дней.
- [ ] Последний S3 dump восстановлен на dev/staging-БД и прошёл smoke.
- [ ] Записан владелец бэкапов, доступы к панели и расписание тестового восстановления.
- [ ] Прод-БД и dev/test-БД физически разные кластеры (или хотя бы разные db-имена).
- [ ] Команда знает rollback-процедуру миграции и не правит `_prisma_migrations` руками.
