# План реализации — волны 6, 7, 8 (закрытые)

Это исторический архив описаний волн 6–8 из ROADMAP.md. Все три волны полностью закрыты к 2026-05-26 (детали — в `audit/PROGRESS.md` и `audit/archive/2026-05-24/journal-waves-1-8.md`). Сюда вынесены детальные описания задач для справки: если нужно понять, ЧТО именно делалось внутри 6.5 или 7.7 — открывайте здесь.


---

# Волна 6 — Юридический фундамент и согласия

**Цель**: на сайте до первой регистрации платного клиента должны быть все юридические артефакты (страницы политик, cookie-banner, consent-чекбоксы), модель `ConsentRecord` с версионированием и инфраструктура для подписания новых соглашений.

## 6.1. Модель `LegalDocument` + `ConsentRecord`

Создать миграцию Prisma:
```prisma
enum LegalDocumentType {
  privacy_policy
  terms_of_service
  personal_data_consent
  cookie_policy
  marketing_consent
  offer_agreement
}

model LegalDocument {
  id          String              @id @default(cuid())
  type        LegalDocumentType
  version     String              // semver: "1.0.0"
  title       String
  body        String              // HTML/Markdown
  publishedAt DateTime?
  isActive    Boolean             @default(false)
  consents    ConsentRecord[]
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@unique([type, version])
  @@index([type, isActive])
}

model ConsentRecord {
  id          String        @id @default(cuid())
  userId      String
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  documentId  String
  document    LegalDocument @relation(fields: [documentId], references: [id])
  acceptedAt  DateTime      @default(now())
  ipAddress   String?
  userAgent   String?
  source      String        // 'registration' | 'login_reconfirm' | 'cookie_banner' | 'settings'

  @@index([userId, documentId])
  @@index([documentId, acceptedAt])
}
```

**Тесты**: integration — пользователь регистрируется → создаются `ConsentRecord` на текущие активные документы.

## 6.2. API-эндпоинты для документов и согласий

- `GET /api/legal/documents?types[]=privacy_policy&types[]=terms_of_service` — возвращает текущие активные версии (без auth).
- `GET /api/legal/documents/:type/:version` — конкретная версия (без auth, для аудита).
- `POST /api/legal/consents` — пользователь подтверждает согласие на список документов (auth required). Использует ID документа и source.
- `GET /api/auth/me/consents` — список всех `ConsentRecord` текущего пользователя.
- Админ:
  - `GET /api/admin/legal/documents` — список всех версий.
  - `POST /api/admin/legal/documents` — создать новую версию.
  - `POST /api/admin/legal/documents/:id/publish` — активировать (предыдущая `isActive=false`).

**Тесты**: integration — создание документа, активация, regression при `acceptConsent` для несуществующего/неактивного документа.

## 6.3. Страницы юридических документов на web

Создать маршруты (доступны без логина):
- `/legal/privacy` — Политика конфиденциальности
- `/legal/terms` — Пользовательское соглашение
- `/legal/personal-data` — Согласие на обработку персональных данных (152-ФЗ)
- `/legal/cookies` — Политика использования cookies
- `/legal/offer` — Публичная оферта

Каждая страница — `<article>` с заголовком, версией, датой обновления, контентом из `LegalDocument.body` (HTML, рендер через DOMPurify из уже единого `@ecoplatform/shared`).

**Заглушка контента ОК** — текст можно прислать позже, главное чтобы UI был и страница рендерилась.

Под каждой страницей — секция «Прошлые версии» с архивом.

## 6.4. Cookie-banner

В `app/layout.tsx` — компонент `CookieConsent`:
- Появляется внизу экрана при первом заходе (если `localStorage.eco_cookie_consent_v1` отсутствует).
- Три кнопки: «Принять все», «Только необходимые», «Настроить».
- «Настроить» открывает модалку с категориями: необходимые (всегда вкл), аналитика, маркетинг.
- При нажатии — отправка `POST /api/legal/consents` (для авторизованных пользователей) + сохранение в localStorage.

**Эффект**: если пользователь отказался от аналитики — Sentry/Prometheus-трекеры на клиенте не загружаются. Реализовать через `window.__ANALYTICS_ENABLED__` флаг.

## 6.5. Регистрация с consent-чекбоксами

В `RegisterForm` под секцией «Доступ» добавить:
```
[ ] Я согласен с Пользовательским соглашением и Политикой конфиденциальности
[ ] Я даю согласие на обработку моих персональных данных в соответствии с 152-ФЗ
[ ] (опционально) Я хочу получать новости и предложения по email
```

Первые два — обязательны (без них кнопка «Создать аккаунт» disabled). Тексты — ссылками на соответствующие /legal/* страницы (открывать в новой вкладке).

При сабмите — отправка вместе с регистрацией списка ID документов, на которые пользователь согласился. Бэк создаёт `ConsentRecord`.

**Архитектурно**: `RegisterDto` в shared расширяется массивом `acceptedDocumentIds: string[]`. `auth.service.register` валидирует, что все обязательные на текущий момент документы упомянуты.

## 6.6. Re-consent при изменении документов

Сценарий: контент-менеджер опубликовал новую версию Политики конфиденциальности.

- При следующем входе пользователь видит модалку «Условия использования обновлены», с diff'ом или ссылкой на сравнение, кнопками «Принять» / «Выйти».
- Без «Принять» — доступ к платформе ограничен.

Реализация: при логине бэк проверяет, есть ли у пользователя `ConsentRecord` на все текущие активные обязательные документы. Если нет — возвращает в `/api/auth/me` флаг `requiresReConsent: true` + список документов.

## 6.7. Footer с ссылками на юр-документы

В AppShell внизу `<main>` (или в lay-out у /login, /register) — `<footer>`:
- Логотип
- 3 колонки: «Платформа» (О нас, Контакты, Поддержка), «Правовое» (Политика конф., Пользовательское соглашение, 152-ФЗ, Cookies, Оферта), «Контакты» (телефон, email, юр.адрес)
- Копирайт © 2026 ЭкоПлатформа.

**Тесты**: e2e — после регистрации запросить `/api/auth/me/consents`, убедиться, что 3 записи созданы.

## 6.8. Сидер — начальные документы

В `apps/api/prisma/seed.ts` — создать начальные активные версии всех 5 типов документов с placeholder-текстом «Текст этого документа находится в подготовке». Это позволяет dev-стенду работать сразу.

## Проверки Волны 6

- [ ] Регистрация без галочки «Соглашаюсь» — кнопка disabled.
- [ ] Регистрация с галочками — в БД создаётся `ConsentRecord` × N.
- [ ] /legal/privacy открывается без логина, без AppShell-сайдбара (отдельный простой layout).
- [ ] Cookie-banner появляется при первом заходе.
- [ ] Footer виден на всех публичных и приватных страницах.
- [ ] lint + test + integration + build зелёные.


---

# Волна 7 — Архитектурный фундамент данных

**Цель**: заложить инженерные решения, которые потом не придётся переделывать. Все эти изменения — невидимы для пользователя сейчас, но обеспечивают «лёгкое подключение» торговой площадки, форума, магазина решений.

## 7.1. Polymorphic `Discussion` + `Comment`

Миграция:
```prisma
enum DiscussionTargetType {
  news_post
  listing
  forum_thread
  solution_review
  lesson
  knowledge_article
}

model Discussion {
  id           String                @id @default(cuid())
  targetType   DiscussionTargetType
  targetId     String
  isLocked     Boolean               @default(false)
  comments     Comment[]
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @updatedAt

  @@unique([targetType, targetId])
  @@index([targetType, targetId])
}

model Comment {
  // существующее + переименовать newsPostId → discussionId
  discussionId String
  discussion   Discussion @relation(...)
}
```

**Миграция данных**: для каждого `NewsPost` создать `Discussion(targetType='news_post', targetId=NewsPost.id)`, обновить `Comment.discussionId`.

API `/news/:id/comments` остаётся как есть снаружи, но внутри теперь идёт через Discussion (лениво создаётся при первом комментарии).

Аналогично добавить лёгкие хуки для lesson/kb-comments (даже если UI пока не реализован, бэк готов).

**Тесты**: integration — старые комментарии работают; новый эндпоинт `/api/discussions/:targetType/:targetId/comments` (RESTful) работает; миграция данных не теряет ни одного комментария.

## 7.2. `Address` как первоклассная сущность

```prisma
model Address {
  id             String   @id @default(cuid())
  // Структура адреса
  country        String   @default("Россия")
  region         String?  // субъект РФ (Московская область, Татарстан)
  city           String
  street         String?
  building       String?
  apartment      String?
  postcode       String?
  // Координаты для карты
  latitude       Decimal? @db.Decimal(10, 7)
  longitude      Decimal? @db.Decimal(10, 7)
  // Сам адрес одной строкой (для отображения)
  formatted      String
  // Источник
  source         String   @default("manual") // 'manual' | 'yandex' | 'dadata'
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

В `Company` добавить:
```prisma
factualAddressId  String?
factualAddress    Address?  @relation("CompanyFactual", fields: [factualAddressId], references: [id])
legalAddressId    String?
legalAddress      Address?  @relation("CompanyLegal", fields: [legalAddressId], references: [id])
// Старое поле legalAddress: String? — удалить после миграции данных
```

**Миграция данных**: если у `Company.legalAddress` есть значение (текст) — создать `Address(formatted=legalAddress, city='Не указан', source='legacy')` и привязать.

## 7.3. Расширить `Company` под полный профиль

```prisma
model Company {
  // существующее +
  websiteUrl           String?
  corporatePhone       String?
  corporateEmail       String?
  about                String?  // о компании, до 2000 символов
  logoFileId           String?  // ссылка на FileAsset
  // ИНН/КПП/реквизиты уже есть, оставить
  // Контактное лицо (если отличается от user)
  contactPersonName    String?
  contactPersonPhone   String?
  contactPersonEmail   String?
}
```

В кабинете (`/account` → таб «Компания») — UI для редактирования всех этих полей.

## 7.4. UI «Реквизиты компании» в /account

Полный таб «Компания» с 3 секциями:
- **Основное**: название, тип, ИНН, КПП, статус, дата регистрации.
- **Контакты**: corporatePhone, corporateEmail, websiteUrl, contactPerson*.
- **Адреса**: factualAddress (с подсказкой автокомплита Yandex Geocoder API когда подключим), legalAddress, дополнительные адреса складов/филиалов (модель `Address` уже умеет N штук на компанию через junction-таблицу — можно отложить, оставить ровно 2 адреса для MVP).
- **Реквизиты**: banking-блок (bankName, bankBik, bankAccount, correspondentAccount, billingInn, billingKpp, legalAddress для документов).

Каждое поле — `optional`, не требуется при регистрации. Заполняется в /account.

## 7.5. Расширить enums «на вырост»

Миграция:
```prisma
enum NotificationCategory {
  security
  billing
  marketplace      // уже есть
  moderation
  support
  system
  // НОВЫЕ:
  forum
  solutions_shop
  reviews
  geo_alert
  price_alert
}

enum NotificationChannel {
  in_app
  email
  sms
  // НОВЫЕ:
  telegram
  push
}

enum SupportTicketCategory {
  // существующее +
  marketplace_dispute
  forum_complaint
  shop_purchase
  refund_request
}

// НОВЫЕ enums "на вырост"
enum PaymentMethodType {
  card_tinkoff
  bank_invoice
}

enum PaymentStatus {
  pending
  succeeded
  failed
  refunded
}
```

## 7.6. `PaymentMethod` и `Payment` — модель платежей

Готовим биллинг под Тинькофф-Кассу заранее. UI пока не делаем (кроме «Способы оплаты» с заглушкой).

```prisma
model PaymentMethod {
  id              String            @id @default(cuid())
  companyId       String
  company         Company           @relation(fields: [companyId], references: [id], onDelete: Cascade)
  type            PaymentMethodType
  // Для card_tinkoff
  cardMask        String?           // "4276 **** **** 1234"
  cardExpiry      String?           // "12/27"
  providerToken   String?           // Рекуррентный токен от Tinkoff
  isDefault       Boolean           @default(false)
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
}

model Payment {
  id              String        @id @default(cuid())
  companyId       String
  company         Company       @relation(...)
  amount          Decimal       @db.Decimal(12, 2)
  currency        String        @default("RUB")
  status          PaymentStatus @default(pending)
  // Что оплачивалось
  purpose         String        // 'subscription_initial' | 'subscription_renewal' | 'product_purchase'
  subscriptionId  String?
  // Провайдер
  providerName    String        @default("tinkoff_kassa")
  providerOrderId String?       @unique
  providerError   String?
  // Финансовый документ
  receiptUrl      String?
  invoiceUrl      String?
  createdAt       DateTime      @default(now())
  paidAt          DateTime?

  @@index([companyId, createdAt(sort: Desc)])
  @@index([status, createdAt])
}
```

UI в `/account` → таб «Биллинг» — секции «Способы оплаты» (заглушка «Подключим в ближайшем обновлении») и «История платежей» (пока пустая, но виден empty-state).

## 7.7. `ContentBlock` версионирование и общий тип

В `packages/shared` — единый тип:
```ts
export type ContentBlockV1 = {
  type: string;  // 'paragraph' | 'image' | 'audio' | ... 
  v: 1;
  payload: Record<string, unknown>;
};
```

В payload каждого блока в БД (NewsContentBlock, LessonContentBlock, KnowledgeBaseBlock) — добавить `v: 1` ключ. Миграция данных: SQL `UPDATE … SET payload = jsonb_set(payload, '{v}', '1') WHERE NOT payload ? 'v'`.

Это позволит в будущем версионировать формат (paragraph_v2 с inline-форматированием → markdown-парсер v2 без миграции старых данных).

## 7.8. `ApiKey` — модель для будущего внешнего API

```prisma
model ApiKey {
  id          String   @id @default(cuid())
  companyId   String
  company     Company  @relation(...)
  name        String   // 'Production ERP integration'
  keyHash     String   @unique  // bcrypt hash секрета
  scopes      String[] @default([])  // ['news:read', 'indices:read']
  isActive    Boolean  @default(true)
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime @default(now())
  createdBy   String

  @@index([companyId, isActive])
}
```

UI и эндпоинты — пока не делаем. Модель — есть.

## 7.9. Документировать решения в `docs/08-architecture/data-model.md`

Документ существует, но `status: draft`. Расширить до actually-current модели с описаниями всех новых сущностей.

## Проверки Волны 7

- [ ] Все миграции `prisma migrate dev` проходят на чистой БД.
- [ ] `prisma migrate reset && pnpm seed` — работает.
- [ ] Старые комментарии новостей видны после миграции.
- [ ] Поля `corporatePhone`, `websiteUrl` доступны в /account → Компания.
- [ ] Все 4 проверки зелёные.


---

# Волна 8 — Высоконагрузочная инфраструктура

**Цель**: подготовить платформу к тысячам посетителей. После Волны 8 на API-стороне можно выдерживать 100+ RPS без затыка в Postgres.

## 8.1. Redis для сессий и кеша

Подключить `ioredis` через NestJS module. Конфиг — из env `REDIS_URL`.

Использовать:
- **JwtAuthGuard-кеш**: при первом запросе сессии — `findUnique + include` → закешировать в Redis на 60 сек. Инвалидация: при `logout`, `revokeSession`, `changePassword`, `blockUser`, `setCompanyStatus`.
- **Public-content cache** (опционально): `/api/news?limit=20&offset=0` — кешировать 60 сек. Инвалидация — при публикации/изменении новости.
- **Rate-limit (throttler)**: переключить с in-memory на Redis-store, чтобы лимиты работали на N репликах.

В dev-стенд — `docker-compose.yml` дополнить сервисом `redis:7-alpine`.

**Fallback**: если Redis недоступен — JwtAuthGuard работает напрямую с БД, throttler — in-memory. То есть Redis — optimization, а не required для запуска.

## 8.2. Infinite scroll для всех листингов

Изменить компоненты на клиенте:

- **/news** (`NewsView`): сейчас грузит первые 20, потом нечего. Заменить на `IntersectionObserver` — при достижении конца ленты грузить следующую страницу через `api.news.list({ offset: items.length, limit: 20 })`.
- **/admin/content/news** — то же.
- **/notifications** — то же.
- **/admin/companies, /admin/users, /admin/staff, /admin/journals, /admin/support/tickets** — то же.
- **/account → support tickets, payments-history** — то же.

Хелпер: `useInfiniteApiQuery(key, fetcher, initialPage)` в `_shared.tsx`, аналогично `useApiQuery`. Возвращает `{ items, hasMore, isLoadingMore, loadMore }`. Использует IntersectionObserver на якорь.

В конце ленты — «Это все записи» когда `hasMore === false`.

## 8.3. Prisma connection pooling и production-best-practices

В `apps/api/src/prisma/prisma.service.ts` — настроить connection limit через `DATABASE_URL` параметр `connection_limit=20`. По docs (`docs/08-architecture/deploy.md` — добавить раздел).

Включить `PrismaClient` с `log: ['error', 'warn']` в проде, без `query`.

Включить `errorFormat: 'minimal'`.

## 8.4. Полная пагинация на стороне API

Проверить, что **все** листинги возвращают `PaginatedResponse<T>` envelope. Сейчас:
- ✅ /news, /admin/content/news (Волна 4)
- ✅ /support/tickets, /admin/support/tickets (Волна 4)
- ✅ /admin/billing/companies (Волна 4)
- ❌ /education/modules — нет, отдаёт массив
- ❌ /indices — нет, отдаёт массив
- ❌ /knowledge-base — нет, дерево
- ❌ /admin/content/education, /admin/content/indices, /admin/content/knowledge-base — нет
- ❌ /admin/users, /admin/staff, /admin/journals — нет
- ❌ /admin/moderation/cases — нет

Для дерева (knowledge-base) — оставить как есть (дерево не пагинируется), но добавить limit на глубину/ширину.

Для остальных — добавить envelope с разумными default'ами.

## 8.5. CDN перед статикой

`apps/web/public/*` — 90+ статических файлов (logo, иконки, аватары).

В `docs/08-architecture/deploy.md` — добавить раздел «CDN» с инструкцией: Timeweb CDN перед web-инстансом, либо Cloudflare. На MVP-старте — Cloudflare Free достаточно.

В коде: убедиться, что `Cache-Control: public, max-age=31536000, immutable` отдаётся для иммутабельных файлов (Next.js делает это автоматически для `/_next/static`, но для `/public` — нет; добавить через `headers()` в `next.config.ts`).

## 8.6. Сжатие (gzip/brotli)

API: `app.use(compression())` — npm `compression` middleware.

Web: Next.js делает Brotli по умолчанию для production-build.

## 8.7. Distributed cron через Postgres advisory lock

В `apps/api/src/scheduler/*` — оборачивать каждый cron-tick в:
```ts
const lockKey = 'cron:billing-status-check';
const acquired = await this.prisma.$queryRaw`
  SELECT pg_try_advisory_lock(hashtext(${lockKey})) as ok
`;
if (!acquired[0].ok) return;
try { await this.runCron(); } finally {
  await this.prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
}
```

Это позволит запускать API на N репликах — cron будет выполняться только на одной (та, что взяла lock).

## 8.8. Загрузка списка тегов и фильтр по тегам в /news

В UI (Волна 11) сделаем chip-row, но бэк к этому моменту уже должен уметь:
- `GET /api/news/tags?limit=20` — топ-20 тегов по `usageCount`.
- `GET /api/news?tags[]=рынок&tags[]=пластик&limit=20&offset=0` — фильтрация (AND-семантика по docs).

## 8.9. WebP/AVIF cover-изображения

Для всех загружаемых обложек (news/learning/kb) — после upload через sharp генерировать WebP + AVIF варианты, хранить в S3, отдавать через `next/image` (он сам выберет format под браузер).

Сейчас sharp уже используется (`files/image-presets.ts`) для cover-rendering — расширить.

## 8.10. Lighthouse baseline и регрессия

Прогнать Lighthouse на `/news`, `/login`, `/education`. Зафиксировать baseline в `audit/lighthouse-baseline.md`. После каждой следующей волны — повторить, не дать показателям ухудшиться больше чем на 5 пунктов без согласования.

Целевые показатели для прода:
- Performance ≥ 80
- Accessibility ≥ 90
- Best practices ≥ 95
- SEO ≥ 90

## Проверки Волны 8

- [ ] Redis подключён, JwtAuthGuard использует кеш с TTL 60 сек.
- [ ] /news подгружает следующие 20 при скролле вниз.
- [ ] /admin/companies — то же.
- [ ] Все API-листинги возвращают `PaginatedResponse<T>`.
- [ ] Lighthouse Performance ≥ 80 на /news.
- [ ] При запуске 2 копий API локально — cron срабатывает только на одной.

