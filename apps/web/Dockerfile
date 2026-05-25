# syntax=docker/dockerfile:1
# Multi-stage сборка Next.js web внутри pnpm + Turborepo.
# Сборка из КОРНЯ репозитория: `docker build -f apps/web/Dockerfile .`

ARG NODE_VERSION=24

# ────────────────── Stage 1: deps ──────────────────
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ────────────────── Stage 2: build ──────────────────
FROM node:${NODE_VERSION}-alpine AS build
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* читаются на build-time — пробрасываем как build-arg.
ARG NEXT_PUBLIC_API_URL="http://localhost:4000/api"
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Сначала shared (через turbo dependsOn), потом сам next build.
RUN pnpm --filter @ecoplatform/web... build

# ────────────────── Stage 3: runtime ──────────────────
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache libc6-compat tini
WORKDIR /app

ENV NODE_ENV=production \
    TZ=UTC \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

# `output: "standalone"` собирает в .next/standalone минимум зависимостей.
# Структура — apps/web/server.js + node_modules. С outputFileTracingRoot
# на корне репозитория standalone лежит в .next/standalone полным деревом.
COPY --from=build --chown=nodeapp:nodeapp /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nodeapp:nodeapp /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nodeapp:nodeapp /repo/apps/web/public ./apps/web/public

USER nodeapp
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
