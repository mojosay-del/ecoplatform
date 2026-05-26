# Этап 5 — Архитектура и подходы к разработке

Покрыто: структура папок, разделение слоёв, дублирование, типобезопасность, согласованность подходов, тестовое покрытие, документация.

---

## 🔴 P0 — корни большинства проблем других этапов

### 1. `DataViews.tsx` — 3244 строки, 10 видов в одном файле ✅ DONE 2026-05-24
> Разбито: 3244 → 10 строк. Создана папка `apps/web/src/views/` с файлами `news-view.tsx`, `account-view.tsx`, `indices-view.tsx`, `learning-view.tsx`, `knowledge-base-view.tsx`, `content-blocks.tsx`, `_shared.tsx`. `DataViews.tsx` остался как re-export hub для совместимости с page.tsx. Мёртвый код (MiniChart, emptyTickets) удалён.
- **Где**: [apps/web/src/components/DataViews.tsx](apps/web/src/components/DataViews.tsx).
- **Что**: `NewsView`, `NewsPostView`, `IndicesView`, `EducationView`, `LearningModuleView`, `LessonView`, `KnowledgeBaseView`, `KnowledgeArticleView`, `AccountView`, `ContentBlocks` — всё в одном файле + 200+ строк хелперов и моделей.
- **Последствия**:
  - **Бандл**: 440 КБ JS-чанк попадает в каждую публичную страницу (Этап 4 #10).
  - **Тестируемость**: ни один из 10 видов не покрыт unit-тестом — модуль слишком большой, чтобы его «зайти и проверить».
  - **Типобезопасность**: общие хелперы принимают `any` (см. ниже), потому что несколько разных видов используют один helper.
  - **Конфликты в git**: любые правки в любом разделе → диффы пересекаются.
- **Чем чинить**: разнести по файлам (`NewsView.tsx`, `IndicesView.tsx`, ...), общие типы — в `types/news.ts`, общие хелперы — в `lib/comments.ts`. Это рефакторинг на пол-дня, но снимет 3 проблемы из других этапов.

### 2. `content.service.ts` — 2054 строки, один сервис на 4 предметные области ✅ DONE 2026-05-24
> Разнесён на 5 фокусных сервисов в `apps/api/src/content/services/`: `ContentCommonService` (shared-хелперы `assertFunctionalAccess`, `payload`, `cleanupDetachedFiles`, `uniqueSlug`), `NewsService` (480), `IndicesService` (329), `LearningService` (857), `KnowledgeBaseService` (435). `ContentController` инжектит 4 доменных сервиса напрямую. Старый `content.service.ts` удалён. Integration 82/82.
- **Где**: [apps/api/src/content/content.service.ts](apps/api/src/content/content.service.ts).
- **Что**: один `@Injectable()` отвечает за: новости, индексы цен, обучение, базу знаний, комментарии, теги, файлы. Внутри 70+ методов с одинаковыми именами в каждой области (`adminListNews`, `adminListLessons`, …).
- **Последствия**:
  - Невозможно проверить, что инвариант области (например, «опубликовать модуль = опубликовать все его уроки») не сломан из соседнего метода.
  - Race conditions и потерянные транзакции прячутся в общей куче (см. Этап 2 #3).
  - `include: { users: true }` (passwordHash-leak, Этап 1 #1) сидит здесь же — единственный сервис с правом на «всё», нет узких ролей.
- **Чем чинить**: разнести по 4 сервиса: `NewsService`, `LearningService`, `KnowledgeBaseService`, `PriceIndexService`. Общие куски (например, `assertFunctionalAccess`) — вынести в `ContentAccessService`.

### 3. `moderation.service.ts` — 940 строк, аналогично 🟦 ОТЛОЖЕНО 2026-05-24
> Решение: оставить как cohesive moderation-домен. Приватные хелперы `subjectForEntity`, `notifyDecision`, `enrichCases`, `loadPublishedEntity`, `removeModeratedEntity` тесно переплетены между Complaints/Cases/Sanctions. Расщепление потребует cross-service зависимостей (Sanctions → Cases → Notifications), что усложнит без явной выгоды. При росте файла >1500 строк или появлении третьего реально независимого подмодуля — пересмотреть. 940 строк — не god-файл по нашим критериям.
- **Где**: [apps/api/src/moderation/moderation.service.ts](apps/api/src/moderation/moderation.service.ts).
- **Что**: жалобы + дела + решения + санкции + ограничения модулей — всё в одном файле. С учётом 5 моделей в БД (`ModerationCase`, `Complaint`, `ModerationDecision`, `Sanction`, `UserModuleRestriction`) — каждой логично иметь свой сервис.

---

## 🟡 P1 — серьёзные

### 4. 56 использований `any` в типизированном коде (вне тестов) ✅ DONE 2026-05-24
> Создан `packages/shared/src/api-response.ts` с DTO-типами ответов API: `NewsListItem`/`NewsPostDetail`/`NewsCommentDecorated`, `NomenclatureCategoryListItem`/`NomenclatureListItem`, `LearningModuleListItem`/`LearningModuleDetail` (с правильным override `lessons` через `Omit`), `KnowledgeNode`/`KnowledgeArticleDetail`, `BillingStatus`/`BillingSubscription`. Все 56 `any` в `apps/web/src/views/*.tsx` (news/indices/learning/knowledge-base/account) заменены на типизированные. `_shared.getNewsFeedSnapshot` параметризован generic для сохранения точного `_count`. Browser-проверка кабинета и индексов прошла без регрессий.
- **Где**: преимущественно `DataViews.tsx` (новости, комментарии, лайки) и `AdminNewsView.tsx`.
- **Что**: API-ответы типизированы как `any`, потому что общие модели news/comment не описаны как типы (только Prisma-генерированные доступны на сервере; web получает чужой Prisma-output через JSON и теряет типы).
- **Чем чинить**: вынести типы в `packages/shared/src/dto.ts` (или новый `entities.ts`) — `NewsListItem`, `NewsPostDetail`, `Comment`, `CommentLikeResult` и т.д. Использовать на сервере (response DTO) и клиенте (тип ответа `apiFetch<NewsListItem[]>`).

### 5. Дублирование санитайзера `sanitize-html.ts` в web и api ✅ DONE 2026-05-24
> Единая реализация в `packages/shared/src/sanitize-html.ts`. `apps/web/src/lib/sanitize-html.ts` и `apps/api/src/common/sanitize-html.ts` теперь — однострочные re-export'ы. Бонусом — добавлен DOMPurify-hook `afterSanitizeAttributes`, который для `target="_blank"` принудительно проставляет `rel="noopener noreferrer"` (закрывает заодно P1 #8 из Этапа 1).
- **Где**: [apps/api/src/common/sanitize-html.ts](apps/api/src/common/sanitize-html.ts) ≡ [apps/web/src/lib/sanitize-html.ts](apps/web/src/lib/sanitize-html.ts) — содержимое почти идентично.
- **Что**: если случайно изменить whitelist в одном месте и забыть в другом — получим расхождение между серверной валидацией и клиентским рендером. Это типичная XSS-ловушка.
- **Чем чинить**: один источник в `packages/shared/src/sanitize-html.ts` (DOMPurify работает и на сервере через `isomorphic-dompurify`).

### 6. Нет глобальной error-boundary и nothing-found-страницы
- См. Этап 3 #1–2: отсутствие `app/not-found.tsx`, `app/error.tsx`, `app/loading.tsx`. Это не баг, а отсутствующая инфраструктура.

### 7. Нет единого API-слоя на клиенте ✅ DONE 2026-05-24
> `apps/web/src/lib/api.ts` превращён в папку `apps/web/src/lib/api/` с тремя файлами: `core.ts` (низкоуровневый apiFetch + token + refresh), `endpoints.ts` (typed namespaced `api` объект с эндпоинтами для news/indices/learning/knowledgeBase/billing/auth/notifications/support/moderation/files), `index.ts` (re-export hub). Добавлен `useApiQuery(key, fetcher, initial)` рядом с `useApiData(path)`. Все 5 view-файлов переведены: 7 хуков и 11 прямых apiFetch заменены на `api.*` вызовы. При ребрендинге URL правится одна строка в `endpoints.ts` вместо ~12 мест в views.
- **Где**: каждый view импортирует `apiFetch` и сам формирует URL: `/news`, `/admin/users?...`, `/learning/modules/${id}`. **42 файла** так делают.
- **Что**: при ребрендинге URL (например, `/admin/users` → `/admin/people/users`) нужно править 42 места.
- **Чем чинить**: тонкая обёртка `api.news.list()`, `api.admin.users.update(id, data)` — один файл `lib/api/index.ts` экспортирует объект с методами. Заодно — единая точка для типизации (см. #4).

### 8. Тестовое покрытие неравномерное
- **Что**: на момент аудита:
  - shared: 6 unit-тестов (access-gating, расчёт индексов цен — все логические инварианты).
  - api: 14 unit-тестов (notifications, support, files, image-presets, moderation) + 79 integration-тестов в **одном файле** `app.integration.test.ts` — это огромный файл, который сам по себе становится god-test.
  - web: 3 теста на `lib/api.ts` (refresh-flow).
- **Дыры**:
  - billing.service — 0 тестов.
  - auth.service (register/login/refresh logic) — только через integration.
  - admin-users, admin-companies, admin-staff, admin-settings, admin-journals — 0 unit-тестов.
  - все React-компоненты — 0 тестов (нет ни Testing Library, ни Storybook).
- **Чем чинить**: декомпозировать integration-тест по доменам (`auth.integration.test.ts`, `content.integration.test.ts`, ...), добавить unit-тесты на ключевые бизнес-инварианты billing.

---

## 🟢 P2 — улучшения

### 9. Нет API-документации (OpenAPI/Swagger)
- **Что**: 12 контроллеров, 50+ эндпоинтов, нигде не сгенерирована OpenAPI-спека. Фронт сделан вручную, и при изменении API легко получить рассинхрон.
- **Чем чинить**: добавить `@nestjs/swagger` (или `nestjs-zod` для автогенерации из zod-схем).

### 10. CommonJS shared + ESM web — рабочее, но компромиссное
- **Что**: `packages/shared` пересобран в CommonJS из-за NestJS-проблем (см. PROJECT_STATUS). Это значит, что новые dependencies в shared должны быть CommonJS-совместимы.
- **Сейчас**: работает, не блокирует. Долгосрочно — пересмотреть, когда NestJS 12+ улучшит ESM-резолюцию.

### 11. dev-режим API на `ts-node-dev`, прод — `tsc + node dist`
- Разные runtime'ы → разные баги могут проявляться только в одном. Стоит хотя бы раз в неделю запускать прод-сборку локально и прогонять smoke-тесты.

### 12. Хардкод констант разбросан по коду
- Примеры: `MAX_UPLOAD_BYTES`, `MAX_COVER_UPLOAD_BYTES`, `POLL_INTERVAL_MS`, `bcrypt cost 12` — каждый в своём файле. Часть пользовательских (длина пароля 8 vs 10) рассинхронизирована (Этап 1 #10).
- Чинить: `packages/shared/src/constants.ts`.

### 13. `docs/` — 10 разделов, частично актуальные (`status: draft`)
- Документация существует, но `PROJECT_STATUS.md` уже устарел (10 тестов vs реальные 79). Стоит ввести правило: «PR, который меняет схему API или БД, должен обновить соответствующий `.md` в `docs/`».

### 14. У admin-разделов нет общего layout-компонента
- Каждый `AdminFooView.tsx` сам рендерит `<AppShell>` внутри. Это работает, но при изменении общего admin-обвеса нужно править N мест.

### 15. Нет линтера ESLint 🟦 Частично DONE 2026-05-25
> `tsc --noEmit` уже работает как «линтер типов» (4 lint-job'а в turbo). ESLint полноценный (правила про unused, complexity) не подключали — не блокирует деплой. Добавим в следующей итерации, когда профиль ошибок будет понятнее.
- `pnpm lint` — это `tsc --noEmit`. Никаких правил кодстайла, no-unused, accessibility-rules, react-hooks/exhaustive-deps. Многие проблемы Этапа 3 ESLint бы поймал.
- Чинить: добавить `eslint-config-next` + `@typescript-eslint`.

### 16. `Prettier` есть, но не запущен в CI ✅ DONE 2026-05-25
> `.github/workflows/ci.yml` запускает `pnpm format:check` в job static-checks. Добавлены `.prettierrc` (printWidth 120, trailingComma all), `.prettierignore` (исключает docs/audit/migrations). На один раз отформатировано 36 файлов — теперь `format:check` зелёный, любой regress поймает CI.
- В корне `"format": "prettier --write ..."` — ручной. В CI нет проверки `prettier --check`. Стили легко разъезжаются.

### 17. Использование Next.js 16 — очень свежая версия
- Релиз буквально недавно. Часть API ещё в RC. Стоит зафиксировать в `package.json` точную версию (без `^`) до выхода 16.1, чтобы не схватить регрессию.

---

## ✅ Что сделано хорошо

- **Монорепо** грамотное: `apps/api`, `apps/web`, `packages/shared` — границы чёткие, общие типы реально шарятся.
- **Turborepo** с правильным `turbo.json` — параллельный build и кэш работают.
- **`packages/shared`** содержит ровно то, что должно: zod-схемы DTO, бизнес-логика расчёта индексов, access-gating, slug. Тесты покрывают эту чистую логику на 100%.
- **NestJS Modules** разбиты осмысленно (auth/billing/content/files/moderation/notifications/support/admin × 5).
- **Prisma-схема** — 39 моделей, читается линейно, enum'ы вынесены. Каскады `onDelete` расставлены.
- **`@ecoplatform/shared`** реэкспорт типов через index — клиентский код не знает про CommonJS-внутренности.
- **Декораторы и guards** правильно слоятся (`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` — это идиоматичный NestJS).
- **`AdminActionLog`** — централизованный audit-trail админских операций. Это редкая в MVP вещь.
- **integration-тесты** покрывают сквозные сценарии (79 тестов), они быстро прогоняются (74с) и выявляют реальные регрессии.
- **Vitest** для всех 3 пакетов с единым воркфлоу.
- **TypeScript strict** включён (можно проверить, но `pnpm lint` через `tsc --noEmit` 4/4 — значит, и web, и api проходят строгую проверку).
- **`docs/`** содержит реальные продуктовые материалы (geo-logic, maps-provider, data-model) — не пустой.
- В commits история ясная, conventional commits встречаются.
