# Этап 4 — Производительность и оптимизация

Покрыто: индексы БД, N+1 запросы, пагинация, Next.js SSR/кэш, изображения, размер бандла, частота сетевых запросов.

---

## 🔴 P0 — критичные (при росте контента ляжет)

### 1. `GET /api/news` возвращает ВСЕ опубликованные новости без пагинации ✅ DONE 2026-05-25
> Пагинация подключена к `/news` (default 20, max 100), `/admin/content/news` (default 20, max 100, без blocks — для редактора отдельная ручка `GET /admin/content/news/:id`), `/support/tickets` + `/admin/support/tickets` (default 50, max 200), `/admin/billing/companies` (default 50, max 200). Все — envelope `PaginatedResponse<T>` (`items/total/hasMore`). Notifications уже имели hardcoded `take: 100`. Web-consumers (NewsView, AdminNewsView, UserSupportDrawer, AdminSupportView, AdminBillingView, account-view) переведены на новый shape.
- **Где**: [apps/api/src/content/content.service.ts:198–212](apps/api/src/content/content.service.ts#L198).
  ```ts
  const posts = await this.prisma.newsPost.findMany({
    where: { status: ContentStatus.published },
    orderBy: { firstPublishedAt: "desc" },
    include: { tags: ..., likes: ..., _count: { likes, comments } },
  });
  ```
- **Что**: ни `take`, ни `cursor`. На 8 текущих постах — мгновенно. На 500 — половина мегабайта JSON и 5-секундный отклик. На 5000 — таймаут.
- **Чем чинить**: `take: 20`, `cursor`-пагинация, бесконечный скролл на клиенте.

Тот же паттерн «без пагинации» в:
- [adminListNews](apps/api/src/content/content.service.ts#L471) — админский список новостей.
- [SupportService.listOwn / listAdmin](apps/api/src/support/support.service.ts#L42) — все тикеты компании / все тикеты платформы.
- [BillingService.listCompanies](apps/api/src/billing/billing.service.ts#L27) — все компании платформы.
- [Notifications list](apps/api/src/notifications/notifications.service.ts) — все уведомления пользователя.
- Список модулей обучения, статей базы знаний, индексов — судя по `findMany` без `take`.

### 2. Отсутствуют индексы на 5+ ключевых таблицах ✅ DONE 2026-05-24
> Миграция `20260525051938_perf_indexes` добавила 13 индексов: NewsPost (`status, firstPublishedAt desc` + `updatedAt desc`), Comment (`newsPostId, parentCommentId, status, createdAt` + `parentCommentId, status, createdAt`), KnowledgeBaseArticle (`parentId, status, position` + `status, position`), LearningModule (`status, position`), PriceIndex (`status`), Subscription (`companyId, createdAt desc` + `status, endsAt`), SupportTicket (`companyId, updatedAt desc` + `status, updatedAt desc`), SupportTicketMessage (`ticketId, createdAt`).
- **Где**: [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma).
- **Что**: Postgres сейчас сканирует таблицы целиком, потому что Prisma НЕ создаёт индекс автоматически:
  - `NewsPost` — нет индекса на `(status, firstPublishedAt)`. Главный запрос ленты бьётся в seq-scan.
  - `Comment` — нет индекса на `(newsPostId, parentCommentId, status)`. На странице новости подгружается дерево комментариев — каждый запрос = full scan.
  - `SupportTicket` — нет индекса на `(companyId, updatedAt)`. Listing для пользователя компании = seq-scan.
  - `LearningModule` — нет индекса на `(status, position)`.
  - `KnowledgeBaseArticle` — нет индекса на `(status, parentId, position)`.
  - `PriceIndex` — нет индекса на `status`.
  - `Subscription` — нет индекса на `(companyId, status, endsAt)`.
- **Чем чинить**: добавить `@@index(...)` в схему, новой миграцией. Это ~5 строк изменений, кратно ускоряет всё.

### 3. Все списочные эндпоинты включают тяжёлые связи без необходимости ✅ DONE 2026-05-25 (частично)
> `adminListNews` теперь возвращает slim shape без `blocks` (вместо них — `_count.blocks`). Detail с блоками подгружается через `GET /admin/content/news/:id` при открытии редактора в AdminNewsView. Для `support/tickets` и `admin/billing/companies` messages/subscriptions оставлены в выдаче — UI-потребители рендерят их прямо из listing без отдельного detail-запроса.
- **Что**: `adminListNews` подтягивает `blocks` (весь контент новости) для рендера ТАБЛИЦЫ — где блоки даже не нужны. На 100 новостей × 20 блоков × 200 байт = 400КБ JSON «впустую».
- **Чем чинить**: для списков — только `id, title, slug, status, firstPublishedAt, _count, coverImageId`. Блоки тянуть только при `getNews(slug)`.

---

## 🟡 P1 — серьёзные

### 4. CORS-preflight (OPTIONS) перед КАЖДЫМ запросом ✅ DONE 2026-05-24
> В `main.ts` `enableCors` получил `maxAge: 86_400` — браузер кеширует preflight на сутки.
- **Где**: backend [apps/api/src/main.ts](apps/api/src/main.ts) — `enableCors({ origin, credentials: true })`. Нет `maxAge`.
- **Что**: каждый `GET /api/...` ходит сначала OPTIONS, потом сам запрос. 2 RTT вместо 1. На медленном канале это +300–500 мс латентности на каждое действие. Видно в сетевой панели: на загрузку `/news` тратится 6 ✕ OPTIONS = ~3 секунды накладных расходов.
- **Чем чинить**: `enableCors({ ..., maxAge: 86400 })` — браузер кэширует preflight на сутки.

### 5. Двойные `fetch` на каждой странице (React 19 Strict Mode)
- **Что**: в dev-режиме `useEffect` запускается дважды, отсюда дублирующиеся запросы `/api/news`, `/api/notifications/unread-count`. В проде Strict Mode по умолчанию ОТКЛЮЧЕН, поэтому в проде — один запрос. Но всё равно, например, NotificationBell поллит каждую минуту в каждой вкладке: 10 открытых вкладок = 10 запросов в минуту с одного пользователя.
- **Чем чинить**: вынести polling в `BroadcastChannel` — обновляется одна вкладка, остальные слушают. Или использовать SSE / WebSocket вместо poll.

### 6. Каждый `<img>` — обычный тег вместо `next/image` ✅ DONE 2026-05-24
> Публичные view (news/learning/knowledge-base) + AppShell + аватары переведены на `next/image`. `next.config.ts` получил `remotePatterns` для Timeweb S3 + локального MinIO. Браузер теперь забирает картинки через `/_next/image?url=...&w=320&q=75` с `srcset` под разные viewports вместо полного S3-файла. Админ-CMS (AdminNewsView/FileUploadField) и content-block images оставлены на `<img>` — у них произвольный ratio, fill-режим испортил бы вёрстку.
- **Где**: [DataViews.tsx](apps/web/src/components/DataViews.tsx), [AdminNewsView.tsx](apps/web/src/components/AdminNewsView.tsx), [AdminStaffView.tsx](apps/web/src/components/AdminStaffView.tsx), [FileUploadField.tsx](apps/web/src/components/FileUploadField.tsx), [AppShell.tsx](apps/web/src/components/AppShell.tsx).
- **Что**: S3 отдаёт оригинальные WebP-картинки (~200–500КБ). На карточке ленты они выводятся в 320×200 px. Браузер всё равно тянет полный файл, потому что нет `srcset`/`sizes`. На мобильном 3G — десятки секунд.
- **Чем чинить**: заменить на `<Image src={...} width={...} height={...} sizes="(max-width: 768px) 100vw, 33vw" />`. Next.js на лету сожмёт через `/_next/image`. Или сразу сохранять preset-варианты (cover-200, cover-600, cover-1200) в S3 и отдавать `<picture>`.

### 7. SSR не используется — все страницы CSR + auth-gate ✅ DONE 2026-05-24 (loading.tsx)
> Полный переход на RSC отложен (большая переделка с куки-форвардингом). Сделано меньшее по объёму, но дающее главный эффект: `loading.tsx` со skeleton-каркасом на ключевых маршрутах (news/indices/education/knowledge-base/account) + общий `PageSkeleton` компонент. Пользователь сразу видит структуру страницы вместо пустого экрана пока JS-бандл загружается.
- **Что**: `app/news/page.tsx` рендерит `<NewsView />` — клиентский компонент. SSR-роли нет. На холодный заход:
  1. сервер отдаёт пустой HTML с лоадером,
  2. JS подгружается (~440КБ),
  3. клиент бежит к `/api/auth/me`,
  4. потом к `/api/news`,
  5. рендерит ленту.
- **Чем чинить**: либо перейти на серверные `RSC` с куки-форвардингом (но это серьёзная переделка), либо включить `loading.tsx` со skeleton-каркасом, чтобы пользователь видел структуру сразу.

### 8. `replaceNewsTags` — классический N+1 ✅ DONE 2026-05-24
> Переписан с 2×N запросов (upsert+create на каждый тег) на 3 фиксированных: `createMany skipDuplicates` для тегов → `findMany` по names → `createMany skipDuplicates` для связей. На 10 тегах было 20+ запросов, стало 3.
- **Где**: [content.service.ts:500–515](apps/api/src/content/content.service.ts#L500).
- **Что**: для каждого тега — `upsert(newsTag) + create(newsPostTag)` = 2 запроса. Для 10 тегов на новости — 20 запросов в БД. Плюс ещё `refreshTagUsage`.
- **Чем чинить**: батч `prisma.newsTag.createMany({ skipDuplicates: true })` + один `findMany` + один `newsPostTag.createMany`.

### 9. `deleteIfUnreferenced` сканирует ВСЕ блоки всех 3-х типов контента ✅ DONE 2026-05-25
> Новая таблица `FileReference` (полиморфная: fileId / entityType / entityId) заменила scan. `deleteIfUnreferenced` теперь делает `fileReference.count({ where: { fileId } })` — O(1) lookup по индексу `(fileId)` вместо O(M) scan'а всех NewsContentBlock/LessonContentBlock/KnowledgeBaseBlock. Хуки `replaceFileReferences()` / `clearFileReferences()` стоят на всех create/update/delete-методах news/learning/knowledge-base. Backfill при первом старте после миграции (`main.ts` → `FilesService.backfillFileReferencesIfNeeded()` — идемпотентно). FK с CASCADE: при удалении FileAsset исчезают все его FileReference. Orphan-fileId фильтруются в `replaceFileReferences` через `FileAsset.findMany` — иначе FK-violation роняет PATCH с тестовыми/устаревшими ID.
- **Где**: [files.service.ts:217–225](apps/api/src/files/files.service.ts#L217).
  ```ts
  this.prisma.newsContentBlock.findMany({ select: { payload: true } }),
  this.prisma.lessonContentBlock.findMany({ select: { payload: true } }),
  this.prisma.knowledgeBaseBlock.findMany({ select: { payload: true } }),
  ```
- **Что**: при удалении ОДНОГО файла тянем В ПАМЯТЬ ВСЕ блоки платформы. На 10К блоков × 2КБ payload = 20МБ + JSON-обход вложенных payload в JS.
- **Чем чинить**: завести таблицу `FileReference (fileId, ownerType, ownerId)` и обновлять её на каждом upsert блока. Удаление файла → один `count(FileReference where fileId)`. То же самое — для подсчёта «куда ссылается файл».

---

## 🟢 P2 — улучшения

### 10. Один компонент `DataViews.tsx` весит 3017 строк → бандл-чанк 440КБ
- **Что**: турбопак не может разделить файл на отдельные view → чанк попадает в каждую страницу.
- **Чем чинить**: разнести `NewsView`, `IndicesView`, `EducationView`, `KnowledgeBaseView`, `AccountView`, `NotificationsView` по отдельным файлам. Каждая страница получит свой chunk.

### 11. `/news` страница тянет двухступенчато: сначала `/api/news`, потом `/api/files?ids=...`
- **Что**: 2 round-trips, чтобы получить URL обложек. Можно резолвить `coverImage` сразу в `/api/news` (publicUrl + alt) и сэкономить запрос.

### 12. Нет ни одного HTTP-cache header на API
- **Что**: `Cache-Control`, `ETag` не выставляются. Браузер не может закэшировать даже статичный `/api/indices` на минуту.
- **Чем чинить**: для публично-кэшируемых эндпоинтов добавить `@Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')`.

### 13. Все админ-страницы — `<AdminFooView />` (client) — каждая со своим набором state и fetch
- При навигации между разделами admin кеш данных теряется. Каждое возвращение = новые запросы. Маленький cache (React Query / SWR / nextjs cache) сильно сэкономит.

### 14. NotificationBell поллит 1 раз/мин в каждой вкладке
- На пользователя с 5 вкладками = 5 запросов в минуту. Не страшно, но SSE / WebSocket изящнее.

### 15. Build-output: 23 страницы prerendered, 3 dynamic
- Хорошо, что Next.js статически собирает большую часть. Но это значит, что shell-страницы тоже SSG — внутрь они всё равно бьются в API. Прогревать React-кэш `cache: 'force-cache'` для public-данных (если они вообще будут).

---

## ✅ Что работает хорошо

- Prisma `_count` используется правильно — отдельных count-запросов не делается.
- `cuid()` на ID + `select` явно прописан в большинстве чувствительных мест (admin-users, admin-companies).
- `Promise.all` для параллельных независимых запросов (см. `deleteNews`, `expireDemo`).
- Турбопак (Turbo) включён в Next.js 16 dev — горячая перезагрузка действительно быстрая.
- Картинки сохраняются как WebP через sharp (`processCoverImage`) — формат уже хороший.
- Картинки лента подгружает с `loading="lazy"` и `decoding="async"`.
- Sidebar collapse состояние сохраняется в localStorage (предположительно, нужно подтвердить — UX-плюс).
- 15 индексов в схеме покрывают: notifications, moderation, audit-log, sanctions, restrictions, sessions. Хорошо.
- Static-prerender: 23 из 25 страниц prerendered — TTFB на холодную низкий.
- В целом БД нагружается одним соединением (PrismaClient) — pooling не настроен, но для одного API-инстанса хватает.
