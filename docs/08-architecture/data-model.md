---
title: Модель данных
status: current
updated: 2026-05-26
source: apps/api/prisma/schema.prisma
---

# Модель данных ЭкоПлатформы

Этот документ — высокоуровневая карта моделей Prisma из `apps/api/prisma/schema.prisma`.
Цель — дать новому разработчику быстро понять «кто с кем связан», не читая
859 строк SQL. Когда схема меняется, **обновляйте этот файл в том же PR**.

## Принципы

1. **Все id — `cuid()`**. Стабильные, сортируемые, безопасные в URL. Никаких автоинкрементов.
2. **`onDelete` явный**. Cascade ставится только там, где удаление родителя
   логически обнуляет ребёнка (`Comment` ↔ `Discussion`, `CommentAttachment` ↔ `Comment`).
   Где данные ценны и должны пережить родителя — `SetNull` или `Restrict`.
3. **Enum-ы расширяются, не пересоздаются**. На вырост уже добавлены
   `forum`/`solutions_shop`/`reviews` в `NotificationCategory`, `telegram`/`push`
   в `NotificationChannel`, `marketplace_dispute`/`forum_complaint`/`shop_purchase`/
   `refund_request` в `SupportTicketCategory`.
4. **Полиморфные связи через intermediate-модели**. См. `Discussion`
   (`targetType`, `targetId`) и `FileReference` (`entityType`, `entityId`).
5. **JSONB для гибких блоков**. `NewsContentBlock.payload`, `LessonContentBlock.payload`,
   `KnowledgeBaseBlock.payload` — всё JSON. Версионируется ключом `v: 1` внутри payload
   (см. Волну 7.7 ниже).

## Домены

### Аутентификация и подписки

- **`User`** — учётная запись физлица. Логин по email или phone (оба `@unique`).
  Соль/хеш пароля в `passwordHash` (bcrypt cost=12).
- **`Company`** — компания-клиент. Один-ко-многим с `User` через `User.companyId`.
  Содержит реквизиты, контакты (`websiteUrl`, `corporatePhone`, `corporateEmail`,
  `about`, `contactPerson*`), связь с `Address` (`factualAddressId`,
  `structuredLegalAddressId`) и финансовые поля. Все поля профиля опциональны —
  заполняются через `PATCH /api/billing/company`.
- **`Address`** — структурированный адрес (страна/регион/город/улица/индекс +
  координаты `latitude`/`longitude` для будущей карты). У компании могут быть
  два: фактический и юридический. На вырост — адреса складов/доставки/листингов.
- **`PlatformStaff`** — расширение `User` для админов/модераторов/контент-менеджеров.
  `roles: PlatformRole[]` — массив ролей; один пользователь может одновременно
  быть и admin, и moderator.
- **`Session`** — refresh-token sessions. Один-ко-многим с `User`. Удаляется
  каскадом при удалении пользователя.
- **`Subscription`** — история подписок компании (включая текущую активную).
  `Company.subscriptionPlan`/`subscriptionEndsAt` — денормализованное «текущее
  состояние», обновляется billing-cron'ом и ручной активацией.
- **`PaymentMethod`** — сохранённые способы оплаты (карта Тинькофф,
  банковский счёт). Храним только `cardMask`/`providerToken` (рекуррент);
  PAN/CVV никогда не покидают платёжного провайдера. UI пока заглушен.
- **`Payment`** — история платежей. `providerOrderId` уникальный — для
  идемпотентности webhook'ов от Тинькофф-Кассы. UI пока пустой empty-state.

### Контент (новости / индексы / обучение / база знаний)

- **`NewsPost`** — публикация в новостной ленте. Связана с `NewsContentBlock[]`
  (тело статьи), `NewsLike[]`, `NewsPostTag[]` (теги). Комментарии **больше
  не висят на NewsPost напрямую** — они через `Discussion` (см. ниже).
- **`NewsContentBlock`** — один блок контента (parad, image, video, gallery,
  audio, file, checklist, image_checklist, heading, subheading). Payload —
  JSONB; `v: 1` внутри payload — версия формата (см. Волну 7.7).
- **`NewsTag`** + **`NewsPostTag`** — теги новостей с usage-counter'ом.
- **`Discussion`** — полиморфная ветка обсуждения. `(targetType, targetId)` `@unique`.
  `targetType` — enum `DiscussionTargetType`: `news_post` сейчас, в перспективе
  `lesson`, `knowledge_article`, `listing`, `forum_thread`, `solution_review`.
  Создаётся лениво при первом комментарии (upsert).
- **`Comment`** — комментарий внутри `Discussion`. Каскад через Discussion:
  удалили Discussion → удалили все комментарии и `CommentLike[]`/`CommentAttachment[]`.
- **`NomenclatureCategory`** + **`Nomenclature`** + **`PriceIndex`** +
  **`PriceIndexValue`** — справочник видов сырья, индексов цен и истории
  значений. Один Nomenclature → ноль или один PriceIndex; PriceIndex → много
  PriceIndexValue.
- **`LearningModule`** → **`Chapter`** → **`Lesson`** → **`LessonContentBlock`**.
  Дополнительно: `LearningModulePreview` (бесплатное превью), `LessonAttachment`,
  `LessonProgress` (один user × один lesson — `(userId, lessonId)` unique).
- **`KnowledgeBaseArticle`** — древовидная структура через self-relation
  `parentId`. `KnowledgeBaseBlock` — блоки статьи (полиморфный payload, тот же
  `v: 1` версионинг).

### Файлы

- **`FileAsset`** — метаданные загруженных файлов (originalName, mimeType,
  sizeBytes, storageKey в S3, accessLevel). Сам файл лежит в Timeweb S3.
- **`FileReference`** — полиморфная таблица «кто на какой файл ссылается»
  (`fileId` × `entityType` × `entityId`). Заменяет старый O(M) скан всех
  блоков в `deleteIfUnreferenced` — теперь это `count`. Расставляется
  явно из `ContentCommonService.recordEntityReferences()`.
- **`CommentAttachment`** — вложения к комментарию (ссылка на FileAsset).

### Уведомления

- **`InAppNotification`** — in-app сообщение пользователю. `(domainEventId, userId)`
  unique — обеспечивает идемпотентность доставки.
- **`UserNotificationPreferences`** — mute-listы по категориям и каналам.
- **`NotificationDelivery`** — лог попыток доставки через email/SMS/in-app
  (`status`: queued/in_progress/delivered/failed/retry_scheduled/dead_lettered).
  Цепляется к `InAppNotification` через `deliveryId`.

### Модерация

- **`ModerationCase`** — кейс модерации (`complaint` или `suspicious_activity`).
  Полиморфно ссылается на сущность через `entityType` + `entityId`
  (`news_comment` / `news_post` / `knowledge_article`).
- **`Complaint`** — конкретная жалоба внутри кейса.
- **`ModerationDecision`** + **`Sanction`** — решение модератора и применённые
  санкции (warning / content_removal / module_restriction / user_block /
  company_block).
- **`UserModuleRestriction`** — ограничение доступа пользователя к конкретному
  модулю (например, `comments`).

### Поддержка

- **`SupportTicket`** + **`SupportTicketMessage`** — переписка по обращению
  в поддержку. Категории: billing, moderation_review, company_management,
  technical, data_deletion, other + (на вырост) marketplace_dispute,
  forum_complaint, shop_purchase, refund_request.

### Юридическое (Волна 6)

- **`LegalDocument`** — версионированный юридический документ. Пара
  `(type, version)` уникальна; одновременно активной может быть одна версия
  на тип (через `isActive: Boolean`).
- **`ConsentRecord`** — запись о согласии пользователя на документ. Один user
  × один document — `(userId, documentId)` unique. Сохраняет IP, user-agent
  и source (registration / login_reconfirm / cookie_banner / settings /
  admin_action).

### Платформа

- **`PlatformSetting`** — key-value настройки рантайма (лимиты модерации,
  параметры биллинга).
- **`AdminActionLog`** — журнал админских действий (audit-trail).
- **`IdempotencyKey`** — ключи идемпотентности для критических операций
  (manual subscription activation, в перспективе платежи).
- **`ApiKey`** — ключи внешнего API компании (Волна 7.8). Хранится bcrypt-hash
  секрета, scopes-массив. UI и эндпоинты — после MVP.

## Версионирование контентных блоков (Волна 7.7)

Все блоки в `NewsContentBlock`, `LessonContentBlock` и `KnowledgeBaseBlock`
содержат ключ `v` внутри payload (jsonb). Сейчас единственная версия — `1`.

При изменении формата блока (например, `paragraph_v2` с расширенным inline-
форматированием) старые строки остаются как `v: 1` и читаются старым парсером,
новые — `v: 2`. Никакой массовой миграции на проде не нужно.

TS-тип-обёртка в `packages/shared/src/content-blocks.ts`:

```ts
export type ContentBlockV1<TPayload = Record<string, unknown>> = {
  type: ContentBlockKind;
  payload: TPayload & { v: 1 };
};
```

Запись `v: 1` в payload автоматически добавляет `ContentCommonService.payload()`
при insert/update — сервисы блоков ничего сами не делают.

## Полиморфные связи

Платформа специально избегает «жёстких» FK туда, где сущность сейчас одна
(NewsPost), но в будущем добавятся другие (Lesson, KnowledgeArticle, Listing,
ForumThread). Вместо одного FK — пара `(entityType, entityId)`:

| Таблица | Поля |
|---|---|
| `Discussion` | `(targetType, targetId)` — для комментариев |
| `FileReference` | `(entityType, entityId)` — для подсчёта ссылок на файл |
| `ModerationCase` | `(entityType, entityId)` — для модерации любого контента |
| `Complaint` | `(entityType, entityId)` — для жалоб |
| `Sanction` | `(targetType, targetId)` — для применения санкций |

Цена: нет FK-каскадов — приходится удалять явно в сервисе (см.
`news.service.deleteNews`, которая делает `discussion.deleteMany` ДО
`newsPost.delete`).

## Миграции и волны

| Волна | Миграция | Что добавила |
|---|---|---|
| 4.2 | `20260525051938_perf_indexes` | 13 индексов на горячие листинги |
| 4.7 | `20260525064424_file_reference` | Таблица FileReference |
| 5.10 | `20260525191500_idempotency_keys` | IdempotencyKey для manual subscription |
| 6.1 | `20260525202437_legal_documents_and_consents` | LegalDocument + ConsentRecord |
| **7.1** | `20260526100000_discussion_polymorphism` | **Discussion + Comment.discussionId** |
| **7.2** | `20260526100100_address_entity` | **Address + Company.factualAddressId/structuredLegalAddressId** |
| **7.3** | `20260526100200_company_full_profile` | **8 опциональных колонок Company (websiteUrl, contacts, about, logoFileId)** |
| **7.5** | `20260526100300_enums_growth` | **+5 NotificationCategory, +2 NotificationChannel, +4 SupportTicketCategory, новые PaymentMethodType/Status** |
| **7.6** | `20260526100400_payment_models` | **PaymentMethod + Payment** |
| **7.7** | `20260526100500_content_block_versioning` | **v:1 в payload всех существующих блоков** |
| **7.8** | `20260526100600_api_keys` | **ApiKey** |

## Что НЕ в модели (намеренно)

- **Торговая площадка**: листинги, объявления, ставки. Подключим отдельной
  волной после MVP. Discussion и FileReference уже готовы под её комментарии
  и файлы.
- **Форум**: темы, посты, голоса. Будет работать через Discussion.
- **Магазин решений**: продукты, корзина, заказы. Payment-модель уже готова.
- **Калькуляторы**: пока считаем на клиенте, без сохранения сессий.
- **Карты**: координаты в Address уже есть; модели геозон и маршрутов —
  по мере необходимости.

См. `audit/ROADMAP.md` для плана последующих волн.
