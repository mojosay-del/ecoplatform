// Скрипт «Первого админа»:
//   1) находит пользователя с email = process.env.PLATFORM_OWNER_EMAIL (по умолчанию
//      mojosay@icloud.com) и гарантирует ему PlatformStaff с ролью admin;
//   2) переназначает на этого пользователя авторство ВСЕГО контента
//      (createdById/actorId/authorId/uploadedById/lockedById/liftedById),
//      где раньше стоял id другого пользователя;
//   3) удаляет всех остальных пользователей (CASCADE подметёт sessions,
//      likes, comments, lesson-progress, notifications, support-tickets);
//   4) удаляет компании, у которых после п.3 не осталось ни одного user'а
//      (кроме компании владельца).
//
// Запуск (локально, после `source .env`):
//   pnpm --filter @ecoplatform/api exec ts-node prisma/scripts/promote-first-admin.ts
//
// Перед использованием на проде — сделайте `pg_dump` и пройдитесь dry-run
// (DRY_RUN=1) чтобы увидеть план без коммита.

import { PrismaClient } from "@prisma/client";

const OWNER_EMAIL = (process.env.PLATFORM_OWNER_EMAIL ?? "mojosay@icloud.com").toLowerCase();
const DRY_RUN = process.env.DRY_RUN === "1";

const prisma = new PrismaClient();

async function main() {
  console.log(`\n→ Owner email: ${OWNER_EMAIL}`);
  console.log(`→ Mode: ${DRY_RUN ? "DRY RUN (без записи)" : "WRITE"}\n`);

  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    include: { company: true, platformStaff: true },
  });
  if (!owner) {
    throw new Error(
      `Пользователь ${OWNER_EMAIL} не найден. Создайте его обычной регистрацией, потом запустите скрипт.`,
    );
  }
  console.log(`✓ Найден владелец: ${owner.firstName} ${owner.lastName} (id=${owner.id})`);
  console.log(`  Company: ${owner.company?.organizationName ?? "—"} (id=${owner.companyId ?? "null"})`);
  console.log(`  PlatformStaff: ${owner.platformStaff ? owner.platformStaff.roles.join(",") : "нет"}\n`);

  const otherUsers = await prisma.user.findMany({
    where: { NOT: { id: owner.id } },
    select: { id: true, email: true, companyId: true },
  });
  console.log(`→ Будет удалено пользователей: ${otherUsers.length}`);
  for (const u of otherUsers) console.log(`   - ${u.email} (id=${u.id})`);

  const otherCompanyIds = Array.from(
    new Set(otherUsers.map((u) => u.companyId).filter((id): id is string => Boolean(id) && id !== owner.companyId)),
  );
  console.log(`\n→ После удаления пользователей под удаление пойдут чужие компании: ${otherCompanyIds.length}\n`);

  // Подсчёт того, что нужно ре-привязать. На уровне SQL это count'ы по
  // каждому полю — Prisma'ой считать долго, но удобно для отчёта.
  const stats = await collectReassignStats(otherUsers.map((u) => u.id));
  console.log("→ Контент к переназначению на владельца:");
  for (const [label, count] of Object.entries(stats)) {
    if (count > 0) console.log(`   - ${label}: ${count}`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("DRY_RUN=1 → ничего не пишем. Снимите флаг, чтобы применить.\n");
    return;
  }

  // 1. PlatformStaff: гарантируем admin-роль.
  await prisma.platformStaff.upsert({
    where: { userId: owner.id },
    update: {
      roles: { set: ["admin", "moderator", "content_manager"] },
      isActive: true,
    },
    create: {
      userId: owner.id,
      roles: ["admin", "moderator", "content_manager"],
      isActive: true,
    },
  });
  console.log("✓ PlatformStaff: роль admin закреплена");

  // 2. Ре-привязка авторства/uploadedBy на владельца. Все эти поля — обычные
  // String без FK, поэтому updateMany делает то, что нужно. CASCADE-relations
  // не трогаем — их разрулит DELETE на следующем шаге.
  const reassignOps = [
    prisma.adminActionLog.updateMany({ where: { actorId: { in: otherUsers.map((u) => u.id) } }, data: { actorId: owner.id } }),
    prisma.fileAsset.updateMany({ where: { uploadedById: { in: otherUsers.map((u) => u.id) } }, data: { uploadedById: owner.id } }),
    prisma.newsPost.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.newsTag.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.priceIndex.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.priceIndexValue.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.learningModule.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.chapter.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.lesson.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.knowledgeBaseArticle.updateMany({ where: { createdById: { in: otherUsers.map((u) => u.id) } }, data: { createdById: owner.id } }),
    prisma.moderationCase.updateMany({ where: { entityAuthorId: { in: otherUsers.map((u) => u.id) } }, data: { entityAuthorId: owner.id } }),
    prisma.moderationCase.updateMany({ where: { lockedById: { in: otherUsers.map((u) => u.id) } }, data: { lockedById: owner.id } }),
    prisma.complaint.updateMany({ where: { authorId: { in: otherUsers.map((u) => u.id) } }, data: { authorId: owner.id } }),
    prisma.moderationDecision.updateMany({ where: { actorId: { in: otherUsers.map((u) => u.id) } }, data: { actorId: owner.id } }),
    prisma.sanction.updateMany({ where: { appliedById: { in: otherUsers.map((u) => u.id) } }, data: { appliedById: owner.id } }),
    prisma.sanction.updateMany({ where: { liftedById: { in: otherUsers.map((u) => u.id) } }, data: { liftedById: owner.id } }),
    prisma.supportTicketMessage.updateMany({ where: { authorId: { in: otherUsers.map((u) => u.id) } }, data: { authorId: owner.id } }),
  ];
  await prisma.$transaction(reassignOps);
  console.log("✓ Контент переназначен на владельца");

  // 3. Удаляем других пользователей. CASCADE снесёт связанные cascade-rows
  // (Session, NewsLike, Comment, CommentLike, LessonProgress, InAppNotification,
  // NotificationDelivery, NotificationDispatchLog, UserModuleAccess,
  // PlatformStaff, SupportTicket).
  const del = await prisma.user.deleteMany({ where: { NOT: { id: owner.id } } });
  console.log(`✓ Удалено пользователей: ${del.count}`);

  // 4. Удаляем «осиротевшие» компании — те, у которых не осталось user'ов.
  const orphanCompanies = await prisma.company.findMany({
    where: { users: { none: {} } },
    select: { id: true, organizationName: true },
  });
  if (orphanCompanies.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: orphanCompanies.map((c) => c.id) } } });
    console.log(`✓ Удалено компаний без пользователей: ${orphanCompanies.length}`);
    for (const c of orphanCompanies) console.log(`   - ${c.organizationName} (id=${c.id})`);
  }

  console.log("\n✅ Готово.\n");
}

async function collectReassignStats(otherUserIds: string[]) {
  if (otherUserIds.length === 0) return {};
  const where = (key: string) => ({ [key]: { in: otherUserIds } as { in: string[] } });
  const [
    adminActionLog,
    fileAsset,
    newsPost,
    newsTag,
    priceIndex,
    priceIndexValue,
    learningModule,
    chapter,
    lesson,
    knowledgeBaseArticle,
    complaint,
    moderationDecision,
    sanction,
    supportTicketMessage,
  ] = await Promise.all([
    prisma.adminActionLog.count({ where: where("actorId") }),
    prisma.fileAsset.count({ where: where("uploadedById") }),
    prisma.newsPost.count({ where: where("createdById") }),
    prisma.newsTag.count({ where: where("createdById") }),
    prisma.priceIndex.count({ where: where("createdById") }),
    prisma.priceIndexValue.count({ where: where("createdById") }),
    prisma.learningModule.count({ where: where("createdById") }),
    prisma.chapter.count({ where: where("createdById") }),
    prisma.lesson.count({ where: where("createdById") }),
    prisma.knowledgeBaseArticle.count({ where: where("createdById") }),
    prisma.complaint.count({ where: where("authorId") }),
    prisma.moderationDecision.count({ where: where("actorId") }),
    prisma.sanction.count({ where: where("appliedById") }),
    prisma.supportTicketMessage.count({ where: where("authorId") }),
  ]);
  return {
    AdminActionLog: adminActionLog,
    FileAsset: fileAsset,
    NewsPost: newsPost,
    NewsTag: newsTag,
    PriceIndex: priceIndex,
    PriceIndexValue: priceIndexValue,
    LearningModule: learningModule,
    Chapter: chapter,
    Lesson: lesson,
    KnowledgeBaseArticle: knowledgeBaseArticle,
    Complaint: complaint,
    ModerationDecision: moderationDecision,
    Sanction: sanction,
    SupportTicketMessage: supportTicketMessage,
  } as Record<string, number>;
}

main()
  .catch((error) => {
    console.error("\n❌ Ошибка:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
