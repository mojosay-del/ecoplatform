-- Волна 7.7: версионирование payload-блоков.
-- Каждая jsonb-payload получает ключ `v: 1`. Это позволяет позже подключить
-- парсер v2 (например, paragraph_v2 с inline-форматированием) без массовой
-- миграции существующих строк — старые читаются как v1, новые как v2.
--
-- Идемпотентно: WHERE NOT payload ? 'v' пропускает уже обновлённые строки,
-- так что повторный запуск миграции (что Prisma делать не должна, но
-- мало ли) ничего не сломает.

UPDATE "NewsContentBlock"
SET payload = jsonb_set(payload, '{v}', '1'::jsonb)
WHERE NOT payload ? 'v';

UPDATE "LessonContentBlock"
SET payload = jsonb_set(payload, '{v}', '1'::jsonb)
WHERE NOT payload ? 'v';

UPDATE "KnowledgeBaseBlock"
SET payload = jsonb_set(payload, '{v}', '1'::jsonb)
WHERE NOT payload ? 'v';
