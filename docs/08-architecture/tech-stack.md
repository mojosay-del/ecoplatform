---
title: Технологический стек
status: draft
updated: 2026-04-26
source: master_product_file.txt
---

<!-- Перенесено из master_product_file.txt, раздел 6 -->

## 1. Технологический стек на старте

### 1.1. Frontend
- Next.js
- React
- TypeScript

### 1.2. Backend
- Node.js
- NestJS

### 1.3. Database
- PostgreSQL

### 1.4. ORM
- Prisma

### 1.5. Auth / Security
- JWT
- Refresh Tokens
- Role-Based Access Control

### 1.6. Storage
- S3-совместимое хранилище для фото, видео, документов и прочих медиафайлов

### 1.7. Maps
- картографический провайдер первой версии — Яндекс.Карты (см. `08-architecture/maps-provider.md`)
- архитектура должна позволять замену картографического провайдера без переработки ядра системы; контракт абстракции `MapsProvider` зафиксирован в `08-architecture/maps-provider.md`, раздел 6
- продуктовое поведение на основе картографического сервиса (модель адреса, алгоритм круга, расчёт расстояний, фильтр по региону) — `08-architecture/geo-logic.md`

### 1.8. Infrastructure
- Redis
- Docker
- Docker Compose
- Nginx

### 1.9. Repository Tooling
- конкретный monorepo tooling на этапе документации не зафиксирован
- monorepo tooling должен быть определён перед стартом разработки
