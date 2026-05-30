-- Авто-восстановление прав пользователя БД (gen_user) на таблицы схемы public.
-- Зачем: на управляемой БД Timeweb наблюдался сброс прав (REVOKE ALL),
-- из-за чего весь API падал с 500 ("permission denied for table ...").
-- Этот скрипт идемпотентен: если права на месте — ничего не делает,
-- если сняты — возвращает их. Запускается из cron (см. deploy/ensure-grants.sh).
\set ON_ERROR_STOP on
SELECT (has_table_privilege('gen_user', '"User"'::regclass, 'SELECT'))::text AS ok \gset
\if :ok
\echo GRANTS_OK
\else
\echo GRANTS_REPAIRING
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gen_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gen_user;
\endif
