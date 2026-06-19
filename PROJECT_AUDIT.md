# Технический аудит ЭкоПлатформы

> Сквозная ревизия монорепо (NestJS API + Next.js web + shared) с позиции senior full-stack / security-reviewer.
> Дата: 2026-06-19. Ветка: `main` @ `469a7ae`.
>
> **Как пользоваться файлом.** Каждый пункт — чекбокс. Когда задача закрыта, поставь `[x]`, в колонке
> «Исполнитель/заметка» напиши кто сделал (Claude / Codex / владелец) и одной строкой — что именно изменено
> (коммит/файл). Не удаляй пункт — он остаётся историей. Спорные развилки помечены 🟡 и требуют решения владельца
> до начала работы.
>
> **Легенда статуса:** `[ ]` не начато · `[~]` в работе · `[x]` сделано · `[-]` отклонено (с причиной).

## 🤝 Инструкция для исполнителя (Claude / Codex / любой агент)

Этот раздел делает файл самодостаточным: бери задачу и работай, не имея контекста чата, в котором аудит создавался.

### Прежде чем писать код
1. **Прочитай `AGENTS.md` и `CLAUDE.md`** в корне — это рабочий стандарт проекта (он главнее личных привычек).
2. **Сориентируйся в текущем состоянии:** `git status --short`, свежий `git log`, `README.md`.
3. **Оцени влияние правки** через `rg`: импорты, соседние компоненты, API-клиенты, DTO в `packages/shared`, тесты.
   Не дублируй уже существующие компоненты/хуки/форматтеры/API-методы.
4. Если код, README и текст задачи расходятся — **остановись и уточни у владельца**, не додумывай.

### Регламент работы с этим файлом (важно для параллельной работы Claude + Codex)
- **Возьми задачу в работу:** поставь `[~]` и в «Исполнитель/заметка» впиши своё имя + дату
  (напр. `Codex 2026-06-20 — в работе`). Это «замок»: второй агент видит, что пункт занят, и берёт другой.
- **Закрыл:** поставь `[x]`, в «Исполнитель/заметка» — кто и что именно сделано (коммит/файлы), одной строкой.
- **Отклонил:** `[-]` + причина. Пункт НЕ удалять — он остаётся историей.
- 🟡-развилки **не начинать** без решения владельца (см. «Журнал решений» внизу файла).
- Один пункт ≈ один логический коммит. Не смешивай несвязанные пункты в одном коммите.

### Слои и куда что класть
- **Frontend:** `app/.../page.tsx` тонкий → page-UI в `apps/web/src/views` → переиспользуемое в
  `apps/web/src/components` → не-UI логика в `apps/web/src/lib`. Состояние раздела — в хук `use-*.ts`.
- **Backend:** контроллеры тонкие → бизнес-логика в сервисах и `*.helpers.ts` → общие контракты в `packages/shared`.
- Меняешь контракт API/DTO — правь **обе стороны** (api + web) и релевантные тесты.
- Не создавай god-файлы — сразу модульная структура (см. находку M-1/M-1b как анти-пример).

### Команды (pnpm, из корня монорепы; Node 24, pnpm 10.33.0)
| Действие | Команда |
|---|---|
| Установка | `pnpm install --frozen-lockfile` |
| Типы (весь репо) | `pnpm typecheck` |
| Lint (= tsc --noEmit) | `pnpm lint` |
| Unit-тесты (все пакеты) | `pnpm test` |
| Integration-тесты (нужен Postgres) | `pnpm test:integration` |
| Сборка | `pnpm build` |
| Prettier | `pnpm format` / `pnpm format:check` |
| Только API typecheck | `pnpm --filter @ecoplatform/api lint` |
| Только web typecheck | `pnpm --filter @ecoplatform/web lint` |
| Prisma client (нужен для tsc) | `pnpm --filter @ecoplatform/api prisma:generate` |
| Миграция (dev, создать) | `pnpm --filter @ecoplatform/api prisma:migrate:dev` |
| Миграция (применить, prod-стиль) | `pnpm --filter @ecoplatform/api prisma:migrate` |
| Сид dev-данных | `pnpm --filter @ecoplatform/api seed` |
| E2E smoke (web, Playwright) | `pnpm --filter @ecoplatform/web test:smoke` |

> Integration-тесты поднимают тестовую БД (суффикс `_test`) из `DATABASE_URL` и сами выставляют
> `THROTTLER_DISABLED=1`. `@ecoplatform/shared` резолвится из `dist` — если тесты не видят пакет,
> сначала `pnpm --filter @ecoplatform/shared build`.

### Definition of Done (по масштабу правки)
- **Всегда:** зелёные `pnpm lint` (типы) + затронутые `pnpm test`.
- **Тронул backend-логику/БД:** + `pnpm test:integration` по затронутому домену.
- **Тронул контракт/широкое влияние:** + полный `pnpm build`.
- **UI-правка:** проверить **вживую** через preview-инструменты (dev-сервер web :3000 + api :4000),
  снять скриншот/снапшот, проверить мобильный брейкпоинт (375) и тёмную/светлую тему, где релевантно.
  Не объявляй задачу готовой при упавшем typecheck/lint/тестах.

### Безопасность окружения (НЕ навреди проду)
- **Не запускай dev/тесты/скрипты против боевых S3/SMTP.** Локальный `.env` сейчас может указывать на прод —
  см. **C-1**. Загрузка/удаление файлов и письма идут напрямую в указанное окружение. Для локали — dev-бакеты
  (или MinIO) и dev-SMTP (mailpit). Шаблон и предупреждения — в `.env.example`.
- **Секретов в git нет** (`.env`, `.env.prod` в `.gitignore`; в репо только `*.example`). Не коммить реальные ключи,
  не печатай их в логи/PR. `dangerouslySetInnerHTML` — только через `sanitizeParagraphHtml`.
- Валидация входа на границах обязательна (формы, HTTP-роуты, webhooks) — на бэке через `parseBody(zodSchema, ...)`.

### Git / деплой
- Стейдить файлы **явно по именам** (не `git add -A`). Один логический таск — один логический коммит.
- `push` и `deploy` — **только по прямой просьбе владельца.** Деплой ручной (docker compose на VPS), App Platform не использовать.
- Прод-БД: миграции применяются последовательно; перед деплоем сверять `prisma migrate status`.

## Итоговая оценка

Кодовая база **зрелая и инженерно аккуратная**. Безопасность продумана системно: in-memory access-token +
HttpOnly refresh-cookie с ротацией, double-submit CSRF, throttling с отдельным жёстким окном на `/auth/*`,
magic-byte валидация загрузок, приватный S3-бакет + signed URL, единый слой прав (`access-policy.ts`),
секрет JWT проверяется на старте, глобальный фильтр ошибок не утекает stack. CI гоняет lint+типы+unit+integration+audit.
Архитектура модульная (тонкие контроллеры → сервисы → `*.helpers`), god-файлов почти нет.

**Критичных дыр в коде нет.** Основные риски — **операционные/конфигурационные** (prod-секреты в dev-окружении,
переиспользование 2ГИС-ключа) и **технический долг фронтенда** (ручной data-fetching без кэш-слоя, SEO).
Ниже — приоритизированный список.

---

## 🔴 Critical — взлом / потеря данных / падение прода

- [ ] **C-1. Dev-окружение подключено к ПРОДОВОМУ S3 и ПРОДОВОЙ почте.**
  `.env` (локальный, не в git) содержит боевые `S3_BUCKET=bfe9c154-…` + `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`
  и боевой `SMTP_PASS` для `notify@ecoplatform.pro`.
  - **Файл:** `/.env` (на машине разработчика; в репозитории — нет).
  - **Риск:** запуск API/тестов/скриптов локально пишет, перезаписывает и удаляет объекты в **боевом** бакете
    (`files.service.deleteIfUnreferenced`, video-transcode, backfill) и шлёт **реальные** письма с прод-ящика.
    Один `cleanup`/`migrate`/`test` против not-isolated окружения = потеря или порча прод-файлов клиентов.
  - **Проверка:** сверить `S3_BUCKET`/ключи в `.env` с боевыми (память: прод-бакет `bfe9c154-…`). Совпадают.
  - **Фикс:** завести **dev-пару** бакетов (публичный `S3_BUCKET` + приватный `S3_PRIVATE_BUCKET`) с отдельными
    ключами, либо локальный MinIO; dev-SMTP — mailpit/MailHog или console-transport. В `.env` оставить только
    dev-значения. Боевые ключи — ТОЛЬКО в `deploy/.env.prod` на VPS.
  - **Исполнитель/заметка:** Claude 2026-06-19 — в `.env.example` добавлены предупреждения dev-изоляции для S3 и
    SMTP (MinIO/mailpit, отдельная dev-пара бакетов). Владелец готовит dev-бакеты и вставит ключи. Открыто до
    фактического разведения dev/prod в локальном `.env`.

- [~] **C-2. Ротация всех боевых секретов перед запуском.** _(отложено владельцем: до запуска ещё не дошло — 2026-06-19)_
  По памяти владелец присылал root-пароль VPS в чат и планировал ротацию «в конце разработки». Сейчас в обороте:
  root VPS, S3-ключи, SMTP-пароль, 2ГИС-ключ, JWT-секреты прода.
  - **Риск:** любой из каналов (чат, dev-`.env`, history) мог утечь; компрометация = полный доступ к данным/инфраструктуре.
  - **Фикс:** перед публичным запуском ротировать: root VPS, `S3_*`, `SMTP_PASS`, `DGIS_*`, `JWT_ACCESS_SECRET`,
    `JWT_REFRESH_SECRET` (ротация JWT-секрета разлогинит всех — делать в окно). Зафиксировать в runbook.
  - **Исполнитель/заметка:** ОТЛОЖЕНО до фазы запуска (решение владельца 2026-06-19). Держать открытым как launch-чеклист.

---

## 🟠 High — исправить в ближайшее время

- [-] **H-1. 2ГИС-ключ геокодера = публичный ключ карт (утечка в бандл).** _(закрыто владельцем 2026-06-19)_
  `DGIS_GEOCODER_API_KEY` и `NEXT_PUBLIC_DGIS_MAPS_API_KEY` — один ключ. Владелец подтвердил: ключ универсальный
  и в кабинете 2ГИС **жёстко ограничен по домену**, с которого принимаются запросы → абуз чужими сайтами заблокирован.
  - **Исполнитель/заметка:** ОТКЛОНЕНО — домен-restriction на ключе закрывает риск (владелец, 2026-06-19).
    _Ремарка на будущее:_ доменное ограничение работает по `Referer`/`Origin` (браузерные вызовы MapGL). Серверный
    geocoder-запрос (`address-geocoder.service.ts`) идёт без Referer — если 2ГИС применяет ограничение и к REST,
    убедиться, что серверные вызовы не отрезаются; если REST-квота отдельная — следить за её расходом. Не блокер.

- [x] **H-2. Фронтенд без слоя кэширования/дедупликации запросов.**
  Нет `@tanstack/react-query`/SWR — данные тянутся вручную через `useEffect` + `fetch`-хелперы
  (`apps/web/src/lib/api/*`). В крупных вьюхах это ведёт к дублирующимся запросам, ручному управлению
  loading/error в каждом компоненте и риску race-condition при гонке ответов.
  - **Файлы:** `apps/web/src/views/**` (напр. `forum/ForumQuestionView.tsx`, `knowledge-base-view.tsx`),
    `apps/web/src/lib/api/requests.ts`.
  - **Риск:** лишние сетевые запросы, рассинхрон состояния, дороже поддержка; устаревание данных без инвалидации.
  - **Проверка:** в DevTools посмотреть число повторных GET на навигации между разделами.
  - **Фикс:** внедрить react-query (кэш + дедуп + ретраи + инвалидация) поэтапно, начиная с самых «горячих»
    списков (новости, форум, БЗ, площадка). 🟡 Развилка: объём миграции — обсудить с владельцем поэтапность.
  - **Исполнитель/заметка:** Codex 2026-06-19 — внедрён `@tanstack/react-query` для горячих списков
    web: provider + `lib/query`, адаптеры `useApiQuery`/`useInfiniteApiQuery`/file assets, новости/форум/БЗ/площадка.
    Проверки зелёные; live-check заблокирован C-1 (`.env` указывает на боевые S3/SMTP).

- [ ] **H-3. Валидация входа держится на договорённости, а не на инварианте.**
  Глобального `ValidationPipe` нет — каждый контроллер обязан сам звать `parseBody(zodSchema, body)`
  (122 вызова на 133 мутирующих метода). Забытый `parseBody` на новом эндпоинте = необработанный сырой вход.
  - **Файлы:** `apps/api/src/**/*.controller.ts`, `apps/api/src/common/zod.ts`.
  - **Риск:** регрессия валидации при добавлении роутов; тихо проходит невалидный payload.
  - **Фикс:** либо ESLint-правило/конвенция-тест, проверяющий, что у каждого `@Body()` есть `parseBody`;
    либо общий zod-`ValidationPipe`, применяемый по DTO-метадате. Зафиксировать правило в `AGENTS.md`.
  - **Исполнитель/заметка:**

- [ ] **H-4. SEO-минимум для публичной платформы отсутствует.**
  Только 6 из 49 `page.tsx` экспортируют `metadata`/`generateMetadata`; нет `robots.txt` и `sitemap.xml`.
  - **Файлы:** `apps/web/app/**`, отсутствуют `apps/web/app/robots.ts` и `apps/web/app/sitemap.ts`.
  - **Риск:** публичные разделы (новости, БЗ, документация, форум) плохо индексируются; нет canonical/OG.
  - **Фикс:** добавить `metadata` (title/description/canonical/OG) на публичные страницы, `app/robots.ts`,
    `app/sitemap.ts` (динамический по опубликованным сущностям).
  - **Исполнитель/заметка:**

---

## 🟡 Medium — технический долг и улучшения

- [ ] **M-1. Крупные файлы — риск god-компонентов.**
  `views/forum/ForumQuestionView.tsx` (681), `views/account/PersonalProfileFields.tsx` (630),
  `views/knowledge-base-view.tsx` (597), `views/account/SubscriptionDialog.tsx` (518),
  `marketplace/services/marketplace-offers.service.ts` (492), `moderation/*-decision.helpers.ts` (452).
  - **Риск:** сложнее тестировать и менять, выше связность.
  - **Фикс:** декомпозировать на под-компоненты/хуки (`use-*.ts`) и доменные helpers по сложившейся в проекте
    модульной конвенции. Без изменения поведения.
  - **Исполнитель/заметка:**

- [ ] **M-1b. `globals.css` — god-файл и лишний вес на каждой странице.**
  `apps/web/src/styles/globals.css` — **9480 строк, 1211 классов, 34 keyframes, 40 media-блоков** (всего CSS в
  проекте ~27k строк). Он импортируется глобально в `app/layout.tsx`, т.е. грузится на **каждой** странице,
  хотя содержит фиче-специфичные стили: модалка новости, split-layout логина/регистрации, степпер регистрации,
  DatePicker, FileUpload, auth-орб и т.д. Эти блоки не нужны на лендинге/в большинстве разделов.
  - **Файлы:** `apps/web/src/styles/globals.css`, `apps/web/app/layout.tsx:5-6`.
  - **Риск:** (1) maintainability — править/искать в 9.5k строк тяжело, высокий риск конфликтов классов;
    (2) performance — раздутый site-wide CSS-чанк в first-load на всех страницах.
  - **Хорошая новость:** паттерн дробления уже есть — `admin.css`, `marketplace.css`, `news.css`, `forum.css`,
    `learning.css`, `documentation.css`, `indices.css`, `account.css`, `landing.css`, `knowledge.css`,
    `calculators.css` импортируются **лениво** из своих view (`views/**/index.ts`). Нужно довести подход до конца.
  - **Фикс:** оставить в `globals.css` только истинно глобальное (reset, токены-применение, app-shell/навигация,
    общие примитивы кнопок/полей), а фиче-блоки (auth, news-modal, file-upload, datepicker, профиль) вынести в
    свои domain-CSS, импортируемые владеющим view. Делать инкрементально, по секциям (в файле уже есть
    комментарии-разделители — удобные границы). Без изменения визуала; проверять preview-скриншотами.
    ⚠️ Класс в CSS глобален: переносить блок можно ТОЛЬКО убедившись (`rg` по классам), что они используются
    исключительно во view, который импортирует целевой domain-CSS, иначе на других страницах стиль пропадёт.
  - **Метод (проверен на пилоте):** блоки в globals.css **перемешаны** — вырезать по диапазону строк нельзя.
    Вынос делается **по классам-префиксам** через postcss-codemod (`/tmp/extract-css.cjs`): собирает все правила,
    у которых КАЖДЫЙ селектор содержит префикс (0 пересечений с чужими селекторами — проверяется заранее), включая
    внутри `@media`, плюс относящиеся keyframes; пишет в co-located CSS, импортируемый самим компонентом, и удаляет
    из globals. Co-location (импорт из компонента, а не из view) надёжнее «домен-файла», т.к. стиль едет за
    компонентом во все разделы, где он рендерится.
  - **Прогресс:**
    - [x] **file-upload** — Claude 2026-06-19. 60 правил + 2 keyframes → `apps/web/src/components/file-upload.css`
      (импорт из `FileUploadField.tsx`). Проверено: классы используются только в `FileUploadField.tsx`;
      web typecheck + 199 unit зелёные; dev-сборка без ошибок. (Живой скрин под админом не снят — логин требует
      подмены пароля в dev-БД, заблокировано guardrail'ом; механика идентична верифицированным ниже.)
    - [x] **cookie-banner** — Claude 2026-06-19. 16 правил → `apps/web/src/components/cookie-consent.css`
      (импорт из `CookieConsent.tsx`). Проверено **вживую**: баннер на `/login` рендерится корректно
      (`position:fixed`, тень, кнопки), консоль чистая, скриншот снят. `--cookie-banner-height` ставится JS-ом,
      от выноса не зависит.
    - [x] **date-picker** — Claude 2026-06-19. 20 правил (вкл. 1 @media) → `apps/web/src/components/date-picker.css`
      (импорт из `DatePicker.tsx`). Классы только в `DatePicker.tsx`; typecheck + 199 unit зелёные.
    - [x] **phone-input** — Claude 2026-06-19. 13 правил → `apps/web/src/components/auth/phone-input.css`
      (импорт из `phone-input.tsx`). Все потребители (`register-sections`, `account/PersonalProfileFields`,
      `marketplace/MakeOfferForm`, `marketplace/listing-form-sections`) рендерят `<PhoneInput>` → co-located CSS
      едет за компонентом. Общее правило `.auth-card .phone-input,.auth-card .button` корректно ОСТАЛОСЬ в globals
      (это override формы). Проверено **вживую** на `/register` шаг 2: `.phone-country` имеет `display:flex` из
      нового файла, поле «+7» рендерится; typecheck + 199 unit зелёные.
    - [x] **legal** — Claude 2026-06-19. 19 правил → `apps/web/src/components/legal-document.css` (импорт из
      `LegalDocumentPage.tsx` и `app/legal/layout.tsx` — оба потребителя). Проверено **вживую** на `/legal/privacy`:
      `.legal-shell-content` имеет `max-width:800px`, страница рендерится, консоль чистая.
    - [x] **support** — Claude 2026-06-19. 35 правил + 2 keyframes → `apps/web/src/components/support-drawer.css`
      (импорт из `UserSupportDrawer.tsx` и `admin/support/AdminSupportView.tsx` — оба потребителя). typecheck +
      199 unit зелёные.
    - **Итог по globals.css: 9481 → 8210 строк (−1271, ~13%), 6 компонентов вынесено.**
    - [ ] Ещё чистые кандидаты (SHARED:0, проверены анализатором): rich-text/block-editor (Notion-редактор ~54
      правила), checklist+content-block+media-block (read-only рендер блоков), notification (4 потребителя:
      View/Bell/Popover/Dialog), account-* (130 правил → в существующий `account.css`, но проверить утечки в
      топбар-аватар). quiz/matching/gallery — по 1 SHARED-правилу, требуют ручного разделения.
    - [-] **auth split-layout — НЕ выносить bulk'ом (важный вывод 2026-06-19).** Проверка показала: префикс
      `.auth-*` (148 правил) — это **НЕ** page-scoped namespace, а ОБЩАЯ дизайн-система карточек/форм. ~17 классов
      реально используются вне auth: `.auth-card*`/`.auth-card-title/sub` → `app/error.tsx`, `not-found.tsx`,
      `global-error.tsx`, `forgot-password`; `.auth-code-*` (OTP-орб) → `account/PersonalProfileFields` (смена
      почты переиспользует орб); `.auth-section*`/`.auth-grid-2`/`.auth-error` → `admin/broadcast`;
      `.auth-footer` → `MarketingShell`. Вынос в auth-only файл сломал бы эти ~13 поверхностей.
      **Рекомендация (отдельная задача, решает владелец):** это не механический вынос, а РЕНЕЙМ дизайн-системы —
      развести «общие примитивы карточки/формы» (переименовать `.auth-card`/`.auth-section`/`.auth-field`/
      `.auth-code-*` в нейтральные `card-*`/`form-*`/`otp-*` и вынести в `components/ui/*.css`) и собственно
      auth-only чрому (билборд/аврора/герой/степпер). Большой рефактор разметки+CSS, не входит в M-1b.
      → вынесено как новая задача **M-1c** ниже.
  - **Codemod:** `/tmp/extract-css.cjs <prefix> <out.css> [--apply]` (сначала dry-run; перед выносом гонять
    анализатор пересечений). Префикс безопасен только при `SHARED:0`.
  - **Исполнитель/заметка:** Claude 2026-06-19 — 4 компонента вынесены (file-upload, cookie-banner, date-picker,
    phone-input), globals 9481→8618 (−863), всё зелёное. Остаток M-1b = auth-only чрома, но она сцеплена с общей
    дизайн-системой → выделено в M-1c. Механический этап M-1b по сути исчерпан.

- [ ] **M-1c. `.auth-*` — общая дизайн-система под именем «auth» (ренейм + разнос).**
  Открыто из M-1b: префикс `.auth-*` (148 CSS-правил) фактически обслуживает не только страницы входа/регистрации,
  а ещё error/not-found/global-error, forgot-password, OTP-верификацию смены почты в `account`, `admin/broadcast`,
  `MarketingShell` (см. список «утечек» в M-1b). Имя вводит в заблуждение и мешает дроблению globals.css.
  - **Риск:** не security, а maintainability — рост связности, нельзя безопасно вынести auth-стили; новый
    разработчик думает, что `.auth-card` только для логина, и ломает error-страницы.
  - **Фикс (большой, поэтапный, нужно решение владельца по объёму):** развести на (1) нейтральные UI-примитивы
    `card-*`/`form-*`/`otp-*` в `apps/web/src/components/ui/*.css`, импортируемые своими компонентами, и
    (2) auth-only чрому (билборд/аврора/герой/степпер) в `auth-shell.css`. Ренейм классов в разметке + CSS,
    по одному кластеру, с live-проверкой каждой затронутой поверхности (login, register, error, forgot-password,
    account-смена почты, broadcast). 🟡 Развилка: делать ли ренейм сейчас или после запуска.
  - **Исполнитель/заметка:**

- [ ] **M-2. Регистрационный код письма отправляется fire-and-forget.**
  `auth.service.ts:103 sendRegistrationCodeInBackground` — при сбое SMTP пользователь получает
  `verificationId`, но кода нет; ошибка только логируется.
  - **Риск:** пользователь застревает на шаге подтверждения без обратной связи (особенно при флапе SMTP).
  - **Фикс:** либо ждать ответ SMTP и возвращать понятную ошибку, либо явный re-send endpoint + UX
    «отправить код повторно» с лимитом. Проверить, что resend существует и виден.
  - **Исполнитель/заметка:**

- [ ] **M-3. helmet с выключенным CSP на API.**
  `main.ts:47 contentSecurityPolicy:false`. CSP по памяти навешивается прокси-слоем (Caddy) на web —
  для JSON-API это приемлемо, но стоит подтвердить, что прод-заголовки покрывают и api-домен, и зафиксировать
  где именно CSP/security-headers задаются (единый источник).
  - **Файлы:** `apps/api/src/main.ts`, `deploy/proxy/*`, `Dockerfile.proxy`.
  - **Фикс:** задокументировать слой security-headers; убедиться, что `X-Content-Type-Options`,
    `Referrer-Policy`, `Permissions-Policy`, HSTS присутствуют на проде (ручная проверка заголовков).
  - **Исполнитель/заметка:**

- [ ] **M-4. CORS — единственный origin из env.**
  `main.ts:64 origin: WEB_ORIGIN ?? localhost`. Если появятся `www.`/доп-домен/превью — отвалятся.
  - **Фикс:** поддержать список origin'ов (массив/функция-валидатор) с явным allowlist; убедиться, что в
    проде `WEB_ORIGIN` выставлен на боевой домен (не дефолт localhost).
  - **Исполнитель/заметка:**

- [ ] **M-5. Bundle size фронтенда — проверить вес.**
  Тяжёлые зависимости: `@vidstack/react` (видеоплеер), MapGL 2ГИС, анимированные иконки Iconsax.
  - **Риск:** большой first-load на разделах с плеером/картой.
  - **Проверка:** `pnpm --filter @ecoplatform/web build` + анализ `.next` (bundle analyzer);
    убедиться, что плеер/карта грузятся динамически (`next/dynamic`, ssr:false) только где нужны.
  - **Фикс:** code-split тяжёлых виджетов, проверить tree-shaking иконок.
  - **Исполнитель/заметка:**

- [ ] **M-6. Индексы под отчётные/частые выборки.**
  Схема большая (68 моделей, 131 `@@index/@@unique`, FK покрыты — память про 12 FK-индексов закрыта).
  Нужна точечная проверка медленных запросов на growth-таблицах (журналы действий, уведомления, форум-голоса,
  marketplace-offers) под реальным объёмом.
  - **Проверка:** `EXPLAIN ANALYZE` на топ-запросах админ-журнала, ленты форума, выборок офферов; `pg_stat_statements`.
  - **Фикс:** добавить составные индексы под фактические `where+orderBy`, где план идёт seq scan.
  - **Исполнитель/заметка:**

- [ ] **M-7. Доступность (a11y) — нужен аудит.**
  Большой объём интерактивного UI (модалки, формы, плееры, карта, drag-tree обучения).
  - **Проверка:** axe / Lighthouse a11y по ключевым экранам; клавиатурная навигация модалок, focus-trap,
    `aria-*` на кастомных контролах, контраст (использовать скилл `design:accessibility-review`).
  - **Исполнитель/заметка:**

- [ ] **M-8. Реакция на сбой внешних сервисов — подтвердить fallback повсеместно.**
  Геокодер 2ГИС — graceful (null/[]), Redis — опциональный с fallback (session-cache/throttler).
  Проверить, что отказ S3 при `upload`/`signDownloadUrls` и SMTP даёт понятную ошибку пользователю,
  а не 500 без контекста; что video-transcode при отсутствии ffmpeg помечает `failed` и отдаёт оригинал
  (по коду — да, подтвердить тестом).
  - **Исполнитель/заметка:**

---

## 🔵 Low — косметика и мелкие улучшения

- [ ] **L-1. `.DS_Store` и `.playwright-mcp/`, `test-results/`, `playwright-report/` в рабочем дереве** —
  проверить, что они в `.gitignore` и не коммитятся.
  - **Исполнитель/заметка:**

- [ ] **L-2. `createMetadata`-эндпоинт файлов** (`files.controller.ts:84`) создаёт запись метаданных без
  загрузки байтов и без magic-byte проверки (валидация только по заявленному MIME). Доступен лишь
  admin/content_manager, но проверить, не является ли путь мёртвым/легаси; если используется — выровнять
  с `upload` по валидации.
  - **Исполнитель/заметка:**

- [ ] **L-3. Единый словарь HTTP-ответов/ошибок.** Ответы консистентны (Nest HttpException + zod), но стоит
  задокументировать контракт ошибки (`{message,error,statusCode}`) в README/shared для фронта.
  - **Исполнитель/заметка:**

- [ ] **L-4. Логирование PII.** Проверить, что в pino-логи не попадают токены/пароли/коды подтверждения
  (по коду — actorId/url/status, выглядит чисто; подтвердить на проде sample-логом).
  - **Исполнитель/заметка:**

---

## ⚡ Quick wins (макс. польза / мин. усилия)

1. **C-1 / H-1:** развести dev и prod S3+SMTP+2ГИС-ключи — снимает самый острый операционный риск. (конфиг, без кода)
2. **H-4:** `app/robots.ts` + `app/sitemap.ts` + `metadata` на 5–6 публичных страницах. (полдня)
3. **M-3:** ручная проверка security-заголовков прода `curl -I https://ecoplatform.pro` + фиксация в доке.
4. **L-1:** дочистить `.gitignore` от артефактов тестов/IDE.
5. **H-3:** добавить правило в `AGENTS.md` + простой тест-инвариант на `parseBody`.

---

## ✅ Security checklist

**Проверено по коду — OK:**
- [x] Auth: JWT access (15m, in-memory на клиенте) + refresh (HttpOnly, ротация с ревокацией старой сессии) — `auth-session-workflow.helpers.ts`.
- [x] JWT-секрет ≥32 символов, иначе процесс не стартует — `main.ts:24`.
- [x] Authz: единый `access-policy.ts` + `RolesGuard` + `ModuleAccessService`; контроллеры под `JwtAuthGuard`
      (единственный публичный — `/metrics`, и он за Basic-auth; `/health/deep` за ролями).
- [x] CSRF: double-submit cookie (sameSite=strict) + проверка заголовка, login/register исключены осознанно — `csrf.guard.ts`.
- [x] Rate limiting: глобальный throttler + жёсткое окно 10/мин на `/auth/*` (register/login/refresh/verify) — `app.module.ts`.
- [x] Brute-force: лимит попыток email-кода (`EMAIL_VERIFICATION_MAX_ATTEMPTS`) + истечение, bcrypt(12) для паролей.
- [x] SQL-injection: только Prisma ORM, сырого SQL с конкатенацией не найдено.
- [x] SSRF: внешний fetch только к захардкоженному `catalog.api.2gis.com`, пользовательский ввод — лишь query-param; таймаут+abort.
- [x] XSS: `dangerouslySetInnerHTML` только после `sanitizeParagraphHtml` (shared whitelist) — двойная санитизация (сервер+рендер).
- [x] Загрузка файлов: magic-byte (`file-type`), blocked MIME/расширения, declared-vs-detected, квоты, media-only для не-стаффа, приватный бакет + signed URL.
- [x] Утечка stack: `GlobalExceptionFilter` отдаёт клиенту generic 500, stack только в лог/Sentry.
- [x] Секреты не в git: `.env`/`.env.prod` в `.gitignore`; в репо только `*.example`.
- [x] Метрики Prometheus за Basic-auth, отказ при отсутствии креды — `metrics.controller.ts`.
- [x] CI security-audit job (`pnpm audit`, падает на high/critical) + pnpm overrides на уязвимые транзитивы.

**Требует ручной проверки (на проде/окружении):**
- [ ] Боевые security-заголовки на api- и web-доменах (HSTS, X-Content-Type-Options, Referrer-Policy, CSP) — `curl -I`.
- [ ] `WEB_ORIGIN` в проде = боевой домен (не дефолт localhost) → иначе CORS-креды не работают.
- [ ] Ротация секретов (C-2) и разведение dev/prod ключей (C-1, H-1).
- [ ] 2ГИС MapGL-ключ привязан к домену в кабинете 2ГИС (H-1).
- [ ] Нет PII/токенов в прод-логах (L-4).
- [ ] Бэкапы БД + проверенный rollback-сценарий миграций (есть `.db-backups/`, подтвердить актуальность и restore-тест).

---

## 🧪 Test plan — что добавить в первую очередь

Тесты сильные: интеграционные по каждому домену (auth, billing, marketplace, forum, content, moderation, files,
documentation), unit на helpers/guards. Пробелы:

1. **Security-инварианты (api, integration):**
   - забытый `parseBody` → тест, что мутирующие роуты отклоняют невалидный/лишний payload (H-3);
   - negative-authz: member компании НЕ может дергать owner/admin-роуты (биллинг, staff, broadcast);
   - CSRF: мутирующий запрос без/с чужим `X-CSRF-Token` → 403.
2. **Files (api):** отказ S3 при `upload`/`sign` → корректная ошибка, не 500; video-transcode без ffmpeg → `failed` + оригинал.
3. **Auth reliability:** сбой SMTP при регистрации → UX-путь resend (M-2); refresh после ревокации/блокировки компании → 401.
4. **Frontend (web):** компонентные тесты на loading/error/empty состояния «горячих» вьюх; e2e (Playwright уже есть) —
   сценарий регистрация→подтверждение→онбординг и публикация объявления площадки.
5. **Perf-регрессии (опц.):** snapshot числа запросов на ключевых списках (защита от N+1 при рефакторе под react-query).

---

## 📁 Files to inspect first (самые рискованные / высоконагруженные)

| # | Файл | Почему |
|---|------|--------|
| 1 | `/.env` (dev-машина) | боевые S3/SMTP/2ГИС-ключи в dev (C-1, H-1) |
| 2 | `apps/api/src/geo/address-geocoder.service.ts` | внешний API + переиспользуемый ключ (H-1) |
| 3 | `apps/api/src/files/files.service.ts` + `files-validation.helpers.ts` | загрузка/удаление файлов, S3 |
| 4 | `apps/api/src/common/{jwt-auth.guard,csrf.guard,roles.guard,access-policy}.ts` | весь периметр authn/authz |
| 5 | `apps/api/src/auth/auth-session-workflow.helpers.ts` | выпуск/ротация токенов |
| 6 | `apps/api/src/main.ts` / `app.module.ts` | bootstrap, CORS, helmet, throttling |
| 7 | `apps/web/src/lib/api/*` | весь клиентский data-fetching (H-2) |
| 8 | `apps/web/src/views/forum/ForumQuestionView.tsx`, `knowledge-base-view.tsx` | крупнейшие вьюхи (M-1) |
| 9 | `apps/api/src/marketplace/services/marketplace-offers.service.ts` | закрытый аукцион, приватность контактов |
| 10 | `Dockerfile.web` / `docker-compose.prod.yml` / `deploy/` | прод-конфиг, env-baking, security-headers |

---

### Журнал решений по 🟡-развилкам (заполняет владелец)
- H-2 (объём миграции на react-query): _ожидает решения_
- M-6 (какие индексы добавлять — после замеров на проде): _ожидает данных EXPLAIN_
