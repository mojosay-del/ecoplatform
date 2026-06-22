-- Авто-восстановление прав пользователя БД (gen_user). Зачем: управляемая БД
-- Timeweb периодически сбрасывает права (REVOKE ALL) — тогда API падает с 500
-- ("permission denied for table ..."), а `CREATE EXTENSION` в миграциях — с
-- 42501 ("permission denied to create extension"). Скрипт идемпотентен: если
-- права на месте — ничего не делает; если сняты — возвращает.
-- Запускается из cron (см. deploy/ensure-grants.sh).
\set ON_ERROR_STOP on

-- 1) Табличные / sequence-привилегии на схему public.
SELECT (has_table_privilege('gen_user', '"User"'::regclass, 'SELECT'))::text AS ok \gset
\if :ok
\echo GRANTS_OK
\else
\echo GRANTS_REPAIRING
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gen_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gen_user;
\endif

-- 2) CREATE на самой БД — нужно для `CREATE EXTENSION` в миграциях
-- (unaccent/pg_trgm для умного поиска форума/документации). gen_user владеет
-- БД, поэтому может вернуть себе ранее отозванную привилегию. Имя БД берём
-- динамически — скрипт не привязан к конкретному имени.
DO $$
BEGIN
  IF NOT has_database_privilege('gen_user', current_database(), 'CREATE') THEN
    EXECUTE format('GRANT CREATE ON DATABASE %I TO gen_user', current_database());
    RAISE NOTICE 'GRANTS_REPAIRING';
  END IF;
END $$;
