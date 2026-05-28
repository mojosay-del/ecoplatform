import { ConflictException } from "@nestjs/common";
import { ModerationCaseStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { complaintInputSchema, sanctionLiftInputSchema } from "./moderation.schemas";
import { ModerationService } from "./moderation.service";

const moderatorUser = {
  id: "moderator-1",
  email: "moderator@test.local",
  firstName: "Модератор",
  lastName: "Тестов",
  phone: "+70000000002",
  companyId: null,
  company: null,
  platformRoles: ["moderator"],
  sessionId: "session-1",
};

function serviceWithPrisma(prisma: Record<string, unknown>) {
  return new ModerationService(
    prisma as any,
    { record: vi.fn().mockResolvedValue({}) } as any,
    { createInApp: vi.fn().mockResolvedValue({}) } as any,
    {
      getValue: vi.fn(async (key: string) => {
        if (key === "moderation.lock_duration_minutes") return 15;
        if (key === "moderation.max_locks_per_moderator") return 3;
        return 0;
      }),
    } as any,
    {
      invalidateCompany: vi.fn().mockResolvedValue(undefined),
      invalidateUser: vi.fn().mockResolvedValue(undefined),
    } as any,
  );
}

describe("ModerationService", () => {
  it("rejects complaint reason other without comment", () => {
    const parsed = complaintInputSchema.safeParse({
      entityType: "news_comment",
      entityId: "comment-1",
      reasonCode: "other",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects sanction lift reason other without comment", () => {
    const parsed = sanctionLiftInputSchema.safeParse({
      reasonCode: "other",
    });

    expect(parsed.success).toBe(false);
  });

  it("limits a moderator to three active locks", async () => {
    const update = vi.fn();
    const service = serviceWithPrisma({
      moderationCase: {
        findUnique: vi.fn().mockResolvedValue({
          id: "case-1",
          status: ModerationCaseStatus.open,
          lockedById: null,
          lockedUntil: null,
        }),
        count: vi.fn().mockResolvedValue(3),
        update,
      },
    });

    await expect(service.takeCaseLock("case-1", moderatorUser as any)).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows another moderator to take an expired lock", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "case-1",
      type: "complaint",
      entityType: "news_comment",
      entityId: "comment-1",
      entityAuthorId: "author-1",
      entityCompanyId: "company-1",
      status: ModerationCaseStatus.in_review,
      lockedById: "moderator-1",
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
      complaints: [],
      decisions: [],
      sanctions: [],
    });
    const service = serviceWithPrisma({
      moderationCase: {
        findUnique: vi.fn().mockResolvedValue({
          id: "case-1",
          status: ModerationCaseStatus.in_review,
          lockedById: "moderator-2",
          lockedUntil: new Date(Date.now() - 1000),
        }),
        count: vi.fn().mockResolvedValue(0),
        update,
      },
      comment: { findMany: vi.fn().mockResolvedValue([]) },
      newsPost: { findMany: vi.fn().mockResolvedValue([]) },
      knowledgeBaseArticle: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    });

    await service.takeCaseLock("case-1", moderatorUser as any);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case-1" },
        data: expect.objectContaining({ lockedById: "moderator-1" }),
      }),
    );
  });
});
