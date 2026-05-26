# Lighthouse baseline

Дата замера: 2026-05-26

## Окружение

- Локальная БД PostgreSQL `localhost:5433`, миграции применены, seed-данные загружены.
- API: production build, `pnpm --filter @ecoplatform/api start`, `API_PORT=4000`, `SCHEDULER_DISABLED=1`, `REDIS_URL=` для Redis fallback.
- Web: production build, `NEXT_PUBLIC_API_URL=http://localhost:4000/api pnpm build`, запуск для замера через `NEXT_PUBLIC_API_URL=http://localhost:4000/api pnpm --filter @ecoplatform/web exec next start --port 3000`.
- Lighthouse: `13.3.0`, HeadlessChrome `148.0.0.0`, desktop preset, категории `performance`, `accessibility`, `best-practices`, `seo`.
- `/login` замерялся без авторизации.
- `/news` и `/education` замерялись после UI-login demo-пользователем в той же Chrome-сессии через Puppeteer + Lighthouse Node API с `disableStorageReset: true`.

Локальный запуск `node apps/web/.next/standalone/apps/web/server.js` отдельно проверялся, но в headless Lighthouse дал ложный `NO_FCP` на защищённых страницах после ручного докладывания static/public ассетов в standalone output. Поэтому baseline 8.10 фиксируется по валидному `next start`-замеру, где `finalDisplayedUrl` совпадает с целевыми URL и `runtimeError` отсутствует.

## Команды и URL

```bash
pnpm --filter @ecoplatform/api prisma:migrate
pnpm --filter @ecoplatform/api seed
NEXT_PUBLIC_API_URL=http://localhost:4000/api pnpm build
API_PORT=4000 SCHEDULER_DISABLED=1 REDIS_URL= pnpm --filter @ecoplatform/api start
NEXT_PUBLIC_API_URL=http://localhost:4000/api pnpm --filter @ecoplatform/web exec next start --port 3000
cd /private/tmp/eco-lh-runner
node run-lighthouse.mjs
```

| URL | Сценарий | Fetch time UTC | Performance | Accessibility | Best Practices | SEO |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `http://localhost:3000/login` | без авторизации | 2026-05-26T11:32:40.016Z | 93 | 96 | 96 | 100 |
| `http://localhost:3000/news` | demo login, `disableStorageReset` | 2026-05-26T11:32:50.203Z | 82 | 92 | 100 | 100 |
| `http://localhost:3000/education` | demo login, `disableStorageReset` | 2026-05-26T11:32:59.494Z | 86 | 92 | 100 | 100 |

## Регрессия

Цели Волны 8.10:

- Performance >= 80
- Accessibility >= 90
- Best Practices >= 95
- SEO >= 90

После следующих волн baseline нужно повторять на тех же URL. Просадка любой категории больше чем на 5 пунктов относительно этой таблицы требует отдельного согласования перед закрытием волны.
