# @ecoplatform/web — фронтенд

Next.js (App Router) + React 19. Здесь описано, **что где лежит** и **по каким правилам добавлять код**, чтобы новый разработчик ориентировался без долгого чтения.

## Карта папок

```
apps/web/
├── app/                  # Next.js App Router: только маршруты и тонкие page.tsx
│   ├── admin/…/page.tsx  # страница = 3–5 строк: импорт вью из src/views + рендер
│   ├── news/…            # публичные страницы
│   └── layout.tsx        # корневой layout
└── src/
    ├── views/            # СТРАНИЦЫ и их части (см. «views vs components»)
    │   ├── admin/<домен>/  # CMS/админ-разделы: news, users, indices, …
    │   ├── account/        # личный кабинет
    │   ├── news/           # лента и пост
    │   └── shared/         # общие куски, переиспользуемые между views
    ├── components/       # ПЕРЕИСПОЛЬЗУЕМЫЕ UI-компоненты (не привязаны к одной странице)
    ├── lib/              # не-UI логика: api-клиент, auth, хуки, форматтеры
    │   ├── api/          # типизированный клиент к backend
    │   └── editor/       # модель блоков редактора (TipTap ↔ блоки)
    └── styles/           # глобальные стили
```

## views vs components — главное правило

- **`src/views/`** — это **страница или её часть**. Если кусок имеет смысл только на одной странице (контейнер раздела, его таблица, формы, модалки, типы, константы) — он живёт здесь, рядом с остальной страницей.
- **`src/components/`** — это **переиспользуемый компонент**, который используется на разных страницах: `AppShell`, `RowKebab`, `StatusPill`, `FileUploadField`, `AdminSortButton`, `PageSkeleton`, `NotificationBell` и т. п.

Простой тест: «Этот компонент нужен больше чем одной странице?» Да → `components/`. Нет → `views/`.

> Историческая заметка: раньше крупные `Admin*View.tsx` лежали в `components/`. Они перенесены в `src/views/admin/<домен>/`. Не возвращайте page-level вью обратно в `components/`.

## Как страница подключает вью

`app/.../page.tsx` остаётся тонким — только импорт и рендер:

```tsx
import { AdminUsersView } from "../../../src/views/admin/users";

export default function AdminUsersPage() {
  return <AdminUsersView />;
}
```

Каждая папка вью экспортирует себя через маленький `index.ts` (barrel):

```ts
export { AdminUsersView } from "./AdminUsersView";
```

## Как разбивать большой вью

Когда `XView.tsx` разрастается (> ~500 строк), разнесите его по соседним файлам в той же папке. Образцы: `src/views/admin/indices/`, `src/views/admin/users/`, `src/views/admin/news/`.

Типичная раскладка папки вью:

| Файл | Назначение |
| --- | --- |
| `XView.tsx` | контейнер: auth, загрузка данных, state, мутации API, оркестрация |
| `types.ts` | доменные типы, draft/selection/state-типы (без React) |
| `constants.ts` | пустые draft-объекты, magic strings, enum-подобные значения |
| `format.ts` / `utils.ts` | чистые функции без React |
| `tree.tsx` / `table.tsx` / `<Row>.tsx` | дерево, таблица, презентационные строки списка |
| `forms.tsx` / `create-forms.tsx` | формы создания/редактирования |
| `index.ts` | barrel для страницы-потребителя |

Правила разбивки:
- Не менять UX, тексты, валидацию и тело API-запросов без явной причины.
- Не добавлять новые библиотеки.
- Не смешивать перенос файла с новой функциональностью (отдельные коммиты).
- Переиспользуемые компоненты (`RowKebab`, `FileUploadField`, `StatusPill`) оставлять в `components/`, а во вью импортировать их оттуда.

## lib/ — где не-UI логика

- `lib/api/` — типизированный клиент. Типы ответов backend живут в `@ecoplatform/shared` (`packages/shared/src/api-response.ts`) и переиспользуются обеими сторонами.
- `lib/auth.tsx` — контекст авторизации и хук `useAuth`.
- `lib/use-*.ts` — переиспользуемые хуки (`useInfiniteApiQuery`, `useCoverAssets`, `useCmsAutosave`).
- `lib/display-labels.ts` — человекочитаемые подписи статусов/ролей (RU). Это осмысленная публичная поверхность, не мёртвый код.
- `lib/editor/` — модель блоков контента (хранение блоков сохраняем, сериализатор TipTap ↔ блоки).

## Проверки перед коммитом

```bash
pnpm --filter @ecoplatform/web typecheck # tsc --noEmit (типы)
pnpm --filter @ecoplatform/web lint      # ESLint (React Hooks, a11y, security)
pnpm --filter @ecoplatform/web test   # vitest
pnpm exec prettier --write <изменённые файлы>
```
