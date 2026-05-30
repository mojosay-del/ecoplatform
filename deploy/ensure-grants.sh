#!/usr/bin/env bash
# Авто-восстановление прав gen_user на таблицы БД.
#
# Контекст: управляемая БД Timeweb периодически может сбросить права
# (REVOKE ALL) у пользователя gen_user — тогда весь API падает с 500
# ("permission denied for table ..."). Этот скрипт раз в ~2 минуты (cron)
# проверяет доступ и, если права сняты, возвращает их. Полностью идемпотентен.
#
# Установка cron (выполняется один раз на сервере):
#   ( crontab -l 2>/dev/null | grep -v ensure-grants.sh; \
#     echo '*/2 * * * * /root/ecoplatform/deploy/ensure-grants.sh >/dev/null 2>&1' ) | crontab -
#
# Логи:
#   /root/ensure-grants.last  — статус последней проверки (OK / REPAIRED / ERROR)
#   /root/ensure-grants.log   — история починок и ошибок (OK не пишется, чтобы не шуметь)
set -euo pipefail

cd "$(dirname "$0")/.."           # -> корень репозитория (/root/ecoplatform)
ENV_FILE="deploy/.env.prod"
SQL_FILE="deploy/ensure-grants.sql"
LOG="/root/ensure-grants.log"
LAST="/root/ensure-grants.last"

# DATABASE_URL содержит спецсимволы и Prisma-параметры (?schema=...),
# которые libpq не понимает — берём строку как есть и оставляем только sslmode.
DBURL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
CLEAN="${DBURL%%\?*}?sslmode=require"

if OUT=$(docker run --rm -i --network host postgres:16-alpine \
           psql "$CLEAN" -X -q -v ON_ERROR_STOP=1 -f - < "$SQL_FILE" 2>&1); then
  if printf '%s' "$OUT" | grep -q GRANTS_REPAIRING; then
    echo "$(date -Is) REPAIRED: права gen_user были сняты — восстановлены" | tee -a "$LOG" > "$LAST"
  else
    echo "$(date -Is) OK" > "$LAST"
  fi
else
  echo "$(date -Is) ERROR: ${OUT}" | tee -a "$LOG" > "$LAST"
fi
