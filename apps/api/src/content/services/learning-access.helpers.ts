import { ForbiddenException } from "@nestjs/common";
import type { LearningAccessLevel } from "@prisma/client";
import { canAccessLearningLevel } from "@ecoplatform/shared";
import type { RequestUser } from "../../common/request-user";

export type LearningReadOptions = { preview?: boolean };

export function canPreviewAuthoredContent(user: RequestUser, createdById: string | null | undefined) {
  return (
    user.id === createdById || user.platformRoles.includes("admin") || user.platformRoles.includes("content_manager")
  );
}

function hasLearningAccess(user: RequestUser, accessLevel: LearningAccessLevel) {
  if (user.platformRoles.length > 0) {
    return true;
  }

  return user.company ? canAccessLearningLevel(user.company, accessLevel) : false;
}

export function canAccessPublishedLearningModule(
  user: RequestUser,
  module: { accessLevel: LearningAccessLevel; isInDevelopment: boolean },
) {
  return !module.isInDevelopment && hasLearningAccess(user, module.accessLevel);
}

export function assertLearningModulePublishable(module: {
  chapters: Array<{
    title: string;
    lessons: Array<{ title: string; _count: { blocks: number } }>;
  }>;
}) {
  if (module.chapters.length === 0) {
    throw new ForbiddenException("Нельзя открыть доступ к модулю без глав.");
  }
  for (const chapter of module.chapters) {
    if (chapter.lessons.length === 0) {
      throw new ForbiddenException(`В главе «${chapter.title}» нет уроков.`);
    }
    for (const lesson of chapter.lessons) {
      if (lesson._count.blocks === 0) {
        throw new ForbiddenException(`Урок «${lesson.title}» не содержит блоков.`);
      }
    }
  }
}
