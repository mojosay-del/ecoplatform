# Production — как ЭкоПлатформа развёрнута и как её обновлять

**Статус: задеплоено в прод (2026-05-30).** Сайт: **https://ecoplatform.pro**

Это канонический и единственный документ по проду. Timeweb App Platform
**не использовался**: его сборщик оказался нестабильным с монорепо (баги
контекста сборки, клонирования и режимов), поэтому развёрнуто на обычном VPS со
стандартным `docker compose`.

## Где и что работает

| Компонент | Что | Где |
|---|---|---|
| **VPS** | Ubuntu 24.04 + Docker (Timeweb «Облачные серверы», образ Docker из маркетплейса) | публичный IP `81.200.158.7`, приватная сеть «Polite Waxwing» `192.168.0.0/24` |
| **Домен** | `ecoplatform.pro` → A-запись на `81.200.158.7`; HTTPS автоматически (Caddy + Let's Encrypt) | — |
| **Контейнеры** | `caddy` (80/443) + `web` (Next.js :3000) + `api` (NestJS :4000) + `redis` | на VPS, через `docker-compose.prod.yml` |
| **БД** | Timeweb Managed PostgreSQL, БД `ecoplatform_db`, пользователь `gen_user` | приватный хост `192.168.0.5:5432` (та же сеть, что VPS) |
| **S3** | Timeweb Cloud Storage (файлы/обложки) | `s3.twcstorage.ru` |

- Репозиторий на сервере: **`/root/ecoplatform`** (склонирован с GitHub).
- Секреты: **`/root/ecoplatform/deploy/.env.prod`** — НЕ в git (gitignored),
  перенесён на сервер через `scp`. Там `DATABASE_URL`, `JWT_*`, `S3_*`, `SMTP_*`
  и другие runtime-секреты.
- Маршрутизация (Caddy, `deploy/Caddyfile`): `ecoplatform.pro/api/*` → `api:4000`,
  всё остальное → `web:3000` (один origin, без CORS).

## Security headers

Внешняя точка входа для прода — Caddy. Он задаёт baseline security-заголовков
для всех ответов (`Strict-Transport-Security`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`) через default-режим:
если upstream уже выставил свой заголовок, Caddy его не перетирает.

- **Web (Next.js):** CSP и web-специфичные security headers задаются в
  `apps/web/next.config.ts`; Caddy остаётся страховочным слоем.
- **API (NestJS):** Helmet остаётся приложенческим слоем, но CSP в API
  выключен осознанно (`contentSecurityPolicy:false`), поэтому Caddy добавляет
  строгую fallback-CSP только на `/api/*`.

Ручная проверка после деплоя:
```bash
curl -I https://ecoplatform.pro
curl -I https://ecoplatform.pro/api/health
```

## Особенности сборки (почему так)

Docker Hub и CDN Alpine режутся/блокируются из РФ, поэтому:
- **Базовые образы** тянутся через зеркало `dockerhub.timeweb.cloud` — на VPS
  это настроено в демоне Docker: `/etc/docker/daemon.json` →
  `{ "registry-mirrors": ["https://dockerhub.timeweb.cloud"] }`.
- **Alpine-пакеты** (`apk`) — через `mirror.yandex.ru` (зашито в Dockerfile'ах).

Прочие неочевидные решения (зафиксированы в комментариях `Dockerfile.api`):
- Dockerfile'ы лежат в **корне** репозитория (`Dockerfile.api/.web/.proxy`) —
  контекст сборки = корень монорепо.
- `Dockerfile.api` ставит `prisma` и `ts-node` **глобально** и в рантайме
  сохраняет структуру pnpm (`node_modules` + `apps/api` + `packages/shared`),
  запуск из `/app/apps/api` — иначе не резолвятся симлинки зависимостей и
  бинарей. Старт: `prisma migrate deploy && node dist/main.js`.

---

## 🔄 Как выкатывать обновления

Любое изменение (код, дизайн, схема БД) попадает в прод так:

**1. Локально (ноутбук):** правишь → коммит → `git push origin main`.

Если в коммите изменился `deploy/.env.prod.example`, сначала синхронизируй
реальный `/root/ecoplatform/deploy/.env.prod` на сервере. Этот файл не в git,
поэтому новые обязательные секреты сами туда не попадут.

**2. На сервере:**
```bash
ssh root@81.200.158.7
cd /root/ecoplatform
git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker image prune -f   # снять untagged-образы от прошлого деплоя (кэш не трогаем)
```
`up -d --build` пересоберёт изменённые образы и перезапустит контейнеры.
При старте `api` сам прогонит `prisma migrate deploy` — **новые миграции
применятся автоматически**. `docker image prune -f` сразу убирает образы
прошлого деплоя (рабочие и build-cache не затрагивает).

> **Диск.** Каждый `--build` копит образы и build-cache. Чтобы VPS не забивался,
> на сервере стоит еженедельный cron (вс 04:00):
> `docker builder prune -f --keep-storage=10GB && docker image prune -af`
> — срезает build-cache до 10 ГБ (свежий кэш для быстрых сборок остаётся) и
> удаляет старые образы. Контейнеры не трогает. Разовая ручная чистка при
> необходимости: `docker system prune -af` (БЕЗ `--volumes` — там данные).

**3. Проверка:**
```bash
docker compose -f docker-compose.prod.yml ps                 # все Up?
docker compose -f docker-compose.prod.yml logs --tail=40 api # миграции + Nest started
curl -s localhost:4000/api/ready                             # зависимости ok?
```

> Полезно: сборка идёт несколько минут — можно запускать в фоне, чтобы не
> зависеть от обрыва SSH:
> `nohup docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build > /root/build.log 2>&1 &`
> и смотреть `tail -f /root/build.log`.

---

## 🛡️ Как НЕ сломать базу при обновлениях

Главное правило: **схему БД меняем только через миграции Prisma, прод их только
ПРИМЕНЯЕТ (`migrate deploy`), и перед изменениями схемы — делаем бэкап.**

**1. Бэкап перед изменениями схемы.** В кластере БД Timeweb → вкладка «Бэкапы»
включи расписание (ежедневно). Перед деплоем, который меняет схему, сделай
бэкап **вручную** (кнопка в панели). Это страховка для отката.

**2. Поток изменения схемы:**
- Локально: правишь `apps/api/prisma/schema.prisma` →
  `pnpm --filter @ecoplatform/api prisma migrate dev --name краткое_имя`
  (создаёт файл миграции в `apps/api/prisma/migrations/`).
- Прогоняешь тесты (`pnpm test:integration`), коммитишь миграцию **вместе с кодом**.
- `git push` → на сервере `git pull && docker compose ... up -d --build` →
  `api` применит миграцию через `prisma migrate deploy`.

**3. Чего НЕЛЬЗЯ делать в проде:**
- ❌ `prisma migrate dev` и `prisma migrate reset` — это для разработки;
  `reset` **стирает данные**. Прод выполняет ТОЛЬКО `migrate deploy` (он
  применяет уже готовые миграции, без потери данных).
- ❌ Редактировать/удалять **уже применённую** миграцию. Любое изменение схемы —
  это НОВАЯ миграция.

**4. Делай миграции безопасными (expand → contract).** Чтобы старый и новый код
пережили момент деплоя:
- сначала **добавляй** (новые таблицы/колонки — nullable или с default),
- разворачивай код,
- при необходимости позже отдельной миграцией ужесточай (NOT NULL и т.п.).
Избегай в одной миграции «удалить колонку, на которую ещё смотрит старый код».

**5. Откат, если миграция всё же сломала прод:**
1. восстанови БД из бэкапа (п.1);
2. верни прошлую версию кода: `git checkout <предыдущий_коммит>` →
   `docker compose ... up -d --build`.
Prisma-миграции не откатываются автоматически — поэтому бэкап обязателен.

---

## Разовые операции (уже выполнены при первом запуске)

```bash
# Юр-документы (нужны для регистрации/согласий):
docker compose -f docker-compose.prod.yml exec api ts-node --transpile-only prisma/seed.ts

# Сделать первого админа (ТОЛЬКО на чистой базе — удаляет прочих пользователей):
docker compose -f docker-compose.prod.yml exec -e PROMOTE_FIRST_ADMIN_WRITE=1 api \
  ts-node --transpile-only prisma/scripts/promote-first-admin.ts
```
Владелец-админ: `mojosay@icloud.com` (он же `PLATFORM_OWNER_EMAIL` — защищён от
снятия admin/блокировки).

## Диагностика

```bash
docker compose -f docker-compose.prod.yml ps                  # статусы
docker compose -f docker-compose.prod.yml logs -f api         # лог API (миграции, ошибки БД)
docker compose -f docker-compose.prod.yml logs -f caddy       # HTTPS-сертификат, проксирование
docker compose -f docker-compose.prod.yml restart api         # перезапустить один сервис
curl -s localhost:4000/api/ready                              # readiness (БД/Redis/S3)
```

Частые причины:
- **api в `Restarting`** → смотри `logs api`: ошибка БД (`P1001`/SSL) или модуль не найден.
- **Нет HTTPS** → DNS не указывает на сервер или закрыты порты 80/443.
- **Пустые согласия / нет регистрации** → не выполнен `seed`.
- **Сайт стоит, вход → «Внутренняя ошибка сервера» (500), контейнеры `Up`** →
  в `logs api` видно `permission denied for table ...` (PostgreSQL `42501`).
  Это **сброс прав пользователя БД** на стороне Timeweb (см. ниже).

---

## ⚠️ Инцидент: сброс прав БД и авто-восстановление

**Симптом.** Все контейнеры `Up`, диск/память в норме, но любой запрос к базе
падает с 500, в логах `api`: `permission denied for table User/Session/...`
(код `42501`). Происходит **без деплоя** (например, ночью).

**Причина.** На управляемой БД Timeweb у пользователя `gen_user` снимаются права
на таблицы (`REVOKE ALL` где-то на стороне провайдера). В каталоге PostgreSQL у
таблиц `relacl` становится `{}` (права обнулены даже у владельца) вместо `NULL`
(владелец имеет всё по умолчанию). Источник — не код и не VPS (проверено: в репо
нет `REVOKE`, на сервере нет cron/истории с такими командами).

**Ручное восстановление** (gen_user — владелец таблиц, поэтому может выдать права
сам себе; данные/схему не трогает):
```bash
cd /root/ecoplatform
DBURL=$(grep '^DATABASE_URL=' deploy/.env.prod | cut -d= -f2-)
CLEAN="${DBURL%%\?*}?sslmode=require"
docker run --rm -i --network host postgres:16-alpine psql "$CLEAN" <<'SQL'
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gen_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gen_user;
SQL
```

**Авто-восстановление (установлено).** На сервере стоит cron-задача, которая
каждые 2 минуты проверяет доступ и при сбросе прав возвращает их — сайт чинится
сам за пару минут. Скрипт: [`deploy/ensure-grants.sh`](ensure-grants.sh) +
[`deploy/ensure-grants.sql`](ensure-grants.sql) (идемпотентны).
```bash
# проверить статус последней проверки:
cat /root/ensure-grants.last        # OK / REPAIRED / ERROR + время
cat /root/ensure-grants.log         # история починок (если права снова снимали)
crontab -l                          # должна быть строка с ensure-grants.sh
```
Если в `ensure-grants.log` появляются записи `REPAIRED` — права снимаются
регулярно; стоит написать в поддержку Timeweb (приложить лог), чтобы выяснить,
что на стороне кластера сбрасывает привилегии `gen_user`.
