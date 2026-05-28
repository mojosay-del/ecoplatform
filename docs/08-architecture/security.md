---
title: Политика безопасности
status: current
updated: 2026-05-26
source: PROJECT_STATUS.md
---

# Политика безопасности ЭкоПлатформы

Документ фиксирует текущие технические правила безопасности MVP. Он дополняет
`docs/08-architecture/deploy.md`, `docs/08-architecture/data-model.md` и
юридические документы платформы.

## 1. Область действия

Политика распространяется на:

- web-приложение `apps/web`;
- API `apps/api`;
- PostgreSQL-модель и Prisma-миграции;
- пользовательские файлы и S3-метаданные;
- административную панель, модерацию, биллинг и юридические флоу.

Владелец политики на MVP — администратор платформы. Перед публичным прод-запуском
нужно назначить конкретного security owner и рабочий адрес `security@eco-platform.ru`.

## 2. Пароли

### 2.1. Хранение

- Пароли пользователей и platform-staff хранятся только как `passwordHash`.
- Алгоритм: `bcryptjs`.
- Cost factor: `12`.
- Plaintext-пароль не логируется, не сохраняется в `AdminActionLog`, не попадает в
  экспорт данных и не возвращается API.

### 2.2. Политика новых паролей

Новые пароли проверяются общей схемой `passwordSchema` из `packages/shared/src/dto.ts`:

- минимум 12 символов;
- минимум одна буква;
- минимум одна цифра.

Схема используется в регистрации, смене пароля и создании platform-staff.
Для admin-staff дополнительно действует верхний предел 120 символов, чтобы не
создавать DoS-нагрузку на bcrypt.

### 2.3. Проверка утёкших паролей

`PasswordPolicyService` проверяет новые пароли через Have I Been Pwned Pwned
Passwords range API:

- на внешний API уходит только SHA-1 prefix из первых 5 символов hash;
- plaintext-пароль и полный hash наружу не отправляются;
- suffix сравнивается локально;
- используется `Add-Padding: true`;
- prefix-кеш живёт 1 час;
- таймаут по умолчанию 1500 мс;
- при недоступности внешнего API действует fail-open: пароль не блокируется,
  но warning пишется в лог.

Для offline/integration окружений проверка отключается через
`PWNED_PASSWORDS_CHECK_ENABLED=0`.

## 3. Токены и сессии

### 3.1. Access token

- Access token — JWT со сроком жизни 15 минут.
- На web-стороне access token хранится только в памяти React-приложения.
- `localStorage` и `sessionStorage` для access token не используются.
- После reload web восстанавливает сессию через refresh-cookie и `/auth/refresh`.

### 3.2. Refresh token

- Refresh token состоит из `sessionId` и случайного tail.
- В БД хранится только bcrypt-hash tail (`Session.refreshTokenHash`, cost 12).
- Cookie `refreshToken`:
  - `HttpOnly`;
  - `SameSite=Lax`;
  - `Secure` в production;
  - `Path=/api/auth`;
  - `Max-Age=30 дней`.
- Серверная валидность дополнительно контролируется `Session.expiresAt`:
  7 дней для обычной сессии и 30 дней для `rememberMe`.

### 3.3. JWT-секреты

`JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` обязательны. `bootstrap()` не запускает
API, если любой из секретов отсутствует или короче 32 символов. Продовые секреты
нужно генерировать отдельно и не переиспользовать dev/test значения.

## 4. Защита входа

- Login выполняет bcrypt-compare и для неизвестного email через dummy hash, чтобы
  не выдавать существование аккаунта по timing.
- Ошибка для неизвестного email и неверного пароля одинаковая:
  «Неверный email или пароль.»
- Lockout: 10 неудачных логинов за 15 минут блокируют вход на 15 минут.
- После успешного входа после истечения lockout счётчики сбрасываются.
- Успешный вход создаёт security-уведомление; новый User-Agent помечается как
  новое устройство.

## 5. Браузерные и HTTP-защиты

### 5.1. API headers

API подключает `helmet` в `apps/api/src/main.ts`.

Сознательные исключения:

- `contentSecurityPolicy: false` — CSP задаётся на web-стороне;
- `crossOriginEmbedderPolicy: false` — иначе ломаются iframe-видео Rutube.

### 5.2. Web headers

`apps/web/next.config.ts` добавляет глобально:

- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`;
- `Content-Security-Policy-Report-Only`.

CSP пока работает в report-only mode. Перевод в enforced mode делается после
наблюдения отчётов в Sentry/логах и проверки iframe/ассетов на прод-доменах.

### 5.3. CSRF

Для unsafe-методов действует double-submit cookie pattern:

- API выдаёт cookie `csrf-token` (`SameSite=Strict`, не `HttpOnly`, `Secure` в prod);
- web читает cookie или получает токен через `GET /api/auth/csrf`;
- web отправляет `X-CSRF-Token`;
- API сравнивает cookie и header.

Защищены `/auth/refresh` и все `POST/PATCH/DELETE/PUT` ручки. Исключения:
`POST /auth/login` и `POST /auth/register`, потому что там ещё нет сессионной
cookie.

## 6. Персональные данные и 152-ФЗ

### 6.1. Согласия

- Юридические документы версионируются через `LegalDocument`.
- Согласия пишутся в `ConsentRecord` с `source`, IP и user-agent.
- Регистрация требует принятия всех активных обязательных документов.
- `/auth/me.requiresReConsent` показывает, нужно ли заново принять обязательные
  документы после публикации новой версии.

### 6.2. Экспорт данных

`POST /api/auth/me/export-data` формирует ZIP-архив с JSON-файлами по профилю,
компании, согласиям, сессиям, уведомлениям, тикетам, прогрессу обучения,
комментариям, реакциям, модерации, FileAsset metadata, авторскому контенту и
audit-log.

Экспорт не включает:

- `passwordHash`;
- `refreshTokenHash`;
- `providerToken`;
- `keyHash`;
- plaintext-секреты.

Ответ отдаётся с `Cache-Control: no-store`.

### 6.3. Запрос удаления аккаунта

`POST /api/auth/me/request-deletion`:

- ставит `User.deletionRequestedAt`;
- переводит компанию в `pending_deletion`;
- сохраняет прежний статус компании в `statusBeforeDeletion`;
- отзывает остальные сессии пользователя;
- создаёт security-уведомление.

`POST /api/auth/me/cancel-deletion` отменяет запрос. Ночной cron
`cleanup-deleted-accounts` удаляет пользователей с заявкой старше 30 дней,
чистит orphan-`FileAsset` metadata и удаляет компанию, если пользователей больше
нет.

## 7. Файлы и пользовательский контент

- `FilesService.upload()` проверяет реальный MIME через magic-number (`file-type`).
- HTML, SVG и executable-типы блокируются.
- При несовпадении declared MIME и detected MIME сервер доверяет detected MIME.
- Non-media файлы кладутся в S3 с `Content-Disposition: attachment`.
- `/files?ids=...` возвращает только `FileAsset.accessLevel = public`.
- Для cover-image news/learning/knowledge create/update можно использовать только
  существующее публичное изображение; content-manager может ставить только свой
  upload, admin может ставить чужое публичное изображение.
- File upload ограничен endpoint throttle 20 запросов/минуту и дневной квотой
  500 МБ на компанию.

## 8. Audit trail

`AdminActionLog` — основной журнал административных действий.

Для критических change-событий используется единый формат:

```json
{
  "before": { "status": "demo" },
  "after": { "status": "active" },
  "diff": {
    "status": { "before": "demo", "after": "active" }
  }
}
```

Before/after подключён к:

- ручной активации подписки;
- block/unblock пользователей;
- изменению platform-roles;
- обновлению platform-staff;
- настройкам платформы;
- смене статуса компании;
- admin-санкциям модерации, включая `module_restriction`.

`/admin/journals` отображает diff как «старое -> новое»: старое значение красным,
новое зелёным. Legacy payload остаётся читаемым JSON.

## 9. Логи, уведомления и секреты

- `GlobalExceptionFilter` логирует 5xx как error со stack trace, 4xx как warn.
- Silent-catch сценарии используют `swallowAndLog(context, payload)`.
- Категории уведомлений `security` и `billing` не отключаются пользователем.
- В логах и уведомлениях запрещено хранить plaintext-пароли, refresh-token tail,
  JWT-секреты, S3 secret key, provider tokens и API key secrets.
- Для `ApiKey` хранится только bcrypt hash секрета.
- Для платежей модель хранит `cardMask` и provider token; PAN/CVV не хранятся.

## 10. Операционные правила

Перед прод-деплоем обязательны:

- новые `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET`;
- TLS к PostgreSQL (`sslmode=require`);
- отдельные prod/dev/test БД;
- S3 bucket с отдельными prod-ключами;
- health/readiness probes;
- бэкапы и тест восстановления;
- smoke `GET /api/health`, `GET /api/ready`, `GET /auth/csrf`;
- проверка security headers на web и API;
- проверка `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm build`;
- dependency audit перед релизом (`pnpm audit --prod`) и разбор новых CVE.

## 11. Responsible disclosure

### 11.1. Канал связи

Основной канал после публичного запуска: `security@eco-platform.ru`.

До публичного запуска адрес нужно создать, привязать к ответственному владельцу и
проверить доставку. В MVP/dev окружении временный резервный канал — обращение в
поддержку платформы или `support@ecoplatform.local`.

### 11.2. Что присылать в отчёте

В отчёте о проблеме безопасности нужны:

- краткое описание;
- затронутый URL/API endpoint;
- шаги воспроизведения;
- ожидаемый и фактический результат;
- оценка влияния;
- минимальный proof-of-concept без доступа к чужим данным;
- test account / company id, если использовались;
- контакт для обратной связи.

### 11.3. Правила безопасного исследования

Разрешено:

- проверять собственные аккаунты и тестовые данные;
- отправлять минимальные PoC-запросы;
- показывать impact без массового сбора данных.

Запрещено:

- читать, изменять или удалять чужие данные;
- пытаться получить persistence;
- выполнять DDoS, spam, brute force или resource exhaustion;
- проводить social engineering, phishing или physical attack;
- публиковать детали до согласованного исправления;
- требовать выкуп за неразглашение.

### 11.4. Обработка отчётов

Целевые сроки для публичного запуска:

| Этап | Срок |
| --- | --- |
| Первичный ответ | до 3 рабочих дней |
| Триаж и severity | до 7 рабочих дней |
| Critical fix | до 72 часов после подтверждения |
| High fix | до 14 дней после подтверждения |
| Medium/Low | ближайший плановый релиз |

До запуска публичной программы bounty не выплачивается. Добросовестные отчёты,
которые соблюдают правила выше, считаются coordinated disclosure.

### 11.5. Координированная публикация

Публичное раскрытие возможно после исправления и проверки фикса либо по отдельной
договорённости. Базовый ориентир — не раньше 90 дней после подтверждения, если
не согласован другой срок.

## 12. Перед переводом CSP в enforced mode

1. Включить сбор CSP report в Sentry или отдельный endpoint.
2. Проверить реальные домены API, S3/CDN, Rutube и analytics.
3. Убрать лишние `unsafe-inline`, если UI и Next.js bundle позволяют.
4. Прогнать smoke по `/login`, `/news`, `/education`, `/account`, `/admin/journals`.
5. Перевести `Content-Security-Policy-Report-Only` в enforced
   `Content-Security-Policy` отдельным коммитом.
