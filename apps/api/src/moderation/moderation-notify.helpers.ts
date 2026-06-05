import { NotificationCategory, SanctionType } from "@prisma/client";
import type { z } from "zod";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { adminSanctionInputSchema } from "./moderation.schemas";

type AdminSanctionInput = z.infer<typeof adminSanctionInputSchema>;

export type ModerationNotifyDeps = {
  prisma: PrismaService;
  notifications: NotificationsService;
};

type ModerationNotificationCase = {
  id: string;
  entityAuthorId: string | null;
  entityCompanyId: string | null;
};

type ModerationNotificationSanction = {
  id: string;
};

type LiftedSanctionNotification = {
  id: string;
  type: SanctionType;
  targetId: string;
};

export async function notifyAdminSanction(
  deps: ModerationNotifyDeps,
  found: ModerationNotificationCase,
  sanction: ModerationNotificationSanction,
  input: AdminSanctionInput,
) {
  const recipients =
    input.type === "company_block"
      ? await deps.prisma.user.findMany({
          where: { companyId: found.entityCompanyId ?? undefined },
          select: { id: true },
        })
      : found.entityAuthorId
        ? [{ id: found.entityAuthorId }]
        : [];

  if (recipients.length === 0) return;

  const category =
    input.type === "module_restriction" ? NotificationCategory.moderation : NotificationCategory.security;

  const titles = adminSanctionCopy(input);

  await Promise.all(
    recipients.map((recipient) =>
      deps.notifications.createInApp({
        userId: recipient.id,
        eventType: titles.eventType,
        sourceId: `${sanction.id}:${recipient.id}`,
        category,
        title: titles.title,
        body: titles.body,
        link: "/notifications",
        payload: { caseId: found.id, sanctionId: sanction.id, reasonCode: input.reasonCode },
      }),
    ),
  );
}

export async function notifySanctionLift(deps: ModerationNotifyDeps, sanction: LiftedSanctionNotification) {
  const recipients =
    sanction.type === SanctionType.company_block
      ? await deps.prisma.user.findMany({
          where: { companyId: sanction.targetId },
          select: { id: true },
        })
      : [{ id: sanction.targetId }];

  if (recipients.length === 0) return;

  const category =
    sanction.type === SanctionType.module_restriction ? NotificationCategory.moderation : NotificationCategory.security;

  const titles = sanctionLiftCopy(sanction.type);

  await Promise.all(
    recipients.map((recipient) =>
      deps.notifications.createInApp({
        userId: recipient.id,
        eventType: titles.eventType,
        sourceId: `${sanction.id}:lift:${recipient.id}`,
        category,
        title: titles.title,
        body: titles.body,
        link: "/notifications",
        payload: { sanctionId: sanction.id },
      }),
    ),
  );
}

export function adminSanctionCopy(input: AdminSanctionInput) {
  if (input.type === "user_block") {
    return {
      eventType: "moderation.user.blocked",
      title: "Учётная запись заблокирована",
      body: "Ваша учётная запись заблокирована администратором платформы.",
    };
  }
  if (input.type === "company_block") {
    return {
      eventType: "moderation.company.blocked",
      title: "Компания заблокирована",
      body: "Компания заблокирована администратором платформы.",
    };
  }
  return {
    eventType: "moderation.module_restriction.applied",
    title: "Ограничение доступа к модулю",
    body: `Доступ к модулю «${input.moduleCode}» ограничен на ${input.durationDays} дн.`,
  };
}

export function sanctionLiftCopy(type: SanctionType) {
  if (type === SanctionType.user_block) {
    return {
      eventType: "moderation.user.unblocked",
      title: "Учётная запись разблокирована",
      body: "Доступ к учётной записи восстановлен.",
    };
  }
  if (type === SanctionType.company_block) {
    return {
      eventType: "moderation.company.unblocked",
      title: "Компания разблокирована",
      body: "Доступ компании восстановлен.",
    };
  }
  return {
    eventType: "moderation.module_restriction.lifted",
    title: "Ограничение доступа к модулю снято",
    body: "Доступ к модулю восстановлен досрочно.",
  };
}
