# syntax=docker/dockerfile:1
# Крошечный reverse-proxy на Caddy для Timeweb App Platform.
# Конфиг «зашит» в образ, потому что на платформе нельзя монтировать volumes.
# Слушает :8080 (порт по умолчанию для App Platform) и маршрутизирует:
#   /api/* → api:4000,  остальное → web:3000.
#
# Контекст сборки — КОРЕНЬ репозитория (так задано в docker-compose.yml).
# Реестр по умолчанию — Docker Hub; на Timeweb переопределяется на их зеркало.
ARG IMAGE_REGISTRY=docker.io/library
FROM ${IMAGE_REGISTRY}/caddy:2-alpine
COPY deploy/proxy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
