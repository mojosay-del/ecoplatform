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

## Закрытые

### S-3. Старый `content.service.ts` и старый `DataViews.tsx` параллельно с новыми сплитами

- **Закрыто 2026-05-25**: split доведён до конца. Controller переключён на 4 split-сервиса, все 9 страниц — на views/. Старые god-файлы удалены. По пути найден и починен баг в `FilesService.replaceFileReferences` (orphan-fileId фильтрация). PROGRESS Волн 3.1/3.2/4.1 переведены из 🟦 в ✅.
