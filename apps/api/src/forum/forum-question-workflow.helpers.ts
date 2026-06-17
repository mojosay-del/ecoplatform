import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ForumQuestionStatus } from "@prisma/client";
import { hasAnyRole } from "../common/access-policy";
import type { RequestUser } from "../common/request-user";
import type { PrismaService } from "../prisma/prisma.service";

export type ForumQuestionWorkflowDeps = { prisma: PrismaService };

// Управлять контентом (править/удалять) может автор либо модератор/админ.
// content_manager отдельно НЕ модерирует чужое (ТЗ §4) — он сеет через админку.
export function canManageForumContent(user: RequestUser, authorId: string): boolean {
  return user.id === authorId || hasAnyRole(user, ["moderator", "admin"]);
}

async function assertTaxonomyExists(
  prisma: PrismaService,
  rawMaterialId: string,
  questionTypeId: string,
): Promise<void> {
  const [rawMaterial, questionType] = await Promise.all([
    prisma.forumRawMaterial.findUnique({ where: { id: rawMaterialId }, select: { id: true } }),
    prisma.forumQuestionType.findUnique({ where: { id: questionTypeId }, select: { id: true } }),
  ]);
  if (!rawMaterial) {
    throw new BadRequestException("Выбранный вид сырья не найден.");
  }
  if (!questionType) {
    throw new BadRequestException("Выбранный тип вопроса не найден.");
  }
}

export async function createForumQuestion(
  deps: ForumQuestionWorkflowDeps,
  input: { title: string; body: string; rawMaterialId: string; questionTypeId: string },
  author: { id: string; companyId: string | null },
): Promise<{ id: string }> {
  await assertTaxonomyExists(deps.prisma, input.rawMaterialId, input.questionTypeId);
  const question = await deps.prisma.forumQuestion.create({
    data: {
      authorId: author.id,
      authorCompanyId: author.companyId,
      title: input.title,
      body: input.body,
      rawMaterialId: input.rawMaterialId,
      questionTypeId: input.questionTypeId,
      status: ForumQuestionStatus.open,
    },
    select: { id: true },
  });
  return question;
}

export async function updateForumQuestion(
  deps: ForumQuestionWorkflowDeps,
  questionId: string,
  input: { title?: string; body?: string; rawMaterialId?: string; questionTypeId?: string },
  user: RequestUser,
): Promise<{ id: string }> {
  const question = await deps.prisma.forumQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, authorId: true },
  });
  if (!question) {
    throw new NotFoundException("Вопрос не найден.");
  }
  if (!canManageForumContent(user, question.authorId)) {
    throw new ForbiddenException("Редактировать можно только свой вопрос.");
  }
  if (input.rawMaterialId || input.questionTypeId) {
    const current = await deps.prisma.forumQuestion.findUniqueOrThrow({
      where: { id: questionId },
      select: { rawMaterialId: true, questionTypeId: true },
    });
    await assertTaxonomyExists(
      deps.prisma,
      input.rawMaterialId ?? current.rawMaterialId ?? "",
      input.questionTypeId ?? current.questionTypeId ?? "",
    );
  }

  await deps.prisma.forumQuestion.update({
    where: { id: questionId },
    data: {
      title: input.title,
      body: input.body,
      rawMaterialId: input.rawMaterialId,
      questionTypeId: input.questionTypeId,
    },
  });
  return { id: questionId };
}

export async function deleteForumQuestion(
  deps: ForumQuestionWorkflowDeps,
  questionId: string,
  user: RequestUser,
): Promise<{ ok: true }> {
  const question = await deps.prisma.forumQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, authorId: true },
  });
  if (!question) {
    throw new NotFoundException("Вопрос не найден.");
  }
  if (!canManageForumContent(user, question.authorId)) {
    throw new ForbiddenException("Удалить можно только свой вопрос.");
  }
  // Каскад удаляет ответы, голоса и подписки (onDelete: Cascade в схеме).
  await deps.prisma.forumQuestion.delete({ where: { id: questionId } });
  return { ok: true };
}

export async function setForumSubscription(
  deps: ForumQuestionWorkflowDeps,
  questionId: string,
  user: RequestUser,
  subscribe: boolean,
): Promise<{ subscribed: boolean }> {
  const question = await deps.prisma.forumQuestion.findUnique({
    where: { id: questionId },
    select: { id: true },
  });
  if (!question) {
    throw new NotFoundException("Вопрос не найден.");
  }
  if (subscribe) {
    await deps.prisma.forumSubscription.upsert({
      where: { questionId_userId: { questionId, userId: user.id } },
      create: { questionId, userId: user.id },
      update: {},
    });
  } else {
    await deps.prisma.forumSubscription.deleteMany({ where: { questionId, userId: user.id } });
  }
  return { subscribed: subscribe };
}
