# Побочные находки

Заметки про вещи, которые встретились по дороге к основной задаче, но не должны её замедлять. Каждая запись — отдельная мини-задача для отдельной итерации (не «по пути»).

## Открытые

### S-1. Локальный тип `User` в `auth.tsx` и `AuthMeUser` в shared расходятся

- **Где**: `apps/web/src/lib/auth.tsx:6-23` (локальный `type User`) vs `packages/shared/src/api-response.ts:274-289` (`AuthMeUser`).
- **Симптом**: каждый раз, когда API возвращает поле, которого нет в локальном типе, TS падает. Сегодня починили `phone?: string` — но рассинхрон останется до унификации.
- **Что сделать**: заменить локальный `User` на импорт `AuthMeUser` из shared. Сверить shape (локальный имеет `avatarUrl`, `company { organizationName, demoEndsAt, subscriptionPlan, subscriptionEndsAt }`; AuthMeUser имеет `phone`, `status`, `company { id, name }`). Привести `/api/auth/me` к единому shape, обновить все потребителей.
- **Когда**: после Волны 6 (юр-фундамент тоже потребует расширения `AuthMeUser`, лучше за один раз).

### S-4. PROGRESS.md содержит «галлюцинации»

- **Что**: в журнал писались записи о работе, которая фактически не была доведена (Волны 3.1, 3.2, 4.1 в части пагинации, 4.7 в части unit-тестов, 5.7 в части обновления паролей в тестах). Часть исправлена 2026-05-25 при ревизии.
- **Урок**: при работе над волнами писать в PROGRESS только после фактического прогона `lint + test + integration + build` (а не «по плану»).
- **Что сделать**: ничего отдельного — следить за дисциплиной в следующих волнах.

## Закрытые

### S-2. Нет корневого `pnpm test:integration` через turbo

- **Закрыто 2026-05-25**: в корневой `package.json` добавлен скрипт `"test:integration": "turbo run test:integration"`. `turbo.json` уже содержал task `test:integration` (`dependsOn: ["^build"]`, `cache: false`), поэтому отдельная настройка turbo не потребовалась. Проверка: `pnpm test:integration` проходит через root-алиас и запускает integration-тесты API.

### S-3. Старый `content.service.ts` и старый `DataViews.tsx` параллельно с новыми сплитами

- **Закрыто 2026-05-25**: split доведён до конца. Controller переключён на 4 split-сервиса, все 9 страниц — на views/. Старые god-файлы удалены. По пути найден и починен баг в `FilesService.replaceFileReferences` (orphan-fileId фильтрация). PROGRESS Волн 3.1/3.2/4.1 переведены из 🟦 в ✅.

### S-6. Волна 5.6 findManyByIds не фильтровал public

- **Закрыто 2026-05-25**: `apps/api/src/files/files.service.ts` теперь добавляет `accessLevel: FileAccessLevel.public` в `findManyByIds`. `apps/api/src/files/files.service.test.ts` проверяет Prisma-where и дедуп ids. Проверка: `pnpm --filter @ecoplatform/api test -- files.service.test.ts` — 17/17.

### S-5. Волна 1.5 MIME-валидация file-type не была доведена

- **Закрыто 2026-05-25**: `apps/api/src/files/files.service.ts` теперь валидирует обычный upload через `file-type/fromBuffer`, блокирует HTML/SVG/executable-типы и опасные расширения, сравнивает заявленный MIME с реальным, а non-media файлы кладёт в S3 с `Content-Disposition: attachment`. `apps/api/src/files/files.service.test.ts` покрывает HTML-as-image, SVG и PDF attachment. Проверки: targeted `pnpm --filter @ecoplatform/api test -- files.service.test.ts` — 20/20; полный цикл `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm --filter @ecoplatform/api test:integration` — зелёный, integration 79/79.

### S-7. AuthProvider не вызывал refresh-cookie restore

- **Закрыто 2026-05-25**: `apps/web/src/lib/auth.tsx` больше не ищет access-token через `getAccessToken()` на холодном mount, а вызывает `tryRestoreSession()` и затем `/auth/me`. Это приводит фактическое поведение к модели Волны 1.3: access-token только в памяти, reload восстанавливается через HttpOnly refresh-cookie. `apps/web/src/lib/api/core.test.ts` покрывает восстановление токена через `/auth/refresh`.
