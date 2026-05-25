# Побочные находки

Заметки про вещи, которые встретились по дороге к основной задаче, но не должны её замедлять. Каждая запись — отдельная мини-задача для отдельной итерации (не «по пути»).

## Открытые

### S-1. Локальный тип `User` в `auth.tsx` и `AuthMeUser` в shared расходятся

- **Где**: `apps/web/src/lib/auth.tsx:6-23` (локальный `type User`) vs `packages/shared/src/api-response.ts:274-289` (`AuthMeUser`).
- **Симптом**: каждый раз, когда API возвращает поле, которого нет в локальном типе, TS падает. Сегодня починили `phone?: string` — но рассинхрон останется до унификации.
- **Что сделать**: заменить локальный `User` на импорт `AuthMeUser` из shared. Сверить shape (локальный имеет `avatarUrl`, `company { organizationName, demoEndsAt, subscriptionPlan, subscriptionEndsAt }`; AuthMeUser имеет `phone`, `status`, `company { id, name }`). Привести `/api/auth/me` к единому shape, обновить все потребителей.
- **Когда**: после Волны 6 (юр-фундамент тоже потребует расширения `AuthMeUser`, лучше за один раз).

### S-2. Нет корневого `pnpm test:integration` через turbo

- **Где**: `package.json` (корневой) — только `dev/build/lint/test/typecheck`. `apps/api/package.json` имеет `test:integration`.
- **Симптом**: команда из инструкций пользователя `pnpm test:integration` падает с `Command "test:integration" not found`. Сейчас работает только `pnpm --filter @ecoplatform/api test:integration`.
- **Что сделать**: добавить в корневой `package.json` скрипт `"test:integration": "turbo run test:integration"` и в `turbo.json` — task с конфигом (`dependsOn: ["^build"]`, `inputs`, `outputs`).
- **Когда**: вместе с обновлением CI/runbook (Волна 10).

### S-4. PROGRESS.md содержит «галлюцинации»

- **Что**: в журнал писались записи о работе, которая фактически не была доведена (Волны 3.1, 3.2, 4.1 в части пагинации, 4.7 в части unit-тестов, 5.7 в части обновления паролей в тестах). Часть исправлена 2026-05-25 при ревизии.
- **Урок**: при работе над волнами писать в PROGRESS только после фактического прогона `lint + test + integration + build` (а не «по плану»).
- **Что сделать**: ничего отдельного — следить за дисциплиной в следующих волнах.

### S-5. Волна 1.5 ❌ MIME-валидация file-type не сделана (P0 security)

- **Где**: `apps/api/src/files/files.service.ts:upload` (line 261-310).
- **Что PROGRESS заявил**: «MIME-валидация file upload (file-type + блок HTML/SVG)» — ✅.
- **Что в реальности**: пакет `file-type ^16.5.4` установлен в `apps/api/package.json:33`, но НИГДЕ не импортируется (`grep -r "file-type" apps/api/src/` пусто). В `upload` проверяется только размер; `mimeType` приходит из multipart-заголовка и идёт прямиком в S3 как `ContentType`. Защита есть только в `processCoverImage` (sharp), но и она проверяет лишь заголовок, не magic-number.
- **Последствие**: атакующий загружает HTML с `mimeType: "text/html"` → S3 отдаёт с этим Content-Type → stored-XSS. Ровно тот P0 из `audit/01-security.md#4`, который PROGRESS пометил ✅.
- **Что сделать**:
  1. В `files.service.ts:upload` — после получения buffer вызвать `fileTypeFromBuffer(file.buffer)`; сравнить с заявленным `file.mimetype`; при рассинхроне или отсутствии — `BadRequestException`.
  2. Завести whitelist разрешённых типов (`image/jpeg|png|webp|gif`, `application/pdf`, `application/zip`, `audio/*`, `video/*`); явно запретить `text/html`, `application/xhtml+xml`, `image/svg+xml`, `application/x-msdownload`.
  3. Юнит-тесты: подсунуть HTML с заголовком `image/png` → ожидать 400.
- **Когда**: ДО Волны 6 (это P0, заявленный как сделанный).
- **Effort**: S (1-2 часа).

## Закрытые

### S-3. Старый `content.service.ts` и старый `DataViews.tsx` параллельно с новыми сплитами

- **Закрыто 2026-05-25**: split доведён до конца. Controller переключён на 4 split-сервиса, все 9 страниц — на views/. Старые god-файлы удалены. По пути найден и починен баг в `FilesService.replaceFileReferences` (orphan-fileId фильтрация). PROGRESS Волн 3.1/3.2/4.1 переведены из 🟦 в ✅.

### S-6. Волна 5.6 findManyByIds не фильтровал public

- **Закрыто 2026-05-25**: `apps/api/src/files/files.service.ts` теперь добавляет `accessLevel: FileAccessLevel.public` в `findManyByIds`. `apps/api/src/files/files.service.test.ts` проверяет Prisma-where и дедуп ids. Проверка: `pnpm --filter @ecoplatform/api test -- files.service.test.ts` — 17/17.
