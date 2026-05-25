# Этап 1 — Безопасность

Покрыто: аутентификация, JWT, cookies/сессии, RBAC, валидация ввода, XSS, SQL-инъекции, загрузка файлов, утечки данных, секреты, CORS/CSRF, политика паролей.

---

## 🔴 P0 — критичные (исправить до прод)

### 1. JWT-секрет с фолбэком на дефолтную строку ✅ DONE 2026-05-24
> `main.ts` валидирует `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` (минимум 32 символа) до создания приложения. Фолбэки `"dev-access-secret"` удалены из `auth.service.ts` и `jwt-auth.guard.ts`.
- **Где**: [apps/api/src/auth/auth.service.ts:388](apps/api/src/auth/auth.service.ts#L388) и [apps/api/src/common/jwt-auth.guard.ts:28](apps/api/src/common/jwt-auth.guard.ts#L28).
- **Что**: `process.env.JWT_ACCESS_SECRET ?? "dev-access-secret"` — если переменная окружения не задана (опечатка в Timeweb, не подгрузился `.env`), приложение спокойно стартует и подписывает токены литералом `"dev-access-secret"`. Этот литерал лежит в публичном репозитории — любой может подделать access-токен и зайти под любым пользователем.
- **Чем чинить**: при старте `bootstrap()` бросать ошибку, если `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` пусты или короче 32 символов. Удалить фолбэки.

### 2. Нет rate-limit / защиты от перебора ✅ DONE 2026-05-24
> Подключён `@nestjs/throttler` глобально. Лимиты в `app.module.ts`: `short` 30/10s, `long` 600/мин, `auth` 10/мин (на login/register/refresh через `@Throttle({ auth: ... })` в `auth.controller.ts`). Флаг `THROTTLER_DISABLED=1` в integration-setup, чтобы не глушить тесты.
- **Где**: весь API, особенно `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/change-password`.
- **Что**: пакет `@nestjs/throttler` не подключён, в коде нет ни одного брюка ограничения по IP/пользователю. Можно за секунды прогнать словарь паролей или массово регистрировать ботов. Учитывая, что bcrypt cost = 12 (медленно), один запрос login ~ 100 мс — это всё равно ≥ 600 попыток в минуту с одного IP, что недопустимо.
- **Чем чинить**: добавить `@nestjs/throttler` глобально (например, 60 req/min на endpoint), и более жёсткие лимиты на `/auth/*` (5 неудач/мин с одного IP+email).

### 3. Access-токен лежит в `localStorage` ✅ DONE 2026-05-24
> `apps/web/src/lib/api.ts` хранит токен только в памяти модуля. `localStorage`-операции удалены. На mount AuthProvider вызывает новый `tryRestoreSession()` → `/auth/refresh` через HttpOnly cookie. Проверено в браузере: после reload пользователь остаётся залогинен, токен в localStorage отсутствует.
- **Где**: [apps/web/src/lib/api.ts:40–66](apps/web/src/lib/api.ts#L40).
- **Что**: токен читается и пишется в `localStorage`. Любой найденный stored-XSS (а в проекте есть `dangerouslySetInnerHTML` пользовательского контента, сейчас защищён DOMPurify — но это «один баг до катастрофы») мгновенно сливает токены всех зашедших пользователей. Refresh-cookie HttpOnly, но access-токен в JS — это и есть «золотой ключик».
- **Чем чинить**: держать access-токен только в памяти (`useState`/модуль-переменная), а при перезагрузке страницы делать `/auth/refresh` через HttpOnly cookie. Это стандарт для SPA + HttpOnly refresh-token.

### 4. Stored-XSS через MIME-тип в загруженных файлах ✅ DONE 2026-05-24
> `files.service.ts` определяет реальный MIME по magic-number (`file-type` v16), проверяет против whitelist (картинки, видео, аудио, PDF, Office, ZIP). Для cover-загрузки запрещены все типы кроме image/*. Не-медиафайлы получают `Content-Disposition: attachment` в S3.
- **Где**: [apps/api/src/files/files.service.ts:165–173](apps/api/src/files/files.service.ts#L165), `Content-Type` берётся из того, что прислал клиент.
- **Что**: пользователь со статусом `content_manager` может загрузить файл `image.html` с заголовком `mimeType: "text/html"` через `/files/upload`. Бакет публичный → ссылка `https://s3.twcstorage.ru/<bucket>/...` отдаст HTML с произвольным JS. При желании злоумышленник может скрывать атаку под маской «обложки». Распространение по платформе становится stored-XSS-ловушкой.
- **Чем чинить**: на сервере жёстко whitelistить MIME (image/png, image/jpeg, image/webp, application/pdf, …) — не доверять `mimetype` от клиента, а определять его реальным магическим числом (`file-type` или `sharp.metadata()`); запрещать любую загрузку HTML/SVG (SVG может содержать JS). Для S3 ставить `Content-Disposition: attachment` для не-картинок.

### 5. Уязвимая транзитивная зависимость PostCSS ✅ DONE 2026-05-24
> В корневой `package.json` добавлен `"pnpm": { "overrides": { "postcss": ">=8.5.10" } }`. `pnpm audit --prod` теперь возвращает «No known vulnerabilities found».
- **Где**: `apps/web -> next -> postcss < 8.5.10` (GHSA-qx2v-qp2m-jg93, XSS через незаэкранированный `</style>`).
- **Что**: текущий риск низкий (мы не парсим недоверенный CSS), но запись остаётся в `pnpm audit` и блокирует security-проверки CI. Через обновление Next.js должно подтянуться.
- **Чем чинить**: обновить Next.js до версии с patched postcss, либо поставить override в `package.json` (`"pnpm": { "overrides": { "postcss": ">=8.5.10" } }`).

---

## 🟡 P1 — серьёзные

### 6. Email-enumeration через тайминг логина
- **Где**: [apps/api/src/auth/auth.service.ts:64–71](apps/api/src/auth/auth.service.ts#L64).
- **Что**: `if (!user || !(await compare(...)))` — для несуществующего email сравнения bcrypt не происходит. Ответ возвращается за 1 мс, а для существующего — за ~100 мс. Атакующий может проверить, какие emails зарегистрированы (полезно для дальнейшего phishing/брюта).
- **Чем чинить**: всегда выполнять bcrypt-сравнение против фиксированного «заглушка-хеша», даже если пользователь не найден.

### 7. `request.ip` без `trust proxy` ✅ DONE 2026-05-24
> `main.ts` теперь делает `app.set("trust proxy", 1)` (через `NestExpressApplication`). За nginx/Cloudflare на Timeweb получим реальный клиентский IP.
- **Где**: [apps/api/src/main.ts](apps/api/src/main.ts), [apps/api/src/auth/auth.controller.ts:97](apps/api/src/auth/auth.controller.ts#L97).
- **Что**: на Timeweb приложение пойдёт за reverse-proxy (nginx/Cloudflare). Без `app.set("trust proxy", 1)` Express будет видеть IP балансировщика, а не клиента. Журнал сессий и (когда появится) rate-limit будут привязаны к одному IP всего трафика — бесполезно для аудита и опасно для rate-limit (один пользователь сложит всех).
- **Чем чинить**: в `main.ts` `app.set("trust proxy", 1)` (или nest-эквивалент через `NestExpressApplication`).

### 8. Whitelist `style` и `target` в санитайзере без enforce `rel` ✅ DONE 2026-05-24 (Волна 3)
> В `packages/shared/src/sanitize-html.ts` добавлен hook `afterSanitizeAttributes`, который для `<a target="_blank">` принудительно добавляет `rel="noopener noreferrer"`. Tabnabbing закрыт. `style` оставлен с whitelist DOMPurify v3 (он сам стрипает опасные CSS-конструкции).
- **Где**: [apps/api/src/common/sanitize-html.ts:27](apps/api/src/common/sanitize-html.ts#L27), [apps/web/src/lib/sanitize-html.ts:26](apps/web/src/lib/sanitize-html.ts#L26).
- **Что**: разрешён `target="_blank"` без принудительного `rel="noopener noreferrer"` — потенциальный tabnabbing. `style` атрибут разрешён на `span`/прочем — DOMPurify v3 чистит опасные CSS-конструкции, но whitelist всё равно расширяет поверхность атаки больше необходимого (TipTap пишет туда только цвет шрифта).
- **Чем чинить**: добавить DOMPurify-hook, который при `target="_blank"` дописывает `rel="noopener noreferrer"`. Сузить `ALLOWED_ATTR` для `style` до `style[color, font-size]` через `ALLOWED_CSS_PROPERTIES`.

### 9. Любой авторизованный пользователь может читать metadata любого файла ✅ DONE 2026-05-25
> `FilesService.findManyByIds` теперь добавляет `where.accessLevel: FileAccessLevel.public` — приватные файлы не возвращаются через `/api/files?ids=...`. Утечка metadata (storageKey, mime) закрыта.
- **Где**: [apps/api/src/files/files.controller.ts:25–33](apps/api/src/files/files.controller.ts#L25).
- **Что**: `GET /files?ids=...` без проверки `accessLevel` возвращает `originalName, mimeType, sizeBytes, uploadedById, createdAt, storageKey` любого файла, в т.ч. `platform_private`. `publicUrl` корректно скрывается, но storageKey уходит — а это путь в бакете.
- **Чем чинить**: фильтровать по `accessLevel`: `public` всем, `authenticated` — авторизованным, `platform_private` — только staff, `conversation_private` — только участникам.

### 10. Минимальная длина пароля = 8, а в change-password = 10 (рассинхрон) ✅ DONE 2026-05-25
> Единая `passwordSchema` + `MIN_PASSWORD_LENGTH = 10` экспортирована из `@ecoplatform/shared` и применена в register, change-password, admin-staff. Раньше было три точки с разными правилами. Тесты обновлены под новый минимум.
- **Где**: [packages/shared/src/dto.ts:12, 26](packages/shared/src/dto.ts#L12).
- **Что**: при регистрации можно завести пароль из 8 символов, а потом change-password требует 10 — пользователь получает ошибку «новый пароль должен быть ≥ 10», ничего непонятно. NIST/OWASP сейчас рекомендуют ≥ 12.
- **Чем чинить**: единая константа `MIN_PASSWORD_LENGTH = 12` для всех точек.

### 11. Учётные данные S3 хранятся в plaintext в `.env`
- **Где**: корневой `.env` (не в git, но физически лежит у разработчика).
- **Что**: реальные `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` Timeweb прописаны в локальном `.env`. Если этот ключ — продовый или имеет доступ к продовому бакету, то любой, кто получит файл (украденный ноутбук, бэкап без шифрования), получит доступ. История git чистая — это уже хорошо.
- **Чем чинить**: использовать отдельный dev-bucket с отдельными ключами для локалки; для прода — секреты только в env Timeweb.

### 12. Нет блокировки аккаунта после серии неудачных входов
- **Где**: `auth.service.ts:login`.
- **Что**: при отсутствии rate-limit (см. P0) ещё хуже — нет логики «10 неудачных подряд → лочим на 15 минут». Combined с p0 — главный риск брута.
- **Чем чинить**: считать `failedLoginCount` на `User` (или ключ Redis), при превышении возвращать 429.

### 13. CORS только по `WEB_ORIGIN`, без allowlist
- **Где**: [apps/api/src/main.ts:18–21](apps/api/src/main.ts#L18).
- **Что**: единственный origin. Когда появится staging/preview-домен, придётся плодить переменные или открывать всё. `credentials: true` + `origin: "*"` запрещён браузером, но регулярно подсовывается в туториалах — стоит описать в комментарии.
- **Чем чинить**: разрешить список через `WEB_ORIGINS="https://a,https://b"` и фильтровать.

---

## 🟢 P2 — улучшения

### 14. ConflictException при регистрации раскрывает занятость email и телефона одновременно
- **Где**: [apps/api/src/auth/auth.service.ts:32–35](apps/api/src/auth/auth.service.ts#L32).
- **Что**: «Пользователь с такой почтой или телефоном уже зарегистрирован» — стандартный UX-vs-security trade-off, оставить как есть пока, но осознанно.

### 15. CSRF не разбирался отдельно
- **Что**: refresh-cookie `SameSite=lax` + cookie path `/api/auth` сильно режут CSRF-поверхность. Все остальные защищённые запросы идут через `Authorization: Bearer …` (не cookie) — CSRF не применим. Логика правильная, но стоит зафиксировать в `docs/` как явное решение.

### 16. Логи могут содержать тела запросов
- **Что**: на текущий момент кастомного логгера нет, NestJS пишет default-логи без body. Но при добавлении логгера легко слить пароли в логи — нужен фильтр для `body.password*`.

### 17. JWT-секреты в `.env`, не в системе секретов
- **Что**: для MVP допустимо. Но если в Timeweb есть встроенный secret store / Vault-like, лучше перенести туда.

### 18. Размер upload = 100 МБ
- **Где**: [apps/api/src/files/files.service.ts:22](apps/api/src/files/files.service.ts#L22) и интерсептор `{ limits: { fileSize: 100 * 1024 * 1024 } }` в [files.controller.ts:46](apps/api/src/files/files.controller.ts#L46).
- **Что**: 100 МБ — много для платформы с картинками и PDF. Один файл = одна занятая исходящая ширина канала + RAM (файл идёт в `Buffer`). Можно DoS-нуть память сервера сериями параллельных загрузок.
- **Чем чинить**: 25 МБ по умолчанию, 10 МБ для cover, отдельный лимит для PDF.

### 19. PROJECT_STATUS обещает 10 integration-тестов, фактически 79 — не критично, но устарел.

---

## ✅ Что сделано хорошо

- bcrypt cost 12, refresh-token = `sessionId.tail` с `bcrypt(tail)` — правильный паттерн, не уязвим к перебору при утечке БД.
- HttpOnly + Secure(prod) + SameSite=lax cookie + `path: /api/auth` — refresh-cookie замкнут на auth-эндпоинты.
- `refresh` ротирует сессию (старая помечается revoked, новая создаётся) + повторно проверяет статус user/company.
- `change-password` отзывает все остальные сессии в одной транзакции.
- Все админ-контроллеры покрыты `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` на класс.
- В `content.controller.ts` 40+ эндпоинтов — каждый имеет `@Roles(...)` (видел сплошной список).
- Email lowercased перед save/lookup.
- `support` правильно проверяет ownership по `companyId` пользователя, и `requireCompany()` корректно возвращает 403 для платформенного стаффа.
- JWT-guard перепроверяет статус user/company при каждом запросе (нет «вечной» сессии после блокировки).
- Prisma везде через type-safe API, ни одного `$queryRaw`/`$executeRaw` — SQL-injection невозможна.
- `processCoverImage` через sharp ре-кодирует картинку — стрипает EXIF и потенциальные эксплойты в JPEG/PNG.
- В history git ни `.env`, ни S3-ключей нет — секреты не утекали.
- Уведомление о входе с нового устройства с дедупом по fingerprint — реальная польза для пользователя.
