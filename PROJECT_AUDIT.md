# Технический аудит ЭкоПлатформы — 2026-06-19 (повторный)

> Сквозная ревизия монорепо (NestJS API + Next.js web + shared) с позиции senior full-stack / security-reviewer.
> Дата: 2026-06-19. Ветка: `main` @ `a384586`.
>
> Это **второй** проход. Первый (от `469a7ae`) уже выполнен почти весь — его находки закрыты коммитами
> `4d334c1`…`a210cf3` (CORS-allowlist, унификация контракта ошибок, редакция PII в логах, удаление
> metadata-only эндпоинта, обработка сбоев S3/SMTP, a11y модалок, вынос тяжёлых виджетов из first-load,
> SEO, react-query для горячих списков, декомпозиция god-файлов, security-заголовки Caddy/Next).
> Поэтому здесь — только то, что **реально открыто на текущем коде**, плюс новые находки этого прохода.
>
> **Как пользоваться файлом.** Каждый пункт — чекбокс. Закрыл → `[x]` + в «Исполнитель/заметка» кто и что
> (коммит/файл) одной строкой. В работе → `[~]` + имя/дата (это «замок» для параллельной работы Claude+Codex).
> Отклонил → `[-]` + причина. Пункт не удалять — он остаётся историей. 🟡-развилки не начинать без владельца.

## 🤝 Инструкция исполнителю (Claude / Codex / любой агент)

### Прежде чем писать код
1. Прочитай `AGENTS.md` и `CLAUDE.md` в корне — это рабочий стандарт (он главнее личных привычек).
2. Сориентируйся: `git status --short`, свежий `git log`, `README.md`, своя память по проекту.
3. Оцени влияние через `rg`: импорты, соседние компоненты, API-клиенты, DTO в `packages/shared`, тесты.
   Не дублируй существующие компоненты/хуки/форматтеры/API-методы.
4. Если код, README и текст задачи расходятся — **остановись и спроси владельца**, не додумывай.

### Слои (куда что класть)
- **Frontend:** `app/.../page.tsx` тонкий → page-UI в `apps/web/src/views` → переиспользуемое в
  `apps/web/src/components` → не-UI логика в `apps/web/src/lib`. Состояние раздела — хук `use-*.ts`.
- **Backend:** контроллеры тонкие → бизнес-логика в сервисах и `*.helpers.ts` → общие контракты в `packages/shared`.
- Меняешь контракт API/DTO — правь **обе стороны** (api + web) и тесты. Не плоди god-файлы.

### Команды (pnpm из корня; Node 24, pnpm 10.33.0)
| Действие | Команда |
|---|---|
| Установка | `pnpm install --frozen-lockfile` |
| Типы всего репо | `pnpm lint` (= `tsc --noEmit`) / `pnpm typecheck` |
| Unit (все пакеты) | `pnpm test` |
| Integration (нужен Postgres) | `pnpm --filter @ecoplatform/api test:integration` |
| Сборка | `pnpm build` |
| Prettier | `pnpm format:check` / `pnpm format` |
| Prisma client (нужен для tsc) | `pnpm --filter @ecoplatform/api prisma:generate` |
| Сид dev-данных | `pnpm --filter @ecoplatform/api seed` |
| Bundle-анализ web | `ANALYZE=true pnpm --filter @ecoplatform/web build` |
| E2E smoke (Playwright) | `pnpm --filter @ecoplatform/web test:smoke` |

> Integration поднимают тестовую БД (суффикс `_test`) и сами ставят `THROTTLER_DISABLED=1`.
> `@ecoplatform/shared` резолвится из `dist` → при «не найден пакет» сначала `pnpm --filter @ecoplatform/shared build`.

### ⚠️ Безопасность окружения (НЕ навреди проду)
На проде public- и private-бакеты S3 РАЗНЫЕ (private не public-read), боевые SMTP/секреты — только в `deploy/.env.prod`.
Локальный dev использует один dev-бакет и осознанно настроенную почту — это решение владельца (см. «Журнал решений»).
Всё равно не гоняй seed/массовые e-mail-скрипты вслепую: письма уходят туда, куда указывает локальный `.env`.

### Definition of Done
- **Всегда:** зелёные `pnpm lint` + затронутые `pnpm test`.
- **Тронул backend/БД:** + `pnpm --filter @ecoplatform/api test:integration` по домену.
- **Тронул контракт/широкое влияние:** + полный `pnpm build`.
- **UI:** проверка **вживую** (preview web :3000 + api :4000), скриншот, мобильный брейкпоинт 375, тёмная/светлая тема.
- Стейдить файлы явно по именам (не `git add -A`). Один логический таск = один коммит. push/deploy — только по просьбе владельца.

## Итоговая оценка

Кодовая база **зрелая и инженерно аккуратная**, и за последний день стала ещё крепче. Периметр безопасности
проверен заново и держится: in-memory access + HttpOnly refresh с ротацией и ревокацией, double-submit CSRF,
CORS-allowlist с валидацией origin, многоуровневый throttling (+ жёсткое окно на `/auth/*`), magic-byte валидация
загрузок и блок-лист опасных MIME/расширений (включая SVG/HTML/JS), приватный бакет + signed-URL, единый
`access-policy.ts`, проверка JWT-секрета на старте, глобальный фильтр без утечки stack, редакция PII в логах,
боевая CSP + полный набор security-заголовков на web. Сырого SQL с конкатенацией нет (только `Prisma.sql`
с плейсхолдерами). N+1 в горячих местах не нашёл; пагинация на публичных списках есть; транзакции широко используются.

**Критичных дыр в коде нет.** Проведён отдельный глубокий проход по объектной авторизации (IDOR/BOLA),
эскалации прав и доступу к файлам — самый частый реальный вектор взлома — и он **держится консистентно**
(детали в разделе «Авторизация и доступ — проверено глубоко»). Открытые пункты — **непроверенная эксплуатация**
(бэкап/restore БД), техдолг фронтенда (неполный переход на react-query, крупные вьюхи) и мелкие улучшения
(a11y, bundle-budget, пиннинг JWT-алгоритма).

> **Сняты как осознанные решения владельца (2026-06-19):** прежние C-1 (dev-SMTP), C-2 (ротация секретов перед
> запуском), H-1 (один dev-бакет S3). На проде S3-бакеты разделены (public ≠ private, private не public-read);
> dev-окружение настроено владельцем сознательно. В работу не берём — оставлено в «Журнале решений».

---

## 🟠 High — исправить в ближайшее время

- [x] **H-1. Переход на react-query не доведён до конца (11 файлов ещё на ручном fetch).**
  Горячие списки уже на `@tanstack/react-query` (~39 файлов), но осталось ручное `apiFetch`+`useEffect`:
  `components/Notifications{Popover,View,Bell}.tsx`, `FileUploadField.tsx`, `UserSupportDrawer.tsx`,
  `views/admin/{billing,settings,moderation,education,news,indices}/*View.tsx`.
  - **Риск:** рассинхрон состояния, дубль-запросы, ручное loading/error в каждом компоненте, риск race на гонке
    ответов; нотификейшн-кластер ещё и поллит без дедупликации. Конкретно по `NotificationBell.tsx`: `apiFetch`
    без `AbortController`/guard на unmount → `setState` после размонтирования + stale-ответ при смене `token`;
    `setInterval` поллит каждые 60с **даже в фоновой вкладке** (нет паузы по Page Visibility — лишняя нагрузка при
    масштабе); Bell/Popover/View дёргают `/notifications` параллельно без общего кэша.
  - **Фикс:** перевести оставшиеся на `useApiQuery`/`useInfiniteApiQuery`/мутации с инвалидацией ключей
    (`apps/web/src/lib/query/*`). react-query сам даёт отмену запроса, защиту от гонок, паузу поллинга в фоне
    (`refetchIntervalInBackground:false` по умолчанию) и дедуп между Bell/Popover/View. Альтернатива для счётчика — SSE/websocket.
  - **Исполнитель/заметка:** ✅ Claude 2026-06-20. Все 11 файлов переведены. Новое:
    `lib/notifications/use-notifications.ts` (хуки `useUnreadCount` — поллинг 60с с авто-паузой в фоне +
    мост `notifications:changed`→инвалидация; `usePopoverNotifications` — ленивый список; `useNotificationMutations`
    — read/read-all/archive с инвалидацией семейства `notifications`). Bell/Popover/View делят один кэш под
    `queryKeys.notifications.*` (ушли `setInterval`, ручной `apiFetch`, риск race/unmount). FileUploadField:
    мета-фетч по id → `useQuery(queryKeys.files.byIds)` (дедуп между полями); upload-XHR с прогрессом оставлен
    (свой AbortController). UserSupportDrawer: создание тикета/ответ → `useMutation` (+эндпоинты
    `support.createTicket/replyToTicket`). Все 6 admin-вью: read → `useApiQuery`/`useInfiniteApiQuery` под
    `queryKeys.admin.*`, write-мутации → `refetch()`/`reload()` (убраны параллельные state-машины и `loadAll`/
    `loadList`-эффекты). Проверки: typecheck ✓, web build ✓, 212 unit ✓, живьём (админ): /notifications +
    bell-popover + «прочитать все» (badge↔popover синхронны), все 6 admin-вью рендерят без error-boundary.
  - **Хвост (был вне H-1) — ТОЖЕ СДЕЛАН 2026-06-20:** хуки `views/admin/{knowledge,documentation,forum}/use-admin-*.ts`
    переведены на react-query. knowledge/documentation: `loadList`-стейт-машина → `useApiQuery(queryKeys.admin.{knowledge,
    documentation})` + обёртка `reload(): Promise<T[]>` (сохранён контракт для расчёта позиций), оптимистичный reorder
    через `setData`. forum: два `useApiQuery` (`forumTaxonomy` + `forumQuestions(statusFilter)`), смена фильтра сама
    рефетчит по ключу, `keepPreviousData` (новая опция `useApiQuery`) держит список без мигания. Зелёное: typecheck/
    build/212 unit; живьём все три экрана рендерят (knowledge 29 узлов, docs 21, forum фильтр-кнопки без бланка).

---

## 🟡 Medium — технический долг и улучшения

- [x] **M-1. Кэш-сессия (TTL 60с) в `JwtAuthGuard` пропускает повторную проверку `blocked/archived`.**
  При попадании в `SessionCacheService` guard возвращает кэшированного `RequestUser` без обращения к БД, т.е. без
  ре-проверки `user.status`/`company.status` (они проверяются только на cache-miss).
  - **Снижено:** все явные пути блокировки/ревокации (модерация, admin-блок юзера/компании, биллинг, смена
    пароля/почты, logout) зовут `sessionCache.invalidate*` → окно фактически отсутствует для них.
  - **Риск (defense-in-depth):** если появится новый путь, меняющий `status` в обход `invalidate*`, заблокированный
    юзер сохранит доступ до 60с. Подписка по сроку — ОК (кэш хранит даты, гейт считает от текущего времени).
  - **Фикс:** либо в cache-hit ветке всё равно сверять `status` лёгким запросом/полем, либо unit-инвариант «каждое
    изменение `User.status`/`Company.status` сопровождается `invalidate*`». Не блокер.
  - **Исполнитель/заметка:** ✅ Claude 2026-06-20. Выбран вариант с инвариантом (zero-runtime, ловит реальный
    failure-mode «новый путь забыл invalidate»; light-query на каждый cache-hit убил бы смысл кэша). Новый
    AST-тест `apps/api/src/common/session-cache-invalidation-invariant.test.ts` (по образцу
    `body-validation-invariant.test.ts`): сканирует все `*.service.ts`/`*.helpers.ts`, находит Prisma-write
    `*.{user,company}.{update,updateMany,upsert}` с присвоением `status` в ограничивающее (blocked/archived/
    pending_deletion) ИЛИ динамическое значение и требует вызов `invalidate{User,Company,Session}` в том же
    файле. Безопасные литералы (active/demo/past_due — последний гейтится по датам) не требуют. ALLOWLIST с
    обоснованием: `scheduler-cleanup.helpers.ts` (крон-восстановление из pending_deletion = выдача доступа) +
    2-й тест на «протухшие» записи allowlist. Проверено: текущая база зелёная (4 ограничивающих write'а
    user/company все инвалидируют), пробный мисс ловится. typecheck/187 api unit ✓. Guard не трогал.

- [x] **M-2. Бэкап/restore БД не подтверждён эксплуатацией.**
  В репо только `.db-backups/20260528-postgres16-to-18/` (разовая миграция версии PG). Нет следов
  автоматического бэкапа и протестированного restore.
  - **Риск:** потеря данных без проверенного плана восстановления; «бэкап есть» ≠ «restore работает».
  - **Фикс:** подтвердить, что Timeweb Managed Postgres делает регулярные снапшоты + провести **restore-drill**
    на отдельную БД (pg_restore → миграции → smoke). Зафиксировать RPO/RTO и шаги в `deploy/PRODUCTION.md`.
  - **Исполнитель/заметка:** ✅ Закрыто владельцем 2026-06-20: бэкапы делает Timeweb автоматически (managed
    Postgres). Restore-drill остаётся хорошей практикой, но как инфра-задача владельца — из кода-роадмапа снято.

- [x] **M-3. Несколько `findMany` без `take` на потенциально растущих/сканирующих путях.**
  Безопасны по конструкции: GDPR-экспорт (per-user), tree-позиции (bounded по родителю), legal (малый фикс-набор).
  Стоит ограничить: `seo/seo.service.ts` (sitemap по всем published — кап/постранично), сканы
  `billing/billing-notifications.service.ts` (крон по компаниям — батчить).
  - **Риск:** под ростом данных — тяжёлый запрос/большой ответ/нагрузка крона.
  - **Фикс:** явные `take`/курсорный обход на sitemap и крон-сканах; на `EXPLAIN ANALYZE` сверить планы топ-выборок
    (журналы, лента форума, офферы) под реальным объёмом (`pg_stat_statements`). Дополнительно в
    `billing-notifications.service.ts` смену статуса делать `updateMany` (а не `update` в цикле по компаниям),
    а рассылку уведомлений батчить с ограниченной конкуррентностью (сейчас вложенные `for…await` последовательны).
  - **Исполнитель/заметка:** ✅ Claude 2026-06-20. (1) `seo.service.ts` — `take: SITEMAP_MAX_PER_TYPE` (10k)
    на все 4 sitemap-выборки (суммарно ≤40k, под лимитом протокола 50k; при упоре → sitemap-index).
    (2) `billing-notifications.service.ts` — `expireDemo`/`expireSubscription` больше не делают `update` в
    цикле: статус переводится одним `updateMany` (подписки — `updateMany` в одной транзакции; where по
    статусу сохраняет идемпотентность). (3) Рассылка уведомлений во всех 4 методах — через новый
    `common/concurrency.ts` `mapWithConcurrency` (лимит 8; unit-тест на порядок/лимит/edge). Проверено:
    typecheck ✓, api unit 192 ✓, **api integration 240 ✓** (PG поднялся; billing-notifications + seo зелёные).
    ⏭ Вне кода (инфра/владелец): `EXPLAIN ANALYZE`/`pg_stat_statements` по топ-выборкам под реальным объёмом.

- [ ] **M-4. Крупные файлы — риск god-компонентов. → ИСПОЛНИТЕЛЬ: Codex (файл-за-файлом по чеклисту ниже).**
  **Правила для каждого файла (одинаковые):**
  1. Декомпозировать по сложившейся конвенции (AGENTS.md): тонкий page/контроллер; UI → под-компоненты в
     `components/*`/`views/*`; не-UI и состояние → хуки `use-*` и чистые `*.helpers.ts`; на бэке — логика в
     соседние `*.helpers.ts`/сервисы. **Поведение НЕ меняем** — чистый рефактор (вынос, не переписывание).
  2. Не плодить новые god-файлы: цель — каждый получившийся файл заметно меньше и с одной зоной ответственности.
  3. Переиспользовать уже существующее (не дублировать хуки/форматтеры/типы); смотреть соседние файлы того же домена.
  4. После КАЖДОГО файла: `pnpm --filter @ecoplatform/web exec tsc --noEmit` (или `@ecoplatform/api`), `pnpm lint`,
     релевантные unit/integration; для web-UI — глянуть экран вживую. Не считать готовым при красном typecheck/тестах.
  5. **Один файл → один коммит** (в `main`). Проставлять `[x]` напротив сделанного. `push`/`deploy` — НЕ делать.

  **Frontend (`apps/web/src/`):**
  - [x] `components/auth/register-form.tsx` (526 → 104) — многошаговая форма разнесена без смены поведения:
        состояние/OTP/submit → `use-register-form`, чистая логика → `register-form.helpers` (+unit), кнопки и
        закрытая регистрация → малые presentational-компоненты. Codex 2026-06-21; проверки:
        web tsc ✓, web unit 222 ✓, root lint ✓, live `/register` desktop/375/OTP ✓.
  - [x] `views/admin/companies/AdminCompaniesView.tsx` (471 → 112) — таблица/строка/фильтры/detail-panel/form статуса
        вынесены в малые соседние компоненты, данные+мутация статуса — в `use-admin-companies` на react-query.
        Codex 2026-06-21; проверки: web tsc ✓, root lint ✓, web unit 222 ✓, format ✓, diff-check ✓.
        Live `/admin/companies` пропущен: локальный `.env` содержит prod-like S3/storage и SMTP/mail признаки.
  - [x] `views/account/AccountView.tsx` (460 → 157) — секции профиля оставлены в тонком контейнере,
        состояние/URL-модалки/scroll-spy/security/data-privacy/notification-preferences вынесены в соседние
        `use-account-*` хуки без смены поведения. Codex 2026-06-21; проверки: web tsc ✓, root lint ✓,
        web unit 222 ✓, format ✓, diff-check ✓. Live `/account/*` пропущен: локальный `.env` содержит
        prod-like S3/storage и SMTP/mail признаки.
  - [x] `views/admin/staff/AdminStaffView.tsx` (457 → 105) — контейнер оставлен тонким, фильтры/форма
        инвайта/таблица/строка вынесены в соседние компоненты, данные+мутации — в `use-admin-staff`
        на react-query без смены API-контракта. Codex 2026-06-21; проверки: web tsc ✓, root lint ✓,
        web unit 222 ✓, format ✓, diff-check ✓. Live `/admin/staff` пропущен: локальный `.env`
        содержит prod-like S3/storage и SMTP/mail признаки.
  - [x] `views/marketplace/ListingModal.tsx` (424 → 168) — модалка оставлена тонким контейнером,
        галерея/шапка/характеристики/action-колонка вынесены в соседние под-компоненты, чистые вычисления —
        в `listing-modal.helpers` без смены поведения. Codex 2026-06-21; проверки: web tsc ✓, root lint ✓,
        web unit 222 ✓, format ✓, diff-check ✓. Live `/marketplace` пропущен: локальный `.env` содержит
        prod-like S3/storage и SMTP/mail признаки.
  - [x] `components/AudioMessagePlayer.tsx` (420 → 49) — публичный компонент оставлен тонким фасадом,
        логика воспроизведения/seek/speed/waveform вынесена в `use-audio-player`, JSX — в `audio-player-view`,
        чистые расчёты — в `audio-player.helpers` (+unit). Codex 2026-06-21; проверки: web tsc ✓,
        web unit 228 ✓, root lint ✓, format ✓, diff-check ✓. Live UI пропущен: локальный `.env` содержит
        prod-like S3/storage и SMTP/mail признаки.
  - [ ] `components/editor/DocumentEditor.tsx` (400) — конфиг расширений/тулбар/slash-команды в модули `lib/editor/*`
        (сериализатор уже там); сам компонент — тонкая оболочка.
  - [ ] `views/admin/documentation/use-admin-documentation.ts` (407) — *borderline (хук данных)*: разнести на под-хуки
        (список/реордер/мутации) или helpers, если читается как god-хук; иначе пропустить.

  **Backend (`apps/api/src/`):**
  - [ ] `billing/billing-activation.helpers.ts` (448) — разнести по под-операциям (trial / self-subscription / manual)
        в отдельные helper-файлы одного домена.
  - [ ] `auth/auth-data-export.service.ts` (423) — GDPR-экспорт: сбор по доменам вынести в `*.helpers`, сервис — оркестратор.
  - [ ] `marketplace/services/marketplace-listings.service.ts` (422) — `mapToDetail`/фильтры/гео-логику в helpers.
  - [ ] `moderation/moderation-case.helpers.ts` (421) — *borderline (уже helpers)*: дробить по типам кейсов только если
        реально облегчает чтение.
  - [ ] `auth/auth.service.ts` (414) — *borderline (тонкий оркестратор, логика уже в `auth-*.helpers`)*: при желании
        вынести `register`/`verifyRegistration` в `auth-registration-workflow.helpers`. Низкий приоритет.

  - **Исполнитель/заметка:** список подготовлен Claude 2026-06-21 (свежие LOC; auth.service.ts +13 строк после L-6).
    Декомпозицию выполняет Codex по чеклисту выше.

- [x] **M-5. `globals.css` ещё 4796 строк (хвост M-1b) + ренейм `.auth-*` (M-1c).**
  Механический вынос co-located CSS почти исчерпан. Остаток — развести «общую дизайн-систему карточек/форм»,
  ошибочно живущую под префиксом `.auth-*` (используется в error/not-found/forgot-password/смене почты/broadcast),
  на нейтральные `card-*`/`form-*`/`otp-*` (в `components/ui/*.css`) и собственно auth-чрому (`auth-shell.css`).
  - **Риск:** maintainability; имя `.auth-*` вводит в заблуждение, мешает дроблению.
  - **Фикс:** поэтапный ренейм по кластерам с live-проверкой каждой затронутой поверхности. 🟡 объём — за владельцем.
  - **Исполнитель/заметка:** ✅ Claude 2026-06-20.
    **M-1c (ренейм `.auth-*`) — уже было сделано** ранее (коммиты `4de812c` auth-card→ui-card, `7c3e519`
    auth-actions→form-actions, `430fa81` otp-ренейм, `d8d5c6f` форм-примитивы, `1a90c50` «завершить ренейм»):
    проверено — `.auth-*` теперь используется ТОЛЬКО внутри `components/auth/` (нет утечек в legal/account/admin;
    общие примитивы живут под `ui-card*`/`form-*`/`otp-*`). Все 38 `.auth-*` классов — в `auth-shell.css`.
    **M-1b (хвост выноса) — добил два самых крупных мис-файленных кластера** через postcss-codemod
    (`/tmp/extract-css.cjs`, перенос полных правил, в т.ч. в `@media`, только когда ВСЕ селекторы содержат
    префикс): `.audio-*` (34 правила) → новый `components/audio-message-player.css`; `.indices-*` (admin-CMS,
    56 правил) → `styles/admin.css` (без ренейма — admin.css импортится во всех admin-вью; leak-check: эти
    классы нигде вне `views/admin/`). **globals.css 4796 → 4179** (−617). Один общий респонсив-`@media` с
    `.indices-admin-layout` среди мульти-селектора корректно ОСТАВЛЕН в globals (SHARED). Статически доказано:
    globals diff = `0 added / 617 deleted`, все удалённые селекторы — audio/indices, все «приземлились» в
    целевых файлах (lossless). typecheck ✓, web build ✓, публичные поверхности чистые (консоль 0 ошибок).
    Не проверил вживую под админом (нет auth в preview; ввод пароля — запрещён) — но это byte-equ relocation,
    риск минимален; владельцу стоит глянуть `/admin/content/indices` и урок/новость с аудио.
    **Остаток (опц., 🟡 за владельцем):** ещё есть фиче-кластеры в globals (lesson/video/module/education →
    learning; forgot; comment; news/password/tree — частично SHARED). Глобальный app-shell (nav/topbar/sidebar/
    eco/rendered/consent) — оставить в globals. Дальнейший вынос — по желанию, тем же codemod'ом.

- [x] **M-6. A11y — системный аудит + устранение находок.** (2026-06-20)
  Хук `use-dialog-a11y.ts` (focus-trap/esc/возврат фокуса) уже применён к модалкам/drawer'ам; живой проход дал
  находки A-1…A-7 (ниже). Устранены все код-находки:
  - **A-1** — `AuthSelect` (тип компании на регистрации) теперь полноценный select-only combobox по APG:
    `role="combobox"` + `aria-controls`/`aria-activedescendant`/`aria-labelledby` (связан видимый лейбл).
    Снапшот в браузере: было `button`, стало `combobox: "ТИП КОМПАНИИ" (value: …)`.
  - **A-4** — обложки контента (новости/БЗ/обучение) больше не отдают `alt`=имя файла → `alt`=заголовок.
  - **A-5** — секции сайдбара были вложенными безымянными `<nav>`; стали `<div role="group" aria-labelledby>`
    (один navigation-лендмарк `<aside>`, имя группы = её видимый заголовок). Проверено: 5 групп с именами.
  - **A-6** — auth-страницы (marketplace/account) получили per-route `metadata.title` (`createPageMetadata`,
    `noIndex`); вместо generic «ЭкоПлатформа» теперь, напр., «Торговая площадка · ЭкоПлатформа».
  - **A-7** — контейнер карты 2ГИС получил `role="region"` + `aria-label="Карта объявлений"`.
  - **Не входит (за владельцем):** A-2 (тёмная тема — её нет вовсе). A-3 (ISR detail-страниц) — ЗАКРЫТО отдельно (`efc08709`).
  - **Проверки:** typecheck ✓, web unit 212 ✓, web build ✓; вживую в preview подтверждены A-1/A-4/A-5/A-6/A-7
    (combobox-семантика, alt=заголовок, 5 именованных групп, title, map region).
  - **Не проверено живьём:** урок-плеер Vidstack (уникальный a11y-виджет) — оставлен на отдельный заход.

- [x] **M-7. Bundle-budget зафиксирован.** (2026-06-20)
  - **Dynamic-split подтверждён:** все тяжёлые виджеты грузятся `next/dynamic` + `ssr:false` — DocumentEditor/TipTap
    (`LazyDocumentEditor.tsx`), lottie-иконки (`nav-icons.tsx`), MapGL 2ГИС (`MarketplaceView.tsx`), Vidstack-плеер
    (`content-block-media.tsx`). В общий (shared) чанк не утекают.
  - **Базлайн снят** с шипающей сборки `next build` (Turbopack): **shared first-load 245.8 kB gzip** (пол, который
    платит каждый маршрут) + **total client JS 1307 kB gzip** (154 чанка). NB: Next 16 больше НЕ печатает таблицу
    First-Load JS, а `app-build-manifest.json` не генерится → считаем из `build-manifest.json`+файлов. Webpack
    (`pnpm analyze`) даёт другой чанкинг (242.5/1167) — бюджет калибруется по Turbopack-сборке.
  - **Порог зафиксирован и автоматизирован:** `apps/web/bundle-budget.json` (260 / 1450 kB gzip, запас ~6%/11%) +
    `scripts/check-bundle-budget.mjs` + npm-скрипт `budget`. Регрессия (тяжёлый импорт в shared / потерянный
    `next/dynamic`) валит проверку (exit 1). Запуск: `pnpm --filter @ecoplatform/web build && … budget`. Детальный
    per-chunk разбор — `pnpm analyze` → `.next/analyze/*.html`. Проверено: на текущей сборке budget зелёный (95%/90%).
  - **CI:** шаг `Bundle budget (web)` добавлен в job `static-checks` после Build (валит CI при превышении).
  - **Остаток (опц.):** A-3 (ISR detail-страниц) — ЗАКРЫТО отдельным коммитом `efc08709`.
  - **Исполнитель/заметка:** Claude.

- [ ] **M-8. Самостоятельная активация подписки/триала выдаёт доступ БЕЗ оплаты (launch-blocker).**
  `POST /api/billing/subscriptions` (`createSelfSubscriptionActivation`) и `POST /api/billing/trial` ставят компании
  `status=active` + `subscriptionEndsAt = now + 30 дней` без какой-либо оплаты (платёжный шлюз ещё не подключён —
  в коде прямой намёк: «Продление через оплату появится следующим шагом»). Владелец компании может активировать
  бесплатно; стакать нельзя (проверка `isCompanySubscriptionCurrentlyActive`), но **после каждого истечения —
  активировать заново**, т.е. бесплатный доступ бесконечно 30-дневными окнами.
  - **Файлы:** `apps/api/src/billing/billing-activation.helpers.ts:173` (+ trial), `billing.controller.ts:39,50`.
  - **Риск:** не взлом, а **прямой ущерб выручке** после публичного запуска (все сидят бесплатно). Сейчас приемлемо
    (закрытый pre-launch, демо-компании вручную), но это осознанная заглушка, которую легко забыть.
  - **Проверка:** owner компании с истёкшим demo → `POST /api/billing/subscriptions` → снова active на 30 дней без оплаты.
  - **Фикс (перед запуском):** завести подписку только после подтверждённой оплаты (Tinkoff webhook с проверкой
    подписи), а до интеграции — закрыть self-activation фиче-флагом (как `MARKETPLACE_ENABLED`) или оставить только
    админскую `manual-subscriptions`. 🟡 Развилка: оставлять ли бесплатный триал и на какой срок — решает владелец.
  - **РЕШЕНИЕ ВЛАДЕЛЬЦА (2026-06-21): ОСОЗНАННО ОСТАВЛЕНО.** Подписка/оплата сознательно «на втором плане»,
    пока идёт альфа-тест (доступ всем участникам бесплатно по 30-дневным окнам — это ожидаемое поведение фазы).
    НЕ баг, НЕ re-flag. Вернуться перед публичным/платным запуском: подключить оплату (Tinkoff webhook) ИЛИ
    закрыть self-activation фиче-флагом. До конца альфы — не трогать.

- [ ] **M-9. Смена email подтверждается СТАРЫМ адресом, новый адрес не верифицируется.**
  Поток `startContactChange → verifyContactChange → applyContactChange` (`account.service.ts`): код отправляется на
  **текущий** email пользователя, а **новый** email приходит только на шаге `apply` и применяется без отправки кода
  на него. Проверяется лишь занятость (`assertContactValueAvailable`).
  - **Что хорошо:** это закрывает захват через угон сессии (код уходит на старую почту, которой у атакующего нет) —
    хорошее свойство, его терять нельзя.
  - **Риск (Medium):** пользователь/сессия может выставить email, которым НЕ владеет (опечатка или чужой адрес):
    письма биллинга/уведомлений уходят не туда; если позже появится публичный forgot-password — непроверенный
    email становится вектором захвата; лёгкая возможность «припарковать» чужой адрес.
  - **Файлы:** `apps/api/src/account/account.service.ts:70-226`.
  - **Проверка:** сменить email на адрес, к которому нет доступа → смена проходит без подтверждения нового адреса.
  - **Фикс:** двухсторонняя верификация — код на **новый** адрес (подтверждение владения) + уведомление на **старый**
    (алерт о смене). Телефон — аналогично, когда подключат SMS.
  - **Исполнитель/заметка:**

- [x] **M-10. Видеотранскодер: pending-видео из бэклога могут не перекодироваться никогда (starvation).**
  `video-transcode.service.ts:findNextPending` берёт только **50 самых свежих** видео
  (`take: 50, orderBy createdAt desc`) и фильтрует статус в JS, т.к. статус лежит в JSON-колонке
  `videoRenditions` и не индексируется/не запрашивается из SQL. Если в системе >50 видео, а pending — старее
  топ-50, оно не попадёт в выборку и останется неперекодированным (плеер будет вечно отдавать оригинал).
  - **Риск:** под ростом данных часть видео тихо «застревает»; корень — анти-паттерн «статус внутри JSON».
  - **Фикс:** вынести статус в отдельную индексируемую колонку (`videoStatus enum @default(pending)` + `@@index`)
    и выбирать `where: { videoStatus: { in: [pending, processing] } }` (атомарный claim заодно решает M-11/L-7),
    либо JSON-path `videoRenditions->>'status'` с индексом. Подобрать самый старый pending, не «топ-50 свежих».
  - **Исполнитель/заметка:** ✅ Claude 2026-06-20. Добавлена индексируемая колонка `FileAsset.videoStatus`
    (enum `VideoTranscodeStatus`, зеркало JSON-статуса) + `@@index([videoStatus, createdAt])` (миграция
    `20260620120000_video_status_column` с бэкофиллом из существующего JSON). `findNextPending` («топ-50 свежих»
    + фильтр в JS) заменён на `claimNextPending()` — атомарный `UPDATE … WHERE id = (SELECT … WHERE videoStatus IN
    (pending,processing) ORDER BY createdAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED)` → берёт САМЫЙ СТАРЫЙ незавершённый
    и сразу метит `processing`. `setStatus`/upload синхронят колонку. `SKIP LOCKED` исключает двойную обработку
    на нескольких инстансах (закрывает claim-часть L-7; `running` оставлен как CPU-гард на инстанс). Тесты:
    интеграционный (старейший pending из-под 55 свежих ready) ✓; api unit/integration зелёные.

- [x] **M-11. Видеотранскодер: нет таймаута на процесс ffmpeg/ffprobe → зависание убивает фичу целиком.**
  `run()` (`video-transcode.service.ts:215`) ждёт `close` без таймаута. Битый/злонамеренный файл, на котором
  ffmpeg зависает, оставит promise неразрешённым → `processPending` не дойдёт до `finally`, флаг `running`
  останется `true` навсегда → все последующие перекодировки не запустятся до рестарта процесса.
  - **Риск:** один проблемный файл вешает весь видеоконвейер до ручного рестарта (reliability).
  - **Фикс:** таймаут на дочерний процесс (`setTimeout` → `child.kill("SIGKILL")` + reject), как сделано для SMTP
    (`sendMailWithTimeout`). Разумный лимит на ренишен (напр. 10–15 мин), конфигурируемый env.
  - **Исполнитель/заметка:** ✅ Claude 2026-06-20. В `run()` добавлен таймаут `TRANSCODE_TIMEOUT_MS`
    (env `VIDEO_TRANSCODE_TIMEOUT_MS`, дефолт 15 мин, минимум 10с): по истечении `child.kill("SIGKILL")` + reject,
    guard `settled` против двойного resolve, `clearTimeout` на close/error. Зависший ffmpeg → reject → `processAsset`
    catch → `setStatus(failed)` → `finally` снимает `running` → конвейер продолжает работу. Unit-тест (мок `spawn`,
    процесс без `close` → reject по таймауту + `SIGKILL`) ✓.

---

## 🔵 Low — косметика и мелкие улучшения

- [~] **L-1. CSP в проде содержит `style-src-attr 'unsafe-inline'`.** ДИРЕКТИВА ОСТАЁТСЯ ОСОЗНАННО (решение
  владельца 2026-06-21); сделана только гигиена (коммит `fee1e17b`).
  - **Почему директиву нельзя убрать (важно, НЕ re-flag как «просто перевести на CSS-переменные»):** исходный
    «фикс» опирался на заблуждение — **CSS-переменная, выставленная через проп `style`, ТОЖЕ inline style-атрибут**
    и подчиняется `style-src-attr`. Полное удаление директивы требует ОБОИХ: (1) per-request nonce для динамических
    стилей → перевод всех страниц в динамический рендер (убьёт ISR из A-3 + отменит явное «no per-request nonce» из
    next.config); (2) отказ от dnd-kit drag (покадровый inline transform нельзя nonce'ить) → замена перетаскивания
    на кнопки. Ради Low-риск директивы (style-атрибуты не исполняют JS; контент санитайзится). Владелец выбрал НЕ делать.
  - **Сделано (гигиена, без удаления директивы):** ~55 СТАТИЧНЫХ inline-стилей → классы (новый
    `src/styles/utilities.css` + co-located модификаторы там, где feature-CSS перекрыл бы утилиту по каскаду).
    Динамические (прогресс/цвета/charts/спарклайны/CSS-vars/dnd-kit/reveal) намеренно остались inline.
  - **Исполнитель/заметка:** гигиена — Claude; удаление директивы — won't-fix (владелец).

- [x] **L-2. Контракт ошибки — покрытие фронта проверено + единый helper.** (2026-06-20)
  - **Проверка покрытия:** все API-пути (`apiFetch`/`apiDownload`/XHR-upload/`apiDeleteFile`) бросают `ApiError`
    с сообщением из контракта `{message,error,statusCode}` (через `extractApiErrorMessage`). Обработчики во вью
    читают `error.message` → серверное сообщение долетает до UI. Ad-hoc чтения полей (`data.error`/`statusCode`)
    нигде нет; сырые `fetch` (LegalDocumentPage/seo — серверные с graceful-fallback; AudioMessagePlayer — media-blob;
    session — внутренний auth) контракт ошибки не показывают, это ок.
  - **Консистентность:** повторявшийся в ~30 файлах идиом `e instanceof Error ? e.message : fallback` сведён в один
    `errorText(error, fallback)` (`apps/web/src/lib/api/errors.ts`) + unit-тест; два локальных дубль-хелпера (forum)
    схлопнуты. Имя `errorText` (не `errorMessage`) — чтобы не конфликтовать с локальным `errorMessage` из `useApiQuery`.
  - **Побочно:** заодно починен дрейф `format:check` (CI-джоб `static-checks` падал на нём — 11 файлов разошлись с
    prettier, накопленный дрейф + хвосты M-5/M-6). Теперь `pnpm format:check` зелёный.
  - **Проверка:** typecheck ✓, web unit 215 ✓ (3 новых теста errorText), web build ✓, `format:check` ✓.
  - **Исполнитель/заметка:** Claude.

- [x] **L-3. Нотификации поллятся интервалом.** ЗАКРЫТО вместе с H-1 (2026-06-20), подтверждено 2026-06-21.
  Единый react-query слой `lib/notifications/use-notifications.ts`: `useUnreadCount` — ОДИН поллинг через
  `refetchInterval: 60s` (react-query сам ставит на паузу в фоновой вкладке), Bell/Popover/View делят общий кэш
  семейства `queryKeys.notifications.*`, мутации инвалидируют его целиком. Дубль-запросов/ручного `setInterval`+
  `apiFetch` по уведомлениям больше нет (полный список — отдельный `useInfiniteApiQuery`, это корректно).
  - **Исполнитель/заметка:** Claude (в составе H-1).

- [x] **L-4. `MARKETPLACE_ENABLED` — флаг закрытой площадки. РЕШЕНИЕ ВЛАДЕЛЬЦА (2026-06-21): ДЕРЖАТЬ ЗАКРЫТОЙ.**
  Торговая площадка скрыта НАМЕРЕННО и должна оставаться скрытой ещё долгое время — **и локально, и на проде** —
  пока владелец явно не решит иное. Гейт (env `MARKETPLACE_ENABLED` + `nav roles:[admin]` + `MarketplaceFeatureGuard`→404)
  оставляем как есть; **не открывать**, не снимать роль-гейт, не re-flag как «todo». Открытие (companyTypes-навигация +
  подписочный гейт + E2E) — отдельная задача строго по будущему решению владельца. Жизненный цикл флага — в памяти
  marketplace_build. NB: на проде площадка и так не видна (env не задан/nav admin-only); локальный dev-флаг для
  разработки трогать не требуется — «скрыта» = не публикуется пользователям.
  - **Исполнитель/заметка:** осознанное решение, кодовых изменений не требует.

- [x] **L-5. JWT-алгоритм запиннен (defense-in-depth).** (2026-06-20)
  - **Сделано:** `verifyAsync(token, { secret, algorithms: ["HS256"] })` в guard + парно `algorithm: "HS256"` в
    `signAsync`. Других sign/verify-сайтов в API нет (refresh-токен — кастомная строка `id.tail`, не JWT).
    Закрывает класс алгоритм-confusion (`alg:none`/RS↔HS подмена).
  - **Файлы:** `apps/api/src/common/jwt-auth.guard.ts:35`, `apps/api/src/auth/auth-session-workflow.helpers.ts:50`.
  - **Проверка:** typecheck ✓, api unit 193 ✓, integration 240/241 ✓ (login/refresh-roundtrip — в зелёных; единств.
    фейл — известный flaky `auth-session-deletion/cleanup` по S3-latency, не связан с JWT). Подпись↔проверка
    интероперируют end-to-end.
  - **Исполнитель/заметка:** Claude.

- [x] **L-6. Регистрация раскрывает занятость email/телефона (`ConflictException`).** ЗАКРЫТО (2026-06-21):
  убран account-enumeration. Было: `register`/`verifyRegistration` бросали 409 «Пользователь с такой почтой или
  телефоном уже зарегистрирован» без авторизации.
  - **Стало (анти-enumeration):** `register()` отвечает ОДИНАКОВО (201, тот же `{verificationId,email,expiresAt}`)
    вне зависимости от занятости. Контакт занят → кода нет и заявка не сохраняется, а на занятый адрес уходит
    письмо `EmailService.sendExistingAccountNotice` («кто-то пытался зарегистрироваться с вашими данными»);
    фантом-`verificationId` → verify даёт generic «Код устарел». Existence-проверка вынесена из `prepareRegistration`
    (там остались registration_enabled + password policy + consent) в единую ветку `register`. Race на шаге verify
    (контакт заняли между заявкой и подтверждением) → generic 400 «Код устарел» (не `ConflictException`; импорт убран).
    SMTP-сбой notice бросает ту же ошибку, что и код → ответ на заявку неотличим по поведению.
  - **Вне scope:** 409 при authenticated смене контакта (account.service) НЕ трогали — низкий риск, не публичный.
  - **Файлы:** `apps/api/src/auth/auth.service.ts`, `apps/api/src/email/email.service.ts` + 2 теста.
  - **Проверка:** typecheck ✓; api unit 194 ✓ (+1: занятый контакт → notice, не код, challenge.create не зван);
    integration 240/241 ✓ (registration-тест переписан: dup → 201, verify фантома → 400, второй аккаунт не создан;
    единств. фейл — известный flaky `auth-session-deletion/cleanup` S3-latency 30s, не связан).

- [ ] **L-7. Видеотранскодер завязан на один инстанс API (in-memory `running`) + буферизует ренишен в память.**
  Сериализация транскодинга — через поле `this.running` (in-memory), а не advisory-lock, как у всех остальных
  кронов. На втором инстансе API одно и то же видео перекодируется дважды. Плюс `readFile(outPath)` грузит весь
  готовый ренишен в Buffer перед `PutObject` (до 100 МБ × до 3 шт).
  - **Риск:** не баг на текущем single-instance проде, но мешает горизонтальному масштабированию; память на больших видео.
  - **Фикс:** атомарный claim в БД (см. M-10) вместо `running`; стримить загрузку ренишена в S3 (multipart/stream),
    а не через полный Buffer. Делать вместе с M-10.
  - **Исполнитель/заметка:** ✅ ЗАКРЫТО (claim — с M-10 2026-06-20; стриминг — 2026-06-21, коммит `a9149138`).
    Атомарный claim `FOR UPDATE SKIP LOCKED` убрал двойную обработку на разных инстансах; `running` оставлен
    осознанно как per-instance CPU-гард. Стриминг: `readFile`→Buffer заменён на `@aws-sdk/lib-storage` `Upload`
    (multipart) с `createReadStream` — буфер по одной ~5-МБ части + безопасные per-part ретраи (сырой поток в
    PutObject при ретрае не перечитать), пик памяти не зависит от размера видео. `runFfmpeg` возвращает размер из
    `stat` для метаданных ренишена. Проверки: typecheck ✓, api unit (transcode) 2 ✓, integration claim-path 1 ✓;
    живой round-trip против twcstorage (2 МБ fs-stream → Upload → HeadObject ContentLength=2 МБ → cleanup) ✓.
    Сам транскод локально не прогоняется (ffmpeg не установлен); на проде ffmpeg есть.

- [x] **L-8. Publish-lifecycle дублируется по контент-доменам.** ЗАКРЫТО (2026-06-21, коммит `19c2ef5c`):
  повтор `{ status: published, firstPublishedAt: existing.firstPublishedAt ?? now }` сведён в чистый helper
  `publishedLifecycleData(current, now)` (`content/services/publish-lifecycle.helpers.ts` + unit-тест) и применён в
  6 местах: news/kb/documentation/indices + learning (модуль и урок). Документация поверх добавляет `revisedAt`.
  - **Не тронуто намеренно:** bulk-публикация черновых уроков (`firstPublishedAt: now` для draft-уроков при публикации
    модуля) — другой семантический случай (это первая публикация «сейчас», а не сохранение исходной даты).
  - **Проверка:** typecheck ✓, api unit 196 ✓ (+2), integration 40/40 ✓ (seo/indices/learning/documentation/
    files-content — публикация без регрессий). Чистый DRY, поведение идентично.

---

## 🧹 Качество кода и современные стандарты (4-й проход)

> Кодовая база уже очень чистая: TS `strict` + `noUncheckedIndexedAccess`, **0** `@ts-ignore`, 1 `as any`,
> практически нет TODO/FIXME, зависимости свежайшие (Next 16, React 19, Nest 11, Prisma 6, zod 4, TS 5.9).
> Ниже — точечные упрощения «костылей» и пробелы по современным стандартам, без потери качества/безопасности.

- [ ] **Q-1. ESLint не подключён вообще (главный пробел стандартов).**
  `lint` во всех пакетах = `tsc --noEmit` (это typecheck, не линт). Нет `eslint.config.*`/`.eslintrc`, нет
  зависимости eslint. Следствия: 12 комментариев `// eslint-disable-next-line react-hooks/exhaustive-deps`
  **мёртвые** (никто их не проверяет); нет автопроверок класса, который TS+Prettier не ловят — `react-hooks`
  (битые зависимости эффектов), `@typescript-eslint/no-floating-promises` (необработанные промисы — сейчас держится
  ручной дисциплиной `void`), `jsx-a11y` (база под M-6), security-правил (`no-eval`, `no-unsanitized`).
  - **Риск:** регрессии effect-deps/floating-promise проходят молча; a11y/security без автоматического барьера.
  - **Фикс:** flat-config ESLint (`eslint.config.mjs`) с `@typescript-eslint`, `eslint-plugin-react-hooks`,
    `eslint-plugin-jsx-a11y`, опц. `eslint-plugin-security`; `lint` = `eslint .` (typecheck оставить отдельным
    `typecheck`); включить в CI. Затем пройти живые предупреждения exhaustive-deps (часть уйдёт вместе с H-1).
  - **Исполнитель/заметка:**

- [ ] **Q-2. Два независимых HTML-санитайзера (костыль jsdom-в-Next-SSR).**
  `packages/shared/sanitize-html.ts` (DOMPurify, 127 строк) + `apps/web/src/lib/sanitize-html.ts`
  (ручной regex, 164 строки). Web НЕ импортирует shared (jsdom ломал упаковку в Next SSR), whitelist'ы
  держатся в синхроне **вручную**, parity-теста нет → при расхождении web отрендерит то, что сервер бы вырезал.
  - **Риск:** maintainability + хрупкость regex-санитайзера как последней линии (primary — DOMPurify на записи — ОК).
  - **Фикс (упрощение):** вынести рендер paragraph-HTML в маленький **server-компонент** (использует shared DOMPurify,
    клиенту санитайзер вообще не нужен) и отделить его от интерактивных блоков (quiz/matching = client). Если оставлять
    клиентский — добавить **parity-тест** whitelist'ов (как у `materials.ts` с `--material-*`), чтобы не разъехались.
  - **Исполнитель/заметка:**

- [ ] **Q-3. Блоки контента рендерятся через `as unknown as` без рантайм-валидации.**
  `ContentBlocks.tsx:160-163`: `block.payload as unknown as QuizPayload`/`MatchingPayload`. При этом в shared
  **уже есть** `quizBlockSchema`/`matchingBlockSchema` (zod) — каст вместо валидации.
  - **Риск:** битый/легаси payload из БД роняет плеер в рантайме; теряется type-safety.
  - **Фикс:** `quizBlockSchema.safeParse(block.payload)` на границе рендера (или один разбор всего блока через
    `lessonContentBlockSchema`), с graceful-фолбэком на невалидный блок. Убирает двойной каст.
  - **Исполнитель/заметка:**

- [ ] **Q-4. Повторяющийся каст `as unknown as Prisma.InputJsonValue` (биллинг/трип-калькулятор).**
  6+ мест льют типизированный объект в Prisma-JSON через двойной каст. Это известная фрикция Prisma, но шумит.
  - **Фикс:** один хелпер `toPrismaJson<T>(value: T): Prisma.InputJsonValue` + при чтении idempotency-replay
    валидировать `existing.response` zod-схемой вместо `as unknown as T` (сейчас доверяем форме JSON из БД вслепую).
  - **Исполнитель/заметка:**

- [ ] **Q-5. Мелкие dev-experience / стандарты (опционально).**
  Нет pre-commit хука (prettier/tsc гоняются только в CI — `lint-staged`+`simple-git-hooks` ловили бы до push);
  нет OpenAPI/Swagger для API (контракт частично закрыт shared-типами, но машиночитаемой спеки нет);
  `auth-shell.tsx` использует `<img>` вместо `next/image` (1 место, билборд).
  - **Фикс:** по желанию владельца — `simple-git-hooks` + `lint-staged`; `@nestjs/swagger` (+ zod-to-openapi) если нужен
    внешний контракт; `next/image` для билборда.
  - **Исполнитель/заметка:**

---

## 🔬 Живой аудит (a11y / perf / baseline) — 2026-06-20

> Поднят preview (web :3000 + api :4000), пройдены публичные ключевые экраны. Аутентифицированные экраны
> (news/forum/marketplace/account/урок) НЕ проверены живьём — нет dev-кредов (seed требует `SEED_*_PASSWORD`,
> в `.env` их нет; БД не трогал намеренно). Это остаток для следующего захода (владелец даёт креды или сидует).

**Базлайн тестов/сборки (локально, 2026-06-20):**
- [x] **Unit — зелёные:** 429 тестов (api 185 / web 212 / shared 32), все passed.
- [x] **Build — зелёный:** `pnpm build` exit 0; web собирается, 53 маршрута, `sitemap.xml` с revalidate 5m/expire 1y.
- [ ] **Integration — локально НЕ прогнаны:** Postgres :5433 лёг во время сессии, docker в окружении недоступен →
      `ECONNREFUSED`. В CI прогоняются против сервис-Postgres (по памяти ~227 тестов). Проверить локально: поднять
      `docker compose -f docker-compose.dev.yml up -d` (или внешний PG) и `pnpm --filter @ecoplatform/api test:integration`.

**A11y публичных экранов — хорошо (login, register):**
- [x] У обоих: `<title>` (SEO-метадата работает), skip-link «К содержимому», landmark `main`, заголовок-секция,
      инпуты с `<label>`, доступные имена кнопок (вкл. тоггл «Показать пароль»), cookie-баннер как `dialog`.
      Регистрация: степпер — семантический `list` с именем «Шаг N из 3». Консоль чистая, сетевых ошибок нет
      (только ожидаемые `/auth/refresh`→401 при отсутствии сессии, дублируются dev-StrictMode).

**Находки живого аудита:**
- [x] **A-1 (Low, a11y). Кастомные дропдауны — `button` без combobox/listbox-семантики.** ЗАКРЫТО в M-6:
      `AuthSelect` → `role="combobox"` + `aria-controls`/`aria-activedescendant`/`aria-labelledby` (видимый лейбл связан).
      (Marketplace/forum дропдауны уже имели listbox-семантику; forum — эталонный combobox.)
- [ ] **A-2 (Low). Нет тёмной темы:** при `prefers-color-scheme: dark` рендерится светлая. Норм для B2B, но если
      тёмная нужна — её нет вовсе. Решает владелец.
- [x] **A-3 (Low, perf/SEO). Публичные detail-страницы — динамический SSR, не ISR.** ЗАКРЫТО (коммит `efc08709`):
      `/news/[slug]`, `/knowledge-base/[slug]`, `/documentation/[slug]`, `/forum/q/[id]` переведены `ƒ` → `●`
      (SSG/ISR): `export const revalidate = 300` + `generateStaticParams` (общий helper `staticParamsForType` в
      `lib/seo.ts`, тянет slug/id из `/seo/sitemap`). Опубликованный контент кэшируется как статический HTML,
      новые/неизвестные slug рендерятся on-demand (dynamicParams=true по умолчанию) и тоже попадают в кэш.
      `generateStaticParams` best-effort: API недоступен на сборке → `[]` + чистый on-demand ISR (fetchSeoSitemap
      уже fail-safe). **news:** убран серверный доступ к `searchParams` (preview) — он держал маршрут динамическим;
      флаг предпросмотра теперь читает клиент (`NewsPostView` через `useSearchParams` под Suspense-границей).
      Проверено: `next build` показывает все 4 маршрута как `● … 5m 1y` (с API на сборке — enumerate реальных slug);
      typecheck, web unit 217 (+2 теста helper'а), bundle budget, prettier — зелёные.

**A11y аутентифицированных экранов — проверено (вошёл юзером salo@gmail.com, 2026-06-20):**
- [x] **news / marketplace / account — структура хорошая:** app-shell `navigation: "Основная навигация"`, breadcrumbs
      `navigation: "Хлебные крошки"`, `main`/`contentinfo` landmarks, топбар-кнопки с именами (уведомления/поддержка/
      настройки), карточки = `article`, поиск = `search`+`searchbox`, фильтры площадки = `group: "Категории сырья"`,
      карточки объявлений = `link` с богатым именем, аккаунт = именованные `region` + семантический `DescriptionList`
      + прогресс с именем «Профиль заполнен на 75%». Консоль без JS-ошибок.
- [x] **forum / admin (вошёл админом mojosay@icloud.com) — структура хорошая:** форум — `search`+`searchbox`,
      `group: "Сортировка"`, карточки-`link` с богатыми именами (статус «Решено»/«Нужен ответ», теги, заголовок-heading);
      role-based nav (раздел «СЛУЖЕБНОЕ» виден только админу). Админка — дашборд с именованным `region` и
      секциями-заголовками; `/admin/users` использует **нативные `<select>`** (доступные combobox, в отличие от
      кастомных дропдаунов A-1) + семантический `<table>` + `searchbox` с label. Консоль чистая на всех админ-экранах.
- [x] **Уточнение по A-1:** кастомные дропдауны без combobox-семантики — только в публичных/auth/marketplace формах;
      в админке селекты нативные (доступны). A-6 (generic `<title>`) подтверждён на ВСЕХ аутентиф. страницах (вкл. `/admin/*`).
- [x] **A-4 (Medium, a11y). Обложки контента имели `alt` = имя файла.** ЗАКРЫТО в M-6: `alt`=заголовок во всех
      четырёх обложках (NewsCard, NewsArticleContent, knowledge-base-article, LessonView). Проверено вживую:
      alt лент новостей = заголовки, имён файлов нет.
- [x] **A-5 (Low, a11y). Несколько безымянных `navigation`-лендмарков в сайдбаре.** ЗАКРЫТО в M-6: секции стали
      `<div role="group" aria-labelledby>` внутри единственного `navigation`-лендмарка `<aside>` — имя группы = её
      видимый заголовок. Проверено вживую: 5 именованных групп, внутренних `<nav>` больше нет.
- [x] **A-6 (Low). Аутентифицированные страницы — generic `<title>` «ЭкоПлатформа».** ЗАКРЫТО в M-6: marketplace
      (+ подмаршруты) и account/[section] получили per-route `metadata`/`generateMetadata` (`createPageMetadata`,
      `noIndex`). Проверено вживую: `/marketplace` → «Торговая площадка · ЭкоПлатформа».
- [x] **A-7 (Low, a11y). Карта площадки — вложенные `generic` без роли/имени.** ЗАКРЫТО в M-6: контейнер MapGL 2ГИС
      получил `role="region"` + `aria-label="Карта объявлений"`. Проверено вживую.
- **M-7 (bundle):** маршруты подтверждены, но точные размеры First-Load JS Next 16 в консоли не печатает →
      нужен `ANALYZE=true pnpm --filter @ecoplatform/web build` (отчёт `.next/analyze/*.html`). Остаётся открытым.
- **Dev-env (НЕ прод-баг):** обложки контента в локали отдают **403/504** (`/_next/image` → dev-бакет `9c175ae1…`
      не public-read — следствие осознанного single-bucket dev-сетапа). На проде public-бакет настоящий → грузятся.
      Последствие: **локальная визуальная QA контента ограничена** (картинки не видны); a11y-дерево проверяется снапшотами.
- [ ] **Не проверено живьём:** урок-плеер (Vidstack — уникальный a11y-виджет: субтитры/клавиши/фокус), форум Q&A,
      база знаний (drawer-навигация), админские экраны (вход под `mojosay@icloud.com`). Остаток на следующий заход.

---

## ⚡ Quick wins (макс. польза / мин. усилия)

1. ~~**L-5** — запиннить `algorithms: ["HS256"]`~~ ✅ сделано 2026-06-20.
2. ~~**M-3** — `take`/кап на sitemap и крон-сканах~~ ✅ сделано 2026-06-20.
3. ~~**M-7** — снять bundle-analyzer и записать базлайн~~ ✅ сделано 2026-06-20 (budget-guard + порог в `bundle-budget.json`).
4. ~~**L-2** — пройтись по клиентским обработчикам ошибок на единый контракт~~ ✅ сделано 2026-06-20 (`errorText`).
5. ~~**H-1** — добить react-query на 11 оставшихся файлах~~ ✅ сделано 2026-06-20 (см. раздел High).

---

## ✅ Security checklist

**Проверено по коду — OK (этот проход):**
- [x] Auth: access(15m, in-memory) + refresh (HttpOnly, ротация с ревокацией) — `auth-session-workflow.helpers.ts`.
- [x] JWT-секреты ≥32 символов, иначе процесс не стартует — `main.ts:25`.
- [x] Authz: единый `access-policy.ts` + `RolesGuard` + `ModuleAccessService`, всё под `JwtAuthGuard`.
- [x] CSRF: double-submit (sameSite=strict, валидный паттерн токена) + сверка header==cookie; login/register исключены осознанно.
- [x] CORS: allowlist из `WEB_ORIGINS` с валидацией origin (без path/query/creds), обязателен в prod — `cors-origin.ts`.
- [x] Rate-limit: short/long + жёсткое окно 10/мин на `/auth/*` (register/resend/verify/login/refresh), redis-storage.
- [x] Brute-force: лимит попыток email-кода + истечение, bcrypt(12).
- [x] SQL-injection: только Prisma; raw — лишь `Prisma.sql` с плейсхолдерами (forum/documentation FTS) — безопасно.
- [x] SSRF: внешний fetch только к захардкоженному `catalog.api.2gis.com`, ввод — только query, таймаут+abort.
- [x] XSS: `dangerouslySetInnerHTML` только после `sanitizeParagraphHtml`; боевая CSP (object-src none, frame-ancestors none, base-uri self) + SRI.
- [x] Загрузка файлов: magic-byte (`file-type`), блок MIME/расширений (SVG/HTML/JS/exe), declared-vs-detected, квоты, приватный бакет + signed-URL, fail-closed без приватного бакета.
- [x] Утечка stack: `GlobalExceptionFilter` → generic 500, stack только в лог/Sentry; контракт ошибки унифицирован.
- [x] Логи: редакция токенов/cookie/csrf/паролей/кодов (`logging.ts`), sessionId маскируется, query-строки чистятся.
- [x] Security-заголовки web: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, CSP.
- [x] Контейнеры: api/web под non-root (`nodeapp`) + tini; наружу только Caddy; standalone-образ.
- [x] CI: lint + format + unit + build + integration(Postgres) + `pnpm audit` (падает на high/critical) + overrides уязвимых транзитивов.

**Авторизация и доступ — проверено глубоко (отдельный проход, главный антивзлом-вектор):**
- [x] **Object-level authz (IDOR/BOLA) — консистентно по всем выборкам.** Marketplace-офферы: покупатель скоупится
      по `buyerCompanyId` (`findOwnOfferOr404`), продавец — по владению объявлением (`loadSellerOfferOr404`/`isListingOwner`);
      контакты/имена скрыты до акцепта (`toListingOfferItem`), есть race-guard на accept. Notifications: `assertOwnership`
      (`userId !== user.id` → 403) перед mark-read/archive. Support: `findFirst({id, companyId})`. Trip-calculator: скоуп по
      `companyId`. Forum: правка/удаление по `authorId === user.id` (+ модератор). Files: `findManyByIds` отдаёт обычному
      юзеру ТОЛЬКО public-файлы (приватные — лишь staff); удаление требует `uploadedById === actor.id` или admin;
      обложка — только свой public-image.
- [x] **Эскалация прав невозможна:** нет `.passthrough()` (strict zod — лишние поля отклоняются), в пользовательских
      DTO нет привилегированных полей (`companyRole`/`platformRoles`/`status`/`subscriptionPlan`/`isActive`);
      self-update аккаунта — только аватар; все admin-операции под `RolesGuard` + `@Roles`.
- [x] **Admin-периметр:** все контроллеры `admin/*` и контент-мутации имеют `JwtAuthGuard` + `RolesGuard` + `@Roles`.
      Роуты без role-guard (`account/files/forum/marketplace/notifications/support/trip-calculator`) защищены
      per-object проверками в сервисах (проверено выше).
- [x] **Auth-устойчивость:** логин — generic «Неверный email или пароль» (без enumeration) + per-account lockout
      (`lockedUntil`) поверх throttling; смена пароля отзывает все прочие сессии; refresh ротирует сессию.
- [x] **Зависимости:** `pnpm audit` — **0 уязвимостей** (на момент аудита).
- [x] **Cookies:** refresh — HttpOnly + Secure(prod) + SameSite=lax + под CSRF; csrf-cookie — readable (double-submit), SameSite=strict.

**Финальный sweep (6-й проход) — проверено чисто:**
- [x] **Нет утечки кредов в ответах:** `passwordHash`/`refreshTokenHash`/`codeHash`/`providerToken`/`keyHash` нигде
      не попадают в `select`/ответы API (только сравнение/запись).
- [x] **`Math.random`** — только для приватного гео-джиттера круга площадки (`marketplace-geo.helpers.ts`), не для секретов/токенов.
- [x] **Голосование форума** — целостность через unique `answerId_userId` + счётчик в транзакции (нет двойного голоса/расхождения).
- [x] **Prisma** — `connection_limit=20`, `errorFormat: minimal` (нет verbose-утечки), метрики запросов, чистый connect/disconnect + shutdown hooks.
- [x] **Admin-dashboard** — ~14 агрегаций параллельно (`Promise.all`), admin-only; geocoder с Redis-кэшем (7д/24ч) и таймаутом.
- [x] **Валидация входа** — инвариант `parseBody` для всех мутирующих `@Body()` (покрыт `body-validation-invariant.test.ts`).
- [x] **Web-таймеры** — debounce/scroll с cleanup; токен только in-memory; ноль `console.*` в проде.

**Охват аудита (6 проходов):** периметр authn/authz · объектная авторизация во ВСЕХ доменах (files, marketplace
listings/offers/reviews, notifications, support, trip-calc, forum, moderation, account, admin, staff) · бизнес-логика
(пейволл, биллинг, деньги, идемпотентность) · фоновые процессы (scheduler, видео, биллинг-крон, геокодер) · слой
данных (prisma, raw SQL, пагинация) · фронт (токен, санитизация, error-boundary, поллинг, data-fetching) ·
качество/стандарты (TS, ESLint, зависимости, санитайзеры, касты) · инфра (Docker, CI, compose, env). Чтение кода
по существу исчерпано; остаток (admin-read-пути, observability-коллекторы) — низкого риска, идёт по тем же паттернам.

**Привилегии, изоляция и опасные паттерны — проверено глубоко (3-й проход):**
- [x] **Управление staff/правами:** нельзя снять admin с себя; «первый админ» (`PLATFORM_OWNER_EMAIL`) защищён;
      нельзя разжаловать последнего админа; деактивация ревокирует сессии + чистит кэш; полный audit-trail.
- [x] **Модерация — least-privilege:** жалобы (user, дедуп по unique-constraint, нельзя на своё, нет проба
      скрытых сущностей); решения по кейсам — `admin`+`moderator`; санкции apply/lift — ТОЛЬКО `admin`.
- [x] **Токен на фронте — in-memory:** access-token живёт только в переменной модуля, НЕ в localStorage
      (закрыт stored-XSS угон); восстановление через HttpOnly refresh-cookie; в localStorage только UI-префы.
- [x] **Email-шаблоны без инъекций:** в письма попадает только server-generated код (не пользовательский ввод);
      SMTP с таймаутами; в test/prod delivery защищён флагами. SEO sitemap отдаёт только `published` + проверяет цепочку родителей (нет утечки черновиков).
- [x] **Опасные стоки чисты:** нет `eval/new Function/child_process exec`; `spawn(ffmpeg,args)` без `shell:true`
      (нет command-injection); `client.eval` — Redis-Lua с константным скриптом; нет path-traversal (файлы через
      S3 signed-URL, ключи = UUID); нет open-redirect (user-ввод в `location` не утекает); server-env НЕ попадает в client-бандл;
      нет `console.*` в проде; нет `JSON.parse` по пользовательскому вводу.

**Бизнес-логика, ввод и надёжность — проверено глубоко (2-й проход):**
- [x] **XSS (stored):** ВСЕ write-пути контент-блоков идут через `content-common.payload()` → DOMPurify-санитайзер
      (единый shared, строгий whitelist, style сужен до color/font-size/text-indent, `target=_blank`→noopener,
      URI только https?/mailto/tel). Рендер: `dangerouslySetInnerHTML` только в ContentBlocks/LegalDocument
      (двойная санитизация, есть тест web-санитайзера). Форум/Q&A user-контент рендерится как текст (React-escape).
- [x] **Деньги — целочисленно/Decimal, без float:** `Decimal(12,2)` для сумм/индексов/веса, `Int` для
      `pricePerTonRub`/`oneTimePrice`. Идемпотентность активаций — `idempotencyKey(key,endpoint,actorId)` + requestHash.
- [x] **Границы ввода (zod):** `weightKg/typicalLoadKg` `.positive().max()`, `pricePerTonRub` `.int().positive().max(100M)`,
      score `.int().min(1).max(5)`, все строки `.max(N)` → нет негативов/overflow/безразмерных строк. Пагинация clamp `[1,maxLimit]`.
- [x] **Кроны идемпотентны:** `pg_try_advisory_xact_lock` (tx-scope) — параллельные инстансы пропускают тик (нет двойной обработки).
- [x] **GDPR-экспорт само-скоупится:** `exportMyData` → `user.id` из токена (чужие данные не выгрузить).
- [x] **Пейволл:** `canOpenFunctionalSections = demo-active OR subscription-active` по датам; `past_due` сам по себе доступ НЕ продлевает (баг закрыт ранее).

**Требует ручной проверки (на проде/окружении):**
- [ ] Боевые заголовки на api- и web-доменах (`curl -I https://ecoplatform.pro` и api-домен): HSTS, CSP, nosniff.
- [ ] `WEB_ORIGINS` в проде = боевой домен (CORS-креды иначе не работают).
- [ ] M-2: бэкапы БД + протестированный restore-drill.
- [ ] На проде public-бакет ≠ private-бакет, private НЕ public-read (прямая ссылка на private → 403). _Подтверждено владельцем: prod = 2 раздельных бакета; dev = 1 (осознанно)._
- [ ] 2ГИС MapGL-ключ привязан к домену в кабинете 2ГИС; расход REST-квоты геокодера под наблюдением.

---

## 🧪 Test plan — что добавить в первую очередь

Тесты сильные: 64 api-unit + 27 integration (по доменам) + 43 web + 4 shared + Playwright smoke; есть инвариант
`parseBody` и тесты CORS/логирования/фильтра ошибок. Пробелы:

1. **Negative-authz (integration):** member компании НЕ может дёргать owner/admin-роуты (биллинг, staff, broadcast,
   модерация); чужой `companyId` не виден в marketplace-контактах до акцепта.
2. **CSRF (integration):** мутирующий запрос без/с чужим `X-CSRF-Token` → 403; safe-методы и login/register проходят.
3. **Files fail-closed (integration):** при отсутствии `S3_PRIVATE_BUCKET` приватный файл → signed-URL=null (а не утечка в public); отказ S3 на upload/sign → понятная ошибка, не 500 (часть уже покрыта `92b3dec`).
4. **Auth reliability:** refresh после ревокации/блокировки → 401; ре-сенд кода регистрации с лимитом (закрыт `4d334c1` — закрепить регрессией).
5. **Frontend:** компонентные тесты loading/error/empty для вьюх, переводимых на react-query (H-1); e2e-сценарий
   регистрация→подтверждение→онбординг и публикация объявления площадки.
6. **Perf-регрессии (опц.):** снапшот числа запросов на ключевых списках (защита от N+1 при рефакторах).

---

## 📁 Files to inspect first (самые рискованные / высоконагруженные)

| # | Файл | Почему |
|---|------|--------|
| 1 | `apps/api/src/common/{jwt-auth.guard,csrf.guard,roles.guard,access-policy}.ts` | весь периметр authn/authz (M-1, L-5) |
| 2 | `apps/api/src/files/{files.service,files-storage.helpers,files-cleanup.helpers}.ts` | доступ к файлам, public/private, signed-URL, удаление по владельцу |
| 3 | `apps/api/src/marketplace/services/marketplace-offers.service.ts` | закрытый аукцион, приватность контактов, object-authz |
| 4 | `apps/api/src/auth/auth-session-workflow.helpers.ts` | выпуск/ротация/ревокация токенов |
| 5 | `apps/api/src/main.ts` / `app.module.ts` / `common/cors-origin.ts` | bootstrap, CORS, helmet, throttling |
| 6 | `apps/web/src/lib/{api,query}/*` | клиентский data-fetching + слой react-query (H-1) |
| 7 | `apps/api/src/auth/{auth-login-workflow,auth-password-workflow}.helpers.ts` | lockout, generic-ошибки, смена пароля, enumeration (L-6) |
| 8 | `apps/api/src/{forum,content/services}/*-search.helpers.ts` | raw `Prisma.sql` FTS (проверено — безопасно, но точка роста) |
| 9 | `apps/web/next.config.ts` | CSP/security-заголовки, остаточный `style-src-attr` (L-1) |
| 10 | `Dockerfile.{api,web}` / `docker-compose.prod.yml` / `deploy/` | прод-конфиг, env-baking, бэкап/restore (M-2) |

---

### Журнал решений (заполняет владелец)
- **C-1 dev-SMTP** — закрыто как осознанное (владелец, 2026-06-19): dev-почта настроена сознательно.
- **C-2 ротация секретов** — закрыто как осознанное (владелец, 2026-06-19): отдельный launch-чеклист вне этого файла.
- **H-1 один dev-бакет S3** — закрыто как осознанное (владелец, 2026-06-19): на проде 2 раздельных бакета
  (public ≠ private, private не public-read); dev сознательно использует один.
- M-5 (объём ренейма `.auth-*`: сейчас или после запуска): _ожидает решения_
- M-3 (какие индексы добавлять — после `EXPLAIN ANALYZE` на проде): _ожидает данных_
- L-6 (скрывать ли занятость email на регистрации): _решает владелец_
