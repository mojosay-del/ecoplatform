import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SupportService } from "./support.service";

describe("SupportService", () => {
  it("does not let company users reply to another company's ticket", async () => {
    const update = vi.fn();
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new SupportService({
      supportTicket: {
        findFirst,
        update,
      },
    } as any);

    await expect(service.replyAsCompanyUser("ticket-1", "user-1", "company-1", "Ответ")).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-1", companyId: "company-1" },
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("adds a company reply only after ownership check", async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: "message-1" });
    const update = vi.fn().mockResolvedValue({ id: "ticket-1" });
    const service = new SupportService({
      $transaction: (callback: any) =>
        callback({
          supportTicketMessage: { create: createMessage },
          supportTicket: { update },
        }),
      supportTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ticket-1",
          subject: "Тема",
          author: { firstName: "Иван", lastName: "Иванов" },
          company: { organizationName: "ООО Тест" },
        }),
      },
    } as any);

    await service.replyAsCompanyUser("ticket-1", "user-1", "company-1", "Ответ");

    expect(createMessage).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        authorId: "user-1",
        authorRole: "company_user",
        text: "Ответ",
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-1" },
        data: expect.objectContaining({
          status: "in_progress",
        }),
      }),
    );
  });
});
