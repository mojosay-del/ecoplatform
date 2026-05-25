# Этап 2 — Стабильность

Покрыто: обработка ошибок, транзакции Prisma, race conditions, scheduler, graceful shutdown, health-check.

---

## 🔴 P0 — критичные

### 1. Дамп `passwordHash` всех пользователей в `GET /api/admin/billing/companies` ✅ DONE 2026-05-24
> `billing.service.ts:listCompanies()` теперь использует `select` с явным белым списком полей юзера (`id, firstName, lastName, email, phone, status, createdAt`). passwordHash больше не выходит на провод.
- **Где**: [apps/api/src/billing/billing.service.ts:30](apps/api/src/billing/billing.service.ts#L30) — `include: { users: true, ... }`.
- **Что**: Prisma `include: { users: true }` возвращает ВСЕ поля связанной таблицы, включая `passwordHash`. Эндпоинт защищён `@Roles("admin")`, но это значит: любой человек с правами admin получает дамп bcrypt-хешей паролей всех пользователей. Также — если access-токен админа когда-нибудь утечёт (см. Этап 1, P0 #3 про localStorage), это сразу всех пользователей сливает в офлайн-перебор.
- **Чем чинить**: заменить на `include: { users: { select: { id: true, firstName: true, lastName: true, email: true, status: true } }, ... }`. (Это одна из системных проблем «по умолчанию` include: true `вытащит passwordHash» — стоит провести аудит всех `include` по проекту, см. ниже).

> Технически это утечка данных (Stage 1: Security), но обнаружено при поиске «что роняет приложение». Дублирую в обоих отчётах.

### 2. Нет graceful shutdown — Prisma-соединения теряются ✅ DONE 2026-05-24
> `main.ts` вызывает `app.enableShutdownHooks()` после `enableCors`. На SIGTERM NestJS теперь корректно зовёт `onModuleDestroy` (PrismaService `$disconnect`).
- **Где**: [apps/api/src/main.ts](apps/api/src/main.ts).
- **Что**: при `SIGTERM` (Timeweb обновляет/перезапускает контейнер) Nest НЕ зовёт `onModuleDestroy()` без `app.enableShutdownHooks()`. Postgres-соединения остаются висеть в БД до таймаута. При rolling-deploy за 10 минут можно упереть в `max_connections`.
- **Чем чинить**: в `bootstrap()` добавить `app.enableShutdownHooks()`.

### 3. Race condition при создании учебного модуля ✅ DONE 2026-05-24
> Логика вынесена в `createLearningModuleWithNextPosition()` (`content.service.ts`). Внутри — `$transaction(async tx => { aggregate; create; })` с ретраем (до 5 попыток) при `Prisma.PrismaClientKnownRequestError.code === "P2002"`. Параллельные create перетыкают позицию, а не падают 500-кой.
- **Где**: [apps/api/src/content/content.service.ts:974–987](apps/api/src/content/content.service.ts#L974).
  ```ts
  const lastPosition = await this.prisma.learningModule.aggregate({ _max: { position: true } });
  const module = await this.prisma.learningModule.create({ data: { ..., position: (lastPosition._max.position ?? -1) + 1 } });
  ```
  `LearningModule.position` имеет `@unique` ([schema.prisma:377](apps/api/prisma/schema.prisma#L377)).
- **Что**: два админа одновременно создают модуль → оба читают max=N → оба пишут position=N+1 → один получит `Unique constraint violation` (Prisma P2002) → клиент получит 500 без полезного сообщения.
- **Чем чинить**:
  - либо обернуть `aggregate + create` в `$transaction` с `Serializable` isolation;
  - либо смотреть в сторону `position = epoch()` + ручной reorder;
  - либо ретраить операцию при P2002 в admin-only endpoint.

---

## 🟡 P1 — серьёзные

### 4. Все промахи `notifications.createInApp` молча подавляются ✅ DONE 2026-05-25
> Создан хелпер `swallowAndLog(context, payload)` в `common/silent-catch.ts`. Заменены 13 `.catch(() => undefined)` в auth, support, billing, billing-notifications, moderation. Теперь подавленные ошибки попадают в `Logger("SilentCatch")` с контекстом и доп. payload (userId, ticketId, …).
- **Где**: 13+ мест, все `await ... .catch(() => undefined)`. Примеры:
  - [auth.service.ts:83, 130](apps/api/src/auth/auth.service.ts#L83)
  - [support.service.ts:36, 76, 95](apps/api/src/support/support.service.ts#L36)
  - [billing.service.ts:96](apps/api/src/billing/billing.service.ts#L96)
  - [billing-notifications.service.ts:81, 116, 155, 196](apps/api/src/billing/billing-notifications.service.ts#L81)
  - [moderation.service.ts:343, 460, 508](apps/api/src/moderation/moderation.service.ts#L343)
- **Что**: задумка правильная — «уведомление не должно ломать бизнес-операцию». Но ошибка `undefined`-проглатывается без логирования. Если уведомления перестанут отправляться (миграция схемы, изменение enum, упавший Notification-сервис), никто не узнает.
- **Чем чинить**: всюду заменить на `.catch((err) => this.logger.warn('notification failed', err))` или ввести метод-обёртку `safeNotify()`.

### 5. Нет глобального exception-filter и обработчика unhandledRejection ✅ DONE 2026-05-25
> `GlobalExceptionFilter` подключён в `main.ts` через `useGlobalFilters`: 5xx → error + stack-trace, 4xx → warn, всё с URL/methodом/actorId. `registerProcessErrorHandlers()` слушает `unhandledRejection` и `uncaughtException` — раньше Node новых версий молча убивал процесс.
- **Где**: [apps/api/src/main.ts](apps/api/src/main.ts).
- **Что**:
  - Любой `throw` без `HttpException` отдаст клиенту дефолтный 500 с full stack trace в логе. Это и leak (раскрытие путей FS), и UX-боль.
  - В Scheduler/billing-notifications ошибка ловится `try/catch`, но если когда-нибудь забудут — process крашится.
- **Чем чинить**: написать `AllExceptionsFilter`, который мапит non-HTTP-ошибки в 500 с обезличенным сообщением + логом. Добавить `process.on('unhandledRejection', ...)` в `main.ts`.

### 6. Параллельная ручная активация подписки создаёт дубли
- **Где**: [apps/api/src/billing/billing.service.ts:34–101](apps/api/src/billing/billing.service.ts#L34).
- **Что**: при двойном клике админа или ретрае запроса возникает две записи `Subscription`, два `AdminActionLog`, два уведомления каждому пользователю компании. БД не остановит — нет уникального ключа.
- **Чем чинить**: idempotency-key в DTO (или хеш `companyId + endsAt + reason`), проверять «не было ли уже за последние 5 секунд». Минимум — клиент-side disable кнопки + serverside lock на `companyId` через `prisma.$transaction({ isolationLevel: 'Serializable' })`.

### 7. Scheduler в multi-replica деплое запустит cron на всех инстансах
- **Где**: [apps/api/src/scheduler/scheduler.service.ts](apps/api/src/scheduler/scheduler.service.ts).
- **Что**: `@Cron(EVERY_HOUR)` на нескольких репликах сработает N раз. Дедуп уведомлений (по `domainEventId`) спасает от спама пользователю, но `expireDemo()` / `expireSubscription()` гоняет лишнюю работу. На Timeweb пока один инстанс — не проблема, но при горизонтальном масштабировании сломается.
- **Чем чинить**:
  - либо отдельный `worker`-процесс с `SCHEDULER_DISABLED` для app-инстансов;
  - либо advisory lock в Postgres (`pg_try_advisory_lock`) внутри `runHourlyCheck`;
  - либо переход на отдельный планировщик (Timeweb Cron / pg_cron).

### 8. Нет health-endpoint ✅ DONE 2026-05-24
> `@nestjs/terminus` подключён через `HealthModule`. `/api/health` (liveness) — 200 пока процесс жив. `/api/ready` (readiness) — 503 если Postgres-ping упал. Оба эндпоинта без rate-limit.
- **Где**: API.
- **Что**: для Timeweb-проб/балансировщиков нет `/health`/`/ready`. При деплое контейнер считается «живым» сразу, ещё до того, как Prisma подключилась — балансировщик начнёт слать трафик в 500-ки.
- **Чем чинить**: добавить `@nestjs/terminus`, эндпоинты `/api/health` (liveness, всегда 200, пока процесс жив) и `/api/ready` (readiness, проверяет Postgres `SELECT 1`).

### 9. `findManyByIds` принимает любую строку → 500 на «битом» id
- **Где**: [apps/api/src/files/files.controller.ts:25–33](apps/api/src/files/files.controller.ts#L25), `?ids=` парсится `.split(",")` без валидации формата cuid.
- **Что**: запрос `?ids=,,,` или `?ids=' OR 1=1 --` (с символами, ломающими Prisma) даст невалидный фильтр — но Prisma корректно эскейпит, так что инъекции нет. Однако ошибка валидации схемы вернёт 500 вместо 400.
- **Чем чинить**: zod-валидация `Query`-параметров.

---

## 🟢 P2 — улучшения

### 10. Все `position`-поля собираются через max+1 — почти-race везде
- Та же история, что в P0 #3, повторяется в: [chapters](apps/api/src/content/content.service.ts), `Lesson`, `LessonContentBlock`, `NewsContentBlock`. Большинство покрыты `@@unique([parentId, position])` — P2002 в худшем случае. P0 поднял только модуль, потому что там `position` глобально-уникальный (admin-level race заметнее).

### 11. content.service.ts — 2054 строк, единый «god service»
- Сложно проверить корректность всех путей кода и удержать инварианты в голове. См. Этап 5.

### 12. PrismaService: `$connect` в `onModuleInit` блокирует старт
- Если Postgres недоступен в момент старта, приложение падает с unhandled rejection. NestJS 11 рекомендуется ленивая инициализация (lazy connect). Текущее поведение в проде = «без БД не запускаем», что часто правильно, но стоит понимать осознанно.

### 13. Vitest конфиг шумит про `esbuild: false` → `oxc: false`
- Не блокирует, но мешает читать вывод тестов. Поправить `apps/api/vitest.config.ts` + `vitest.integration.config.ts`.

### 14. В `BillingService.activateManually` уведомления отправляются последовательно через `Promise.all`, но без backpressure
- При 1000+ пользователей компании можно положить event-loop. На MVP не критично.

---

## ✅ Что сделано хорошо

- Транзакции `$transaction` использованы во всех ключевых местах: смена пароля + revoke сессий, публикация модуля + lessons, manual subscription + audit, moderation decisions, contentful CRUD.
- `Cron` обёрнут в `try/catch` с явным логированием — single-instance scheduler стабильно работает.
- `SCHEDULER_DISABLED=1` корректно отключает кроны в integration-тестах.
- `notifications.createInApp` сам делает upsert по `(domainEventId, userId)` — повторный запуск cron не дублирует уведомление.
- support и moderation корректно проверяют ownership внутри `where` (видно как `where: { id, companyId }` в `support.service.ts:63` — нельзя ответить в чужой тикет).
- `@@unique([...])` constraints на:
  - `NewsLike`/`CommentLike` (`userId, *postId`) — двойной like невозможен на уровне БД,
  - `NotificationDelivery` (`domainEventId, recipientUserId, channel`) — дубли уведомлений невозможны,
  - `Complaint` (`entityType, entityId, authorId, reasonCode`) — один пользователь не может подать ту же жалобу дважды.
- Refresh-токен реально ротируется и старая сессия revoke'ается атомарно.
- PrismaService реализует `OnModuleInit`/`OnModuleDestroy` — но см. P0 #2 про shutdown-hooks.
